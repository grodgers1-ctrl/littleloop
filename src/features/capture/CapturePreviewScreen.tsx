import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { NoteEditor } from "../../components/NoteEditor";
import type { Project } from "../../db/schema";
import { findEntryForPeriod } from "../../db/repositories";
import {
  dailyPeriodKey,
  formatDateLong,
  formatWeekLabel,
  todayDateOnly,
  weeklyPeriodKey,
} from "../../lib/dates";
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

  // Revoke preview URL when we navigate away.
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
      </div>
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