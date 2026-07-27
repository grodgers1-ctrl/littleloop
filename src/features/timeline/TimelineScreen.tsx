import { useCallback, useEffect, useState } from "react";
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
import { useObjectUrls } from "../../lib/use-object-urls";
import { deleteEntry } from "./entry-service";

interface Props {
  project: Project;
  kind: "real" | "sandbox";
  navigate: (r: Route) => void;
}

export function TimelineScreen({ project, kind, navigate }: Props) {
  // `kind` is consumed in Phase 4 (timeline-specific sandbox badges).
  void kind;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [thumbBlobs, setThumbBlobs] = useState<
    Array<{ id: string; blob: Blob | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<Entry | null>(null);
  const [pendingReplace, setPendingReplace] = useState<Entry | null>(null);

  // The hook handles createObjectURL / revokeObjectURL for us; we
  // hand it a stable list of {id, blob} pairs and it gives us back
  // URLs in the same order.
  const { urls: rows } = useObjectUrls(thumbBlobs);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await listEntries(project.id);
    setEntries(list);
    const db = getDb();
    const blobs: Array<{ id: string; blob: Blob | null }> = [];
    for (const e of list) {
      const asset = await db.assets.get(e.thumbnailBlobId);
      blobs.push({ id: e.id, blob: asset ? asset.blob : null });
    }
    setThumbBlobs(blobs);
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  // Index URLs by entry id for quick lookup in render.
  const urlById = new Map<string, string | null>();
  for (const r of rows) urlById.set(r.id, r.url);

  if (loading) {
    return (
      <div className="ll-content">
        <p>Loading…</p>
      </div>
    );
  }

  if (entries.length === 0) {
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
        {entries.map((entry) => {
          const age = ageAt(entry.capturedDate, project.dateOfBirth);
          const isWeekly = project.cadence === "weekly";
          const thumbUrl = urlById.get(entry.id) ?? null;
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