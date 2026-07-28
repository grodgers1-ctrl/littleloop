import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import { Dexie } from "dexie";
import { LittleLoopDB, resetDbForTesting, setDbForTesting } from "../../src/db/database";
import { newAssetId, newEntryId, nowIso } from "../../src/db/repositories";
import type { Asset, Entry, Project } from "../../src/db/schema";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  createBackup,
  readBackupFile,
  restoreBackup,
  type BackupManifest,
} from "../../src/features/backup/backup-service";

function makeProject(): Project {
  return {
    id: "proj_test1",
    childName: "Ada",
    dateOfBirth: "2024-09-01",
    cadence: "daily",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function makeEntry(
  projectId: string,
  capturedDate: string,
  periodKey: string,
): { entry: Entry; img: Asset; thumb: Asset } {
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
    type: "image/jpeg",
  });
  const img: Asset = {
    id: newAssetId(),
    projectId,
    type: "image",
    mimeType: "image/jpeg",
    width: 1600,
    height: 1200,
    byteSize: blob.size,
    blob,
    createdAt: nowIso(),
  };
  const thumb: Asset = {
    id: newAssetId(),
    projectId,
    type: "thumbnail",
    mimeType: "image/jpeg",
    width: 480,
    height: 360,
    byteSize: blob.size,
    blob,
    createdAt: nowIso(),
  };
  const entry: Entry = {
    id: newEntryId(),
    projectId,
    periodKey,
    capturedDate,
    imageBlobId: img.id,
    thumbnailBlobId: thumb.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return { entry, img, thumb };
}

async function seedOneEntry() {
  const db = new LittleLoopDB(`ll-test-${Math.random().toString(36).slice(2)}`);
  setDbForTesting(db);
  const project = makeProject();
  await db.projects.add(project);
  const { entry, img, thumb } = makeEntry(project.id, "2025-03-14", "2025-03-14");
  await db.assets.bulkAdd([img, thumb]);
  await db.entries.add(entry);
  return { project, entry, img, thumb, db };
}

describe(".babyflip backup + restore", () => {
  beforeEach(() => {
    resetDbForTesting();
  });

  it("creates a backup blob containing manifest and image entries", async () => {
    const { project } = await seedOneEntry();
    const blob = await createBackup(project);
    expect(blob.size).toBeGreaterThan(0);
    const ab = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(new Uint8Array(ab));
    const manifestFile = zip.file("manifest.json");
    expect(manifestFile).toBeTruthy();
    const manifest = JSON.parse(
      await manifestFile!.async("string"),
    ) as BackupManifest;
    expect(manifest.format).toBe(BACKUP_FORMAT);
    expect(manifest.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    // V1 backup always writes the project field.
    expect(manifest.project!.childName).toBe("Ada");
    expect(manifest.entries.length).toBe(1);
    expect(zip.file(manifest.entries[0].imagePath)).toBeTruthy();
  });

  it("reads back a valid backup and reports counts", async () => {
    const { project } = await seedOneEntry();
    const blob = await createBackup(project);
    const file = new File([blob], "test.babyflip");
    const summary = await readBackupFile(file);
    expect(summary.projectName).toBe("Ada");
    expect(summary.cadence).toBe("daily");
    expect(summary.entryCount).toBe(1);
  });

  it("rejects backups missing manifest.json", async () => {
    const zip = new JSZip();
    zip.file("images/foo.jpg", new Uint8Array([1, 2, 3]));
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "no-manifest.babyflip");
    await expect(readBackupFile(file)).rejects.toThrow(/missing manifest\.json/);
  });

  it("rejects unsupported format version", async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        format: "babyflip",
        formatVersion: 99,
        exportedAt: nowIso(),
        project: makeProject(),
        entries: [],
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "wrong-version.babyflip");
    await expect(readBackupFile(file)).rejects.toThrow(/Unsupported backup format version/);
  });

  it("rejects duplicate entry ids in the manifest", async () => {
    const { project, entry } = await seedOneEntry();
    const dupEntry = {
      id: entry.id,
      periodKey: "2025-03-15",
      capturedDate: "2025-03-15",
      imagePath: "images/dup.jpg",
    };
    const manifest = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: nowIso(),
      project,
      entries: [
        {
          id: entry.id,
          periodKey: entry.periodKey,
          capturedDate: entry.capturedDate,
          imagePath: "images/foo.jpg",
        },
        dupEntry,
      ],
    };
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest));
    zip.file("images/foo.jpg", new Uint8Array([1, 2, 3]));
    zip.file("images/dup.jpg", new Uint8Array([1, 2, 3]));
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "dup.babyflip");
    await expect(readBackupFile(file)).rejects.toThrow(/Duplicate entry id/);
  });

  it("rejects manifest entries that reference a missing image", async () => {
    const { project, entry } = await seedOneEntry();
    const manifest = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: nowIso(),
      project,
      entries: [
        {
          id: entry.id,
          periodKey: entry.periodKey,
          capturedDate: entry.capturedDate,
          imagePath: "images/missing.jpg",
        },
      ],
    };
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest));
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "missing.babyflip");
    await expect(readBackupFile(file)).rejects.toThrow(/Missing image/);
  });

  it("rejects archive paths that escape the root", async () => {
    const { project, entry } = await seedOneEntry();
    const manifest = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: nowIso(),
      project,
      entries: [
        {
          id: entry.id,
          periodKey: entry.periodKey,
          capturedDate: entry.capturedDate,
          imagePath: "../etc/passwd",
        },
      ],
    };
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest));
    zip.file("../etc/passwd", "x");
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "escape.babyflip");
    await expect(readBackupFile(file)).rejects.toThrow(/Invalid archive path|Missing image/);
  });

  it("round-trips: create backup, wipe DB, restore, project + entries present", async () => {
    const { project } = await seedOneEntry();
    const blob = await createBackup(project);
    const file = new File([blob], "round-trip.babyflip");

    // Wipe DB by recreating.
    const newName = `ll-test-${Math.random().toString(36).slice(2)}`;
    const db2 = new LittleLoopDB(newName);
    Dexie.delete(newName);
    setDbForTesting(db2);

    expect(await db2.entries.count()).toBe(0);
    expect(await db2.projects.count()).toBe(0);

    const restored = await restoreBackup(file);
    expect(restored.childName).toBe("Ada");
    expect(await db2.entries.count()).toBe(1);
    expect(await db2.projects.count()).toBe(1);
    const restoredAssets = await db2.assets.toArray();
    // 2 assets per entry (image + thumbnail), regenerated on restore.
    expect(restoredAssets.length).toBe(2);
  });

  it("failed restore preserves existing data", async () => {
    // Seed an existing project so we can verify it survives a failed restore.
    const seed = await seedOneEntry();
    const beforeEntries = await seed.db.entries.count();
    expect(beforeEntries).toBe(1);

    // Pass an invalid file: a non-zip.
    const badFile = new File([new Uint8Array([0, 1, 2, 3])], "bad.babyflip");
    await expect(restoreBackup(badFile)).rejects.toThrow();

    const afterEntries = await seed.db.entries.count();
    expect(afterEntries).toBe(1);
  });
});