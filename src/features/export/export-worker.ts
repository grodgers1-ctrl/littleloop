// Singleton Worker for FFmpeg rendering. The worker is created once
// and reused across exports. The FFmpeg core inside the worker is also
// loaded once (module-scoped _ffmpeg in video-render.worker.ts) so the
// second export reuses the already-downloaded WASM binary.
//
// The worker receives { type: "render", request: RenderRequest } and
// responds with typed WorkerOut messages. We surface progress and
// the final result through a callback-based helper.

import type {
  RenderRequest,
  RenderProgress,
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

export function startExport(
  request: RenderRequest,
  handle: ExportHandle,
): void {
  const worker = getWorker();

  const onMessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    if (msg.type === "progress") {
      handle.onProgress(msg.progress);
    } else if (msg.type === "success") {
      handle.onSuccess(msg.blob, msg.filename);
      worker.removeEventListener("message", onMessage);
    } else if (msg.type === "error") {
      handle.onError(msg.message);
      worker.removeEventListener("message", onMessage);
    }
    // log messages are ignored
  };

  worker.addEventListener("message", onMessage);
  worker.onerror = (ev) => {
    handle.onError(ev.message || "Worker error");
    worker.removeEventListener("message", onMessage);
  };

  worker.postMessage({ type: "render", request });
}

// Forcibly terminate the cached worker. Useful when the app unmounts.
export function terminateWorker(): void {
  if (_worker) {
    _worker.terminate();
    _worker = null;
  }
}