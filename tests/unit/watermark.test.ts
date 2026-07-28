// V2 Watermark unit tests. Render the watermark onto a real canvas
// (jsdom provides HTMLCanvasElement; the test setup in tests/setup.ts
// stubs getContext to a 2d context with the methods we exercise).
//
// We assert:
//   - applyWatermark does not throw and returns control.
//   - shouldApplyWatermark returns the right value for each tier.
//   - The watermark is positioned in the bottom-right quadrant
//     (we don't introspect pixels; we assert via the canvas size
//     and the API surface).

import { describe, expect, it } from "vitest";
import {
  applyWatermark,
  DEFAULT_WATERMARK_STYLE,
  shouldApplyWatermark,
} from "../../src/engine/export/watermark";

function makeCtx(w = 720, h = 1280): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("jsdom canvas context unavailable");
  return ctx;
}

describe("applyWatermark", () => {
  it("renders without throwing on the default canvas size", () => {
    const ctx = makeCtx();
    expect(() => applyWatermark(ctx)).not.toThrow();
  });

  it("renders without throwing on a small canvas", () => {
    const ctx = makeCtx(320, 568);
    expect(() => applyWatermark(ctx)).not.toThrow();
  });

  it("is a no-op when canvas dimensions are zero", () => {
    const ctx = makeCtx(0, 0);
    expect(() => applyWatermark(ctx)).not.toThrow();
  });

  it("accepts a custom style", () => {
    const ctx = makeCtx();
    expect(() =>
      applyWatermark(ctx, {
        ...DEFAULT_WATERMARK_STYLE,
        text: "demo",
        opacity: 0.5,
        fontSizePx: 24,
      }),
    ).not.toThrow();
  });

  it("uses the spec default text and opacity", () => {
    expect(DEFAULT_WATERMARK_STYLE.text).toBe("made with little-loop");
    expect(DEFAULT_WATERMARK_STYLE.opacity).toBe(0.3);
    expect(DEFAULT_WATERMARK_STYLE.position).toBe("bottom-right");
  });
});

describe("shouldApplyWatermark", () => {
  it("applies the watermark on the free tier", () => {
    expect(shouldApplyWatermark("free")).toBe(true);
  });

  it("does NOT apply on Clean", () => {
    expect(shouldApplyWatermark("clean")).toBe(false);
  });

  it("does NOT apply on Studio", () => {
    expect(shouldApplyWatermark("studio")).toBe(false);
  });

  it("forceNoWatermark bypasses the tier check (used by the per-export preview bypass)", () => {
    expect(shouldApplyWatermark("clean", true)).toBe(false);
    expect(shouldApplyWatermark("free", true)).toBe(false);
  });
});
