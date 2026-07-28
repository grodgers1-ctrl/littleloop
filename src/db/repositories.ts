import type { Cadence, Entry, Project, Subject, SubjectType } from "./schema";
import { getDb } from "./database";

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix: string): string {
  // crypto.randomUUID is available in modern browsers and modern Node test envs.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// V1 API — kept as deprecated wrappers so V1 callers compile unchanged.
// ---------------------------------------------------------------------------

/** @deprecated Use `getActiveSubject` from V2 onward. Kept for V1 callers. */
export async function getActiveProject(): Promise<Project | undefined> {
  const db = getDb();
  // V1 callers expect the legacy Project shape. Read from the V1
  // `projects` table, not the V2 `subjects` table. The two tables
  // share IDs (the V1 → V2 migration preserves them) but the row
  // shapes are not interchangeable.
  const all = await db.projects.toArray();
  if (all.length === 0) return undefined;
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** @deprecated Use `createSubject` from V2 onward. Kept for V1 callers. */
export async function createProject(input: {
  childName: string;
  dateOfBirth: string;
  cadence: Cadence;
}): Promise<Project> {
  // Create a V1 Project for legacy callers. The V2 migration will pick
  // this row up and produce a parallel Subject on next engine.init().
  const db = getDb();
  const now = nowIso();
  const project: Project = {
    id: uid("proj"),
    childName: input.childName.trim(),
    dateOfBirth: input.dateOfBirth,
    cadence: input.cadence,
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.add(project);
  return project;
}

/** @deprecated Use `updateSubject` from V2 onward. Kept for V1 callers. */
export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, "childName" | "dateOfBirth" | "cadence">>,
): Promise<Project> {
  const db = getDb();
  const existing = await db.projects.get(id);
  if (!existing) throw new Error("Project not found");
  const updated: Project = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };
  await db.projects.put(updated);
  return updated;
}

/** @deprecated Use `deleteSubject` from V2 onward. Kept for V1 callers. */
export async function deleteAllProjectData(projectId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.projects, db.entries, db.assets, async () => {
    await db.entries.where("projectId").equals(projectId).delete();
    await db.assets.where("projectId").equals(projectId).delete();
    await db.projects.delete(projectId);
  });
}

/** @deprecated Kept for V1 callers. */
export async function countEntries(projectId: string): Promise<number> {
  return countEntriesForSubject(projectId);
}

/** @deprecated Kept for V1 callers. */
export async function totalBytesUsed(projectId: string): Promise<number> {
  return totalBytesUsedForSubject(projectId);
}

/** @deprecated Kept for V1 callers. */
export async function listEntries(projectId: string): Promise<Entry[]> {
  return listEntriesForSubject(projectId);
}

/** @deprecated Kept for V1 callers. */
export async function findEntryForPeriod(
  projectId: string,
  periodKey: string,
): Promise<Entry | undefined> {
  return findEntryForPeriodForSubject(projectId, periodKey);
}

/** @deprecated Kept for V1 callers. */
export function newEntryId(): string {
  return uid("entry");
}

/** @deprecated Kept for V1 callers. */
export function newAssetId(): string {
  return uid("asset");
}

/** @deprecated Kept for V1 callers. */
export function newProjectId(): string {
  return uid("proj");
}

// ---------------------------------------------------------------------------
// V2 API — Subject. New code uses these.
// ---------------------------------------------------------------------------

/** Read the most-recently-updated subject. Returns undefined if none. */
export async function getActiveSubject(): Promise<Subject | undefined> {
  return getActiveSubjectInternal();
}

async function getActiveSubjectInternal(): Promise<Subject | undefined> {
  const db = getDb();
  const all = await db.subjects.toArray();
  if (all.length === 0) return undefined;
  return all.sort((a, b) => {
    // Primary: sortIndex ascending. Secondary: most-recently-updated
    // first as a tiebreaker.
    if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
    return b.updatedAt.localeCompare(a.updatedAt);
  })[0];
}

export async function listSubjects(): Promise<Subject[]> {
  const db = getDb();
  const all = await db.subjects.toArray();
  return all.sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export interface CreateSubjectInput {
  name: string;
  type: SubjectType;
  cadence: Cadence;
  referenceImageBlobId?: string;
}

export async function createSubject(
  input: CreateSubjectInput,
): Promise<Subject> {
  const db = getDb();
  const all = await db.subjects.toArray();
  const now = nowIso();
  const subject: Subject = {
    id: uid("subj"),
    name: input.name.trim(),
    type: input.type,
    cadence: input.cadence,
    referenceImageBlobId: input.referenceImageBlobId,
    createdAt: now,
    updatedAt: now,
    // Append to the end of the list.
    sortIndex: all.length === 0 ? 0 : Math.max(...all.map((s) => s.sortIndex)) + 1,
  };
  await db.subjects.add(subject);
  return subject;
}

export async function updateSubject(
  id: string,
  patch: Partial<
    Pick<Subject, "name" | "type" | "cadence" | "sortIndex" | "referenceImageBlobId">
  >,
): Promise<Subject> {
  const db = getDb();
  const existing = await db.subjects.get(id);
  if (!existing) throw new Error("Subject not found");
  const updated: Subject = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };
  await db.subjects.put(updated);
  return updated;
}

export async function deleteSubject(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.subjects, db.entries, db.assets, async () => {
    // Note: entries keep `projectId` (which == subject id) so the
    // entries are reachable via that index. Deleting a subject also
    // clears its entries and assets. The V1 `Project` row is kept
    // for backwards compatibility — V2.5 cleanup removes it.
    await db.entries.where("projectId").equals(id).delete();
    await db.assets.where("projectId").equals(id).delete();
    await db.subjects.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Entry helpers — V1 functions renamed to make Subject the first-class
// concept, but the underlying projectId index is unchanged.
// ---------------------------------------------------------------------------

async function countEntriesForSubject(subjectId: string): Promise<number> {
  const db = getDb();
  return db.entries.where("projectId").equals(subjectId).count();
}

async function totalBytesUsedForSubject(subjectId: string): Promise<number> {
  const db = getDb();
  const assets = await db.assets.where("projectId").equals(subjectId).toArray();
  return assets.reduce((sum, a) => sum + a.byteSize, 0);
}

async function listEntriesForSubject(subjectId: string): Promise<Entry[]> {
  const db = getDb();
  const all = await db.entries.where("projectId").equals(subjectId).toArray();
  return all.sort((a, b) => b.capturedDate.localeCompare(a.capturedDate));
}

async function findEntryForPeriodForSubject(
  subjectId: string,
  periodKey: string,
): Promise<Entry | undefined> {
  const db = getDb();
  return db.entries
    .where("[projectId+periodKey]")
    .equals([subjectId, periodKey])
    .first();
}

/** Generate a new subject id. Used by the migration and the engine. */
export function newSubjectId(): string {
  return uid("subj");
}

export { nowIso, uid };
