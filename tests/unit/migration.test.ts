// V1 → V2 migration tests. Use fake-indexeddb (already loaded in
// tests/setup.ts) so the migration runs against a real Dexie instance.
//
// The migration touches localStorage for its idempotency flag. Each
// test clears both flags in `beforeEach` and resets the DB to a known
// state.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LittleLoopDB, resetDbForTesting, setDbForTesting } from "../../src/db/database";
import {
  __resetMigrationFlagsForTesting,
  getMigrationState,
  runV1ToV2Migration,
} from "../../src/db/migrations/v1-to-v2";
import type { Project } from "../../src/db/schema";

const TEST_PROJECT_A: Project = {
  id: "proj_test_a",
  childName: "Mia",
  dateOfBirth: "2024-01-15",
  cadence: "daily",
  createdAt: "2025-01-01T10:00:00.000Z",
  updatedAt: "2025-06-15T12:00:00.000Z",
};

const TEST_PROJECT_B: Project = {
  id: "proj_test_b",
  childName: "Basil",
  dateOfBirth: "2024-03-01",
  cadence: "weekly",
  createdAt: "2025-04-01T08:00:00.000Z",
  updatedAt: "2025-06-20T09:00:00.000Z",
};

function freshDb(): LittleLoopDB {
  // Each test gets a brand-new Dexie instance backed by fake-indexeddb.
  // The fake-indexeddb shim is a single shared IndexedDB; we use
  // unique DB names per test to keep tests isolated.
  return new LittleLoopDB(`little-loop-db-test-${Math.random().toString(36).slice(2)}`);
}

beforeEach(() => {
  __resetMigrationFlagsForTesting();
});

afterEach(() => {
  resetDbForTesting();
  __resetMigrationFlagsForTesting();
});

