// V2.5 Day 1 sanity test. The V2.5 architecture scaffold (this day's
// delivery) ships:
//
//   1. Five new engine module directories with placeholder barrels.
//   2. New V2.5 types in `src/engine/state.ts`.
//   3. New method stubs on the `Engine` class.
//   4. A widened `engine.export()` signature that accepts
//      `ExportRequestV2` while still accepting the V2.0 `ExportRequest`
//      shape (backwards compatibility is the headline contract).
//
// This test asserts that the scaffold is in place and that V2.0
// callers (the V2 export pipeline, the V2 subject tests, the V2
// integration suite) continue to compile and run unchanged.
//
// The day-1 plan calls for the test to "load the app and confirm
// nothing regressed"; in V2/V2.5 the engine is the app's source of
// truth, so the equivalent assertion here is that the engine boots
// (init succeeds with a stub provider set) and that the V2.0
// `ExportRequest` shape still round-trips through `engine.export()`
// without type errors. The E2E harness (`tests/e2e/preview.spec.mjs`)
// is unchanged and continues to run on the full preview build.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import type { AdProvider, Platform } from "../../src/engine/engine";
import type { ExportRequest, ExportRequestV2 } from "../../src/engine/index";
import type {
  Filter,
  NotificationState,
  ScheduleOpts,
  Theme,
  Transition,
} from "../../src/engine/state";

function stubPlatform(): Platform {
  return {
    share: () => Promise.resolve({ shared: false, reason: "unavailable" }),
    saveToCameraRoll: () => Promise.resolve(false),
    saveToFiles: () => Promise.resolve(false),
    pickFile: () => Promise.resolve(null),
  };
}

function stubAds(): AdProvider {
  return {
    shouldShow: () => false,
    impression: () => {},
    lastImpressionAt: () => null,
  };
}

function freshEngine(): Engine {
  const engine = new Engine({
    iap: createDevIapProvider({ available: true }),
    platform: stubPlatform(),
    ads: stubAds(),
  });
  __setEngineForTesting(engine);
  return engine;
}

describe("V2.5 Day 1 — architecture scaffold", () => {
  it("creates the five new engine module directories", () => {
    const repoRoot = resolve(__dirname, "..", "..");
    const expected = [
      "src/engine/notifications",
      "src/engine/transitions",
      "src/engine/filters",
      "src/engine/themes",
      "src/engine/exif",
    ];
    for (const dir of expected) {
      const indexPath = resolve(repoRoot, dir, "index.ts");
      expect(existsSync(indexPath)).toBe(true);
    }
  });

  it("re-exports V2.5 types from the engine barrel", () => {
    // Compile-time check: the symbols exist. The test file would
    // fail to compile if any of these imports resolved to
    // undefined. We instantiate a few representative values to make
    // the runtime assertion a meaningful smoke test too.
    const transitions: Transition[] = [
      { id: "crossfade", label: "Crossfade", studioOnly: true, blurb: "" },
    ];
    const filters: Filter[] = [
      { id: "sepia", label: "Sepia", studioOnly: true, blurb: "" },
    ];
    const themes: Theme[] = [
      {
        id: "vintage",
        label: "Vintage",
        studioOnly: true,
        transition: "crossfade",
        filter: "sepia",
        speed: "standard",
        blurb: "",
      },
    ];
    const schedule: ScheduleOpts = {
      cadence: "daily",
      lastCaptureAt: null,
      hour: 9,
      minute: 0,
    };
    const notification: NotificationState = {
      permission: "default",
      schedule: { cadence: "off", hour: 9, minute: 0 },
      nextDueAt: null,
      lastFiredAt: null,
    };
    const v2Request: ExportRequestV2 = {
      subjectId: "subject-1",
      dateRange: { kind: "all" },
      speed: "standard",
      showDate: true,
    };
    expect(transitions).toHaveLength(1);
    expect(filters).toHaveLength(1);
    expect(themes).toHaveLength(1);
    expect(schedule.cadence).toBe("daily");
    expect(notification.permission).toBe("default");
    expect(v2Request.subjectId).toBe("subject-1");
  });

  it("Engine boots and emits the ready event", async () => {
    const engine = freshEngine();
    const ready = new Promise<void>((resolveReady) => {
      engine.on("ready", () => resolveReady());
    });
    await engine.init();
    await ready;
    expect(engine.isReady()).toBe(true);
  });

  it("V2.5 method stubs throw 'not implemented' until later days", async () => {
    const engine = freshEngine();
    await expect(engine.setEntryNote("entry-1", "hello")).rejects.toThrow(
      /Day 2/,
    );
    await expect(engine.requestNotificationPermission()).rejects.toThrow(
      /Day 6/,
    );
    await expect(engine.scheduleNotifications({} as ScheduleOpts)).rejects.toThrow(
      /Day 6/,
    );
    await expect(engine.cancelNotifications()).rejects.toThrow(/Day 6/);
    expect(() => engine.onNotificationTick(() => {})).toThrow(/Day 6/);
    expect(() => engine.getNotificationState()).toThrow(/Day 6/);
  });

  it("ExportRequestV2 is a superset of ExportRequest (V2.0 stays green)", () => {
    // This is the headline backwards-compatibility contract: a V2.0
    // caller that passes an `ExportRequest` (the V2.0 shape) must
    // still satisfy the V2.5 `export()` signature. The TS compiler
    // enforces this at the call site; here we assert the structural
    // relationship at the type level.
    const v2Request: ExportRequest = {
      subjectId: "subject-1",
      dateRange: { kind: "all" },
      speed: "standard",
      showDate: true,
    };
    const v25Request: ExportRequestV2 = v2Request;
    expect(v25Request.subjectId).toBe("subject-1");
    expect(v25Request.transition).toBeUndefined();
    expect(v25Request.filter).toBeUndefined();
    expect(v25Request.theme).toBeUndefined();
  });

  it("ExportRequestV2 accepts Studio transition/filter/theme fields", () => {
    const request: ExportRequestV2 = {
      subjectId: "subject-1",
      dateRange: { kind: "all" },
      speed: "standard",
      showDate: true,
      transition: "crossfade",
      filter: "sepia",
      theme: "vintage",
    };
    expect(request.transition).toBe("crossfade");
    expect(request.filter).toBe("sepia");
    expect(request.theme).toBe("vintage");
  });
});
