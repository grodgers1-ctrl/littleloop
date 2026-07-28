// Day 6 tests: AdProvider frequency cap + engine.moveSubject (sort).
//
// AdProvider tests use an injected `now()` to avoid time-dependent
// flakes. moveSubject tests use the engine's IDB persistence path so
// the reorder survives an "engine reload" via a fresh instance.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import type {
  AdProvider,
  IapProvider,
  Platform,
} from "../../src/engine/engine";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import {
  __clearAdCapForTesting,
  createPlaceholderAdProvider,
} from "../../src/engine/ads/placeholder";
import {
  createDevIapProvider,
} from "../../src/engine/iap/dev";

function freshDb(): LittleLoopDB {
  return new LittleLoopDB(
    `little-loop-db-test-${Math.random().toString(36).slice(2)}`,
  );
}

function stubPlatform(): Platform {
  return {
    share: () => Promise.resolve({ shared: false, reason: "unavailable" }),
    saveToCameraRoll: () => Promise.resolve(false),
    saveToFiles: () => Promise.resolve(false),
    pickFile: () => Promise.resolve(null),
  };
}

function stubAds(): AdProvider {
  return createPlaceholderAdProvider();
}

function stubIap(): IapProvider {
  return createDevIapProvider({ available: true });
}

function freshEngine(): Engine {
  return new Engine({
    iap: stubIap(),
    platform: stubPlatform(),
    ads: stubAds(),
  });
}

beforeEach(() => {
  __clearAdCapForTesting();
});

afterEach(() => {
  __setEngineForTesting(null);
  resetDbForTesting();
  __clearAdCapForTesting();
});

describe("AdProvider frequency cap", () => {
  it("shouldShow() returns true when no prior impression is logged", () => {
    const now = new Date("2026-07-28T10:00:00Z");
    const ad = createPlaceholderAdProvider({ now: () => now });
    expect(ad.shouldShow()).toBe(true);
  });

  it("shouldShow() returns false within 30 minutes of last impression", () => {
    let now = new Date("2026-07-28T10:00:00Z");
    const ad = createPlaceholderAdProvider({ now: () => now });
    ad.impression();
    // 10 minutes later — cap in effect.
    now = new Date("2026-07-28T10:10:00Z");
    expect(ad.shouldShow()).toBe(false);
    // 29 minutes later — still in effect.
    now = new Date("2026-07-28T10:29:00Z");
    expect(ad.shouldShow()).toBe(false);
  });

  it("shouldShow() returns true once 30 minutes have passed", () => {
    let now = new Date("2026-07-28T10:00:00Z");
    const ad = createPlaceholderAdProvider({ now: () => now });
    ad.impression();
    // At exactly 30 minutes the cap still suppresses the ad.
    now = new Date("2026-07-28T10:30:00Z");
    expect(ad.shouldShow()).toBe(false);
    // Strictly after 30 minutes, the cap has expired.
    now = new Date("2026-07-28T10:30:01Z");
    expect(ad.shouldShow()).toBe(true);
  });

  it("lastImpressionAt() returns the impression time", () => {
    const now = new Date("2026-07-28T10:00:00Z");
    const ad = createPlaceholderAdProvider({ now: () => now });
    expect(ad.lastImpressionAt()).toBeNull();
    ad.impression();
    expect(ad.lastImpressionAt()?.toISOString()).toBe(
      "2026-07-28T10:00:00.000Z",
    );
  });

  it("impression() updates the cap", () => {
    let now = new Date("2026-07-28T10:00:00Z");
    const ad = createPlaceholderAdProvider({ now: () => now });
    ad.impression();
    expect(ad.shouldShow()).toBe(false);
    // Move past 30 minutes.
    now = new Date("2026-07-28T10:31:00Z");
    expect(ad.shouldShow()).toBe(true);
    // New impression resets the cap.
    ad.impression();
    now = new Date("2026-07-28T10:31:30Z");
    expect(ad.shouldShow()).toBe(false);
  });

  it("uses a custom cap when supplied", () => {
    let now = new Date("2026-07-28T10:00:00Z");
    const ad = createPlaceholderAdProvider({
      frequencyCapMs: 1000,
      now: () => now,
    });
    ad.impression();
    now = new Date("2026-07-28T10:00:01Z");
    expect(ad.shouldShow()).toBe(false);
    now = new Date("2026-07-28T10:00:02Z");
    expect(ad.shouldShow()).toBe(true);
  });
});

describe("engine.moveSubject", () => {
  it("reorders subjects and re-numbers sortIndex", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();
    const a = await engine.createSubject({ name: "A", type: "baby", cadence: "daily" });
    const b = await engine.createSubject({ name: "B", type: "plant", cadence: "weekly" });
    const c = await engine.createSubject({ name: "C", type: "fitness", cadence: "daily" });
    expect(engine.listSubjectsSync().map((s) => s.name)).toEqual(["A", "B", "C"]);

    // Move C (index 2) to position 0.
    await engine.moveSubject(c.id, 0);
    expect(engine.listSubjectsSync().map((s) => s.name)).toEqual(["C", "A", "B"]);
    // sortIndex is re-numbered as 0..N-1.
    const sorted = engine.listSubjectsSync();
    expect(sorted.map((s) => s.sortIndex)).toEqual([0, 1, 2]);

    // Sanity: a, b, c still exist with the right names.
    expect(a.name).toBe("A");
    expect(b.name).toBe("B");
    expect(c.name).toBe("C");
  });

  it("no-ops when the target index equals the current index", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();
    const a = await engine.createSubject({ name: "A", type: "baby", cadence: "daily" });
    const b = await engine.createSubject({ name: "B", type: "plant", cadence: "weekly" });
    await engine.moveSubject(a.id, 0);
    expect(engine.listSubjectsSync().map((s) => s.name)).toEqual(["A", "B"]);
    await engine.moveSubject(b.id, 1);
    expect(engine.listSubjectsSync().map((s) => s.name)).toEqual(["A", "B"]);
  });

  it("clamps out-of-range targets to the ends", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();
    const a = await engine.createSubject({ name: "A", type: "baby", cadence: "daily" });
    const b = await engine.createSubject({ name: "B", type: "plant", cadence: "weekly" });
    await engine.moveSubject(a.id, 99);
    expect(engine.listSubjectsSync().map((s) => s.name)).toEqual(["B", "A"]);
    await engine.moveSubject(b.id, -5);
    expect(engine.listSubjectsSync().map((s) => s.name)).toEqual(["B", "A"]);
  });

  it("moveSubject updates the engine subjects cache and emits subjects-changed", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();
    const a = await engine.createSubject({ name: "A", type: "baby", cadence: "daily" });
    await engine.createSubject({ name: "B", type: "plant", cadence: "weekly" });

    let fired = 0;
    engine.on("subjects-changed", () => {
      fired += 1;
    });

    await engine.moveSubject(a.id, 1);
    expect(fired).toBe(1);
    expect(engine.listSubjectsSync().map((s) => s.name)).toEqual(["B", "A"]);
  });
});
