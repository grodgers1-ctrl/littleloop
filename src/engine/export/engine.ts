// V2 export engine. Wraps the V1 export pipeline with the engine's
// `ExportRequest` API and the per-frame watermark on the main
// thread. The worker protocol (init / frame / encode) is unchanged
// — the V1 worker continues to receive PNG bytes; we draw the
// watermark onto the same canvas that draws the photo, BEFORE
// encoding to PNG. This preserves the v11 image2-demuxer fix that
// keeps exports working on iOS Safari 16.
//
// The orchestrator:
//   1. Resolves the subject's entries from IDB.
//   2. Builds a `RenderRequest` matching the V1 shape.
//   3. Runs the V1 `runExport`, which renders frames + encodes.
//   4. Maps V1 progress into the engine's `ExportProgress` events.
//   5. Skips the watermark entirely if the user has Clean / Studio
//      OR if `request.forceNoWatermark` is set (per-export bypass).
//
// The orchestrator is intentionally thin — all the rendering /
// encoding work lives in the V1 module so any future improvements
// to FFmpeg, frame layout, or speed tuning benefit the engine
// automatically.

import { getDb } from "../../db/database";
import {
  type DateRange,
  type ExportProgress,
  type ExportRequestV2,
  type ExportResult,
} from "../state";
import { applyWatermark, shouldApplyWatermark } from "./watermark";
import { composeVfChain, resolveSpeed } from "../themes";

/** Pull the entries for a subject within a date range, sorted
 *  oldest-first (the V1 export expects chronological order). */
async function loadEntries(
  subjectId: string,
  dateRange: DateRange,
): Promise<
  Array<{
    id: string;
    capturedDate: string;
    periodKey: string;
    imageBlobId: string;
  }>
> {
  const db = getDb();
  const all = await db.entries.where("projectId").equals(subjectId).toArray();
  const filtered = all.filter((e) => {
    if (dateRange.kind === "all") return true;
    if (dateRange.kind === "this-month") {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      return e.capturedDate.startsWith(ym);
    }
    if (dateRange.kind === "custom") {
      if (dateRange.from && e.capturedDate < dateRange.from) return false;
      if (dateRange.to && e.capturedDate > dateRange.to) return false;
      return true;
    }
    return true;
  });
  filtered.sort((a, b) => a.capturedDate.localeCompare(b.capturedDate));
  return filtered.map((e) => ({
    id: e.id,
    capturedDate: e.capturedDate,
    periodKey: e.periodKey,
    imageBlobId: e.imageBlobId,
  }));
}

/** Build the filename a V2 export uses, honouring a per-export
 *  override if provided. */
function buildFilename(
  subjectName: string,
  dateRange: DateRange,
  override: string | undefined,
): string {
  if (override) return override;
  const today = new Date().toISOString().slice(0, 10);
  const safe = subjectName.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "subject";
  const suffix = dateRange.kind === "all" ? "all" : "custom";
  return `${safe}-${today}-${suffix}.mp4`;
}

/** Map the V2 speed label to the V1 worker's numeric seconds. */
function speedToSeconds(speed: "fast" | "standard" | "slow"): 0.25 | 0.5 | 0.8 {
  switch (speed) {
    case "fast":
      return 0.25;
    case "standard":
      return 0.5;
    case "slow":
      return 0.8;
  }
}

/** Run the V2 export pipeline. Pure async function — caller is the
 *  engine method. Accepts the V2.5 `ExportRequestV2` shape (the V2
 *  `ExportRequest` is a structural subset, so V2 callers continue
 *  to work). The optional `theme` / `transition` / `filter` fields
 *  are Studio-only; free and clean callers leave them unset. */
