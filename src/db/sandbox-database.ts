// Sandbox database. A second Dexie instance with the same schema as the
// real project database, isolated by name ("little-loop-sandbox") so
// sandbox data never collides with the real timeline. This is what
// gives users a "play with sample photos" mode that they can delete
// without touching their real timeline.
//
// Schema is identical to the main DB so the existing entry-service and
// image-processing logic can be reused.

import Dexie, { type EntityTable } from "dexie";
import type { Asset, Entry, Project } from "./schema";

export const SANDBOX_DB_NAME = "little-loop-sandbox";
export const SANDBOX_PROJECT_ID = "proj_sandbox";

class LittleLoopSandboxDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  entries!: EntityTable<Entry, "id">;
  assets!: EntityTable<Asset, "id">;

  constructor(name = SANDBOX_DB_NAME) {
    super(name);
    this.version(1).stores({
      projects: "&id",
      entries: "&id, projectId, [projectId+periodKey], capturedDate",
      assets: "&id, projectId, type",
    });
  }
}

let _sandboxDb: LittleLoopSandboxDB | null = null;

export function getSandboxDb(): LittleLoopSandboxDB {
  if (!_sandboxDb) _sandboxDb = new LittleLoopSandboxDB();
  return _sandboxDb;
}

export function setSandboxDbForTesting(db: LittleLoopSandboxDB): void {
  _sandboxDb = db;
}

export function resetSandboxDbForTesting(): void {
  _sandboxDb = null;
}

export { LittleLoopSandboxDB };