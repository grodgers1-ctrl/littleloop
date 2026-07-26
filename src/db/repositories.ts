import type { Cadence, Entry, Project } from "./schema";
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

export async function getActiveProject(): Promise<Project | undefined> {
  const db = getDb();
  // V1 only supports one project. Return the most recently updated.
  const all = await db.projects.toArray();
  if (all.length === 0) return undefined;
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export async function createProject(input: {
  childName: string;
  dateOfBirth: string;
  cadence: Cadence;
}): Promise<Project> {
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

export async function deleteAllProjectData(projectId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.projects, db.entries, db.assets, async () => {
    await db.entries.where("projectId").equals(projectId).delete();
    await db.assets.where("projectId").equals(projectId).delete();
    await db.projects.delete(projectId);
  });
}

export async function countEntries(projectId: string): Promise<number> {
  const db = getDb();
  return db.entries.where("projectId").equals(projectId).count();
}

export async function totalBytesUsed(projectId: string): Promise<number> {
  const db = getDb();
  const assets = await db.assets.where("projectId").equals(projectId).toArray();
  return assets.reduce((sum, a) => sum + a.byteSize, 0);
}

export async function listEntries(
  projectId: string,
): Promise<Entry[]> {
  const db = getDb();
  const all = await db.entries
    .where("projectId")
    .equals(projectId)
    .toArray();
  return all.sort((a, b) => b.capturedDate.localeCompare(a.capturedDate));
}

export async function findEntryForPeriod(
  projectId: string,
  periodKey: string,
): Promise<Entry | undefined> {
  const db = getDb();
  return db.entries
    .where("[projectId+periodKey]")
    .equals([projectId, periodKey])
    .first();
}

export function newEntryId(): string {
  return uid("entry");
}

export function newAssetId(): string {
  return uid("asset");
}

export function newProjectId(): string {
  return uid("proj");
}

export { nowIso, uid };