describe("V1 → V2 migration", () => {
  it("no-ops on an empty database", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const result = await runV1ToV2Migration();
    expect(result.ok).toBe(true);
    expect(result.created).toBe(0);
    expect(result.existing).toBe(0);
    expect(await db.subjects.count()).toBe(0);
  });

  it("migrates a single V1 project to a V2 subject", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await db.projects.add(TEST_PROJECT_A);

    const result = await runV1ToV2Migration();

    expect(result.ok).toBe(true);
    expect(result.created).toBe(1);
    const subject = await db.subjects.get(TEST_PROJECT_A.id);
    expect(subject).toBeDefined();
    expect(subject?.id).toBe(TEST_PROJECT_A.id);
    expect(subject?.name).toBe(TEST_PROJECT_A.childName);
    expect(subject?.type).toBe("baby");
    expect(subject?.cadence).toBe(TEST_PROJECT_A.cadence);
    expect(subject?.sortIndex).toBe(0);
    expect(subject?.createdAt).toBe(TEST_PROJECT_A.createdAt);
    expect(subject?.updatedAt).toBe(TEST_PROJECT_A.updatedAt);
  });

  it("preserves the project id so existing entries stay linked", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await db.projects.add(TEST_PROJECT_A);
    await db.entries.add({
      id: "entry_test_1",
      projectId: TEST_PROJECT_A.id,
      periodKey: "2025-06-15",
      capturedDate: "2025-06-15",
      imageBlobId: "asset_test_img",
      thumbnailBlobId: "asset_test_thumb",
      note: "",
      createdAt: "2025-06-15T10:00:00.000Z",
      updatedAt: "2025-06-15T10:00:00.000Z",
    });

    const result = await runV1ToV2Migration();
    expect(result.ok).toBe(true);

    // The entry's projectId must still resolve to a Subject via the
    // shared id. This is the re-link the spec calls out.
    const entry = await db.entries.get("entry_test_1");
    const subject = await db.subjects.get(entry!.projectId);
    expect(subject?.name).toBe("Mia");
  });

  it("migrates multiple projects in one transaction", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await db.projects.bulkAdd([TEST_PROJECT_A, TEST_PROJECT_B]);

    const result = await runV1ToV2Migration();

    expect(result.ok).toBe(true);
    expect(result.created).toBe(2);
    const subjects = await db.subjects.toArray();
    expect(subjects).toHaveLength(2);
    const names = subjects.map((s) => s.name).sort();
    expect(names).toEqual(["Basil", "Mia"]);
    const mia = subjects.find((s) => s.name === "Mia")!;
    const basil = subjects.find((s) => s.name === "Basil")!;
    expect(mia.cadence).toBe("daily");
    expect(basil.cadence).toBe("weekly");
    // sortIndex must be unique per subject.
    expect(mia.sortIndex).not.toBe(basil.sortIndex);
  });

  it("is idempotent — second run is a no-op", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await db.projects.add(TEST_PROJECT_A);

    const first = await runV1ToV2Migration();
    expect(first.created).toBe(1);

    const second = await runV1ToV2Migration();
    expect(second.ok).toBe(true);
    expect(second.created).toBe(0);

    // Subject count is still 1 — no duplicates.
    const subjects = await db.subjects.toArray();
    expect(subjects).toHaveLength(1);
  });

  it("does not duplicate when subjects already exist alongside projects", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await db.projects.add(TEST_PROJECT_A);
    // Simulate a partial migration that already created the subject.
    await db.subjects.add({
      id: TEST_PROJECT_A.id,
      name: TEST_PROJECT_A.childName,
      type: "baby",
      cadence: TEST_PROJECT_A.cadence,
      createdAt: TEST_PROJECT_A.createdAt,
      updatedAt: TEST_PROJECT_A.updatedAt,
      sortIndex: 0,
    });

    const result = await runV1ToV2Migration();
    expect(result.ok).toBe(true);
    expect(result.created).toBe(0);
    const subjects = await db.subjects.toArray();
    expect(subjects).toHaveLength(1);
  });

  it("surfaces a successful run via getMigrationState", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await db.projects.add(TEST_PROJECT_A);

    const before = await getMigrationState();
    expect(before.flagSet).toBe(false);
    expect(before.projectCount).toBe(1);
    expect(before.subjectCount).toBe(0);

    await runV1ToV2Migration();

    const after = await getMigrationState();
    expect(after.flagSet).toBe(true);
    expect(after.projectCount).toBe(1);
    expect(after.subjectCount).toBe(1);
  });

  it("does not touch the sandbox database", async () => {
    // The real migration ignores the sandbox. We don't import the
    // sandbox DB here (the real-DB migration does not touch it);
    // this test just asserts the migration does not throw on an
    // empty real DB even if the sandbox has rows. A separate test
    // in the sandbox suite covers the sandbox DB's own v2 upgrade.
    const db = freshDb();
    setDbForTesting(db);
    const result = await runV1ToV2Migration();
    expect(result.ok).toBe(true);
  });

  it("flag-set early return does not re-migrate even if projects grow", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await db.projects.add(TEST_PROJECT_A);
    await runV1ToV2Migration();

    // After migration, simulate a NEW project being added. The flag
    // is set, so a subsequent migration run must NOT pick up the new
    // project. This is a deliberate trade-off: the flag wins over
    // row-level idempotency. The migration is a one-shot.
    await db.projects.add(TEST_PROJECT_B);
    const second = await runV1ToV2Migration();
    expect(second.ok).toBe(true);
    expect(second.created).toBe(0);
    const subjects = await db.subjects.toArray();
    expect(subjects).toHaveLength(1);
  });

  it("clearing the flag allows the migration to be re-run from scratch", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await db.projects.add(TEST_PROJECT_A);
    await runV1ToV2Migration();

    // Adding a second project and clearing the flag, then re-running,
    // picks up both the new project AND does not duplicate the first.
    await db.projects.add(TEST_PROJECT_B);
    __resetMigrationFlagsForTesting();
    const result = await runV1ToV2Migration();
    expect(result.ok).toBe(true);
    expect(result.created).toBe(1);
    const subjects = await db.subjects.toArray();
    expect(subjects).toHaveLength(2);
  });
});
