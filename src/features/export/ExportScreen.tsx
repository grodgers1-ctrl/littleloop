import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import type { Project } from "../../db/schema";
import { getDb } from "../../db/database";
import { todayDateOnly } from "../../lib/dates";
import { flipbookFilename as makeFlipbookFilename } from "../../lib/filenames";
import type { Route } from "../../app/routes";
import type {
  RenderEntry,
  RenderProgress,
  RenderRequest,
  RenderSpeed,
  WorkerOut,
} from "../../workers/video-render.worker";
import {
  collectExportEntries,
  type DateRange,
} from "./collect-export-entries";

interface Props {
  project: Project;
  navigate: (r: Route) => void;
}

type Phase = "config" | "preparing" | "rendering" | "finalizing" | "done" | "error";

export function ExportScreen({ project, navigate }: Props) {
  const [range, setRange] = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState(todayDateOnly());
  const [customTo, setCustomTo] = useState(todayDateOnly());
  const [speed, setSpeed] = useState<RenderSpeed>(0.5);
  const [showDates, setShowDates] = useState(true);
  const [phase, setPhase] = useState<Phase>("config");
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);

  useEffect(() => {
    return () => {
      worker?.terminate();
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [worker, result]);

  async function startExport() {
    setError(null);
    setPhase("preparing");
    setProgress({ phase: "preparing", completed: 0, total: 0 });

    const entries = await collectExportEntries(project, {
      range,
      customFrom,
      customTo,
    });
    if (entries.length === 0) {
      setError("There are no photos in the selected range.");
      setPhase("config");
      return;
    }

    const db = getDb();
    const renderEntries: RenderEntry[] = [];
    for (const entry of entries) {
      const asset = await db.assets.get(entry.imageBlobId);
      if (!asset) continue;
      const buf = await asset.blob.arrayBuffer();
      renderEntries.push({
        id: entry.id,
        capturedDate: entry.capturedDate,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        bytes: new Uint8Array(buf),
      });
    }

    const filename = makeFlipbookFilename(project.childName, todayDateOnly());

    const w = new Worker(
      new URL("../../workers/video-render.worker.ts", import.meta.url),
      { type: "module" },
    );
    setWorker(w);

    const request: RenderRequest = {
      entries: renderEntries,
      speedSeconds: speed,
      showDates,
      childName: project.childName,
      exportFilename: filename,
    };

    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress(msg.progress);
        if (msg.progress.phase === "preparing") setPhase("preparing");
        if (msg.progress.phase === "rendering") setPhase("rendering");
        if (msg.progress.phase === "finalizing") setPhase("finalizing");
      } else if (msg.type === "success") {
        const url = URL.createObjectURL(msg.blob);
        setResult({ url, filename: msg.filename });
        setPhase("done");
        w.terminate();
      } else if (msg.type === "error") {
        setError(msg.message);
        setPhase("error");
        w.terminate();
      }
    };
    w.onerror = (ev) => {
      setError(ev.message || "Worker error");
      setPhase("error");
    };
    w.postMessage({ type: "render", request });
  }

  if (phase === "config" || phase === "error") {
    const isError = phase === "error";
    return (
      <div className="ll-content ll-stack-lg">
        <h2>Export flipbook</h2>
        <div className="ll-card ll-stack">
          <div className="ll-field">
            <label>Date range</label>
            <div className="ll-stack">
              <RangeOption
                active={range === "all"}
                onClick={() => setRange("all")}
                title="All moments"
                desc="Every photo in the timeline"
              />
              <RangeOption
                active={range === "month"}
                onClick={() => setRange("month")}
                title="Current month"
                desc="Photos from this month"
              />
              <RangeOption
                active={range === "custom"}
                onClick={() => setRange("custom")}
                title="Custom range"
                desc="Pick start and end dates"
              />
            </div>
            {range === "custom" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <div className="ll-field">
                  <label htmlFor="from">From</label>
                  <input
                    id="from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </div>
                <div className="ll-field">
                  <label htmlFor="to">To</label>
                  <input
                    id="to"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="ll-field">
            <label>Speed</label>
            <div className="ll-radio-row">
              <SpeedOption value={0.8} current={speed} onClick={setSpeed} label="Slow" sub="0.8 s/frame" />
              <SpeedOption value={0.5} current={speed} onClick={setSpeed} label="Standard" sub="0.5 s/frame" />
              <SpeedOption value={0.25} current={speed} onClick={setSpeed} label="Fast" sub="0.25 s/frame" />
            </div>
          </div>

          <div className="ll-field">
            <label>
              <input
                type="checkbox"
                checked={showDates}
                onChange={(e) => setShowDates(e.target.checked)}
                style={{ width: 18, height: 18, marginRight: 8 }}
              />
              Show dates on each frame
            </label>
          </div>

          {error ? (
            <div className="ll-status ll-status-error" role="alert">
              {error}
            </div>
          ) : null}
          {isError ? (
            <div className="ll-status ll-status-warn">
              Your timeline is safe. Try again, or export a shorter date range.
            </div>
          ) : null}

          <div className="ll-stack">
            <Button variant="primary" block onClick={startExport}>
              Start export
            </Button>
            <Button block onClick={() => navigate({ name: "home" })}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="ll-content ll-stack-lg">
        <h2>Your flipbook is ready.</h2>
        <div className="ll-card">
          <p>
            <strong>{result.filename}</strong>
          </p>
          <video
            src={result.url}
            controls
            playsInline
            style={{ width: "100%", borderRadius: 12, background: "#000" }}
          />
          <div className="ll-stack" style={{ marginTop: 12 }}>
            <a
              className="ll-btn ll-btn-primary ll-btn-block"
              href={result.url}
              download={result.filename}
            >
              Download MP4
            </a>
            <Button block onClick={() => navigate({ name: "home" })}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const pct = total > 0 ? completed / total : 0;
  const phaseText =
    phase === "preparing"
      ? "Preparing images…"
      : phase === "rendering"
      ? `Rendering video (${completed}/${total})`
      : "Finalizing MP4…";
  return (
    <div className="ll-content ll-stack-lg">
      <h2>Rendering</h2>
      <div className="ll-card">
        <p>Keep this screen open while your video is being created.</p>
        <ProgressBar value={pct} label={phaseText} />
        <p style={{ marginTop: 12, color: "var(--ll-text-soft)" }}>{phaseText}</p>
      </div>
    </div>
  );
}

function RangeOption(props: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`ll-radio-card ${props.active ? "is-active" : ""}`}
      style={{ textAlign: "left" }}
    >
      <div className="ll-radio-card-title">{props.title}</div>
      <div className="ll-radio-card-desc">{props.desc}</div>
    </button>
  );
}

function SpeedOption(props: {
  value: RenderSpeed;
  current: RenderSpeed;
  onClick: (v: RenderSpeed) => void;
  label: string;
  sub: string;
}) {
  return (
    <label
      className={`ll-radio-card ${props.current === props.value ? "is-active" : ""}`}
    >
      <input
        type="radio"
        name="speed"
        checked={props.current === props.value}
        onChange={() => props.onClick(props.value)}
      />
      <div className="ll-radio-card-title">{props.label}</div>
      <div className="ll-radio-card-desc">{props.sub}</div>
    </label>
  );
}