// MP4 export rendering. Runs inside a Web Worker so the UI thread stays
// responsive. Uses @ffmpeg/ffmpeg (single-threaded core) loaded lazily
// from a public CDN so it doesn't bloat the main JS bundle.
//
// Message protocol matches the V1 spec (section G):
//
//   in  : { type: "render", request: RenderRequest }
//   out : { type: "progress", phase, completed, total }
//   out : { type: "success", blob, filename }
//   out : { type: "error", message }

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export type RenderSpeed = 0.8 | 0.5 | 0.25;

export interface RenderEntry {
  id: string;
  capturedDate: string; // YYYY-MM-DD
  mimeType: string;
  width: number;
  height: number;
  bytes: Uint8Array;
}

export interface RenderRequest {
  entries: RenderEntry[];
  speedSeconds: RenderSpeed;
  showDates: boolean;
  childName: string;
  exportFilename: string;
}

export interface RenderProgress {
  phase: "preparing" | "rendering" | "finalizing";
  completed: number;
  total: number;
}

export type WorkerOut =
  | { type: "ready" }
  | { type: "progress"; progress: RenderProgress }
  | { type: "log"; message: string }
  | { type: "success"; blob: Blob; filename: string }
  | { type: "error"; message: string };

const FRAME_W = 720;
const FRAME_H = 1280;
const FPS = 30;
const BG_COLOR = "#fbf2e6"; // warm neutral, matches UI

// 9:16 letterbox math: fit image into frame preserving aspect ratio.
export function letterboxFit(srcW: number, srcH: number): {
  outW: number;
  outH: number;
  offX: number;
  offY: number;
} {
  if (!srcW || !srcH) return { outW: FRAME_W, outH: FRAME_H, offX: 0, offY: 0 };
  const scale = Math.min(FRAME_W / srcW, FRAME_H / srcH);
  const outW = Math.round(srcW * scale);
  const outH = Math.round(srcH * scale);
  const offX = Math.round((FRAME_W - outW) / 2);
  const offY = Math.round((FRAME_H - outH) / 2);
  return { outW, outH, offX, offY };
}

// Per-speed helpers. Speed 0.8 = 0.8s/frame; 0.25 = 0.25s/frame.
export function frameCountForSpeed(speed: RenderSpeed): number {
  // Each frame in the output stream is one source image shown for speed
  // seconds. We render speed*FPS frames per source image so transitions
  // appear smooth at standard playback.
  return Math.max(1, Math.round(speed * FPS));
}

export function totalFrames(entries: RenderEntry[], speed: RenderSpeed): number {
  return entries.length * frameCountForSpeed(speed);
}

let _ffmpeg: FFmpeg | null = null;

