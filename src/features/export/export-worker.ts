// Singleton Worker for FFmpeg encoding. The worker is created once
// and reused across exports. The FFmpeg core inside the worker is
// also loaded once (module-scoped _ffmpeg in video-render.worker.ts)
// so the second export reuses the already-downloaded WASM binary.
//
// Frame rendering happens on the MAIN THREAD via a regular <canvas>.
// This is critical for iOS Safari 16.x compatibility — those builds
// lack OffscreenCanvas entirely. The worker only receives PNG-encoded
// frames and writes them to FFmpeg's VFS.

import type {
  RenderRequest,
  RenderProgress,
  RenderSpeed,
  WorkerOut,
} from "../../workers/video-render.worker";

let _worker: Worker | null = null;

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL("../../workers/video-render.worker.ts", import.meta.url),
      { type: "module" },
    );
  }
  return _worker;
}

export interface ExportHandle {
  onProgress: (p: RenderProgress) => void;
  onSuccess: (blob: Blob, filename: string) => void;
  onError: (message: string) => void;
}

export interface ImageSourceLike {
  bytes: Uint8Array;
  mimeType: string;
  capturedDate: string;
}

const FRAME_W = 720;
const FRAME_H = 1280;
const BG_COLOR = "#fbf2e6";

// Letterbox math: fit image into frame preserving aspect ratio.
function letterboxFit(srcW: number, srcH: number): {
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

// Draw one source bitmap onto the host canvas, optionally with the
// captured-date label. Matches the worker-side drawFrameOnCanvas so
// the output is identical regardless of which browser.
function drawFrame(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  showDate: string | null,
  extraDraw?: (ctx: CanvasRenderingContext2D) => void,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  const fit = letterboxFit(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, fit.offX, fit.offY, fit.outW, fit.outH);
  if (showDate) {
    ctx.fillStyle = "rgba(43, 42, 38, 0.78)";
    ctx.fillRect(0, FRAME_H - 96, FRAME_W, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 32px 'Helvetica Neue', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(showDate, FRAME_W / 2, FRAME_H - 48);
  }
  // V2 extension hook: draw the watermark (or anything else) on
  // top of the frame content. Runs on the main thread before PNG
  // encoding, so the worker only sees the resulting bytes.
  if (extraDraw) extraDraw(ctx);
}

// Convert the canvas contents to a PNG Uint8Array. Uses canvas.toBlob
// (available everywhere; iOS Safari 16 included). Each call returns
// a fresh ArrayBuffer, which lets us transfer it without detaching
// a buffer we still need.
function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("canvas.toBlob returned null"));
        return;
      }
      blob
        .arrayBuffer()
        .then((ab) => resolve(new Uint8Array(ab)))
        .catch(reject);
    }, "image/png");
  });
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

// Run an export end-to-end. Main thread renders frames on a regular
// <canvas>; the worker writes PNGs into FFmpeg's virtual FS and runs
// the concat command at the end.
export async function runExport(
  request: RenderRequest,
  getImage: (idx: number) => Promise<ImageSourceLike | null>,
): Promise<{ blob: Blob; filename: string }> {
  if (typeof document === "undefined") {
    throw new Error(
      "runExport must be called from the main thread (it needs document.createElement).",
    );
  }

  const worker = getWorker();
  const framesPerImage = Math.max(1, Math.round(request.speedSeconds * 30));
  const total = request.entries.length * framesPerImage;

  // Build the host canvas. We use a real <canvas> (NOT OffscreenCanvas)
  // so this works on every browser including iOS Safari 16.0 which
  // has no OffscreenCanvas at all.
  const host = document.createElement("canvas");
  host.width = FRAME_W;
  host.height = FRAME_H;
  const ctx = host.getContext("2d");
  if (!ctx) {
    throw new Error(
      "Your browser does not support the 2D canvas API. Little Loop needs a modern browser.",
    );
  }

  // Helper: send a worker message and await a specific reply type.
  // The third arg is the transferable list (e.g. [pngBytes]).
  const sendAndAwait = <T extends WorkerOut["type"]>(
    payload: object,
    awaitType: T,
    transfer: Transferable[] = [],
  ): Promise<Extract<WorkerOut, { type: T }>> =>
    new Promise((resolve, reject) => {
      const onMessage = (e: MessageEvent<WorkerOut>) => {
        const msg = e.data;
        if (msg.type === awaitType) {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          resolve(msg as Extract<WorkerOut, { type: T }>);
        } else if (msg.type === "error") {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          reject(new Error(msg.message));
        }
      };
      const onError = (ev: ErrorEvent) => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        reject(new Error(ev.message || "Worker error"));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError as EventListener);
      worker.postMessage(payload, transfer);
    });

  // Init: tell the worker how many frames total and how many per
  // source image. Worker eagerly loads FFmpeg so any CDN error
  // surfaces here as a clean "Failed to load FFmpeg: ..." message.
  await sendAndAwait(
    { type: "init", total, framesPerImage },
    "ready",
  );

  // For each source entry: decode to ImageBitmap on main thread,
  // draw + PNG-encode N times (one per output frame), and post each
  // PNG to the worker. canvasToPng produces a fresh ArrayBuffer per
  // call, so transferring each one is safe.
  for (let idx = 0; idx < request.entries.length; idx += 1) {
    const src = await getImage(idx);
    if (!src) {
      throw new Error(`Image ${idx + 1} could not be loaded.`);
    }
    const blob = new Blob([src.bytes], { type: src.mimeType });
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      throw new Error(`Image ${idx + 1} could not be decoded.`);
    }
    const showDate = request.showDates ? src.capturedDate : null;
    drawFrame(ctx, bitmap, showDate, request.extraDraw);

    for (let f = 0; f < framesPerImage; f += 1) {
      const png = await canvasToPng(host);
      await sendAndAwait(
        { type: "frame", idx, frameIdx: f, png },
        "frame-done",
        [png.buffer],
      );
    }
    bitmap.close();
  }

  // Encode. Worker runs the concat command and returns the MP4 blob.
  const success = await sendAndAwait(
    { type: "encode", filename: request.exportFilename },
    "success",
  );
  return { blob: success.blob, filename: success.filename };
}

export function startExport(
  request: RenderRequest,
  handle: ExportHandle,
): void {
  runExport(request, async (idx) => {
    const entry = request.entries[idx];
    if (!entry) return null;
    return {
      bytes: entry.bytes,
      mimeType: entry.mimeType,
      capturedDate: entry.capturedDate,
    };
  })
    .then((result) => {
      handle.onSuccess(result.blob, result.filename);
    })
    .catch((err) => {
      handle.onError(describeError(err));
    });
}

// Forcibly terminate the cached worker. Useful when the app unmounts.
export function terminateWorker(): void {
  if (_worker) {
    _worker.terminate();
    _worker = null;
  }
}

// Re-export the protocol types so callers don't need a second import.
export type { RenderRequest, RenderSpeed, RenderProgress };