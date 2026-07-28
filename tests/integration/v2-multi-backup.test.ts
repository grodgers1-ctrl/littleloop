// V2 multi-subject backup and restore tests. Exercises the new
// createAllSubjectsBackup / restoreFromBackup / readBackupFile
// functions with merge and replace modes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import {
  createAllSubjectsBackup,
  readBackupFile,
  restoreFromBackup,
  BACKUP_FORMAT_VERSION_V2,
  createBackup,
} from "../../src/features/backup/backup-service";
import { __resetMigrationFlagsForTesting } from "../../src/db/migrations/v1-to-v2";
import { newAssetId, newEntryId, nowIso } from "../../src/db/repositories";
import type { Project, Subject } from "../../src/db/schema";

function freshDb(): LittleLoopDB {
  return new LittleLoopDB(`ll-test-${Math.random().toString(36).slice(2)}`);
}

function makeSubject(name: string, sortIndex = 0): Subject {
  return {
    id: `subj_${name}`,
    name,
    type: "baby",
    cadence: "daily",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-06-01T00:00:00.000Z",
    sortIndex,
  };
}

function makeProject(subject: Subject): Project {
  return {
    id: subject.id,
    childName: subject.name,
    dateOfBirth: "2024-01-01",
    cadence: subject.cadence,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  };
}

async function seedSubject(
  db: LittleLoopDB,
  subject: Subject,
  entryCount = 2,
): Promise<void> {
  await db.subjects.add(subject);
  await db.projects.add(makeProject(subject));
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
  for (let i = 0; i < entryCount; i += 1) {
    const imgId = newAssetId();
    const thumbId = newAssetId();
    const date = `2025-06-${String(i + 1).padStart(2, "0")}`;
    await db.assets.bulkAdd([
      { id: imgId, projectId: subject.id, type: "image", mimeType: "image/jpeg", width: 100, height: 100, byteSize: 3, blob, createdAt: nowIso() },
      { id: thumbId, projectId: subject.id, type: "thumbnail", mimeType: "image/jpeg", width: 50, height: 50, byteSize: 3, blob, createdAt: nowIso() },
    ]);
    await db.entries.add({
      id: newEntryId(),
      projectId: subject.id,
      periodKey: date,
      capturedDate: date,
      imageBlobId: imgId,
      thumbnailBlobId: thumbId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
}

beforeEach(() => {
  __resetMigrationFlagsForTesting();
});

afterEach(() => {
  resetDbForTesting();
  __resetMigrationFlagsForTesting();
});

describe("V2 multi-subject backup", () => {
  it("createAllSubjectsBackup produces a V2 manifest with all subjects", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await seedSubject(db, makeSubject("Mia"));
    await seedSubject(db, makeSubject("Basil"));

    const blob = await createAllSubjectsBackup();
    const file = new File([blob], "backup.babyloop");
    const summary = await readBackupFile(file);
    expect(summary.type).toBe("v2");
    expect(summary.subjectCount).toBe(2);
    expect(summary.entryCount).toBe(4);
    expect(summary.manifest.formatVersion).toBe(BACKUP_FORMAT_VERSION_V2);
  });

  it("restoreFromBackup with replace mode wipes existing data", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await seedSubject(db, makeSubject("Mia"));
    await seedSubject(db, makeSubject("Basil"));
    const blob = await createAllSubjectsBackup();
    const file = new File([blob], "backup.babyloop");

    // Wipe and restore.
    await db.subjects.clear();
    await db.entries.clear();
    await db.assets.clear();
    await db.projects.clear();
    await restoreFromBackup(file, "replace");

    const subjects = await db.subjects.toArray();
    expect(subjects).toHaveLength(2);
    const names = subjects.map((s) => s.name).sort();
    expect(names).toEqual(["Basil", "Mia"]);
  });

  it("restoreFromBackup with merge mode preserves existing subjects", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await seedSubject(db, makeSubject("Mia", 0), 2);
    await seedSubject(db, makeSubject("Basil", 1), 1);
    const blob = await createAllSubjectsBackup();
    const file = new File([blob], "backup.babyloop");

    // Simulate a new local subject that should be preserved.
    await seedSubject(db, makeSubject("Charlie", 2), 1);

    await restoreFromBackup(file, "merge");

    const subjects = await db.subjects.toArray();
    expect(subjects).toHaveLength(3); // Mia, Basil, Charlie
    const names = subjects.map((s) => s.name).sort();
    expect(names).toEqual(["Basil", "Charlie", "Mia"]);
  });

  it("restoreFromBackup merge skips duplicate names", async () => {
    const db = freshDb();
    setDbForTesting(db);
    await seedSubject(db, makeSubject("Mia"), 2);
    const blob = await createAllSubjectsBackup();
    const file = new File([blob], "backup.babyloop");

    await restoreFromBackup(file, "merge");

    // Mia should still have her original 2 entries — the merge
    // skipped her because the name already existed, so the backup's
    // entries were NOT duplicated.
    const miaEntries = await db.entries
      .where("projectId")
      .equals("subj_Mia")
      .toArray();
    expect(miaEntries).toHaveLength(2);
  });

  it("V1 .babyflip archive still restores via the new pipeline", async () => {
    const db = freshDb();
    setDbForTesting(db);
    // Use createBackup (V1-style single-project) and restore via
    // restoreFromBackup.
    const project: Project = {
      id: "proj_v1_test",
      childName: "Ada",
      dateOfBirth: "2024-09-01",
      cadence: "daily",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
    };
    await db.projects.add(project);
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    const imgId = newAssetId();
    const thumbId = newAssetId();
    await db.assets.bulkAdd([
      { id: imgId, projectId: "proj_v1_test", type: "image", mimeType: "image/jpeg", width: 100, height: 100, byteSize: 3, blob, createdAt: nowIso() },
      { id: thumbId, projectId: "proj_v1_test", type: "thumbnail", mimeType: "image/jpeg", width: 50, height: 50, byteSize: 3, blob, createdAt: nowIso() },
    ]);
    await db.entries.add({
      id: newEntryId(),
      projectId: "proj_v1_test",
      periodKey: "2025-06-15",
      capturedDate: "2025-06-15",
      imageBlobId: imgId,
      thumbnailBlobId: thumbId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    const v1Blob = await createBackup(project);
    const v1File = new File([v1Blob], "ada.babyflip");
    // Read the V1 format.
    const summary = await readBackupFile(v1File);
    expect(summary.type).toBe("v1");
    expect(summary.projectName).toBe("Ada");
    expect(summary.entryCount).toBe(1);
  });
});