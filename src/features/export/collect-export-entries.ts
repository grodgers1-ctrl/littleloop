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
  const all = await listEntries(project.id);
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