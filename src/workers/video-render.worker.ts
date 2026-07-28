// MP4 export encoding. Runs inside a Web Worker so the UI thread
// stays responsive. Uses @ffmpeg/ffmpeg (single-threaded core)
// loaded from /ffmpeg-core/ on the same origin.
//
// Worker protocol (main-thread canvas, worker handles FFmpeg):
//
//   in  : { type: "init", total, framesPerImage, coreURL?, wasmURL? }
//         — configures the worker and eagerly loads FFmpeg so any
//         CDN error surfaces here with a clear message.
//
//   in  : { type: "frame", idx, frameIdx, png }
//         — a single PNG-encoded frame. The main thread has
//         already rendered and PNG-encoded it on a regular
//         <canvas>. The png bytes are transferred for zero-copy.
//
//   in  : { type: "encode", filename }
//         — encodes the assembled frames into out.mp4 and posts
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
  /**
   * Optional per-frame draw hook invoked by the renderer AFTER the
   * photo + date label are drawn but BEFORE PNG encoding. The V2
   * engine uses this to apply the watermark on the main thread.
   * V1 callers leave it undefined.
   */
  extraDraw?: ExtraDrawFn;
  /**
   * Optional FFmpeg `-vf` chain. When set, replaces the default
   * `scale=...` filter. The V2.5 engine composes a chain from the
   * selected theme (or transition + filter). V1 callers leave
   * it undefined and the worker uses its default.
   */
  vfChain?: string;
}

/** A function that draws onto the host canvas after the V1 frame
 *  content is on it. Used for the V2 watermark. */
export type ExtraDrawFn = (ctx: CanvasRenderingContext2D) => void;

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
  // Each frame in the output stream is one source image shown for
  // speed seconds. We render speed*FPS frames per source image so
  // transitions appear smooth at standard playback.
  return Math.max(1, Math.round(speed * FPS));
}

export function totalFrames(entries: RenderEntry[], speed: RenderSpeed): number {
  return entries.length * frameCountForSpeed(speed);
}

// Re-export the helpers used by tests.

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
  // Load the single-threaded core from the SAME ORIGIN as the page,
  // and use our own classic-worker shim (not the FFmpeg library's
  // default module worker). The library's default worker uses ESM
  // imports which force a module worker, and module workers can't
  // call importScripts. The shim is /ffmpeg-core/ffmpeg-classic-worker.js.
  const baseURL = coreURL
    ? coreURL.replace(/\/[^/]*$/, "")
    : "/ffmpeg-core";
  await ffmpeg.load({
    coreURL: coreURL ?? `${baseURL}/ffmpeg-core.js`,
    wasmURL: wasmURL ?? `${baseURL}/ffmpeg-core.wasm`,
    classWorkerURL: "/ffmpeg-core/ffmpeg-classic-worker.js",
  });
  _ffmpeg = ffmpeg;
  return ffmpeg;
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

// Encode the assembled frames into an MP4.
//
// IMPORTANT: this uses the image2 demuxer with a sequential
// frame_%03d.png pattern, NOT the concat demuxer. The concat demuxer
// in FFmpeg.wasm 0.12.6 produces all input frames at PTS=0, which
// makes vsync=auto treat them all as duplicates and drop ~95% of them
// — confirmed in production: a 7-image flipbook produced a 0.13s MP4
// with only 4 frames instead of 56. image2 with a sequential pattern
// assigns each input a unique increasing PTS and every frame
// survives. (Verified locally: 56-frame test produced 56 frames, 1.87s,
// 0 drops. concat produced 4 frames, 0.13s, 52 drops.)
async function encode(
  total: number,
  post: (m: WorkerOut) => void,
  filename: string,
  vfChain?: string,
): Promise<{ blob: Blob; filename: string }> {
  const ffmpeg = await ensureFfmpeg((m) => post({ type: "log", message: m }));
  const outName = "out.mp4";

  // V2.5 — the engine may pass a custom vfChain (composed from
  // the selected theme / transition / filter). The default
  // remains the V1 letterbox scale so V1 callers are unaffected.
  const vf = vfChain && vfChain.trim().length > 0
    ? vfChain
    : `scale=${FRAME_W}:${FRAME_H}`;

  await ffmpeg.exec([
    "-framerate",
    String(FPS),
    "-i",
    "frame_%03d.png",
    "-vf",
    vf,
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    outName,
  ]);

  const data = await ffmpeg.readFile(outName);
  const outBlob = new Blob([data], { type: "video/mp4" });

  // Cleanup virtual files. The frame_NNN.png sequence is contiguous
  // from 0 to total-1.
  for (let i = 0; i < total; i += 1) {
    try {
      await ffmpeg.deleteFile(`frame_${String(i).padStart(3, "0")}.png`);
    } catch {
      /* ignore */
    }
  }
  try {
    await ffmpeg.deleteFile(outName);
  } catch {
    /* ignore */
  }

  return { blob: outBlob, filename };
}

// Worker bootstrap. We attach a single message listener that
// dispatches to init / frame / encode.
declare const self: DedicatedWorkerGlobalScope | Window;

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
  let vfChain: string | undefined;

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
      vfChain?: string;
    };
    if (!data || !data.type) {
      post({ type: "error", message: "Unknown render message" });
      return;
    }
    if (data.type === "init") {
      if (typeof data.total !== "number") {
        post({ type: "error", message: "init requires total" });
        return;
      }
      total = data.total;
      if (typeof data.framesPerImage === "number") {
        framesPerImage = data.framesPerImage;
      }
      if (typeof data.vfChain === "string") {
        vfChain = data.vfChain;
      }
      // Eagerly load FFmpeg so CDN errors surface during init with
      // a clear message rather than at the encode step.
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
      // Sequential frame_NNN.png naming so the image2 demuxer can
      // pick them up via the frame_%03d.png glob pattern. The
      // orchestrator sends frames in strict (idx, frameIdx) order
      // so seq = idx * framesPerImage + frameIdx is monotonic.
      const seq = data.idx * framesPerImage + data.frameIdx;
      const fname = `frame_${String(seq).padStart(3, "0")}.png`;
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
      const result = await encode(total, post, data.filename, vfChain);
      post({ type: "success", blob: result.blob, filename: result.filename });
      return;
    }

    post({ type: "error", message: `Unknown message type: ${data.type}` });
  };

  (self as unknown as Worker).postMessage({
    type: "ready",
  } satisfies WorkerOut);
}

// Re-export the helpers used by tests.
export { frameCountForSpeed as _frameCountForSpeed, totalFrames as _totalFrames };