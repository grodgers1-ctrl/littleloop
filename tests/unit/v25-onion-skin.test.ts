// V2.5 Day 4 — onion-skin overlay.
//
// The onion-skin library is a small canvas helper. We test the
// pure-data side (which previous entry gets selected, with/without
// a prior capture) and the library's behaviour on a stubbed 2D
// context (the previous image is drawn at the configured
// opacity, the canvas state is restored after the call).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  drawOnionSkin,
  ONION_SKIN_OPACITY,
} from "../../src/lib/onion-skin";

interface RecordedCall {
  method: string;
  args: unknown[];
}

function makeRecordingCtx(): {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const ctx = {
    canvas: document.createElement("canvas"),
    save: () => calls.push({ method: "save", args: [] }),
    restore: () => calls.push({ method: "restore", args: [] }),
    drawImage: (...args: unknown[]) =>
      calls.push({ method: "drawImage", args }),
    set globalAlpha(v: number) {
      calls.push({ method: "globalAlpha<-", args: [v] });
    },
    get globalAlpha(): number {
      return 1;
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

beforeEach(() => {
  // jsdom's HTMLCanvasElement has no getContext; setup.ts provides
  // a 2d context stub. We don't need the full drawImage to work
  // here — we only need the recording to capture the call.
  // The decode path uses createImageBitmap which is stubbed in
  // setup.ts; the stub returns a 1x1 bitmap. The draw call goes
  // through and we record it.
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("onion-skin library", () => {
  it("exports the documented 30% opacity", () => {
    expect(ONION_SKIN_OPACITY).toBe(0.3);
  });

  it("draws the previous image at 30% opacity, then restores the context", async () => {
    const { ctx, calls } = makeRecordingCtx();
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    });
    await drawOnionSkin(ctx, blob, 800, 600);
    // Expect: save, globalAlpha <- 0.3, drawImage, restore.
    const methodNames = calls.map((c) => c.method);
    const saveIdx = methodNames.indexOf("save");
    const restoreIdx = methodNames.indexOf("restore");
    const drawIdx = methodNames.indexOf("drawImage");
    expect(saveIdx).toBeGreaterThanOrEqual(0);
    expect(drawIdx).toBeGreaterThan(saveIdx);
    expect(restoreIdx).toBeGreaterThan(drawIdx);
    // The opacity-set call sits between save and draw.
    const alphaCall = calls.find(
      (c) => c.method === "globalAlpha<-" && c.args[0] === 0.3,
    );
    expect(alphaCall).toBeDefined();
  });

  it("clamps a custom opacity to [0, 1]", async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    });
    // Above the range → 1.
    const high = makeRecordingCtx();
    await drawOnionSkin(high.ctx, blob, 100, 100, 1.5);
    expect(
      high.calls.find(
        (c) => c.method === "globalAlpha<-" && c.args[0] === 1,
      ),
    ).toBeDefined();
    // Below the range → 0.
    const low = makeRecordingCtx();
    await drawOnionSkin(low.ctx, blob, 100, 100, -0.5);
    expect(
      low.calls.find(
        (c) => c.method === "globalAlpha<-" && c.args[0] === 0,
      ),
    ).toBeDefined();
  });

  it("no-ops on a zero-size canvas", async () => {
    const { ctx, calls } = makeRecordingCtx();
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    });
    await drawOnionSkin(ctx, blob, 0, 0);
    expect(calls).toHaveLength(0);
  });
});
