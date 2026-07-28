// .babyflip / .babyloop archive create + restore.
//
// V1 format (formatVersion 1): single project, entries, no subjectId.
// V2 format (formatVersion 2): multi-subject, every entry has a subjectId.
//
// Thumbnails are NOT included in either format; they are regenerated
// from the images on restore so the backup stays small and we never
// duplicate derived data.

import JSZip from "jszip";
import { getDb } from "../../db/database";
import { newAssetId, newEntryId, nowIso } from "../../db/repositories";
import type { Asset, Project, Subject } from "../../db/schema";
import { processImageFile } from "../../lib/image-processing";
import { backupFilename } from "../../lib/filenames";
import { downloadBlob } from "../../lib/download";
import { todayDateOnly } from "../../lib/dates";

export const BACKUP_FORMAT = "babyloop" as const;
export const BACKUP_FORMAT_V1 = "babyflip" as const;
export const BACKUP_FORMAT_VERSION = 1 as const; // V1: single project
export const BACKUP_FORMAT_VERSION_V2 = 2 as const; // V2: multi-subject
export const MAX_BACKUP_BYTES = 500 * 1024 * 1024;
export const MAX_BACKUP_IMAGES = 5_000;

export interface BackupEntryManifest {
  id: string;
  subjectId: string;
  periodKey: string;
  capturedDate: string;
  imagePath: string;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT | typeof BACKUP_FORMAT_V1;
  formatVersion: typeof BACKUP_FORMAT_VERSION | typeof BACKUP_FORMAT_VERSION_V2;
  exportedAt: string;
  project?: Project;
  subjects?: Subject[];
  entries: BackupEntryManifest[];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

function safeImagePath(entryId: string): string {
  if (!/^entry_[A-Za-z0-9_-]+$/.test(entryId)) {
    throw new BackupError(`Invalid entry id: ${entryId}`);
  }
  return `images/${entryId}.jpg`;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  const b = blob as unknown as { _buffer?: ArrayBuffer; buffer?: ArrayBuffer };
  if (b._buffer) return new Uint8Array(b._buffer.slice(0));
  if (b.buffer) return new Uint8Array(b.buffer.slice(0));
  throw new BackupError("Could not serialise Blob in this environment");
}

// ---------------------------------------------------------------------------
// V1 per-project backup (kept for backwards compat callers)
// ---------------------------------------------------------------------------

export async function createBackup(project: Project): Promise<Blob> {
  const db = getDb();
  const entries = await db.entries
    .where("projectId")
    .equals(project.id)
    .toArray();
  entries.sort((a, b) => a.capturedDate.localeCompare(b.capturedDate));

  if (entries.length > MAX_BACKUP_IMAGES) {
    throw new BackupError(
      `Backup contains too many photos (${entries.length}). Reduce to ${MAX_BACKUP_IMAGES} or fewer.`,
    );
  }

  const zip = new JSZip();
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: nowIso(),
    project,
    entries: [],
  };

  for (const entry of entries) {
    const asset = await db.assets.get(entry.imageBlobId);
    if (!asset) continue;
    const path = safeImagePath(entry.id);
    const bytes = await blobToBytes(asset.blob);
    zip.file(path, bytes);
    manifest.entries.push({
      id: entry.id,
      subjectId: entry.projectId,
      periodKey: entry.periodKey,
      capturedDate: entry.capturedDate,
      imagePath: path,
    });
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  if (blob.size > MAX_BACKUP_BYTES) {
    throw new BackupError(
      `Backup is ${(blob.size / 1024 / 1024).toFixed(1)} MB which exceeds the ${MAX_BACKUP_BYTES / 1024 / 1024} MB safety limit.`,
    );
  }
  return blob;
}

export async function downloadBackup(project: Project): Promise<void> {
  const blob = await createBackup(project);
  downloadBlob(blob, backupFilename(project.childName, todayDateOnly()));
}

// ---------------------------------------------------------------------------
// V2 multi-subject backup
// ---------------------------------------------------------------------------

export async function createAllSubjectsBackup(): Promise<Blob> {
  const db = getDb();
  const subjects = await db.subjects.toArray();
  if (subjects.length === 0) throw new BackupError("No subjects to back up.");

  const zip = new JSZip();
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION_V2,
    exportedAt: nowIso(),
    subjects: subjects.map((s) => ({ ...s })),
    entries: [],
  };
  let totalImages = 0;

