import { describe, expect, it } from "vitest";
import { computeFit, MAX_LONG_EDGE, MAX_THUMB_LONG_EDGE } from "../../src/lib/image-processing";

describe("computeFit", () => {
  it("returns input size when already within bounds", () => {
    const fit = computeFit(800, 600, MAX_LONG_EDGE);
    expect(fit).toEqual({ w: 800, h: 600 });
  });
  it("scales down preserving aspect ratio (landscape)", () => {
    const fit = computeFit(3200, 2400, MAX_LONG_EDGE);
    expect(fit.w).toBe(1600);
    expect(fit.h).toBe(1200);
  });
  it("scales down preserving aspect ratio (portrait)", () => {
    const fit = computeFit(1200, 3200, MAX_LONG_EDGE);
    expect(fit.w).toBe(600);
    expect(fit.h).toBe(1600);
  });
  it("scales to thumbnail size", () => {
    const fit = computeFit(3200, 2400, MAX_THUMB_LONG_EDGE);
    expect(fit.w).toBe(480);
    expect(fit.h).toBe(360);
  });
  it("rounds without dropping to zero for tiny long edges", () => {
    const fit = computeFit(100, 100, 480);
    expect(fit).toEqual({ w: 100, h: 100 });
  });
});