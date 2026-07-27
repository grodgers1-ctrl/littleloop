// MP4 export encoding. Runs inside a Web Worker so the UI thread stays
// responsive. Uses @ffmpeg/ffmpeg (single-threaded core) loaded lazily
// from a public CDN so it doesn't bloat the main JS bundle.
//
// Worker protocol (v3 — main-thread canvas, worker handles FFmpeg only).
// Works on every browser including iOS Safari 16.0 (which has no
// OffscreenCanvas / transferControlToOffscreen):
//
//   in  : { type: "init", total, framesPerImage, coreURL?, wasmURL? }
//         — configures the worker and eagerly loads FFmpeg so any
//         CDN error surfaces here with a clear message.
//
//   in  : { type: "frame", idx, frameIdx, png }
//         — a single PNG-encoded frame to write to FFmpeg's virtual
//         FS. The main thread has already rendered and PNG-encoded
//         it on a regular <canvas>. The png bytes are transferred
//         for zero-copy.
//
//   in  : { type: "encode", filename }
//         — runs the concat command, produces out.mp4, posts
//         { type: "success", blob, filename }.
//
//   out : { type: "ready" }
//   out : { type: "progress", progress: RenderProgress }
//   out : { type: "log", message }
//   out : { type: "frame-done", idx, frameIdx }
//   out : { type: "success", blob, filename }
//   out : { type: "error", message }

import { FFmpeg } from "@ffmpeg/ffmpeg";

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

async function getFfmpeg(
  onLog: (msg: string) => void,
  coreURL?: string,
  wasmURL?: string,
): Promise<FFmpeg> {
  if (_ffmpeg) return _ffmpeg;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => onLog(message));
  ffmpeg.on("progress", () => {
    // Per-frame progress is reported by the orchestrator based on
    // completed frame writes, not FFmpeg's internal progress.
  });
  // Load the single-threaded core from the SAME ORIGIN as the page.
  // We previously fetched from unpkg.com but iOS Safari 26.5 fails
  // the worker's importScripts for cross-origin URLs even when
  // unpkg sends the right CORS / CORP headers. Self-hosting the
  // core from /ffmpeg-core/ (served by the same Vercel deploy as
  // the app) avoids the cross-origin importScripts restriction.
  //
  // The init message can still override via coreURL/wasmURL for
  // tests pointing at a local mock.
  const baseURL = coreURL
    ? coreURL.replace(/\/[^/]*$/, "")
    : "/ffmpeg-core";
  await ffmpeg.load({
    coreURL: coreURL ?? `${baseURL}/ffmpeg-core.js`,
    wasmURL: wasmURL ?? `${baseURL}/ffmpeg-core.wasm`,
  });
  _ffmpeg = ffmpeg;
  return ffmpeg;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

async function ensureFfmpeg(
  onLog: (msg: string) => void,
  coreURL?: string,
  wasmURL?: string,
): Promise<FFmpeg> {
  return getFfmpeg(onLog, coreURL, wasmURL);
}

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

async function encode(
  total: number,
  framesPerImage: number,
  post: (m: WorkerOut) => void,
  filename: string,
): Promise<{ blob: Blob; filename: string }> {
  const ffmpeg = await ensureFfmpeg((m) => post({ type: "log", message: m }));
  const outName = "out.mp4";
  const concatList = Array.from(
    { length: total },
    (_, i) =>
      `file 'frame_${pad(Math.floor(i / framesPerImage))}_${pad(i % framesPerImage)}.png'`,
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

  // Cleanup virtual files.
  const entriesWritten = Math.ceil(total / framesPerImage);
  for (let i = 0; i < entriesWritten; i += 1) {
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

  return { blob: outBlob, filename };
}

// describeError: produce a single diagnostic string from any thrown
// value. The previous fallback to the literal "Render failed" string
// hid empty-message rejections (notably some FFmpeg.wasm internal
// errors on iOS Safari). Concatenating every useful property gives
// the user (and our remote debugging) the real cause.
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const parts: string[] = [];
    if (err.name && err.name !== "Error") parts.push(`[${err.name}]`);
    if (err.message) parts.push(err.message);
    if (err.stack) parts.push(`(${err.stack.split("\n")[0]})`);
    if (parts.length === 0) {
      try {
        parts.push(`unknown Error: ${JSON.stringify(err)}`);
      } catch {
        parts.push("unknown Error (not serializable)");
      }
    }
    return parts.join(" ");
  }
  if (typeof err === "string") return err;
  if (err === null || err === undefined) return "Unknown error (no details)";
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// Worker bootstrap. We attach a single message listener that dispatches
// to init / frame / encode.
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

  // Module-scoped state populated by the first `init` message.
  let total = 0;
  let framesPerImage = 1;

  self.onmessage = async (e: MessageEvent) => {
    const data = e.data as {
      type?: string;
      idx?: number;
      frameIdx?: number;
      png?: Uint8Array;
      filename?: string;
      total?: number;
      framesPerImage?: number;
      coreURL?: string;
      wasmURL?: string;
    };
    if (!data || !data.type) {
      post({ type: "error", message: "Unknown render message" });
      return;
    }

    try {
      if (data.type === "init") {
        total = data.total ?? 0;
        framesPerImage = data.framesPerImage ?? 1;
        // Eagerly load FFmpeg so CDN errors surface during init with
        // a clear message, instead of failing mid-render.
        await initFfmpegEager(post, data.coreURL, data.wasmURL);
        post({ type: "ready" });
        return;
      }

      if (data.type === "frame") {
        const ffmpeg = await ensureFfmpeg((m) =>
          post({ type: "log", message: m }),
        );
        if (
          typeof data.idx !== "number" ||
          typeof data.frameIdx !== "number" ||
          !(data.png instanceof Uint8Array)
        ) {
          post({ type: "error", message: "frame message missing fields" });
          return;
        }
        const fname = `frame_${pad(data.idx)}_${pad(data.frameIdx)}.png`;
        await ffmpeg.writeFile(fname, data.png);
        post({
          type: "progress",
          progress: {
            phase: "rendering",
            completed: data.idx * framesPerImage + data.frameIdx + 1,
            total,
          },
        });
        post({ type: "frame-done", idx: data.idx, frameIdx: data.frameIdx });
        return;
      }

      if (data.type === "encode") {
        if (typeof data.filename !== "string") {
          post({ type: "error", message: "encode requires filename" });
          return;
        }
        post({
          type: "progress",
          progress: { phase: "finalizing", completed: total, total },
        });
        const result = await encode(total, framesPerImage, post, data.filename);
        post({ type: "success", blob: result.blob, filename: result.filename });
        return;
      }

      post({ type: "error", message: `Unknown message type: ${data.type}` });
    } catch (err) {
      post({ type: "error", message: describeError(err) });
    }
  };

  (self as unknown as Worker).postMessage({
    type: "ready",
  } satisfies WorkerOut);
}

// Re-export the helpers used by tests.
export { frameCountForSpeed as _frameCountForSpeed, totalFrames as _totalFrames };

// BG_COLOR is referenced by the legacy runRender export; keep it
// exported here so other tooling can read it. We don't use it in
// the worker because all canvas drawing happens on the main thread.
export const _BG_COLOR = BG_COLOR;