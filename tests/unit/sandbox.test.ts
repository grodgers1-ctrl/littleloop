import { beforeEach, describe, expect, it } from "vitest";
import { Dexie } from "dexie";
import {
  LittleLoopSandboxDB,
  resetSandboxDbForTesting,
  setSandboxDbForTesting,
} from "../../src/db/sandbox-database";
import {
  countSandboxAssets,
  countSandboxEntries,
  deleteSandbox,
  initSandbox,
  listSandboxEntries,
  totalSandboxBytes,
} from "../../src/db/sandbox-repositories";
import { bulkImportSandbox } from "../../src/features/sandbox/sandbox-import";
import type { ProcessedImage } from "../../src/lib/image-processing";
import type { Entry } from "../../src/db/schema";

function fakeProcessed(): ProcessedImage {
  return {
    image: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    }),
    thumbnail: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    }),
    width: 1600,
    height: 1200,
    thumbWidth: 480,
    thumbHeight: 360,
    imageBytes: 4,
    thumbBytes: 4,
  };
}

describe("sandbox DB", () => {
  let db: LittleLoopSandboxDB;

  beforeEach(() => {
    const name = `ll-sandbox-test-${Math.random().toString(36).slice(2)}`;
    db = new LittleLoopSandboxDB(name);
    Dexie.delete(name);
    setSandboxDbForTesting(db);
  });

  it("initSandbox creates exactly one project with the sandbox id", async () => {
    const project = await initSandbox();
    expect(project.id).toBe("proj_sandbox");
    const all = await db.projects.toArray();
    expect(all).toHaveLength(1);
  });

  it("initSandbox is idempotent", async () => {
    const a = await initSandbox();
    const b = await initSandbox();
    expect(a.id).toBe(b.id);
    expect(await db.projects.count()).toBe(1);
  });

  it("starts with zero entries and zero assets", async () => {
    await initSandbox();
    expect(await countSandboxEntries()).toBe(0);
    expect(await countSandboxAssets()).toBe(0);
    expect(await totalSandboxBytes()).toBe(0);
  });

  it("bulkImportSandbox assigns consecutive dates newest-first", async () => {
    await initSandbox();
    const result = await bulkImportSandbox({
      processed: [fakeProcessed(), fakeProcessed(), fakeProcessed()],
      now: new Date(2026, 6, 26),
    });
    expect(result.createdEntryIds).toHaveLength(3);
    expect(result.skipped).toBe(0);
    expect(result.assignedDates).toEqual([
      "2026-07-26",
      "2026-07-25",
      "2026-07-24",
    ]);
    const entries = await listSandboxEntries();
    // Newest first per listSandboxEntries contract
    expect(entries.map((e: Entry) => e.capturedDate)).toEqual([
      "2026-07-26",
      "2026-07-25",
      "2026-07-24",
    ]);
    // 2 assets per entry (image + thumbnail)
    expect(await countSandboxAssets()).toBe(6);
  });

  it("bulkImportSandbox never writes a duplicate periodKey in one batch", async () => {
    await initSandbox();
    await bulkImportSandbox({
      processed: Array.from({ length: 5 }, () => fakeProcessed()),
      now: new Date(2026, 6, 26),
    });
    const entries = await listSandboxEntries();
    const keys = entries.map((e: Entry) => e.periodKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("sandbox data is isolated from the real DB", async () => {
    // Both DBs live in this test env. Set up a real DB with a project,
    // set up the sandbox with its own project, and verify neither
    // sees the other's data.
    const { LittleLoopDB, resetDbForTesting, setDbForTesting } =
      await import("../../src/db/database");
    const realName = `ll-real-test-${Math.random().toString(36).slice(2)}`;
    const realDb = new LittleLoopDB(realName);
    Dexie.delete(realName);
    setDbForTesting(realDb);

    await realDb.projects.add({
      id: "proj_real",
      childName: "RealKid",
      dateOfBirth: "2024-01-01",
      cadence: "daily",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await realDb.entries.add({
      id: "entry_real",
      projectId: "proj_real",
      periodKey: "2026-07-26",
      capturedDate: "2026-07-26",
      imageBlobId: "a",
      thumbnailBlobId: "b",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Sandbox writes happen against db (the sandbox DB)
    await bulkImportSandbox({
      processed: [fakeProcessed(), fakeProcessed()],
      now: new Date(2026, 6, 26),
    });

    // Sandbox: 2 entries
    expect(await countSandboxEntries()).toBe(2);
    // Real DB: still 1 entry, not 3
    expect(await realDb.entries.count()).toBe(1);
    // Real DB has only "proj_real"
    const realProjects = await realDb.projects.toArray();
    expect(realProjects.map((p) => p.id)).toEqual(["proj_real"]);
    // Sandbox DB has only "proj_sandbox"
    const sandboxProjects = await db.projects.toArray();
    expect(sandboxProjects.map((p) => p.id)).toEqual(["proj_sandbox"]);

    resetDbForTesting();
    resetSandboxDbForTesting();
  });

  it("deleteSandbox removes every entry, asset, and the project row", async () => {
    await initSandbox();
    await bulkImportSandbox({
      processed: Array.from({ length: 3 }, () => fakeProcessed()),
    });
    expect(await db.entries.count()).toBe(3);
    expect(await db.assets.count()).toBe(6);
    await deleteSandbox();
    expect(await db.entries.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
    expect(await db.projects.count()).toBe(0);
  });
});