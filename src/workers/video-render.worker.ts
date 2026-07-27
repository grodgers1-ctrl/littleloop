// MP4 export rendering. Runs inside a Web Worker so the UI thread stays
// responsive. Uses @ffmpeg/ffmpeg (single-threaded core) loaded lazily
// from a public CDN so it doesn't bloat the main JS bundle.
//
// Worker protocol (v2 — supports iOS Safari by sourcing canvas +
// ImageBitmap from the main thread and transferring them in):
//
//   in  : { type: "init", canvas: OffscreenCanvas }
//         — called once before any frames. `canvas` is transferred
//         from the main thread via transferControlToOffscreen(). We
//         use a SINGLE canvas for the whole render and call
//         ctx.clearRect between frames, so memory stays bounded.
//
//   in  : { type: "frame", idx, frameIdx, bitmap, capturedDate,
//           showDates }
//         — `bitmap` is an ImageBitmap created on the main thread
//         (because Safari workers can't construct OffscreenCanvas /
//         call createImageBitmap on some paths). We draw it onto
//         the shared canvas, call convertToBlob, write the PNG to
//         FFmpeg's virtual FS, and reply with { type: "frame-done" }.
//
//   in  : { type: "encode" }
//         — runs the concat command and produces out.mp4, then
//         posts { type: "success", blob, filename } or
//         { type: "error", message }.
//
//   out : { type: "ready" }
//   out : { type: "frame-done", idx, frameIdx }
//   out : { type: "progress", progress: RenderProgress }
//   out : { type: "log", message }
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
  | { type: "frame-done"; idx: number; frameIdx: number }
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
  img: ImageBitmap,
  showDate: string | null,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  const fit = letterboxFit(img.width, img.height);
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

// Worker-side state. Populated by the `init` message.
interface WorkerState {
  canvas: OffscreenCanvas | null;
  ctx: OffscreenCanvasRenderingContext2D | null;
  ffmpeg: FFmpeg | null;
  total: number;
  completed: number;
  framesPerImage: number;
  speed: RenderSpeed;
}

const state: WorkerState = {
  canvas: null,
  ctx: null,
  ffmpeg: null,
  total: 0,
  completed: 0,
  framesPerImage: 0,
  speed: 0.5,
};

async function ensureFfmpeg(
  onLog: (msg: string) => void,
  coreURL?: string,
  wasmURL?: string,
): Promise<FFmpeg> {
  if (state.ffmpeg) return state.ffmpeg;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => onLog(message));
  ffmpeg.on("progress", () => {
    // We don't surface per-frame progress here; we count by source images.
  });
  // Load the single-threaded core. Default to the @ffmpeg/core CDN;
  // allow the init message to override (useful for tests pointing at
  // a local mock).
  const baseURL = coreURL
    ? coreURL.replace(/\/[^/]*$/, "")
    : "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: coreURL ?? `${baseURL}/ffmpeg-core.js`,
    wasmURL: wasmURL ?? `${baseURL}/ffmpeg-core.wasm`,
  });
  state.ffmpeg = ffmpeg;
  return ffmpeg;
}

