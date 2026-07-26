import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import type { Project } from "../../db/schema";
import {
  isFutureDate,
  todayDateOnly,
  weeklyPeriodKey,
  dailyPeriodKey,
} from "../../lib/dates";
import {
  ImageValidationError,
  processImageFile,
} from "../../lib/image-processing";
import {
  createEntry,
  replaceEntry,
} from "../timeline/entry-service";
import { findEntryForPeriod } from "../../db/repositories";
import type { Route } from "../../app/routes";

interface Props {
  project: Project;
  previewUrl: string;
  suggestedDate: string;
  blob: Blob;
  navigate: (r: Route) => void;
  replaceEntryId?: string;
}

// Convert a Blob back into a File so processImageFile accepts it uniformly.
function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

export function ImportDateScreen({
  project,
  previewUrl,
  suggestedDate,
  blob,
  navigate,
  replaceEntryId,
}: Props) {
  const [date, setDate] = useState(suggestedDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const periodKey =
    project.cadence === "weekly"
      ? weeklyPeriodKey(date)
      : dailyPeriodKey(date);

  async function handleSave() {
    setError(null);
    if (isFutureDate(date)) {
      setError("Date cannot be in the future.");
      return;
    }
    setBusy(true);
    try {
      const processed = await processImageFile(blobToFile(blob, "import"));
      if (replaceEntryId) {
        await replaceEntry({
          project,
          entryId: replaceEntryId,
          processed,
        });
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
            capturedDate: date,
            periodKey,
            processed,
          });
        }
      }
      navigate({ name: "home" });
    } catch (err) {
      if (err instanceof ImageValidationError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error ? err.message : "Could not save this photo.",
        );
      }
      setBusy(false);
    }
  }

  return (
    <div className="ll-content ll-stack-lg">
      <h2>Assign a date</h2>
      <div className="ll-capture-preview">
        <img src={previewUrl} alt="Imported photo preview" />
      </div>
      <div className="ll-card">
        <div className="ll-field">
          <label htmlFor="import-date">Capture date</label>
          <input
            id="import-date"
            type="date"
            value={date}
            max={todayDateOnly()}
            onChange={(e) => setDate(e.target.value)}
          />
          <div className="ll-field-help">
            Imported photos let you backfill older moments.
          </div>
        </div>
        {error ? (
          <div className="ll-status ll-status-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="ll-stack">
          <Button variant="primary" block onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save photo"}
          </Button>
          <Button block onClick={() => navigate({ name: "home" })} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}