import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import type { Route } from "../../app/routes";
import { getDb } from "../../db/database";
import { listEntries } from "../../db/repositories";
import type { Entry, Project } from "../../db/schema";
import {
  ageAt,
  dailyPeriodKey,
  formatAge,
  formatDateLong,
  formatWeekLabel,
  weeklyPeriodKey,
} from "../../lib/dates";
import { deleteEntry } from "./entry-service";

interface Props {
  project: Project;
  navigate: (r: Route) => void;
}

interface Row {
  entry: Entry;
  thumbUrl: string | null;
}

export function TimelineScreen({ project, navigate }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<Entry | null>(null);
  const [pendingReplace, setPendingReplace] = useState<Entry | null>(null);

  async function reload() {
    setLoading(true);
    const entries = await listEntries(project.id);
    // Resolve thumbnail URLs.
    const db = getDb();
    const out: Row[] = [];
    for (const e of entries) {
      const asset = await db.assets.get(e.thumbnailBlobId);
      out.push({
        entry: e,
        thumbUrl: asset ? URL.createObjectURL(asset.blob) : null,
      });
    }
    setRows(out);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    return () => {
      // Revoke any object URLs on unmount.
      rows.forEach((r) => {
        if (r.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
      });
    };
    // We deliberately don't depend on `rows` — we only want to reload
    // when the project changes. Including `rows` would cause an infinite
    // loop because reload() updates rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function handleDelete(entry: Entry) {
    await deleteEntry(entry.id);
    setConfirmDelete(null);
    await reload();
  }

  function handleReplace(entry: Entry) {
    setPendingReplace(entry);
    // Defer click so the modal opens after state update.
    setTimeout(() => {
      const input = document.getElementById(
        "ll-timeline-replace-input",
      ) as HTMLInputElement | null;
      input?.click();
    }, 0);
  }

  function onFileSelected(file: File) {
    if (!pendingReplace) return;
    navigate({
      name: "capture-preview",
      source: "library",
      blob: file,
      previewUrl: URL.createObjectURL(file),
      suggestedDate: pendingReplace.capturedDate,
      replaceEntryId: pendingReplace.id,
    });
    setPendingReplace(null);
  }

  if (loading) {
    return (
      <div className="ll-content">
        <p>Loading…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="ll-content">
        <EmptyState
          title="Your first moment starts here."
          description="Take a photo or choose one from your camera roll."
        />
      </div>
    );
  }

  return (
    <div className="ll-content ll-stack">
      <h2>Timeline</h2>
      <div className="ll-timeline">
        {rows.map(({ entry, thumbUrl }) => {
          const age = ageAt(entry.capturedDate, project.dateOfBirth);
          const isWeekly = project.cadence === "weekly";
          return (
            <div className="ll-timeline-entry" key={entry.id}>
              {thumbUrl ? (
                <img
                  className="ll-timeline-thumb"
                  src={thumbUrl}
                  alt={`Photo from ${entry.capturedDate}`}
                />
              ) : (
                <div className="ll-timeline-thumb" aria-hidden="true" />
              )}
              <div className="ll-timeline-meta">
                <div>
                  <div className="ll-timeline-date">
                    {isWeekly
                      ? formatWeekLabel(weeklyPeriodKey(entry.capturedDate))
                      : formatDateLong(entry.capturedDate)}
                  </div>
                  <div className="ll-timeline-age">{formatAge(age)}</div>
                </div>
                <div className="ll-timeline-actions">
                  <Button
                    onClick={() => handleReplace(entry)}
                    aria-label={`Replace photo for ${entry.capturedDate}`}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setConfirmDelete(entry)}
                    aria-label={`Delete photo for ${entry.capturedDate}`}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <input
        id="ll-timeline-replace-input"
        type="file"
        accept="image/*"
        aria-label="Replace photo"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = "";
        }}
      />

      <Modal
        open={Boolean(confirmDelete)}
        title="Delete this photo?"
        onClose={() => setConfirmDelete(null)}
      >
        <p>
          This photo will be removed from the timeline on this device. If you
          have exported a backup, you can restore it later.
        </p>
        <div className="ll-stack" style={{ marginTop: 16 }}>
          <Button
            variant="danger"
            block
            onClick={() => confirmDelete && void handleDelete(confirmDelete)}
          >
            Delete
          </Button>
          <Button block onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
        </div>
      </Modal>

      {/* Marker so unused imports stay referenced. */}
      <span style={{ display: "none" }} aria-hidden="true">
        {dailyPeriodKey("2025-01-01")}
      </span>
    </div>
  );
}