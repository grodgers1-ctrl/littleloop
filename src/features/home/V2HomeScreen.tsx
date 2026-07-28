// V2 Home Screen. A vertical list of subject tiles. Each tile shows:
//
//   - The most recent entry's image as a small thumbnail
//   - The subject name
//   - The subject type (icon + label)
//   - The cadence ("daily" / "weekly")
//   - The entry count
//
// A "+ Add subject" button at the top opens the AddSubjectSheet. On
// Day 7 the V1 home screen is replaced by this one in App.tsx; until
// then this component is wired only by V2App (a separate shell, not
// the main entry).

import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { useEngine, useSubjects } from "../../engine/hooks";
import { getDb } from "../../db/database";
import type { Subject, SubjectType } from "../../engine/state";
import { AddSubjectSheet } from "./AddSubjectSheet";

const TYPE_LABELS: Record<SubjectType, string> = {
  baby: "Baby",
  plant: "Plant",
  fitness: "Fitness",
  recovery: "Recovery",
  home: "Home",
  creative: "Creative",
  pet: "Pet",
  other: "Other",
};

interface SubjectTileProps {
  subject: Subject;
  onOpen: (id: string) => void;
  onSettings: (id: string) => void;
}

function SubjectTile({ subject, onOpen, onSettings }: SubjectTileProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    let urlToRevoke: string | null = null;
    void (async () => {
      const db = getDb();
      const entries = await db.entries
        .where("projectId")
        .equals(subject.id)
        .toArray();
      entries.sort((a, b) => b.capturedDate.localeCompare(a.capturedDate));
      if (cancelled) return;
      setEntryCount(entries.length);
      const latest = entries[0];
      if (!latest) {
        setThumbUrl(null);
        return;
      }
      const asset = await db.assets.get(latest.thumbnailBlobId);
      if (!asset || cancelled) return;
      const url = URL.createObjectURL(asset.blob);
      urlToRevoke = url;
      setThumbUrl(url);
    })();
    return () => {
      cancelled = true;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [subject.id, subject.updatedAt]);

  const cadenceLabel = subject.cadence === "daily" ? "Daily" : "Weekly";
  const countLabel =
    entryCount === 0
      ? "No moments yet"
      : entryCount === 1
        ? "1 moment"
        : `${entryCount} moments`;

  return (
    <button
      type="button"
      className="ll-subject-tile"
      onClick={() => onOpen(subject.id)}
    >
      <div className="ll-subject-tile-thumb" aria-hidden="true">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" />
        ) : (
          <div className="ll-subject-tile-thumb-empty">
            {subject.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="ll-subject-tile-body">
        <div className="ll-subject-tile-name">{subject.name}</div>
        <div className="ll-subject-tile-meta">
          <span>{TYPE_LABELS[subject.type]}</span>
          <span aria-hidden="true"> · </span>
          <span>{cadenceLabel}</span>
          <span aria-hidden="true"> · </span>
          <span>{countLabel}</span>
        </div>
      </div>
      <button
        type="button"
        className="ll-subject-tile-settings"
        aria-label={`Open settings for ${subject.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onSettings(subject.id);
        }}
      >
        Settings
      </button>
    </button>
  );
}

interface Props {
  onOpenSubject: (id: string) => void;
  onOpenSubjectSettings: (id: string) => void;
}

export function V2HomeScreen({ onOpenSubject, onOpenSubjectSettings }: Props) {
  const engine = useEngine();
  const subjects = useSubjects();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Refresh on mount so the latest cache is shown.
  useEffect(() => {
    void engine.listSubjects();
  }, [engine]);

  return (
    <div className="ll-content ll-stack-lg">
      <div className="ll-card">
        <div className="ll-subjects-header">
          <div>
            <h2 style={{ margin: 0 }}>Your subjects</h2>
            <p style={{ color: "var(--ll-text-soft)", margin: "4px 0 0 0" }}>
              {subjects.length === 0
                ? "Add your first subject to get started."
                : subjects.length === 1
                  ? "1 subject"
                  : `${subjects.length} subjects`}
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setSheetOpen(true)}
            aria-label="Add subject"
          >
            + Add subject
          </Button>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="ll-card">
          <p style={{ color: "var(--ll-text-soft)" }}>
            One photo at a time. Watch anything grow.
          </p>
          <p>
            Track a baby, a plant, a fitness cut, a renovation — anything
            that benefits from "same time, same angle" snapshots.
          </p>
          <Button
            variant="primary"
            block
            onClick={() => setSheetOpen(true)}
          >
            Add your first subject
          </Button>
        </div>
      ) : (
        <div className="ll-subject-tile-list">
          {subjects.map((subject) => (
            <SubjectTile
              key={subject.id}
              subject={subject}
              onOpen={onOpenSubject}
              onSettings={onOpenSubjectSettings}
            />
          ))}
        </div>
      )}

      <AddSubjectSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={(id) => {
          setSheetOpen(false);
          onOpenSubject(id);
        }}
      />
    </div>
  );
}
