// Shared date-collection helper used by the export screen. Kept in its own
// file so the screen module can export only the React component.

import { todayDateOnly } from "../../lib/dates";
import { listEntries } from "../../db/repositories";
import type { Entry, Project } from "../../db/schema";

export type DateRange = "all" | "month" | "custom";

export async function collectExportEntries(
  project: Project,
  opts: { range: DateRange; customFrom: string; customTo: string },
): Promise<Entry[]> {
  // listEntries returns newest-first (timeline display order). The
  // flipbook export reverses this to oldest-first so the video
  // shows the child growing up across the timeline, which matches
  // how parents naturally narrate the journey.
  const newestFirst = await listEntries(project.id);
  const all = [...newestFirst].reverse();
  if (opts.range === "all") return all;
  if (opts.range === "month") {
    const today = todayDateOnly();
    const month = today.slice(0, 7);
    return all.filter((e) => e.capturedDate.startsWith(month));
  }
  const from = opts.customFrom;
  const to = opts.customTo;
  return all.filter((e) => e.capturedDate >= from && e.capturedDate <= to);
}