// V2.5 — small helper: look up a subject's name by id. Falls
// back to "Unknown" if the subject is not in the list. Extracted
// so the MemoryLane component stays focused on layout.

import type { Subject } from "../../engine/state";

export function getSubjectName(
  subjects: Subject[],
  subjectId: string,
): string {
  const s = subjects.find((x) => x.id === subjectId);
  return s?.name ?? "Unknown";
}
