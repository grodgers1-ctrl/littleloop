// Sandbox database. A second Dexie instance with the same schema as the
// real project database, isolated by name ("little-loop-sandbox") so
// sandbox data never collides with the real timeline. This is what
// gives users a "play with sample photos" mode that they can delete
// without touching their real timeline.
//
// V2.0: mirrors the V2 schema (subjects + unlocks). The V1 → V2
// migration skips the sandbox — it is intentionally not migrated so
// a sandbox user can keep one Project row for the "sandbox mode" UX.

import Dexie, { type EntityTable } from "dexie";
import type { Asset, Entry, Project, StoredUnlock, Subject } from "./schema";

export const SANDBOX_DB_NAME = "little-loop-sandbox";
export const SANDBOX_PROJECT_ID = "proj_sandbox";

class LittleLoopSandboxDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  entries!: EntityTable<Entry, "id">;
  assets!: EntityTable<Asset, "id">;
  subjects!: EntityTable<Subject, "id">;
  unlocks!: EntityTable<StoredUnlock, "token">;

  constructor(name = SANDBOX_DB_NAME) {
    super(name);
    this.version(1).stores({
      projects: "&id",
      entries: "&id, projectId, [projectId+periodKey], capturedDate",
      assets: "&id, projectId, type",
    });
    this.version(2).stores({
      projects: "&id",
      entries: "&id, projectId, [projectId+periodKey], capturedDate",
      assets: "&id, projectId, type",
      subjects: "&id, name, type, sortIndex",
      unlocks: "&token, platform, product",
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
