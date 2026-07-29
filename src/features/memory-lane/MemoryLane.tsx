// V2.5 — MemoryLane component. Renders the "On this day" card on
// the home screen, showing up to 3 entries from past years that
// match today's day-month.
//
// V2.5.1 hotfix — the card now renders in two states:
//   - matches: the original "1 year ago" / "X years ago" grid
//   - empty:   a graceful "start your time machine" prompt with
//              a + Add a moment CTA. The kickoff said "renders
//              nothing when no matches" but the user asked for
//              a graceful empty state — the card always surfaces
//              so the feature is discoverable on day 1.

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
  /**
   * V2.5.1 hotfix — invoked when the user taps the empty-state
   * "Add a moment" CTA. The home screen wires this to its
   * subject picker / creation flow.
   */
  onAddMoment?: () => void;
}

export function MemoryLane({
  today,
  max = 3,
  onOpenEntry,
  onAddMoment,
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
    return (
      <div
        className="ll-card ll-memory-lane ll-memory-lane-empty"
        data-testid="memory-lane-empty"
      >
        <div className="ll-memory-lane-header">
          <h3 className="ll-memory-lane-title">On this day</h3>
        </div>
        <p className="ll-memory-lane-empty-body">
          Capture today's moment and we'll show you the same day
          in years to come. Your time machine starts here.
        </p>
        {onAddMoment ? (
          <button
            type="button"
            className="ll-memory-lane-empty-cta"
            onClick={onAddMoment}
            data-testid="memory-lane-empty-cta"
          >
            + Add a moment
          </button>
        ) : null}
      </div>
    );
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
