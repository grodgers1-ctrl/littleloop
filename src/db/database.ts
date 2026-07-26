import Dexie, { type EntityTable } from "dexie";
import type { Asset, Entry, Project } from "./schema";

// Single Dexie database for the app. The schema mirrors the
// V1_DEV_SPEC.md Implementation Detail Addendum (section C).
class LittleLoopDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  entries!: EntityTable<Entry, "id">;
  assets!: EntityTable<Asset, "id">;

  constructor(name = "little-loop-db") {
    super(name);
    // Compound index [projectId+periodKey] enforces unique period in app code.
    this.version(1).stores({
      projects: "&id",
      entries: "&id, projectId, [projectId+periodKey], capturedDate",
      assets: "&id, projectId, type",
    });
  }
}

// Lazily instantiated so tests can swap in fake-indexeddb before construction.
let _db: LittleLoopDB | null = null;

export function getDb(): LittleLoopDB {
  if (!_db) _db = new LittleLoopDB();
  return _db;
}

export function setDbForTesting(db: LittleLoopDB): void {
  _db = db;
}

export function resetDbForTesting(): void {
  _db = null;
}

export { LittleLoopDB };