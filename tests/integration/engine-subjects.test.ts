// Engine subject-method integration tests. Use fake-indexeddb so the
// engine touches a real Dexie instance. Each test instantiates a fresh
// engine with stub providers and exercises the public surface.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import {
  __resetMigrationFlagsForTesting,
} from "../../src/db/migrations/v1-to-v2";

function freshDb(): LittleLoopDB {
  return new LittleLoopDB(
    `little-loop-db-test-${Math.random().toString(36).slice(2)}`,
  );
}

function freshEngine(): Engine {
  return new Engine({
    iap: {
      isAvailable: () => false,
      buy: () => Promise.resolve({ ok: false, reason: "unavailable" }),
      restore: () => Promise.resolve("free"),
      getUnlock: () => Promise.resolve("free"),
    },
    platform: {
      share: () => Promise.resolve({ shared: false, reason: "unavailable" }),
      saveToCameraRoll: () => Promise.resolve(false),
      saveToFiles: () => Promise.resolve(false),
      pickFile: () => Promise.resolve(null),
    },
    ads: {
      shouldShow: () => false,
      impression: () => {},
      lastImpressionAt: () => null,
    },
  });
}

beforeEach(() => {
  __resetMigrationFlagsForTesting();
});

afterEach(() => {
  __setEngineForTesting(null);
  resetDbForTesting();
  __resetMigrationFlagsForTesting();
});

describe("Engine subject methods", () => {
  it("createSubject appends a subject and emits subjects-changed", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    let fired = 0;
    engine.on("subjects-changed", () => {
      fired += 1;
    });
    const subject = await engine.createSubject({
      name: "  Mia  ",
      type: "baby",
      cadence: "daily",
    });
    expect(subject.name).toBe("Mia"); // trimmed
    expect(subject.type).toBe("baby");
    expect(subject.cadence).toBe("daily");
    expect(subject.sortIndex).toBe(0);
    expect(fired).toBeGreaterThanOrEqual(1);
    const all = await db.subjects.toArray();
    expect(all).toHaveLength(1);
  });

  it("createSubject mirrors to V1 Project so legacy callers stay coherent", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    const subject = await engine.createSubject({
      name: "Basil",
      type: "plant",
      cadence: "weekly",
    });
    const v1 = await db.projects.get(subject.id);
    expect(v1).toBeDefined();
    expect(v1?.childName).toBe("Basil");
    expect(v1?.cadence).toBe("weekly");
    expect(v1?.dateOfBirth).toBe("");
  });

  it("renameSubject updates both Subject and mirrored Project", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    const subject = await engine.createSubject({
      name: "Original",
      type: "baby",
      cadence: "daily",
    });
    await engine.renameSubject(subject.id, "  New Name  ");
    const updated = await db.subjects.get(subject.id);
    const v1 = await db.projects.get(subject.id);
    expect(updated?.name).toBe("New Name");
    expect(v1?.childName).toBe("New Name");
  });

  it("renameSubject trims and rejects empty / too-long names", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    const subject = await engine.createSubject({
      name: "Mia",
      type: "baby",
      cadence: "daily",
    });
    await expect(engine.renameSubject(subject.id, "   ")).rejects.toThrow(
      /empty/,
    );
    await expect(
      engine.renameSubject(subject.id, "x".repeat(61)),
    ).rejects.toThrow(/60 characters/);
    // Subject unchanged on failed rename.
    const after = await db.subjects.get(subject.id);
    expect(after?.name).toBe("Mia");
  });

  it("reclassifySubject updates the type", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    const subject = await engine.createSubject({
      name: "Succulent",
      type: "plant",
      cadence: "weekly",
    });
    await engine.reclassifySubject(subject.id, "creative");
    const after = await db.subjects.get(subject.id);
    expect(after?.type).toBe("creative");
  });

  it("setSubjectCadence updates both Subject and mirrored Project", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    const subject = await engine.createSubject({
      name: "Mia",
      type: "baby",
      cadence: "daily",
    });
    await engine.setSubjectCadence(subject.id, "weekly");
    const updated = await db.subjects.get(subject.id);
    const v1 = await db.projects.get(subject.id);
    expect(updated?.cadence).toBe("weekly");
    expect(v1?.cadence).toBe("weekly");
  });

  it("deleteSubject removes the subject and its entries/assets", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    const subject = await engine.createSubject({
      name: "Mia",
      type: "baby",
      cadence: "daily",
    });
    await db.entries.add({
      id: "entry_test_1",
      projectId: subject.id,
      periodKey: "2025-06-15",
      capturedDate: "2025-06-15",
      imageBlobId: "asset_img",
      thumbnailBlobId: "asset_thumb",
      note: "",
      createdAt: "2025-06-15T10:00:00.000Z",
      updatedAt: "2025-06-15T10:00:00.000Z",
    });
    await db.assets.bulkAdd([
      {
        id: "asset_img",
        projectId: subject.id,
        type: "image",
        mimeType: "image/jpeg",
        width: 100,
        height: 100,
        byteSize: 1,
        blob: new Blob([new Uint8Array([0xff])], { type: "image/jpeg" }),
        createdAt: "2025-06-15T10:00:00.000Z",
      },
      {
        id: "asset_thumb",
        projectId: subject.id,
        type: "thumbnail",
        mimeType: "image/jpeg",
        width: 50,
        height: 50,
        byteSize: 1,
        blob: new Blob([new Uint8Array([0xff])], { type: "image/jpeg" }),
        createdAt: "2025-06-15T10:00:00.000Z",
      },
    ]);
    await engine.deleteSubject(subject.id);
    expect(await db.subjects.get(subject.id)).toBeUndefined();
    expect(await db.entries.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
  });

  it("listSubjectsSync reflects the latest subject cache", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    expect(engine.listSubjectsSync()).toHaveLength(0);
    await engine.createSubject({
      name: "A",
      type: "baby",
      cadence: "daily",
    });
    expect(engine.listSubjectsSync()).toHaveLength(1);
  });

  it("createSubject assigns a unique sortIndex per subject", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    const a = await engine.createSubject({
      name: "A",
      type: "baby",
      cadence: "daily",
    });
    const b = await engine.createSubject({
      name: "B",
      type: "baby",
      cadence: "daily",
    });
    const c = await engine.createSubject({
      name: "C",
      type: "baby",
      cadence: "daily",
    });
    expect(new Set([a.sortIndex, b.sortIndex, c.sortIndex]).size).toBe(3);
  });
});