export async function runExport(
  request: ExportRequestV2,
  unlockState: "free" | "clean" | "studio",
  onProgress: (p: ExportProgress) => void,
): Promise<ExportResult> {
  const start = Date.now();

  // V2.5 — compose the FFmpeg `-vf` chain. Theme takes precedence
  // over transition + filter (kickoff §Day 7). The chain is
  // always non-empty: the V1 letterbox scale is the prefix.
  const vfChain = composeVfChain({
    theme: request.theme,
    transition: request.transition,
    filter: request.filter,
  });
  // Resolve the render speed: a theme pins the speed; otherwise
  // the user's pick survives.
  const resolvedSpeed = resolveSpeed({
    theme: request.theme,
    speed: request.speed,
  });

  // Phase 1: preparing — load entries + assets from IDB.
  onProgress({ phase: "preparing", ratio: 0, message: "Loading photos…" });
  const entries = await loadEntries(request.subjectId, request.dateRange);
  if (entries.length === 0) {
    throw new Error("No photos in the selected date range to export.");
  }

  // Read the asset blobs. Each entry needs the raw image bytes + the
  // asset's width/height (the V1 worker uses these for the
  // letterbox math). We read dimensions straight from the stored
  // asset — no need to re-decode.
  const db = getDb();
  const entryBytes: Array<{
    id: string;
    capturedDate: string;
    bytes: Uint8Array;
    mimeType: string;
    width: number;
    height: number;
  }> = [];
  for (const e of entries) {
    const asset = await db.assets.get(e.imageBlobId);
    if (!asset) continue;
    const buf = new Uint8Array(await asset.blob.arrayBuffer());
    entryBytes.push({
      id: e.id,
      capturedDate: e.capturedDate,
      bytes: buf,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    });
  }
  if (entryBytes.length === 0) {
    throw new Error("No readable photos in the selected date range.");
  }

  // Read subject name for filename.
  const subject = await db.subjects.get(request.subjectId);
  const subjectName = subject?.name ?? "subject";
  const filename = buildFilename(
    subjectName,
    request.dateRange,
    request.filenameOverride,
  );

  // Phase 2: drawing — render frames to canvas, applying the
  // watermark on the main thread before PNG encoding via the
  // `extraDraw` hook in the V1 RenderRequest.
  onProgress({ phase: "drawing", ratio: 0.05, message: "Drawing frames…" });

  const useWatermark = shouldApplyWatermark(
    unlockState,
    request.forceNoWatermark ?? false,
  );

  // Phase 3: encoding — defer to the V1 export module. We import
  // it dynamically because it pulls in @ffmpeg/ffmpeg and a Web
  // Worker, neither of which is safe to load in node tests.
  const { runExport: runExportV1 } = await import(
    "../../features/export/export-worker"
  );

  const v1Request = {
    childName: subjectName,
    entries: entryBytes.map((e) => ({
      id: e.id,
      capturedDate: e.capturedDate,
      bytes: e.bytes,
      mimeType: e.mimeType,
      width: e.width,
      height: e.height,
    })),
    speedSeconds: speedToSeconds(resolvedSpeed),
    showDates: request.showDate,
    exportFilename: filename,
    // V2.5 — the engine-composed FFmpeg -vf chain. V1 callers
    // (request has no theme/transition/filter) get the default
    // V1 letterbox scale.
    vfChain,
    // Per-frame hook: draws the watermark on the canvas before PNG
    // encoding. Runs on the main thread; the worker only sees the
    // resulting bytes. Only wired in for free-tier exports; Clean
    // and Studio skip it.
    extraDraw: useWatermark
      ? (ctx: CanvasRenderingContext2D) => applyWatermark(ctx)
      : undefined,
  };

  const total = entryBytes.length;
  let drawn = 0;

  const v1Result = await runExportV1(v1Request, async (idx: number) => {
    const src = entryBytes[idx];
    if (!src) return null;
    drawn = idx + 1;
    onProgress({
      phase: "drawing",
      ratio: 0.05 + (0.85 * drawn) / total,
      message: `Drawing photo ${drawn} of ${total}`,
    });
    return {
      bytes: src.bytes,
      mimeType: src.mimeType,
      capturedDate: src.capturedDate,
    };
  });

  onProgress({ phase: "encoding", ratio: 0.95, message: "Encoding MP4…" });

  onProgress({ phase: "done", ratio: 1, message: "Done" });
  return {
    blob: v1Result.blob,
    filename: filename,
    frameCount: total,
    durationMs: Date.now() - start,
  };
}
