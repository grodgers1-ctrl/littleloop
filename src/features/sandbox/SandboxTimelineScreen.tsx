import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import type { Entry, Project } from "../../db/schema";
import { listSandboxEntries } from "../../db/sandbox-repositories";
import { getSandboxDb } from "../../db/sandbox-database";
import { formatDateLong, formatAge, ageAt } from "../../lib/dates";
import { useObjectUrls } from "../../lib/use-object-urls";
import type { Route } from "../../app/routes";

interface Props {
  project: Project;
  navigate: (r: Route) => void;
}

export function SandboxTimelineScreen({ project, navigate }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [thumbBlobs, setThumbBlobs] = useState<
    Array<{ id: string; blob: Blob | null }>
  >([]);
  const [loading, setLoading] = useState(true);

  const { urls: rows } = useObjectUrls(thumbBlobs);

  async function reload() {
    setLoading(true);
    const all = await listSandboxEntries();
    setEntries(all);
    const db = getSandboxDb();
    const blobs: Array<{ id: string; blob: Blob | null }> = [];
    for (const e of all) {
      const asset = await db.assets.get(e.thumbnailBlobId);
      blobs.push({ id: e.id, blob: asset ? asset.blob : null });
    }
    setThumbBlobs(blobs);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [project.id]);

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
          title="Your sandbox starts here."
          description="Pick photos from your camera roll and they'll show up here."
        />
      </div>
    );
  }

  return (
    <div className="ll-content ll-stack">
      <h2>Sandbox timeline</h2>
      <div className="ll-timeline">
        {entries.map((entry) => {
          const age = ageAt(entry.capturedDate, project.dateOfBirth);
          const thumbUrl = urlById.get(entry.id) ?? null;
          return (
            <div className="ll-timeline-entry" key={entry.id}>
              {thumbUrl ? (
                <img
                  className="ll-timeline-thumb"
                  src={thumbUrl}
                  alt={`Sandbox photo from ${entry.capturedDate}`}
                />
              ) : (
                <div className="ll-timeline-thumb" aria-hidden="true" />
              )}
              <div className="ll-timeline-meta">
                <div>
                  <div className="ll-timeline-date">
                    {formatDateLong(entry.capturedDate)}
                  </div>
                  <div className="ll-timeline-age">{formatAge(age)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        variant="ghost"
        block
        onClick={() => navigate({ name: "home" })}
      >
        Add more photos
      </Button>
    </div>
  );
}