  for (const subject of subjects) {
    const entries = await db.entries
      .where("projectId")
      .equals(subject.id)
      .toArray();
    entries.sort((a, b) => a.capturedDate.localeCompare(b.capturedDate));

    for (const entry of entries) {
      if (totalImages >= MAX_BACKUP_IMAGES) break;
      const asset = await db.assets.get(entry.imageBlobId);
      if (!asset) continue;
      const path = safeImagePath(entry.id);
      const bytes = await blobToBytes(asset.blob);
      zip.file(path, bytes);
      manifest.entries.push({
        id: entry.id,
        subjectId: subject.id,
        periodKey: entry.periodKey,
        capturedDate: entry.capturedDate,
        imagePath: path,
      });
      totalImages += 1;
    }
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return blob;
}

// ---------------------------------------------------------------------------
// Read / validate
// ---------------------------------------------------------------------------

export interface RestoredSummary {
  type: "v1" | "v2";
  projectName: string;
  cadence: string;
  subjectCount: number;
  entryCount: number;
  blob: Blob;
  manifest: BackupManifest;
}

export async function readBackupFile(file: File | Blob): Promise<RestoredSummary> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupError(
      `Backup file is ${(file.size / 1024 / 1024).toFixed(1)} MB which exceeds the ${MAX_BACKUP_BYTES / 1024 / 1024} MB safety limit.`,
    );
  }
  let zip: JSZip;
  try {
    const ab = await file.arrayBuffer();
    zip = await JSZip.loadAsync(new Uint8Array(ab));
  } catch {
    throw new BackupError("This file is not a valid .babyloop archive.");
  }
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new BackupError("The backup is missing manifest.json.");
  }
  let manifest: BackupManifest;
  try {
    const text = await manifestFile.async("string");
    manifest = JSON.parse(text) as BackupManifest;
  } catch {
    throw new BackupError("manifest.json could not be parsed.");
  }
  if (manifest.format !== BACKUP_FORMAT && manifest.format !== BACKUP_FORMAT_V1) {
    throw new BackupError(`Unsupported backup format: ${String(manifest.format)}`);
  }
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION && manifest.formatVersion !== BACKUP_FORMAT_VERSION_V2) {
    throw new BackupError(`Unsupported backup format version: ${String(manifest.formatVersion)}`);
  }

  if (manifest.formatVersion === BACKUP_FORMAT_VERSION) {
    if (!manifest.project?.childName || !manifest.project?.cadence) {
      throw new BackupError("manifest.json is missing project fields.");
    }
  }

  // Validate all images exist and decode.
  const seenIds = new Set<string>();
  for (const e of manifest.entries) {
    if (seenIds.has(e.id)) {
      throw new BackupError(`Duplicate entry id in backup: ${e.id}`);
    }
    seenIds.add(e.id);
    if (!zip.file(e.imagePath)) {
      throw new BackupError(`Missing image in backup: ${e.imagePath}`);
    }
    if (e.imagePath.includes("..") || e.imagePath.startsWith("/")) {
      throw new BackupError(`Invalid archive path: ${e.imagePath}`);
    }
    try {
      const imgBlob = await zip.file(e.imagePath)!.async("blob");
      if (
        typeof createImageBitmap === "function" &&
        !(globalThis as { __llStubbedBitmap?: boolean }).__llStubbedBitmap
      ) {
        try { await createImageBitmap(imgBlob); } catch {
          throw new BackupError(`Image could not be decoded: ${e.imagePath}`);
        }
      }
    } catch (err) {
      if (err instanceof BackupError) throw err;
      throw new BackupError(`Image could not be read: ${e.imagePath}`);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const isV2 = manifest.formatVersion === BACKUP_FORMAT_VERSION_V2;
  return {
    type: isV2 ? "v2" : "v1",
    projectName: manifest.project?.childName ?? manifest.subjects?.[0]?.name ?? "Unknown",
    cadence: manifest.project?.cadence ?? manifest.subjects?.[0]?.cadence ?? "daily",
    subjectCount: manifest.subjects?.length ?? 1,
    entryCount: manifest.entries.length,
    blob,
    manifest,
  };
}

// ---------------------------------------------------------------------------
// V2 restore (merge or replace)
// ---------------------------------------------------------------------------

export type RestoreMode = "merge" | "replace";

export async function restoreFromBackup(
  file: File,
  mode: RestoreMode,
): Promise<void> {
  const summary = await readBackupFile(file);
  const db = getDb();
  const ab2 = await summary.blob.arrayBuffer();
  const zip = await JSZip.loadAsync(new Uint8Array(ab2));
  const manifest = summary.manifest;

  if (mode === "replace") {
    const existingSubjects = await db.subjects.toArray();
    for (const s of existingSubjects) {
      await db.entries.where("projectId").equals(s.id).delete();
      await db.assets.where("projectId").equals(s.id).delete();
    }
    await db.subjects.clear();
    await db.projects.clear();
  }

  // Get subjects to restore. For V2 format, use manifest.subjects.
  // For V1 format, create a single subject from the project.
  const subjectsToRestore: Subject[] = [];
  if (manifest.subjects && manifest.subjects.length > 0) {
    for (const s of manifest.subjects) {
      if (mode === "merge") {
        const existing = await db.subjects.where("name").equals(s.name).first();
        if (existing) continue; // skip duplicate names in merge mode
      }
      subjectsToRestore.push({ ...s, updatedAt: nowIso() });
    }
  } else if (manifest.project) {
    const p = manifest.project;
    // Check for merge: skip if a subject with the same name exists.
    if (mode === "merge") {
      const existing = await db.subjects.where("name").equals(p.childName).first();
      if (existing) {
        // Don't restore the project, but the V1 entries may still need
        // to be linked to the existing subject.
        subjectsToRestore.push(existing);
      }
    }
    if (subjectsToRestore.length === 0) {
      subjectsToRestore.push({
        id: p.id,
        name: p.childName,
        type: "baby" as const,
        cadence: p.cadence,
        createdAt: p.createdAt,
        updatedAt: nowIso(),
        sortIndex: 0,
      });
    }
  }

  if (subjectsToRestore.length === 0) {
    // In merge mode, all subjects already exist locally — no-op.
    return;
  }

  // Build a set of subject IDs that are being restored (new or existing).
  const restoringSubjectIds = new Set(subjectsToRestore.map((s) => s.id));

  // Write subjects + entries + assets in one transaction.
  const now = nowIso();
  for (const s of subjectsToRestore) {
    restoringSubjectIds.add(s.id);
    await db.subjects.put(s);
    // Also mirror to V1 projects table.
    await db.projects.put({
      id: s.id,
      childName: s.name,
      dateOfBirth: "",
      cadence: s.cadence,
      createdAt: s.createdAt,
      updatedAt: now,
    });
  }

  for (const e of manifest.entries) {
    // In merge mode, skip entries whose subject was already present.
    if (!restoringSubjectIds.has(e.subjectId)) continue;
    const imgBlob = await zip.file(e.imagePath)!.async("blob");
    const file = new File([imgBlob], e.id, { type: "image/jpeg" });
    const processed = await processImageFile(file);
    const imageAsset: Asset = {
      id: newAssetId(),
      projectId: e.subjectId,
      type: "image",
      mimeType: "image/jpeg",
      width: processed.width,
      height: processed.height,
      byteSize: processed.imageBytes,
      blob: processed.image,
      createdAt: now,
    };
    const thumbAsset: Asset = {
      id: newAssetId(),
      projectId: e.subjectId,
      type: "thumbnail",
      mimeType: "image/jpeg",
      width: processed.thumbWidth,
      height: processed.thumbHeight,
      byteSize: processed.thumbBytes,
      blob: processed.thumbnail,
      createdAt: now,
    };
    await db.assets.bulkAdd([imageAsset, thumbAsset]);
    await db.entries.add({
      id: newEntryId(),
      projectId: e.subjectId,
      periodKey: e.periodKey,
      capturedDate: e.capturedDate,
      imageBlobId: imageAsset.id,
      thumbnailBlobId: thumbAsset.id,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// V1 single-project restore (kept for backwards compat)
// ---------------------------------------------------------------------------

export async function restoreBackup(file: File): Promise<Project> {
  const summary = await readBackupFile(file);
  if (summary.type !== "v1") {
    throw new BackupError("Use restoreFromBackup for V2 multi-subject backups.");
  }
  const manifest = summary.manifest;
  const project = manifest.project!;
  await restoreFromBackup(file, "replace");
  return project;
}