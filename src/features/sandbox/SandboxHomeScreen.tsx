import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ProgressBar } from "../../components/ProgressBar";
import type { Project } from "../../db/schema";
import {
  listSandboxEntries,
} from "../../db/sandbox-repositories";
import { bulkImportSandbox } from "./sandbox-import";
import { processImageFile, ImageValidationError } from "../../lib/image-processing";
import {
  isValidImportBatchSize,
  MAX_IMPORT_BATCH,
  MIN_PREVIEW_PHOTOS,
  shouldShowPreviewCta,
} from "../../lib/auto-dates";
import { renderSandboxPreview } from "./sandbox-preview";
import { downloadBlob } from "../../lib/download";
import type { Route } from "../../app/routes";
import type { Entry } from "../../db/schema";

interface Props {
  project: Project;
  navigate: (r: Route) => void;
}

interface Row {
  entry: Entry;
  thumbUrl: string | null;
}

type BusyState =
  | { kind: "idle" }
  | { kind: "importing"; processed: number; total: number }
  | { kind: "error"; message: string };

export function SandboxHomeScreen({ project, navigate }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState<BusyState>({ kind: "idle" });

  async function reload() {
    const all = await listSandboxEntries();
    const out: Row[] = [];
    for (const e of all) {
      // Sandbox thumbnails are fetched directly from the sandbox DB.
      const { getSandboxDb } = await import("../../db/sandbox-database");
      const asset = await getSandboxDb().assets.get(e.thumbnailBlobId);
      out.push({
        entry: e,
        thumbUrl: asset ? URL.createObjectURL(asset.blob) : null,
      });
    }
    setRows(out);
    setCount(all.length);
  }

  useEffect(() => {
    void reload();
    return () => {
      rows.forEach((r) => {
        if (r.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on mount only
  }, [project.id]);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;

    if (!isValidImportBatchSize(arr.length)) {
      setBusy({
        kind: "error",
        message: `Pick up to ${MAX_IMPORT_BATCH} photos at a time. You picked ${arr.length}.`,
      });
      return;
    }

    setBusy({ kind: "importing", processed: 0, total: arr.length });

    const processed: Parameters<typeof bulkImportSandbox>[0]["processed"] = [];
    for (let i = 0; i < arr.length; i += 1) {
      try {
        const p = await processImageFile(arr[i]);
        processed.push(p);
      } catch (err) {
        if (err instanceof ImageValidationError) {
          // Skip the bad photo and continue.
        } else {
          throw err;
        }
      }
      setBusy({
        kind: "importing",
        processed: i + 1,
        total: arr.length,
      });
    }

    if (processed.length === 0) {
      setBusy({
        kind: "error",
        message: "None of the selected files were valid images.",
      });
      return;
    }

    const result = await bulkImportSandbox({ processed });
    setBusy({ kind: "idle" });
    void reload();
    if (result.skipped > 0) {
      console.warn(
        `[Little Loop sandbox] ${result.skipped} photo(s) failed to import.`,
      );
    }
  }

  return (
    <div className="ll-content ll-stack-lg">
      <div className="ll-card">
        <h1>Sandbox</h1>
        <p style={{ color: "var(--ll-text-soft)" }}>
          Try the app with sample photos from your camera roll. Delete the
          sandbox anytime — it never touches a real timeline.
        </p>

        <div className="ll-stack" style={{ marginTop: 16 }}>
          <label className="ll-btn ll-btn-primary ll-btn-block">
            {busy.kind === "importing"
              ? `Importing ${busy.processed} of ${busy.total}…`
              : "Pick photos from camera roll"}
            <input
              id="ll-sandbox-import-input"
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              aria-label="Pick photos from camera roll"
              style={{ display: "none" }}
              onChange={(e) => {
                const files = e.target.files;
                if (files) void handleFiles(files);
                e.target.value = "";
              }}
            />
          </label>

          {count > 0 ? (
            <>
              <Button
                block
                onClick={() => navigate({ name: "timeline" })}
              >
                View timeline ({count})
              </Button>
              {shouldShowPreviewCta(count) ? (
                <PreviewChip project={project} count={count} />
              ) : null}
              <Button
                variant="ghost"
                block
                onClick={() => navigate({ name: "settings" })}
              >
                Sandbox settings
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {busy.kind === "error" ? (
        <div className="ll-status ll-status-error" role="alert">
          {busy.message}
        </div>
      ) : null}

      {count === 0 ? (
        <EmptyState
          title="Your sandbox starts here."
          description="Pick a few photos from your camera roll. They'll get today and the previous days so you can see the timeline fill up."
        />
      ) : null}
    </div>
  );
}

function PreviewChip({
  project,
  count,
}: {
  project: Project;
  count: number;
}) {
  // Phase 4 implementation: clicking the chip kicks off an FFmpeg render
  // of the most recent 20 photos at 0.25 s/frame. We surface progress
  // (the worker emits phase updates; we surface a single coarse bar).
  // On success we show the video inline and offer a download.
  const [phase, setPhase] = useState<
    "idle" | "rendering" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [downloadBlobRef, setDownloadBlobRef] = useState<Blob | null>(null);

  async function handlePreview() {
    setError(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setFilename(null);
    setDownloadBlobRef(null);
    setPhase("rendering");
    try {
      const r = await renderSandboxPreview(project, MIN_PREVIEW_PHOTOS);
      const url = URL.createObjectURL(r.blob);
      setVideoUrl(url);
      setFilename(r.filename);
      setDownloadBlobRef(r.blob);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
      setPhase("error");
    }
  }

  return (
    <div className="ll-stack">
      <Button
        variant="primary"
        block
        onClick={handlePreview}
        disabled={phase === "rendering"}
      >
        {phase === "rendering"
          ? "Rendering preview…"
          : `Watch a 30-second preview (${count} photos)`}
      </Button>

      {phase === "rendering" ? (
        <div className="ll-status ll-status-info">
          Keep this screen open while your video is being created.
          <div style={{ marginTop: 8 }}>
            <ProgressBar value={0.5} label="Rendering preview" />
          </div>
        </div>
      ) : null}

      {phase === "done" && videoUrl && filename && downloadBlobRef ? (
        <div className="ll-status ll-status-success">
          <p style={{ margin: "0 0 8px" }}>
            <strong>Your flipbook is ready.</strong>
          </p>
          <video
            src={videoUrl}
            controls
            playsInline
            style={{
              width: "100%",
              borderRadius: 12,
              background: "#000",
            }}
          />
          <Button
            block
            onClick={() => downloadBlob(downloadBlobRef, filename)}
            style={{ marginTop: 8 }}
          >
            Download MP4
          </Button>
        </div>
      ) : null}

      {phase === "error" && error ? (
        <div className="ll-status ll-status-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}