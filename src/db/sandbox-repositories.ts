// Sandbox DB repository functions. Mirror the real project's
// repositories.ts but write to the sandbox DB so a misstep here cannot
// ever touch the real timeline.

import { getSandboxDb, SANDBOX_PROJECT_ID } from "./sandbox-database";
import type { Asset, Entry, Project } from "./schema";

export const SANDBOX_CHILD_NAME = "Sandbox";
export const SANDBOX_DOB = "2024-01-01"; // arbitrary, only used for age display

// Internal: build the single sandbox project row. Idempotent.
async function ensureSandboxProject(): Promise<Project> {
  const db = getSandboxDb();
  const existing = await db.projects.get(SANDBOX_PROJECT_ID);
  if (existing) return existing;
  const project: Project = {
    id: SANDBOX_PROJECT_ID,
    childName: SANDBOX_CHILD_NAME,
    dateOfBirth: SANDBOX_DOB,
    cadence: "daily",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.projects.add(project);
  return project;
}

export async function getSandboxProject(): Promise<Project | undefined> {
  const db = getSandboxDb();
  return db.projects.get(SANDBOX_PROJECT_ID);
}

export async function initSandbox(): Promise<Project> {
  return ensureSandboxProject();
}

export async function listSandboxEntries(): Promise<Entry[]> {
  const db = getSandboxDb();
  const all = await db.entries
    .where("projectId")
    .equals(SANDBOX_PROJECT_ID)
    .toArray();
  return all.sort((a, b) => b.capturedDate.localeCompare(a.capturedDate));
}

export async function countSandboxEntries(): Promise<number> {
  const db = getSandboxDb();
  return db.entries.where("projectId").equals(SANDBOX_PROJECT_ID).count();
}

export async function countSandboxAssets(): Promise<number> {
  const db = getSandboxDb();
  return db.assets.where("projectId").equals(SANDBOX_PROJECT_ID).count();
}

export async function totalSandboxBytes(): Promise<number> {
  const db = getSandboxDb();
  const assets = await db.assets
    .where("projectId")
    .equals(SANDBOX_PROJECT_ID)
    .toArray();
  return assets.reduce((sum, a) => sum + a.byteSize, 0);
}

export async function deleteSandbox(): Promise<void> {
  const db = getSandboxDb();
  await db.transaction("rw", db.projects, db.entries, db.assets, async () => {
    await db.entries.where("projectId").equals(SANDBOX_PROJECT_ID).delete();
    await db.assets.where("projectId").equals(SANDBOX_PROJECT_ID).delete();
    await db.projects.delete(SANDBOX_PROJECT_ID);
  });
}

export async function readAllSandboxAssets(): Promise<Asset[]> {
  const db = getSandboxDb();
  return db.assets.where("projectId").equals(SANDBOX_PROJECT_ID).toArray();
}