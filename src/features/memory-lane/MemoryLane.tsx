// V2.5 — MemoryLane component. Renders the "On this day" card on
// the home screen, showing up to 3 entries from past years that
// match today's day-month. The card is hidden when no matches
// exist (per the kickoff's empty-state guidance: "No memories
// for today yet — capture one to start your time machine.").

import { useEffect, useState } from "react";
import { getDb } from "../../db/database";
import { useOnThisDay, type OnThisDayEntry } from "./useOnThisDay";
import { todayDateOnly } from "../../lib/dates";
import { getSubjectName } from "./get-subject-name";
import { useSubjects } from "../../engine/hooks";

interface MemoryLaneProps {
  /** Override "today" for tests. Defaults to todayDateOnly(). */
  today?: string;
  /** Max entries to show. Default 3 (kickoff). */
  max?: number;
  /** Tap handler: open the entry in the timeline view. */
  onOpenEntry: (subjectId: string, entryId: string) => void;
}

export function MemoryLane({
  today,
  max = 3,
  onOpenEntry,
}: MemoryLaneProps) {
  const resolvedToday = today ?? todayDateOnly();
  const matches = useOnThisDay(resolvedToday, max);
  const subjects = useSubjects();
  const [thumbById, setThumbById] = useState<Record<string, string | null>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    const urlsToRevoke: string[] = [];
    void (async () => {
      const db = getDb();
      const out: Record<string, string | null> = {};
      for (const m of matches) {
        const asset = await db.assets.get(m.entry.thumbnailBlobId);
        if (!asset) {
          out[m.entry.id] = null;
          continue;
        }
        const url = URL.createObjectURL(asset.blob);
        urlsToRevoke.push(url);
        out[m.entry.id] = url;
      }
      if (cancelled) {
        urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setThumbById(out);
    })();
    return () => {
      cancelled = true;
      urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [matches]);

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="ll-card ll-memory-lane" data-testid="memory-lane">
      <div className="ll-memory-lane-header">
        <h3 className="ll-memory-lane-title">On this day</h3>
        <span className="ll-memory-lane-subtitle">
          {matches.length === 1
            ? "1 memory from a past year"
            : `${matches.length} memories from past years`}
        </span>
      </div>
      <div className="ll-memory-lane-grid">
        {matches.map((m) => (
          <MemoryLaneRow
            key={m.entry.id}
            match={m}
            subjectName={getSubjectName(subjects, m.entry.projectId)}
            thumbUrl={thumbById[m.entry.id] ?? null}
            onOpen={() => onOpenEntry(m.entry.projectId, m.entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MemoryLaneRow({
  match,
  subjectName,
  thumbUrl,
  onOpen,
}: {
  match: OnThisDayEntry;
  subjectName: string;
  thumbUrl: string | null;
  onOpen: () => void;
}) {
  const caption = matchYearsAgo(match.yearsAgo);
  return (
    <button
      type="button"
      className="ll-memory-lane-row"
      onClick={onOpen}
      aria-label={`Open ${caption} memory for ${subjectName}`}
      data-testid="memory-lane-row"
    >
      <div className="ll-memory-lane-thumb">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" />
        ) : (
          <div className="ll-memory-lane-thumb-empty" aria-hidden="true" />
        )}
      </div>
      <div className="ll-memory-lane-meta">
        <div className="ll-memory-lane-when">{caption}</div>
        <div className="ll-memory-lane-subject">{subjectName}</div>
      </div>
    </button>
  );
}

function matchYearsAgo(years: number): string {
  if (years === 1) return "1 year ago";
  if (years === 0) return "this year";
  return `${years} years ago`;
}
