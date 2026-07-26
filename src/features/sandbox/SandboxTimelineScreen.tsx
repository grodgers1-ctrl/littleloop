import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import type { Project } from "../../db/schema";
import { listSandboxEntries } from "../../db/sandbox-repositories";
import { getSandboxDb } from "../../db/sandbox-database";
import { formatDateLong, formatAge, ageAt } from "../../lib/dates";
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

export function SandboxTimelineScreen({ project, navigate }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const all = await listSandboxEntries();
    const db = getSandboxDb();
    const out: Row[] = [];
    for (const e of all) {
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
      rows.forEach((r) => {
        if (r.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

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
        {rows.map(({ entry, thumbUrl }) => {
          const age = ageAt(entry.capturedDate, project.dateOfBirth);
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