// Eagerly initialise FFmpeg so any CDN failure surfaces during init
// (a clear "Failed to load FFmpeg" error) rather than mid-render (a
// confusing frame-write failure). The init message waits for FFmpeg
// before posting ready.
async function initFfmpegEager(
  post: (m: WorkerOut) => void,
  coreURL?: string,
  wasmURL?: string,
): Promise<void> {
  try {
    await ensureFfmpeg(
      (m) => post({ type: "log", message: m }),
      coreURL,
      wasmURL,
    );
  } catch (err) {
    throw new Error(
      `Failed to load FFmpeg: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Render a single source image into `framesPerImage` PNG frames.
// We cache the source ImageBitmap across the inner loop because
// every output frame is the same image.
async function writeFramesForEntry(
  msg: {
    idx: number;
    bitmap: ImageBitmap;
    capturedDate: string;
    showDates: boolean;
  },
  post: (m: WorkerOut) => void,
  onProgress: (p: RenderProgress) => void,
): Promise<void> {
  const ctx = state.ctx;
  const ffmpeg = await ensureFfmpeg((m) => post({ type: "log", message: m }));
  if (!ctx || !state.canvas) {
    throw new Error("Worker not initialised — call init first.");
  }
  const showDate = msg.showDates ? msg.capturedDate : null;
  drawFrameOnCanvas(ctx, msg.bitmap, showDate);

  for (let f = 0; f < state.framesPerImage; f += 1) {
    const png = await canvasToPngBytes(state.canvas);
    const fname = `frame_${pad(msg.idx)}_${pad(f)}.png`;
    await ffmpeg.writeFile(fname, png);
    state.completed += 1;
    onProgress({
      phase: "rendering",
      completed: state.completed,
      total: state.total,
    });
  }
}

async function encode(
  total: number,
  post: (m: WorkerOut) => void,
  onProgress: (p: RenderProgress) => void,
  filename: string,
): Promise<{ blob: Blob; filename: string }> {
  const ffmpeg = await ensureFfmpeg((m) => post({ type: "log", message: m }));
  onProgress({ phase: "finalizing", completed: total, total });

  const outName = "out.mp4";
  const concatList = Array.from(
    { length: total },
    (_, i) =>
      `file 'frame_${pad(Math.floor(i / state.framesPerImage))}_${pad(i % state.framesPerImage)}.png'`,
  ).join("\n");
  await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(concatList));

  // Run ffmpeg. -framerate sets input rate; the output is rendered at
  // the same fps so each input frame displays 1/fps seconds. Because
  // we duplicated frames per image, each image shows for
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

  // Cleanup virtual files. Iterate by (idx, frameIdx) for every
  // source image we wrote.
  const entriesWritten = Math.ceil(total / state.framesPerImage);
  for (let i = 0; i < entriesWritten; i += 1) {
    for (let f = 0; f < state.framesPerImage; f += 1) {
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

  return { blob: outBlob, filename };
}

// Worker bootstrap.
declare const self: DedicatedWorkerGlobalScope | Window;

// Only install the worker handlers when running inside a real DedicatedWorker.
if (
  typeof self !== "undefined" &&
  typeof (self as { postMessage?: unknown }).postMessage === "function" &&
  typeof (self as { importScripts?: unknown }).importScripts === "function"
) {
  const post = (m: WorkerOut) => {
    (self as unknown as Worker).postMessage(m);
  };

  self.onmessage = async (e: MessageEvent) => {
    const data = e.data as {
      type?: string;
      canvas?: OffscreenCanvas;
      idx?: number;
      frameIdx?: number;
      bitmap?: ImageBitmap;
      capturedDate?: string;
      showDates?: boolean;
      total?: number;
      speed?: RenderSpeed;
      filename?: string;
      coreURL?: string;
      wasmURL?: string;
    };
    if (!data || !data.type) {
      post({ type: "error", message: "Unknown render message" });
      return;
    }

    try {
      if (data.type === "init") {
        if (!data.canvas) {
          post({
            type: "error",
            message:
              "OffscreenCanvas is not available. Little Loop needs a modern browser (iOS Safari 16.4+, Chrome, Edge, Firefox).",
          });
          return;
        }
        state.canvas = data.canvas;
        const ctx = state.canvas.getContext("2d");
        if (!ctx) {
          post({
            type: "error",
            message: "Could not get a 2D context from the OffscreenCanvas.",
          });
          return;
        }
        state.ctx = ctx;
        state.speed = data.speed ?? 0.5;
        state.framesPerImage = frameCountForSpeed(state.speed);
        state.total = data.total ?? 0;
        state.completed = 0;
        // Eagerly load FFmpeg so CDN errors surface during init with
        // a clear message, instead of failing mid-render. The init
        // message may override coreURL/wasmURL (e2e tests do this to
        // point at a local mock without hitting unpkg.com).
        await initFfmpegEager(post, data.coreURL, data.wasmURL);
        post({ type: "ready" });
        return;
      }

      if (data.type === "frame") {
        if (
          !state.ctx ||
          !state.canvas ||
          typeof data.idx !== "number" ||
          !data.bitmap
        ) {
          post({ type: "error", message: "Worker not initialised for frames." });
          return;
        }
        const onProgress = (p: RenderProgress) =>
          post({ type: "progress", progress: p });
        await writeFramesForEntry(
          {
            idx: data.idx,
            bitmap: data.bitmap,
            capturedDate: data.capturedDate ?? "",
            showDates: data.showDates ?? false,
          },
          post,
          onProgress,
        );
        post({ type: "frame-done", idx: data.idx, frameIdx: data.frameIdx ?? 0 });
        return;
      }

      if (data.type === "encode") {
        if (typeof data.filename !== "string") {
          post({ type: "error", message: "encode requires filename" });
          return;
        }
        const onProgress = (p: RenderProgress) =>
          post({ type: "progress", progress: p });
        const result = await encode(state.total, post, onProgress, data.filename);
        post({
          type: "success",
          blob: result.blob,
          filename: result.filename,
        });
        return;
      }

      post({ type: "error", message: `Unknown message type: ${data.type}` });
    } catch (err) {
      // Surface a useful message. The generic catch was hiding the
      // actual cause ("OffscreenCanvas is not defined", "convertToBlob
      // is not a function", etc.).
      let message = "Render failed";
      if (err instanceof Error) {
        message = err.message || (err.name ? `${err.name}` : "Render failed");
        if (err.stack) message += ` (${err.stack.split("\n")[0]})`;
      } else {
        message = String(err);
      }
      post({
        type: "error",
        message,
      });
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

// Backwards-compatible export for the previous (non-iOS) API. The
// unit tests import `runRender` to verify the frame math. The real
// production path goes through the new init/frame/encode protocol
// above.
export async function runRender(
  request: RenderRequest,
  onProgress: (p: RenderProgress) => void,
  onLog: (msg: string) => void,
): Promise<{ blob: Blob; filename: string }> {
  // Re-implement the old single-message API using the same building
  // blocks as the new protocol. This path is only exercised in unit
  // tests — production uses init/frame/encode.
  if (request.entries.length === 0) {
    throw new Error("There are no photos to render.");
  }
  onProgress({
    phase: "preparing",
    completed: 0,
    total: request.entries.length,
  });
  const ffmpeg = await getFfmpeg(onLog);
  const sorted = [...request.entries].sort((a, b) =>
    a.capturedDate.localeCompare(b.capturedDate),
  );
  const framesPerImage = frameCountForSpeed(request.speedSeconds);
  const total = totalFrames(sorted, request.speedSeconds);
  let completed = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const e = sorted[i];
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
    for (let f = 0; f < framesPerImage; f += 1) {
      const png = await canvasToPngBytes(canvas);
      const fname = `frame_${pad(i)}_${pad(f)}.png`;
      await ffmpeg.writeFile(fname, png);
      completed += 1;
      onProgress({ phase: "rendering", completed, total });
    }
  }
  onProgress({ phase: "finalizing", completed: total, total });
  const outName = "out.mp4";
  const concatList = Array.from(
    { length: total },
    (_, i) =>
      `file 'frame_${pad(Math.floor(i / framesPerImage))}_${pad(i % framesPerImage)}.png'`,
  ).join("\n");
  await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(concatList));
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
  for (let i = 0; i < sorted.length; i += 1) {
    for (let f = 0; f < framesPerImage; f += 1) {
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