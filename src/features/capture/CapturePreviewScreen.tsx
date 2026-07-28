import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { NoteEditor } from "../../components/NoteEditor";
import type { Project } from "../../db/schema";
import { findEntryForPeriod, listEntries } from "../../db/repositories";
import { getDb } from "../../db/database";
import {
  dailyPeriodKey,
  formatDateLong,
  formatWeekLabel,
  todayDateOnly,
  weeklyPeriodKey,
} from "../../lib/dates";
import { drawOnionSkin, ONION_SKIN_OPACITY } from "../../lib/onion-skin";
import {
  ImageValidationError,
  processImageFile,
} from "../../lib/image-processing";
import { createEntry, replaceEntry } from "../timeline/entry-service";
import type { Route } from "../../app/routes";

interface Props {
  project: Project;
  source: "camera" | "library";
  blob: Blob;
  previewUrl: string;
  navigate: (r: Route) => void;
  replaceEntryId?: string;
}

export function CapturePreviewScreen({
  project,
  source,
  blob,
  previewUrl,
  navigate,
  replaceEntryId,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWeekly] = useState(project.cadence === "weekly");
  // V2.5 — note attached to the new entry. Empty = no note.
  const [note, setNote] = useState<string>("");
  // V2.5 — onion-skin overlay state.
  //   - `prevImageUrl` is the URL of the previous entry's image, or
  //     null when there's no prior entry (or the asset fails to load).
  //   - `onionEnabled` is the user's per-session toggle. The
  //     default is `true` when a prior entry exists, `false`
  //     otherwise.
  //   - The overlay canvas ref points at the layered canvas; the
  //     live preview image is rendered behind it.
  const [prevImageUrl, setPrevImageUrl] = useState<string | null>(null);
  const [onionEnabled, setOnionEnabled] = useState<boolean>(false);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  // Revoke preview URL when we navigate away.
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // V2.5 — load the previous entry's image (if any) for the
  // onion-skin overlay. "Previous" is the entry with the most
  // recent `capturedDate` strictly before today; if none
  // exists, we fall back to the most recent entry overall
  // (which can happen for weekly cadence where the user is
  // backfilling an older week). Best-effort: any failure
  // leaves `prevImageUrl` at null and the overlay is hidden.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    void (async () => {
      try {
        const today = todayDateOnly();
        const all = await listEntries(project.id);
        if (cancelled) return;
        // Sort newest first.
        const sorted = [...all].sort((a, b) =>
          b.capturedDate.localeCompare(a.capturedDate),
        );
        const prior =
          sorted.find((e) => e.capturedDate < today) ??
          sorted[0] ??
          null;
        if (!prior) return;
        const db = getDb();
        const asset = await db.assets.get(prior.imageBlobId);
        if (cancelled) return;
        if (!asset) return;
        createdUrl = URL.createObjectURL(asset.blob);
        if (cancelled) {
          URL.revokeObjectURL(createdUrl);
          return;
        }
        setPrevImageUrl(createdUrl);
        setOnionEnabled(true);
      } catch {
        /* best-effort: no overlay */
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [project.id]);

  // V2.5 — draw the onion-skin on the overlay canvas when the
  // toggle is on and we have a previous image. The canvas is
  // sized to match the visible preview; we redraw whenever the
  // toggle or image changes. The image is loaded inside the
  // effect to keep the dependency on `prevImageUrl` correct.
  useEffect(() => {
    if (!onionEnabled) return;
    if (!prevImageUrl) return;
    const canvas = overlayRef.current;
    if (!canvas) return;
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch(prevImageUrl);
        if (cancelled) return;
        const blob = await resp.blob();
        if (cancelled) return;
        // Match the canvas to the displayed image. The
        // preview uses the natural aspect ratio via object-fit;
        // for the canvas we just inherit the displayed size.
        // Note: the canvas's clientWidth/Height are set by the
        // parent container; if they are 0 (e.g. before mount)
        // the draw is a no-op.
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await drawOnionSkin(ctx, blob, w, h, ONION_SKIN_OPACITY);
      } catch {
        /* best-effort: overlay stays blank */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onionEnabled, prevImageUrl]);

  async function handleUse() {
    setError(null);
    setBusy(true);
    try {
      const processed = await processImageFile(blob);
      const today = todayDateOnly();
      const periodKey =
        project.cadence === "weekly"
          ? weeklyPeriodKey(today)
          : dailyPeriodKey(today);
      if (replaceEntryId) {
        await replaceEntry({
          project,
          entryId: replaceEntryId,
          processed,
        });
        // Note updates for replaces go through engine.setEntryNote;
        // a saved-then-edited flow would write twice. For V2.5 we
        // skip the note when replacing (the user can edit from the
        // timeline). Empty note is fine.
      } else {
        const existing = await findEntryForPeriod(project.id, periodKey);
        if (existing) {
          await replaceEntry({
            project,
            entryId: existing.id,
            processed,
          });
        } else {
          await createEntry({
            project,
            capturedDate: today,
            periodKey,
            processed,
            note: note.trim().length > 0 ? note : undefined,
          });
        }
      }
      navigate({ name: "home" });
    } catch (err) {
      if (err instanceof ImageValidationError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save this photo. Please try again.",
        );
      }
      setBusy(false);
    }
  }

  return (
    <div className="ll-content ll-stack-lg">
      <h2>Preview</h2>
      <div className="ll-capture-preview">
        <img src={previewUrl} alt="Selected photo preview" />
        {/* V2.5 — onion-skin overlay canvas. Sits on top of the
            preview image; the toggle below controls visibility. */}
        {prevImageUrl ? (
          <canvas
            ref={overlayRef}
            className="ll-onion-skin"
            data-testid="onion-skin-canvas"
            aria-hidden="true"
            style={{
              opacity: onionEnabled ? 1 : 0,
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
      {prevImageUrl ? (
        <div className="ll-onion-skin-toggle">
          <label className="ll-toggle">
            <input
              type="checkbox"
              checked={onionEnabled}
              onChange={(e) => setOnionEnabled(e.target.checked)}
              data-testid="onion-skin-toggle"
            />
            <span>Show previous as guide</span>
          </label>
          <span className="ll-onion-skin-hint">
            Onion-skin overlay at {Math.round(ONION_SKIN_OPACITY * 100)}% opacity.
          </span>
        </div>
      ) : (
        <div className="ll-onion-skin-hint ll-onion-skin-hint-empty">
          No previous photo yet. Capture one to start the onion-skin guide.
        </div>
      )}
      <div className="ll-card ll-card-quiet">
        {isWeekly ? (
          <p style={{ margin: 0 }}>
            This will be saved to <strong>{formatWeekLabel(weeklyPeriodKey(todayDateOnly()))}</strong>.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            This will be saved to <strong>{formatDateLong(todayDateOnly())}</strong>.
          </p>
        )}
      </div>
      <div className="ll-card">
        <NoteEditor
          value={note}
          onCommit={setNote}
          ariaLabel="Note for this entry"
        />
      </div>
      {error ? (
        <div className="ll-status ll-status-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="ll-stack">
        <Button variant="primary" block onClick={handleUse} disabled={busy}>
          {busy ? "Saving…" : "Use photo"}
        </Button>
        <Button block onClick={() => navigate({ name: "home" })} disabled={busy}>
          {source === "camera" ? "Retake" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}