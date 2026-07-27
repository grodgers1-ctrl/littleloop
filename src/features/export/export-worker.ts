// Singleton Worker for FFmpeg rendering. The worker is created once
// and reused across exports. The FFmpeg core inside the worker is also
// loaded once (module-scoped _ffmpeg in video-render.worker.ts) so the
// second export reuses the already-downloaded WASM binary.
//
// The orchestrator here handles the transferable-OffscreenCanvas
// protocol: the main thread owns the canvas, creates an ImageBitmap
// per source photo, and posts the bitmap (transferable) to the
// worker for drawing + PNG encoding + FFmpeg writeFile. This keeps
// the worker able to operate in environments where it cannot
// construct OffscreenCanvas or call createImageBitmap on its own
// (notably some iOS Safari builds).

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

// Run an export end-to-end. The caller passes the request (used to
// compute total frame count + filename) and a function that yields
// each source image as bytes. The orchestrator owns the canvas and
// ImageBitmap lifecycle; the worker handles drawing + FFmpeg.
export async function runExport(
  request: RenderRequest,
  getImage: (idx: number) => Promise<ImageSourceLike | null>,
): Promise<{ blob: Blob; filename: string }> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error(
      "Your browser does not support OffscreenCanvas. Little Loop needs iOS Safari 16.4+, Chrome, Edge, or Firefox.",
    );
  }

  const worker = getWorker();

  const framesPerImage = Math.max(
    1,
    Math.round(request.speedSeconds * 30),
  );
  const total = request.entries.length * framesPerImage;

  // Wait for the worker's `ready` (sent at boot) before sending init.
  // We attach a per-export listener that filters by message type.
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

  // Build the OffscreenCanvas on the main thread, then transfer it
  // to the worker. transferControlToOffscreen is a HTMLCanvasElement
  // method that returns an OffscreenCanvas — the returned object
  // becomes the worker's render target. Real iOS Safari 16.4+,
  // Chrome, Edge, and Firefox all support this.
  //
  // Some very old WebKit builds (pre-16.4) lack both this API and
  // the OffscreenCanvas constructor itself. We surface a clear error
  // in that case so the user knows the browser is the problem, not
  // the app.
  const host = document.createElement("canvas");
  host.width = 720;
  host.height = 1280;
  if (typeof host.transferControlToOffscreen !== "function") {
    throw new Error(
      "Your browser does not support OffscreenCanvas. Little Loop needs iOS Safari 16.4+, Chrome, Edge, or Firefox.",
    );
  }
  const transferred = host.transferControlToOffscreen();

  // Send init and wait for ready. The OffscreenCanvas is a
  // transferable — pass it in the second arg so it moves to the
  // worker instead of being cloned (which would throw).
  await sendAndAwait(
    {
      type: "init",
      canvas: transferred,
      total,
      speed: request.speedSeconds,
    },
    "ready",
    [transferred],
  );

  // For each entry: decode on main thread, transfer bitmap, wait
  // for frame-done.
  const onProgress = (p: RenderProgress) => {
    // We re-emit progress through a per-export notifier. The
    // orchestrator sets _activeProgress on init.
    if (_activeProgress) _activeProgress(p);
  };

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
    onProgress({
      phase: "rendering",
      completed: idx * framesPerImage,
      total,
    });
    await sendAndAwait(
      {
        type: "frame",
        idx,
        frameIdx: 0,
        bitmap,
        capturedDate: src.capturedDate,
        showDates: request.showDates,
      },
      "frame-done",
      [bitmap],
    );
    bitmap.close();
  }

  // Final encode.
  onProgress({ phase: "finalizing", completed: total, total });
  const success = await sendAndAwait(
    { type: "encode", filename: request.exportFilename },
    "success",
  );

  return { blob: success.blob, filename: success.filename };
}

// Per-export progress notifier. The runExport flow pushes progress
// updates here, and the higher-level startExport wires the
// user-supplied onProgress callback into this slot while the export
// is in flight.
let _activeProgress: ((p: RenderProgress) => void) | null = null;

export function startExport(
  request: RenderRequest,
  handle: ExportHandle,
): void {
  _activeProgress = handle.onProgress;

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
      _activeProgress = null;
      handle.onSuccess(result.blob, result.filename);
    })
    .catch((err) => {
      _activeProgress = null;
      handle.onError(err instanceof Error ? err.message : "Render failed");
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