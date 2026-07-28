import Dexie, { type EntityTable } from "dexie";
import type { Asset, Entry, Project, StoredUnlock, Subject } from "./schema";

// Single Dexie database for the app.
//
// V2.0 schema (version 2):
//   - V1 tables (projects, entries, assets) are kept unchanged so the
//     V1 export path and the V1 backup service compile and run.
//   - New `subjects` table mirrors `projects` with a V2-shaped row.
//     The V1 → V2 migration copies each V1 Project into a Subject
//     (same id) so V2 code can read subjects without touching the
//     V1 callers.
//   - New `unlocks` table holds the IAP receipt store. Empty until
//     Day 4 wires the IAP provider.
//
// The entries index `projectId` is kept (not renamed) so we don't
// rebuild the compound `[projectId+periodKey]` index in the same
// migration. V2 code reads `subjectId` via a type alias. The rename
// to `subjectId` (and a compound `[subjectId+periodKey]` index)
// happens in V2.5 with a proper version(3) bump.
class LittleLoopDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  entries!: EntityTable<Entry, "id">;
  assets!: EntityTable<Asset, "id">;
  // V2.0 stores
  subjects!: EntityTable<Subject, "id">;
  unlocks!: EntityTable<StoredUnlock, "token">;

  constructor(name = "little-loop-db") {
    super(name);
    // V1 schema (preserved unchanged for backwards compatibility).
    this.version(1).stores({
      projects: "&id",
      entries: "&id, projectId, [projectId+periodKey], capturedDate",
      assets: "&id, projectId, type",
    });
    // V2.0 schema. Adds subjects + unlocks. The existing V1 indexes
    // are re-declared verbatim so Dexie doesn't drop them during the
    // upgrade. `unlocks` is keyed by `&token` (receipt tokens are
    // unique per purchase) plus secondary indexes on platform, product.
    this.version(2).stores({
      projects: "&id",
      entries: "&id, projectId, [projectId+periodKey], capturedDate",
      assets: "&id, projectId, type",
      subjects: "&id, name, type, sortIndex",
      unlocks: "&token, platform, product",
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
