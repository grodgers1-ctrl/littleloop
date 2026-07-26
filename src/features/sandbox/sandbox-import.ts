// Bulk-import helper for the sandbox. Takes N already-normalized
// images and creates entries with auto-assigned consecutive dates.
//
// Each entry is created in its own transaction so a single bad image
// can't poison the whole batch — failed photos are skipped and the
// caller is told which ones succeeded.

import {
  getSandboxDb,
  SANDBOX_PROJECT_ID,
} from "../../db/sandbox-database";
import {
  newAssetId,
  newEntryId,
  nowIso,
} from "../../db/repositories";
import type { Asset, Entry } from "../../db/schema";
import { assignConsecutiveDates } from "../../lib/auto-dates";
import { initSandbox } from "../../db/sandbox-repositories";

// Reuse the singleton-project creation. Cheap (one IDB read).
async function ensureSandboxProjectRow(): Promise<void> {
  await initSandbox();
}

export interface SandboxImportInput {
  // Each item is already-normalized (the same ProcessedImage shape
  // used by the real entry-service). The order in the array is the
  // order they should appear in the timeline — first item is the
  // newest (most recent date).
  processed: Array<{
    image: Blob;
    thumbnail: Blob;
    width: number;
    height: number;
    thumbWidth: number;
    thumbHeight: number;
    imageBytes: number;
    thumbBytes: number;
  }>;
  now?: Date;
}

export interface SandboxImportResult {
  createdEntryIds: string[];
  assignedDates: string[];
  skipped: number;
}

export async function bulkImportSandbox(
  input: SandboxImportInput,
): Promise<SandboxImportResult> {
  // Always ensure the singleton project exists. Idempotent.
  await ensureSandboxProjectRow();
  const projectId = SANDBOX_PROJECT_ID;
  const dates = assignConsecutiveDates(input.processed.length, input.now);
  const created: string[] = [];
  let skipped = 0;

  for (let i = 0; i < input.processed.length; i += 1) {
    const p = input.processed[i];
    const capturedDate = dates[i];
    const db = getSandboxDb();
    try {
      await db.transaction(
        "rw",
        db.projects,
        db.entries,
        db.assets,
        async () => {
          const now = nowIso();
          const imgAsset: Asset = {
            id: newAssetId(),
            projectId,
            type: "image",
            mimeType: "image/jpeg",
            width: p.width,
            height: p.height,
            byteSize: p.imageBytes,
            blob: p.image,
            createdAt: now,
          };
          const thumbAsset: Asset = {
            id: newAssetId(),
            projectId,
            type: "thumbnail",
            mimeType: "image/jpeg",
            width: p.thumbWidth,
            height: p.thumbHeight,
            byteSize: p.thumbBytes,
            blob: p.thumbnail,
            createdAt: now,
          };
          await db.assets.bulkAdd([imgAsset, thumbAsset]);
          const entry: Entry = {
            id: newEntryId(),
            projectId,
            periodKey: capturedDate,
            capturedDate,
            imageBlobId: imgAsset.id,
            thumbnailBlobId: thumbAsset.id,
            createdAt: now,
            updatedAt: now,
          };
          await db.entries.add(entry);
          created.push(entry.id);
        },
      );
    } catch {
      skipped += 1;
    }
  }

  return {
    createdEntryIds: created,
    assignedDates: dates,
    skipped,
  };
}