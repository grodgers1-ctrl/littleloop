// V1 → V2 migration. Runs once per device, on engine.init().
//
// V1 stored zero-or-one `Project` per device. V2 stores zero-or-more
// `Subject`s. The migration:
//   1. Reads each V1 `Project` row.
//   2. Writes a `Subject` row with the SAME id, `name = childName`,
//      `type = "baby"`, `cadence = project.cadence`.
//   3. Re-links are no-ops because the migration preserves the id —
//      V1 `Entry.projectId` already points at the right subject id.
//
// Idempotency: a localStorage flag marks the migration complete. The
// flag is checked at the top; if set, the function returns early.
// The flag is per-tenant (real DB vs sandbox DB) so the two databases
// stay independent. The flag survives service-worker upgrades because
// localStorage is origin-scoped, not SW-scoped.
//
// The migration is wrapped in a single IDB transaction so partial
// writes cannot leak. If the transaction throws, the localStorage
// flag is NOT set, and the migration re-runs on the next init.

import { getDb } from "../database";
import type { Project, Subject } from "../schema";

/** localStorage key for the real-DB migration flag. */
const MIGRATION_FLAG = "ll.v2.migration.done.v1";

/** localStorage key for the sandbox-DB migration flag. */
const SANDBOX_MIGRATION_FLAG = "ll.v2.migration.done.v1.sandbox";

/** Result of a migration attempt, surfaced for logging and tests. */
export interface MigrationResult {
  /** True when the migration ran (or did not need to run because the
   *  flag was set). False when the migration threw. */
  ok: boolean;
  /** Number of subjects created by this run. */
  created: number;
  /** Number of subjects already present before this run. */
  existing: number;
  /** The error, if `ok` is false. */
  error?: unknown;
}

/** Shape returned for inspection by tests and dev tools. */
export interface MigrationState {
  /** True if the migration flag is set (i.e. this device has been
   *  migrated already). */
  flagSet: boolean;
  /** Number of subjects present in the DB right now. */
  subjectCount: number;
  /** Number of projects present in the DB right now. */
  projectCount: number;
}

/** Read the current migration state without performing any work. */
export async function getMigrationState(): Promise<MigrationState> {
  const db = getDb();
  const [subjects, projects] = await Promise.all([
    db.subjects.toArray(),
    db.projects.toArray(),
  ]);
  return {
    flagSet: isFlagSet(MIGRATION_FLAG),
    subjectCount: subjects.length,
    projectCount: projects.length,
  };
}

/**
 * Run the V1 → V2 migration. Idempotent. Safe to call multiple times.
 *
 * Steps:
 *   1. Bail early if the flag is set.
 *   2. Open a single RW transaction over `projects` and `subjects`.
 *   3. For each project not already mirrored as a subject, write the
 *      subject row with the same id and `sortIndex` set to its
 *      insertion order.
 *   4. Commit. Set the flag only after the transaction resolves.
 *
 * Errors are caught and returned in `MigrationResult`. The caller is
 * expected to log and continue — the V1 surface keeps working even if
 * the migration fails (the V1 Project rows are untouched).
 */
export async function runV1ToV2Migration(): Promise<MigrationResult> {
  if (isFlagSet(MIGRATION_FLAG)) {
    const existing = await getDb().subjects.count();
    return { ok: true, created: 0, existing };
  }
  const db = getDb();
  let created = 0;
  try {
    await db.transaction("rw", db.projects, db.subjects, async () => {
      const [projects, existingSubjects] = await Promise.all([
        db.projects.toArray(),
        db.subjects.toArray(),
      ]);
      const existingIds = new Set(existingSubjects.map((s) => s.id));
      let sortIndex = existingSubjects.length;
      for (const project of projects) {
        if (existingIds.has(project.id)) continue;
        const subject = projectToSubject(project, sortIndex);
        await db.subjects.add(subject);
        existingIds.add(project.id);
        sortIndex += 1;
        created += 1;
      }
    });
    setFlag(MIGRATION_FLAG);
    const existing = await db.subjects.count();
    return { ok: true, created, existing };
  } catch (err) {
    return { ok: false, created, existing: created, error: err };
  }
}

/**
 * Sandbox migration stub. The sandbox database is intentionally NOT
 * migrated: it has a single hard-coded `proj_sandbox` row that the
 * V1 sandbox UX relies on. The function exists so the engine can
 * call it symmetrically without branching. It sets the sandbox flag
 * immediately and returns a no-op result.
 */
export async function runSandboxV1ToV2Migration(): Promise<MigrationResult> {
  if (isFlagSet(SANDBOX_MIGRATION_FLAG)) {
    return { ok: true, created: 0, existing: 0 };
  }
  setFlag(SANDBOX_MIGRATION_FLAG);
  return { ok: true, created: 0, existing: 0 };
}

/**
 * Test-only helper. Clears the migration flags so the migration can
 * be re-run from a fresh state. Production code does not use this.
 */
export function __resetMigrationFlagsForTesting(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(MIGRATION_FLAG);
    localStorage.removeItem(SANDBOX_MIGRATION_FLAG);
  } catch {
    /* storage may be unavailable in some test envs */
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function projectToSubject(project: Project, sortIndex: number): Subject {
  return {
    id: project.id,
    name: project.childName,
    type: "baby",
    cadence: project.cadence,
    // V2.0 doesn't use referenceImageBlobId; preserve undefined so the
    // field is absent on disk and Dexie doesn't materialise a `null`.
    referenceImageBlobId: undefined,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    sortIndex,
  };
}

function isFlagSet(key: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setFlag(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Storage may be full or disabled. The migration is still
    // effectively complete in IDB; the only consequence is the
    // migration will run again on next init (still safe — it's
    // idempotent at the row level).
  }
}
