// Preview render helper for the sandbox. Pulls the most recent N
// sandbox entries, renders them at fast speed, and returns a Blob +
// filename. Kept separate from the full ExportScreen so the preview
// CTA can be a one-tap flow without the date-range / cadence UI.

import { getSandboxDb } from "../../db/sandbox-database";
import { listSandboxEntries } from "../../db/sandbox-repositories";
import { flipbookFilename } from "../../lib/filenames";
import type {
  RenderEntry,
  RenderRequest,
  RenderSpeed,
} from "../../workers/video-render.worker";
import { startExport } from "../export/export-worker";
import type { Project } from "../../db/schema";

export interface PreviewResult {
  blob: Blob;
  filename: string;
}

export async function renderSandboxPreview(
  project: Project,
  photoCount: number,
  speed: RenderSpeed = 0.25,
): Promise<PreviewResult> {
  const all = await listSandboxEntries();
  const selected = all.slice(0, photoCount);
  if (selected.length === 0) {
    throw new Error("No photos in the sandbox to preview.");
  }

  const db = getSandboxDb();
  const renderEntries: RenderEntry[] = [];
  for (const entry of selected) {
    const asset = await db.assets.get(entry.imageBlobId);
    if (!asset) continue;
    const buf = await asset.blob.arrayBuffer();
    renderEntries.push({
      id: entry.id,
      capturedDate: entry.capturedDate,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      bytes: new Uint8Array(buf),
    });
  }

  const filename = flipbookFilename(project.childName, new Date().toISOString().slice(0, 10));

  return new Promise<PreviewResult>((resolve, reject) => {
    const request: RenderRequest = {
      entries: renderEntries,
      speedSeconds: speed,
      showDates: true,
      childName: project.childName,
      exportFilename: filename,
    };
    startExport(request, {
      onProgress: () => {},
      onSuccess: (blob, fn) => {
        resolve({ blob, filename: fn });
      },
      onError: (message) => {
        reject(new Error(message));
      },
    });
  });
}