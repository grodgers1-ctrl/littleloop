// V2 Export Sheet. The slide-up bottom sheet that replaces the V1
// ExportScreen's config UI. The sheet owns the export configuration
// state and hands a fully-resolved ExportRequest to the engine on
// submit. While the engine is exporting the sheet swaps its body to
// show progress; when the export completes the sheet swaps to a
// result view with video player + share buttons.
//
// Spec §9 calls out the controls:
//   - Date range (radio: all / this month / custom)
//   - Speed (radio: fast / standard / slow)
//   - Style (locked-with-upgrade-prompt for non-Studio users in V2.0;
//     the actual transitions/filter/theme content lands in V2.5)
//   - Show date on each frame toggle
//   - Export button

import { useState } from "react";
import { Button } from "../../../components/Button";
import { ProgressBar } from "../../../components/ProgressBar";
import { Modal } from "../../../components/Modal";
import { useEngine, useExportProgress, useUnlock } from "../../../engine/hooks";
import type {
  DateRange,
  ExportRequest,
  ExportResult,
  RenderSpeed,
} from "../../../engine/state";

interface Props {
  open: boolean;
  subjectId: string;
  subjectName: string;
  entryCount: number;
  /** Called when the export finishes successfully. Receives the
   *  blob + filename so the parent route can navigate to the
   *  result view. */
  onCompleted: (result: ExportResult) => void;
  /** Called when the user closes the sheet mid-export or after. */
  onClose: () => void;
}

const SPEED_LABELS: Record<RenderSpeed, string> = {
  fast: "Fast (0.25s / frame)",
  standard: "Standard (0.5s / frame)",
  slow: "Slow (0.8s / frame)",
};

export function ExportSheet({
  open,
  subjectId,
  subjectName,
  entryCount,
  onCompleted,
  onClose,
}: Props) {
  const engine = useEngine();
  const unlock = useUnlock();
  const progress = useExportProgress();
  const [dateRange, setDateRange] = useState<DateRange>({ kind: "all" });
  const [speed, setSpeed] = useState<RenderSpeed>("fast");
  const [showDate, setShowDate] = useState(true);
  const [filenameOverride, setFilenameOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExporting = progress !== null && progress.phase !== "done" && progress.phase !== "error";
  const isDone = progress?.phase === "done";
  const isError = progress?.phase === "error";

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const request: ExportRequest = {
        subjectId,
        dateRange,
        speed,
        showDate,
        filenameOverride: filenameOverride.trim() || undefined,
        forceNoWatermark: false,
      };
      const result = await engine.export(request, () => {
        // Progress is forwarded by the engine itself via the
        // export-progress event; useExportProgress above picks it up.
      });
      onCompleted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return; // Don't allow closing mid-export.
    onClose();
  }

  return (
    <Modal open={open} title={`Export ${subjectName}`} onClose={handleClose}>
      {isExporting ? (
        <ExportProgressView progress={progress!} />
      ) : isDone ? (
        <p>Export complete. Loading result…</p>
      ) : (
        <form onSubmit={handleExport} noValidate>
          <div className="ll-field">
            <label>Date range</label>
            <div className="ll-radio-row">
              <label
                className={`ll-radio-card ${dateRange.kind === "all" ? "is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="v2-date-range"
                  checked={dateRange.kind === "all"}
                  onChange={() => setDateRange({ kind: "all" })}
                />
                <div className="ll-radio-card-title">All photos</div>
                <div className="ll-radio-card-desc">{entryCount} captured</div>
              </label>
              <label
                className={`ll-radio-card ${dateRange.kind === "this-month" ? "is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="v2-date-range"
                  checked={dateRange.kind === "this-month"}
                  onChange={() => setDateRange({ kind: "this-month" })}
                />
                <div className="ll-radio-card-title">This month</div>
              </label>
              <label
                className={`ll-radio-card ${dateRange.kind === "custom" ? "is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="v2-date-range"
                  checked={dateRange.kind === "custom"}
                  onChange={() =>
                    setDateRange({
                      kind: "custom",
                      from: "",
                      to: "",
                    })
                  }
                />
                <div className="ll-radio-card-title">Custom range</div>
              </label>
            </div>
            {dateRange.kind === "custom" ? (
              <div className="ll-custom-range">
                <label className="ll-field">
                  <span>From</span>
                  <input
                    type="date"
                    value={dateRange.from ?? ""}
                    onChange={(e) =>
                      setDateRange({
                        kind: "custom",
                        from: e.target.value,
                        to: dateRange.to,
                      })
                    }
                  />
                </label>
                <label className="ll-field">
                  <span>To</span>
                  <input
                    type="date"
                    value={dateRange.to ?? ""}
                    onChange={(e) =>
                      setDateRange({
                        kind: "custom",
                        from: dateRange.from,
                        to: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="ll-field">
            <label>Speed</label>
            <div className="ll-radio-row">
              {(Object.keys(SPEED_LABELS) as RenderSpeed[]).map((s) => (
                <label
                  key={s}
                  className={`ll-radio-card ${speed === s ? "is-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="v2-speed"
                    checked={speed === s}
                    onChange={() => setSpeed(s)}
                  />
                  <div className="ll-radio-card-title">{SPEED_LABELS[s]}</div>
                </label>
              ))}
            </div>
          </div>

          <div className="ll-field">
            <label
              className="ll-radio-card is-locked"
              aria-disabled="true"
            >
              <input type="checkbox" checked={false} disabled />
              <div className="ll-radio-card-body">
                <div className="ll-radio-card-title">Style</div>
                <div className="ll-radio-card-desc">
                  {unlock === "studio"
                    ? "Transitions, filters, and themes available."
                    : "Get Studio for transitions, filters, and themes."}
                </div>
              </div>
            </label>
          </div>

          <div className="ll-field">
            <label className="ll-checkbox-row">
              <input
                type="checkbox"
                checked={showDate}
                onChange={(e) => setShowDate(e.target.checked)}
              />
              <span>Show date on each frame</span>
            </label>
          </div>

          <div className="ll-field">
            <label htmlFor="v2-export-filename">Filename (optional)</label>
            <input
              id="v2-export-filename"
              type="text"
              value={filenameOverride}
              placeholder={`${subjectName}-${new Date().toISOString().slice(0, 10)}.mp4`}
              maxLength={80}
              onChange={(e) => setFilenameOverride(e.target.value)}
            />
          </div>

          {error || isError ? (
            <div className="ll-status ll-status-error" role="alert">
              {error ?? progress?.message ?? "Export failed."}
            </div>
          ) : null}

          <div className="ll-stack">
            <Button
              type="submit"
              variant="primary"
              block
              disabled={busy || entryCount === 0}
            >
              {busy ? "Exporting…" : "Export"}
            </Button>
            <Button type="button" block onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ExportProgressView({
  progress,
}: {
  progress: { phase: string; ratio: number; message?: string };
}) {
  return (
    <div className="ll-export-progress">
      <p style={{ fontWeight: 600 }}>{progress.message ?? "Working…"}</p>
      <ProgressBar
        value={Math.max(0, Math.min(1, progress.ratio))}
        label={progress.phase}
      />
      <p style={{ color: "var(--ll-text-soft)", fontSize: 13, marginTop: 8 }}>
        {Math.round(progress.ratio * 100)}% — keep this tab in the foreground.
      </p>
    </div>
  );
}
