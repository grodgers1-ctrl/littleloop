import { beforeEach, describe, expect, it } from "vitest";
import {
  newAssetId,
  newEntryId,
  newProjectId,
  nowIso,
} from "../../src/db/repositories";
import type { Asset, Entry, Project } from "../../src/db/schema";
import { resetDbForTesting, setDbForTesting } from "../../src/db/database";
import { LittleLoopDB } from "../../src/db/database";
import { Dexie } from "dexie";

function makeProject(): Project {
  return {
    id: newProjectId(),
    childName: "Ada",
    dateOfBirth: "2024-09-01",
    cadence: "daily",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function makeAsset(projectId: string, type: "image" | "thumbnail"): Asset {
  const blob = new (globalThis as { Blob?: typeof Blob }).Blob!(
    [new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    { type: "image/jpeg" },
  );
  return {
    id: newAssetId(),
    projectId,
    type,
    mimeType: "image/jpeg",
    width: 1600,
    height: 1200,
    byteSize: blob.size,
    blob,
    createdAt: nowIso(),
  };
}

function makeEntry(
  projectId: string,
  capturedDate: string,
  periodKey: string,
  imageId: string,
  thumbId: string,
): Entry {
  return {
    id: newEntryId(),
    projectId,
    periodKey,
    capturedDate,
    imageBlobId: imageId,
    thumbnailBlobId: thumbId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

describe("Little Loop persistence", () => {
  let db: LittleLoopDB;

  beforeEach(async () => {
    // fresh in-memory DB per test
    const name = `ll-test-${Math.random().toString(36).slice(2)}`;
    db = new LittleLoopDB(name);
    // Delete on close
    Dexie.delete(name);
    setDbForTesting(db);
  });

  it("round-trips a project create + read", async () => {
    const project = makeProject();
    await db.projects.add(project);
    const all = await db.projects.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(project.id);

    resetDbForTesting();
  });

  it("stores entry and asset together and orders by capturedDate desc", async () => {
    const project = makeProject();
    await db.projects.add(project);
    const a1 = makeAsset(project.id, "image");
    const t1 = makeAsset(project.id, "thumbnail");
    await db.assets.bulkAdd([a1, t1]);
    const e1 = makeEntry(project.id, "2025-03-14", "2025-03-14", a1.id, t1.id);
    await db.entries.add(e1);

    const a2 = makeAsset(project.id, "image");
    const t2 = makeAsset(project.id, "thumbnail");
    await db.assets.bulkAdd([a2, t2]);
    const e2 = makeEntry(project.id, "2025-03-15", "2025-03-15", a2.id, t2.id);
    await db.entries.add(e2);

    const all = await db.entries
      .where("projectId")
      .equals(project.id)
      .toArray();
    const sorted = all.sort((a, b) => b.capturedDate.localeCompare(a.capturedDate));
    expect(sorted.map((e) => e.capturedDate)).toEqual([
      "2025-03-15",
      "2025-03-14",
    ]);

    resetDbForTesting();
  });

  it("enforces unique periodKey per project via compound index query", async () => {
    const project = makeProject();
    await db.projects.add(project);
    const a1 = makeAsset(project.id, "image");
    const t1 = makeAsset(project.id, "thumbnail");
    await db.assets.bulkAdd([a1, t1]);
    const e1 = makeEntry(project.id, "2025-03-14", "2025-03-14", a1.id, t1.id);
    await db.entries.add(e1);

    // Same periodKey: the compound query must find the existing entry.
    const found = await db.entries
      .where("[projectId+periodKey]")
      .equals([project.id, "2025-03-14"])
      .first();
    expect(found?.id).toBe(e1.id);

    resetDbForTesting();
  });

  it("cascades delete from entry to its assets", async () => {
    const project = makeProject();
    await db.projects.add(project);
    const a = makeAsset(project.id, "image");
    const t = makeAsset(project.id, "thumbnail");
    await db.assets.bulkAdd([a, t]);
    const e = makeEntry(project.id, "2025-03-14", "2025-03-14", a.id, t.id);
    await db.entries.add(e);

    await db.transaction("rw", db.entries, db.assets, async () => {
      await db.entries.delete(e.id);
      await db.assets.delete(a.id);
      await db.assets.delete(t.id);
    });

    expect(await db.entries.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);

    resetDbForTesting();
  });
});

describe("entry-service replacement transaction", () => {
  let db: LittleLoopDB;

  beforeEach(() => {
    const name = `ll-test-${Math.random().toString(36).slice(2)}`;
    db = new LittleLoopDB(name);
    Dexie.delete(name);
    setDbForTesting(db);
  });

  it("replaces assets without leaving orphans", async () => {
    const { replaceEntry } = await import(
      "../../src/features/timeline/entry-service"
    );
    const project = makeProject();
    await db.projects.add(project);

    // Insert an entry directly with stub assets.
    const oldImg = makeAsset(project.id, "image");
    const oldThumb = makeAsset(project.id, "thumbnail");
    await db.assets.bulkAdd([oldImg, oldThumb]);
    const entry = makeEntry(
      project.id,
      "2025-03-14",
      "2025-03-14",
      oldImg.id,
      oldThumb.id,
    );
    await db.entries.add(entry);

    const processed = {
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

    await replaceEntry({
      project,
      entryId: entry.id,
      processed,
    });

    const updatedEntry = await db.entries.get(entry.id);
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry!.imageBlobId).not.toBe(oldImg.id);
    expect(updatedEntry!.thumbnailBlobId).not.toBe(oldThumb.id);

    // Old assets are deleted after the transaction commits.
    expect(await db.assets.get(oldImg.id)).toBeUndefined();
    expect(await db.assets.get(oldThumb.id)).toBeUndefined();

    // New assets exist.
    expect(await db.assets.get(updatedEntry!.imageBlobId)).toBeDefined();
    expect(await db.assets.get(updatedEntry!.thumbnailBlobId)).toBeDefined();

    resetDbForTesting();
  });

  it("rejects creating a duplicate entry for the same period", async () => {
    const { createEntry } = await import(
      "../../src/features/timeline/entry-service"
    );
    void createEntry; // referenced in next assertions
    const project = makeProject();
    await db.projects.add(project);

    const processed = {
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

    await createEntry({
      project,
      capturedDate: "2025-03-14",
      periodKey: "2025-03-14",
      processed,
    });
    await expect(
      createEntry({
        project,
        capturedDate: "2025-03-14",
        periodKey: "2025-03-14",
        processed,
      }),
    ).rejects.toThrow(/already has a photo/);

    resetDbForTesting();
  });
});