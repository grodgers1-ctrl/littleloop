import { describe, expect, it } from "vitest";
import {
  frameCountForSpeed,
  letterboxFit,
  totalFrames,
} from "../../src/workers/video-render.worker";

describe("export render helpers", () => {
  it("letterboxFit fits a 1600x1200 image into 720x1280", () => {
    const fit = letterboxFit(1600, 1200);
    expect(fit.outW).toBe(720);
    expect(fit.outH).toBe(540); // 720 * (1200/1600)
    // Centered
    expect(fit.offX).toBe(0);
    expect(fit.offY).toBe(370); // (1280 - 540)/2
  });

  it("letterboxFit fits a portrait image into 720x1280", () => {
    const fit = letterboxFit(1200, 3200);
    // scale = 1280/3200 = 0.4 -> 480 x 1280
    expect(fit.outW).toBe(480);
    expect(fit.outH).toBe(1280);
    expect(fit.offX).toBe(120);
    expect(fit.offY).toBe(0);
  });

  it("frameCountForSpeed returns speed*30", () => {
    expect(frameCountForSpeed(0.8)).toBe(24);
    expect(frameCountForSpeed(0.5)).toBe(15);
    expect(frameCountForSpeed(0.25)).toBe(8);
  });

  it("totalFrames multiplies by entry count", () => {
    const entries = [
      { id: "a", capturedDate: "2025-01-01", mimeType: "image/jpeg", width: 100, height: 100, bytes: new Uint8Array() },
      { id: "b", capturedDate: "2025-01-02", mimeType: "image/jpeg", width: 100, height: 100, bytes: new Uint8Array() },
      { id: "c", capturedDate: "2025-01-03", mimeType: "image/jpeg", width: 100, height: 100, bytes: new Uint8Array() },
    ];
    expect(totalFrames(entries, 0.5)).toBe(45); // 3 entries * 15 frames
    expect(totalFrames(entries, 0.25)).toBe(24);
  });
});