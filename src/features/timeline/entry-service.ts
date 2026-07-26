// Entry orchestration: transactional create / replace / delete.
// All asset writes are isolated from entry writes; the entry is updated
// only after the new assets are stored, and previous assets are deleted
// only after a successful replace.

import { getDb } from "../../db/database";
import { newAssetId, newEntryId, nowIso } from "../../db/repositories";
import type { Asset, Entry, Project } from "../../db/schema";
import type { ProcessedImage } from "../../lib/image-processing";

export interface CreateEntryInput {
  project: Project;
  capturedDate: string;
  periodKey: string;
  processed: ProcessedImage;
}

export async function createEntry(input: CreateEntryInput): Promise<Entry> {
  const db = getDb();
  const now = nowIso();
  const imageAssetId = newAssetId();
  const thumbAssetId = newAssetId();

  return db.transaction(
    "rw",
    db.projects,
    db.entries,
    db.assets,
    async () => {
      // Block duplicates: one entry per period.
      const existing = await db.entries
        .where("[projectId+periodKey]")
        .equals([input.project.id, input.periodKey])
        .first();
      if (existing) {
        throw new Error("This period already has a photo. Use replace.");
      }

      const imageAsset: Asset = {
        id: imageAssetId,
        projectId: input.project.id,
        type: "image",
        mimeType: "image/jpeg",
        width: input.processed.width,
        height: input.processed.height,
        byteSize: input.processed.imageBytes,
        blob: input.processed.image,
        createdAt: now,
      };
      const thumbAsset: Asset = {
        id: thumbAssetId,
        projectId: input.project.id,
        type: "thumbnail",
        mimeType: "image/jpeg",
        width: input.processed.thumbWidth,
        height: input.processed.thumbHeight,
        byteSize: input.processed.thumbBytes,
        blob: input.processed.thumbnail,
        createdAt: now,
      };
      await db.assets.bulkAdd([imageAsset, thumbAsset]);

      const entry: Entry = {
        id: newEntryId(),
        projectId: input.project.id,
        periodKey: input.periodKey,
        capturedDate: input.capturedDate,
        imageBlobId: imageAssetId,
        thumbnailBlobId: thumbAssetId,
        createdAt: now,
        updatedAt: now,
      };
      await db.entries.add(entry);
      return entry;
    },
  );
}

export interface ReplaceEntryInput {
  project: Project;
  entryId: string;
  processed: ProcessedImage;
}

export async function replaceEntry(input: ReplaceEntryInput): Promise<Entry> {
  const db = getDb();
  const now = nowIso();
  const imageAssetId = newAssetId();
  const thumbAssetId = newAssetId();

  let previousImageAssetId: string | undefined;
  let previousThumbAssetId: string | undefined;

  const updated = await db.transaction(
    "rw",
    db.projects,
    db.entries,
    db.assets,
    async () => {
      const existing = await db.entries.get(input.entryId);
      if (!existing) throw new Error("Entry not found");
      previousImageAssetId = existing.imageBlobId;
      previousThumbAssetId = existing.thumbnailBlobId;

      const imageAsset: Asset = {
        id: imageAssetId,
        projectId: input.project.id,
        type: "image",
        mimeType: "image/jpeg",
        width: input.processed.width,
        height: input.processed.height,
        byteSize: input.processed.imageBytes,
        blob: input.processed.image,
        createdAt: now,
      };
      const thumbAsset: Asset = {
        id: thumbAssetId,
        projectId: input.project.id,
        type: "thumbnail",
        mimeType: "image/jpeg",
        width: input.processed.thumbWidth,
        height: input.processed.thumbHeight,
        byteSize: input.processed.thumbBytes,
        blob: input.processed.thumbnail,
        createdAt: now,
      };
      // Write new assets BEFORE updating the entry reference. If the
      // transaction aborts, the entry still points at the old assets.
      await db.assets.bulkAdd([imageAsset, thumbAsset]);
      const updatedEntry: Entry = {
        ...existing,
        imageBlobId: imageAssetId,
        thumbnailBlobId: thumbAssetId,
        updatedAt: now,
      };
      await db.entries.put(updatedEntry);
      return updatedEntry;
    },
  );

  // After commit, delete the previous assets. If this step fails the
  // user only loses a little storage, not data.
  if (previousImageAssetId) {
    try {
      await db.assets.delete(previousImageAssetId);
    } catch {
      /* best-effort cleanup */
    }
  }
  if (previousThumbAssetId) {
    try {
      await db.assets.delete(previousThumbAssetId);
    } catch {
      /* best-effort cleanup */
    }
  }

  return updated;
}

export async function deleteEntry(entryId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.entries, db.assets, async () => {
    const entry = await db.entries.get(entryId);
    if (!entry) return;
    await db.entries.delete(entryId);
    await db.assets.delete(entry.imageBlobId);
    await db.assets.delete(entry.thumbnailBlobId);
  });
}

export async function getEntryImageBlob(entryId: string): Promise<Blob | null> {
  const db = getDb();
  const entry = await db.entries.get(entryId);
  if (!entry) return null;
  const asset = await db.assets.get(entry.imageBlobId);
  return asset?.blob ?? null;
}