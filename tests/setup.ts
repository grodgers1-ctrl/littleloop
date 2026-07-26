// Vitest setup. Provide:
//   - jest-dom matchers for DOM assertions.
//   - fake-indexeddb so the Dexie layer can run in jsdom.
//   - canvas + createImageBitmap stubs so image-processing tests work.

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";

// jsdom's Blob/File classes are stubs without arrayBuffer/text/stream.
// Swap in Node's native Blob/File so the real-browser code paths work.
const _NodeBlob = NodeBlob as unknown as typeof Blob;
Object.defineProperty(globalThis, "Blob", {
  value: _NodeBlob,
  writable: true,
  configurable: true,
});
const _NodeFile = NodeFile as unknown as typeof File;
Object.defineProperty(globalThis, "File", {
  value: _NodeFile,
  writable: true,
  configurable: true,
});
(globalThis as { __llUsingNodeBlob?: boolean }).__llUsingNodeBlob = true;

// Minimal canvas mock sufficient for our processImageFile tests.
if (typeof HTMLCanvasElement !== "undefined") {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const getContextFn = function getContext(
    this: HTMLCanvasElement,
    ctxId?: string,
    ...rest: unknown[]
  ): RenderingContext | null {
    if (ctxId !== "2d") {
      return originalGetContext
        ? originalGetContext.call(this, ctxId as never, ...(rest as []))
        : null;
    }
    const noop = () => {};
    const ctx = {
      canvas: this,
      fillStyle: "#000",
      fillRect: noop,
      drawImage: noop,
      getImageData: (
        _x: number,
        _y: number,
        w: number,
        h: number,
      ): ImageData => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
        colorSpace: "srgb",
      }),
      putImageData: noop,
      createImageData: (w: number, h: number): ImageData => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
        colorSpace: "srgb",
      }),
      setTransform: noop,
      resetTransform: noop,
      save: noop,
      restore: noop,
      translate: noop,
      rotate: noop,
      scale: noop,
      measureText: (): TextMetrics => ({
        width: 0,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 0,
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: 0,
        fontBoundingBoxAscent: 0,
        fontBoundingBoxDescent: 0,
        alphabeticBaseline: 0,
        emHeightAscent: 0,
        emHeightDescent: 0,
        hangingBaseline: 0,
        ideographicBaseline: 0,
      }),
      fillText: noop,
      strokeText: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      bezierCurveTo: noop,
      arc: noop,
      rect: noop,
      fill: noop,
      stroke: noop,
      clip: noop,
      clearRect: noop,
    };
    return ctx as unknown as RenderingContext;
  };
  // Cast through unknown so the overloaded getContext type accepts our duck-typed mock.
  HTMLCanvasElement.prototype.getContext =
    getContextFn as unknown as typeof HTMLCanvasElement.prototype.getContext;

  // Stub canvas.toBlob to return a deterministic 1x1 PNG byte sequence.
  HTMLCanvasElement.prototype.toBlob = function toBlob(
    callback: BlobCallback | null,
    _type?: string,
    _quality?: number,
  ): void {
    if (callback) {
      // 67-byte 1x1 transparent PNG.
      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      callback(new Blob([png], { type: "image/png" }));
    }
  };
}

// Provide a working stub for createImageBitmap so the image-processing
// pipeline can run end-to-end in jsdom. We return a 1x1 mock bitmap
// matching the source's reported dimensions (the real pipeline is
// tested via component tests in a real browser).
if (typeof globalThis.createImageBitmap !== "function") {
  const stubBitmap: typeof createImageBitmap = (async (
    _image: ImageBitmapSource,
    opts?: { resizeWidth?: number; resizeHeight?: number },
  ): Promise<ImageBitmap> => {
    const w = opts?.resizeWidth ?? 1;
    const h = opts?.resizeHeight ?? 1;
    return {
      width: w,
      height: h,
      close: () => {},
    } as unknown as ImageBitmap;
  }) as unknown as typeof createImageBitmap;
  globalThis.createImageBitmap = stubBitmap;
}
// jsdom doesn't provide URL.createObjectURL. The image-processing
// fallback path uses it; tests don't exercise the full decode pipeline
// (we have a stubbed createImageBitmap) but we still polyfill so
// processImageFile's fallback doesn't crash if createImageBitmap throws.
if (
  typeof URL.createObjectURL !== "function" ||
  typeof URL.revokeObjectURL !== "function"
) {
  const map = new Map<unknown, string>();
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    value: () => {
      const id = `blob:stub-${++counter}`;
      map.set(id, "stub");
      return id;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: () => {
      /* no-op */
    },
  });
}

// Mark the stub so modules can detect it and skip best-effort decode
// checks that would otherwise fail on otherwise-valid test inputs.
(globalThis as { __llStubbedBitmap?: boolean }).__llStubbedBitmap = false;