async function getFfmpeg(onLog: (msg: string) => void): Promise<FFmpeg> {
  if (_ffmpeg) return _ffmpeg;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => onLog(message));
  ffmpeg.on("progress", () => {
    // We don't surface per-frame progress here; we count by source images.
  });
  // Load the single-threaded core from the @ffmpeg/core CDN.
  // The @ffmpeg/util 0.12.x default URLs target unpkg.
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
  });
  _ffmpeg = ffmpeg;
  return ffmpeg;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function drawFrameOnCanvas(
  ctx: OffscreenCanvasRenderingContext2D,
  img: ImageBitmap | HTMLImageElement,
  showDate: string | null,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  const fit = letterboxFit(
    "width" in img ? img.width : 0,
    "height" in img ? img.height : 0,
  );
  ctx.drawImage(img, fit.offX, fit.offY, fit.outW, fit.outH);
  if (showDate) {
    ctx.fillStyle = "rgba(43, 42, 38, 0.78)";
    ctx.fillRect(0, FRAME_H - 96, FRAME_W, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 32px 'Helvetica Neue', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(showDate, FRAME_W / 2, FRAME_H - 48);
  }
}

async function canvasToPngBytes(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function runRender(
  request: RenderRequest,
  onProgress: (p: RenderProgress) => void,
  onLog: (msg: string) => void,
): Promise<{ blob: Blob; filename: string }> {
  if (request.entries.length === 0) {
    throw new Error("There are no photos to render.");
  }

  onProgress({ phase: "preparing", completed: 0, total: request.entries.length });

  const ffmpeg = await getFfmpeg(onLog);

  // Sort entries ascending by capturedDate.
  const sorted = [...request.entries].sort((a, b) =>
    a.capturedDate.localeCompare(b.capturedDate),
  );

  // Write input frames into FFmpeg's virtual FS.
  const total = totalFrames(sorted, request.speedSeconds);
  const framesPerImage = frameCountForSpeed(request.speedSeconds);
  let completed = 0;

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    // Decode the image.
    const blob = new Blob([e.bytes], { type: e.mimeType });
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      throw new Error(`Image ${i + 1} could not be decoded.`);
    }
    const canvas = new OffscreenCanvas(FRAME_W, FRAME_H);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
    const showDate = request.showDates ? e.capturedDate : null;
    drawFrameOnCanvas(ctx, bitmap, showDate);
    bitmap.close();

    // Duplicate the same frame N times so we get the requested duration.
    for (let f = 0; f < framesPerImage; f++) {
      const png = await canvasToPngBytes(canvas);
      const fname = `frame_${pad(i)}_${pad(f)}.png`;
      await ffmpeg.writeFile(fname, png);
      completed += 1;
      onProgress({
        phase: "rendering",
        completed,
        total,
      });
    }
  }

  // Concat to MP4.
  onProgress({
    phase: "finalizing",
    completed: total,
    total,
  });

  const outName = "out.mp4";
  const concatList = Array.from(
    { length: total },
    (_, i) => `file 'frame_${pad(Math.floor(i / framesPerImage))}_${pad(i % framesPerImage)}.png'`,
  ).join("\n");
  await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(concatList));

  // Run ffmpeg. -framerate sets input rate; the output is rendered at the
  // same fps so each input frame displays 1/fps seconds. Because we
  // duplicated frames per image, each image shows for
  // (framesPerImage/FPS) seconds = speedSeconds.
  await ffmpeg.exec([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "concat.txt",
    "-framerate",
    String(FPS),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    `scale=${FRAME_W}:${FRAME_H}`,
    "-movflags",
    "+faststart",
    "-an",
    outName,
  ]);

  const data = await ffmpeg.readFile(outName);
  const outBlob = new Blob([data], { type: "video/mp4" });

  // Cleanup virtual files.
  for (let i = 0; i < sorted.length; i++) {
    for (let f = 0; f < framesPerImage; f++) {
      try {
        await ffmpeg.deleteFile(`frame_${pad(i)}_${pad(f)}.png`);
      } catch {
        /* ignore */
      }
    }
  }
  try {
    await ffmpeg.deleteFile("concat.txt");
    await ffmpeg.deleteFile(outName);
  } catch {
    /* ignore */
  }

  return { blob: outBlob, filename: request.exportFilename };
}

// Worker bootstrap. We attach a single message listener that dispatches
// to runRender.
declare const self: DedicatedWorkerGlobalScope | Window;

// Only install the worker handlers when running inside a real DedicatedWorker.
// Inside jsdom (regular Window), self is `window` and we should NOT register
// global handlers; the pure helpers above are exported for unit testing.
if (
  typeof self !== "undefined" &&
  typeof (self as { postMessage?: unknown }).postMessage === "function" &&
  // Heuristic: in a real Worker, `self` has `onmessage` defined as a setter
  // on DedicatedWorkerGlobalScope. In jsdom window, postMessage exists but
  // requires (message, targetOrigin). Distinguish by checking for the
  // absence of the Window-only message-event machinery.
  typeof (self as { importScripts?: unknown }).importScripts === "function"
) {
  self.onmessage = async (e: MessageEvent) => {
    const data = e.data as { type?: string; request?: RenderRequest };
    if (!data || data.type !== "render" || !data.request) {
      (self as unknown as Worker).postMessage({
        type: "error",
        message: "Unknown render message",
      } satisfies WorkerOut);
      return;
    }
    const req = data.request;
    try {
      const result = await runRender(
        req,
        (p) => {
          (self as unknown as Worker).postMessage({
            type: "progress",
            progress: p,
          } satisfies WorkerOut);
        },
        (msg) => {
          (self as unknown as Worker).postMessage({
            type: "log",
            message: msg,
          } satisfies WorkerOut);
        },
      );
      (self as unknown as Worker).postMessage(
        {
          type: "success",
          blob: result.blob,
          filename: result.filename,
        } satisfies WorkerOut,
      );
    } catch (err) {
      (self as unknown as Worker).postMessage({
        type: "error",
        message: err instanceof Error ? err.message : "Render failed",
      } satisfies WorkerOut);
    }
  };

  (self as unknown as Worker).postMessage({
    type: "ready",
  } satisfies WorkerOut);
}

// Re-export the helpers used by tests.
export { frameCountForSpeed as _frameCountForSpeed, totalFrames as _totalFrames };
// Helper kept for symmetry with imports in some bundlers.
export const fetchFileHelper = fetchFile;