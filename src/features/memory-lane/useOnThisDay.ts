// V2.5 — "On this day" memory lane hook.
//
// The home screen shows past entries whose day-month matches
// today. This module exports:
//   - `findOnThisDayEntries(entries, today, now)` — pure
//     selector over a list of entries.
//   - `useOnThisDay(today)` — React hook that subscribes to
//     the engine's `subjects-changed` event and returns the
//     matching entries across all subjects.
//
// The hook lives in the features/ tree because it's UI
// composition (not engine logic); the engine is data-only and
// remains React-free.

import { useEffect, useState } from "react";
import { useEngine, useSubjects } from "../../engine/hooks";
import { getDb } from "../../db/database";
import type { Entry } from "../../db/schema";

/** Result of an "on this day" lookup. */
export interface OnThisDayEntry {
  entry: Entry;
  /** "X years ago" — years between the entry and today. */
  yearsAgo: number;
}

/**
 * Pure selector: filter `entries` to those whose `capturedDate`
 * has the same day-month as `today` and is strictly earlier
 * (i.e. in a past year). Returns the matches sorted by recency
 * (most recent past year first) and capped at `max`.
 *
 * `now` is parameterised so tests can pin the clock.
 */
export function findOnThisDayEntries(
  entries: Entry[],
  today: string,
  now: Date = new Date(),
  max: number = 3,
): OnThisDayEntry[] {
  const todayParts = parseYearMonthDay(today);
  if (!todayParts) return [];
  const thisYear = now.getFullYear();
  // Compute the matches.
  const matches: OnThisDayEntry[] = [];
  for (const e of entries) {
    const parts = parseYearMonthDay(e.capturedDate);
    if (!parts) continue;
    if (parts.month !== todayParts.month) continue;
    if (parts.day !== todayParts.day) continue;
    if (parts.year >= thisYear) continue;
    matches.push({ entry: e, yearsAgo: thisYear - parts.year });
  }
  // Most recent past year first; tiebreak by entry id.
  matches.sort((a, b) => {
    if (a.yearsAgo !== b.yearsAgo) return a.yearsAgo - b.yearsAgo;
    return a.entry.id.localeCompare(b.entry.id);
  });
  return matches.slice(0, max);
}

interface YearMonthDay {
  year: number;
  month: number;
  day: number;
}

function parseYearMonthDay(s: string): YearMonthDay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return { year: y, month: m, day: d };
}

/**
 * React hook: returns up to `max` "on this day" entries across
 * all subjects. Refreshes when the engine's `subjects-changed`
 * event fires (which also covers the entry-mutation paths in
 * V2.5: a new capture changes `subject.updatedAt`, which
 * triggers the event).
 */
export function useOnThisDay(
  today: string,
  max: number = 3,
): OnThisDayEntry[] {
  const engine = useEngine();
  const subjects = useSubjects();
  const [matches, setMatches] = useState<OnThisDayEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const db = getDb();
        // Read all entries. This is a single IDB scan; with
        // realistic timelines (a few hundred entries per subject)
        // the cost is well under a frame. The hook is only
        // mounted on the home screen, so it does not run on
        // every interaction.
        const allEntries = await db.entries.toArray();
        if (cancelled) return;
        setMatches(findOnThisDayEntries(allEntries, today, new Date(), max));
      } catch {
        if (!cancelled) setMatches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, subjects, today, max]);

  return matches;
}
