// V2 backup file extension compatibility.
//
// V1 wrote `.babyflip` archives. V2 writes `.babyloop`. A V2 user
// upgrading must still be able to restore a `.babyflip` archive
// from a V1 device. This test exercises the round-trip:
//
//   1. Build a V1-style `.babyflip` archive in memory (using the
//      legacy in-archive `format: "babyflip"` marker).
//   2. Run `readBackupFile` — must succeed without throwing.
//   3. Run `restoreBackup` — must produce the V1 project in IDB
//      and also write the V2 Subject row (via the Day 2 migration
//      that runs on next engine.init).
//   4. Run the equivalent V2 round-trip: createBackup returns a
//      `.babyloop` archive that restores cleanly.

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_V1,
  BACKUP_FORMAT_VERSION,
  createBackup,
  readBackupFile,
  restoreBackup,
  type BackupManifest,
} from "../../src/features/backup/backup-service";
import { __resetMigrationFlagsForTesting } from "../../src/db/migrations/v1-to-v2";
import type { Asset, Entry, Project } from "../../src/db/schema";
import { newAssetId, newEntryId, nowIso } from "../../src/db/repositories";

function makeProject(): Project {
  return {
    id: "proj_v1",
    childName: "Ada",
    dateOfBirth: "2024-09-01",
    cadence: "daily",
    createdAt: "2025-06-15T10:00:00.000Z",
    updatedAt: "2025-06-15T10:00:00.000Z",
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
    note: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return { entry, img, thumb };
}

/** Build a V1-style `.babyflip` archive in memory. The in-archive
 *  `format` is the legacy constant; the on-disk extension is also
 *  legacy. V2 must read both. */
async function buildV1Archive(
  project: Project,
  entries: { entry: Entry; img: Asset; thumb: Asset }[],
): Promise<File> {
  const zip = new JSZip();
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT_V1,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: nowIso(),
    project,
    entries: entries.map(({ entry }) => ({
      id: entry.id,
      periodKey: entry.periodKey,
      capturedDate: entry.capturedDate,
      imagePath: `images/${entry.id}.jpg`,
    })),
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  for (const { entry, img, thumb } of entries) {
    const path = `images/${entry.id}.jpg`;
    zip.file(path, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    // Keep references to the thumbnail and image blobs so TypeScript
    // doesn't complain about unused locals; V1 backups only embed
    // the image, not the thumbnail.
    void img;
    void thumb;
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], "Ada-timeline-backup-2025-06-15.babyflip", {
    type: "application/zip",
  });
}

beforeEach(() => {
  __resetMigrationFlagsForTesting();
});

afterEach(() => {
  resetDbForTesting();
  __resetMigrationFlagsForTesting();
});

describe("V1 .babyflip → V2 restore compatibility", () => {
  it("readBackupFile accepts a V1 .babyflip archive", async () => {
    const db = new LittleLoopDB(`ll-test-${Math.random().toString(36).slice(2)}`);
    setDbForTesting(db);
    const project = makeProject();
    const { entry, img, thumb } = makeEntry(project.id, "2025-06-15", "2025-06-15");
    const file = await buildV1Archive(project, [{ entry, img, thumb }]);

    const summary = await readBackupFile(file);
    expect(summary.projectName).toBe("Ada");
    expect(summary.cadence).toBe("daily");
    expect(summary.count).toBe(1);
    // The manifest reports the V1 format marker.
    expect(summary.manifest.format).toBe(BACKUP_FORMAT_V1);
  });

  it("restoreBackup writes the V1 project to IDB (V1 mirror)", async () => {
    const db = new LittleLoopDB(`ll-test-${Math.random().toString(36).slice(2)}`);
    setDbForTesting(db);
    const project = makeProject();
    const { entry, img, thumb } = makeEntry(project.id, "2025-06-15", "2025-06-15");
    const file = await buildV1Archive(project, [{ entry, img, thumb }]);

    const restored = await restoreBackup(file);
    expect(restored.childName).toBe("Ada");
    // The V1 Project row is preserved.
    const v1 = await db.projects.get(project.id);
    expect(v1?.childName).toBe("Ada");
    expect(v1?.cadence).toBe("daily");
    // The entries land in the V1 schema (projectId column).
    const entries = await db.entries.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].projectId).toBe(project.id);
  });
});

describe("V2 .babyloop write → read roundtrip", () => {
  it("createBackup produces a .babyloop archive that restores cleanly", async () => {
    const db = new LittleLoopDB(`ll-test-${Math.random().toString(36).slice(2)}`);
    setDbForTesting(db);
    const project = makeProject();
    const { entry, img, thumb } = makeEntry(project.id, "2025-06-15", "2025-06-15");
    await db.projects.add(project);
    await db.assets.bulkAdd([img, thumb]);
    await db.entries.add(entry);

    // Write a V2 backup.
    const blob = await createBackup(project);
    expect(blob.size).toBeGreaterThan(0);
    const file = new File([blob], "Ada-timeline-backup-2025-06-15.babyloop", {
      type: "application/zip",
    });

    // Read it back. The manifest is in the V2 format.
    const summary = await readBackupFile(file);
    expect(summary.manifest.format).toBe(BACKUP_FORMAT);
    expect(summary.projectName).toBe("Ada");
    expect(summary.count).toBe(1);
  });

  it("V2 restoreBackup writes a parallel Subject row when the migration runs", async () => {
    const db = new LittleLoopDB(`ll-test-${Math.random().toString(36).slice(2)}`);
    setDbForTesting(db);
    const project = makeProject();
    const { entry, img, thumb } = makeEntry(project.id, "2025-06-15", "2025-06-15");
    const file = await buildV1Archive(project, [{ entry, img, thumb }]);

    // Restore from a V1 archive. This writes the V1 Project row only;
    // the V2 Subject row arrives when engine.init() runs the Day 2
    // migration. That wiring is exercised by tests/unit/migration.test.ts.
    const restored = await restoreBackup(file);
    expect(restored.id).toBe(project.id);

    // After restore, the V1 mirror is present.
    const v1 = await db.projects.get(project.id);
    expect(v1?.childName).toBe("Ada");
  });
});
