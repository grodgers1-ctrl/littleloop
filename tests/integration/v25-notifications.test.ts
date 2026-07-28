// V2.5 Day 6 — local notifications.
//
// We test the pure scheduling functions directly, then drive
// the BrowserLocal provider through an InMemoryNotificationStore
// and a stubbed setTimeout/Notification to verify:
//   - permission state machine
//   - schedule writes the next-due + persists
//   - cancel clears
//   - the in-app tick callback fires
//   - restore re-arms the timer from IDB
//   - the engine surface is wired end-to-end

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeNextDue,
  delayUntilNextDue,
  detectNotificationSupport,
  DEFAULT_NOTIFICATION_SCHEDULE,
  BrowserLocal,
  InMemoryNotificationStore,
  type PersistedNotificationState,
} from "../../src/engine/notifications";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import { getDb } from "../../src/db/database";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import type { AdProvider, Platform } from "../../src/engine/engine";
import { NOTIFICATION_ROW_KEY } from "../../src/engine/notifications/provider";

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

beforeEach(() => {
  setDbForTesting(new LittleLoopDB(`ll-db-test-${Math.random().toString(36).slice(2)}`));
});

afterEach(() => {
  resetDbForTesting();
  __setEngineForTesting(null);
  vi.restoreAllMocks();
});

describe("computeNextDue (pure)", () => {
  it("returns null for cadence 'off'", () => {
    expect(
      computeNextDue({
        now: new Date("2026-06-15T08:00:00Z"),
        schedule: { cadence: "off", hour: 9, minute: 0 },
        lastCaptureAt: "2025-01-01T00:00:00Z",
      }),
    ).toBeNull();
  });

  it("schedules for today when now is before hour:minute", () => {
    // Use Date.UTC to make the assertions timezone-independent.
    // now = 2026-06-15 08:00 UTC; target = 18:30 UTC same day.
    const r = computeNextDue({
      now: new Date(Date.UTC(2026, 5, 15, 8, 0, 0)),
      schedule: { cadence: "daily", hour: 18, minute: 30 },
      lastCaptureAt: null,
    });
    expect(r).toBe("2026-06-15T18:30:00.000Z");
  });

  it("schedules for tomorrow when now is after hour:minute", () => {
    const r = computeNextDue({
      now: new Date(Date.UTC(2026, 5, 15, 20, 0, 0)),
      schedule: { cadence: "daily", hour: 9, minute: 0 },
      lastCaptureAt: null,
    });
    expect(r).toBe("2026-06-16T09:00:00.000Z");
  });

  it("weekly cadence pins to the same weekday as lastCaptureAt", () => {
    // lastCaptureAt is a Sunday. Today is the previous Saturday.
    // The next weekly slot is today at hour:minute (still in the
    // future today), so it should land today, not next Sunday.
    const r = computeNextDue({
      now: new Date(Date.UTC(2026, 5, 13, 8, 0, 0)), // Saturday
      schedule: { cadence: "weekly", hour: 18, minute: 0 },
      lastCaptureAt: "2026-06-14T10:00:00", // Sunday
    });
    expect(r).toBe("2026-06-14T18:00:00.000Z");
  });

  it("weekly cadence jumps to next week when the slot has passed", () => {
    const r = computeNextDue({
      now: new Date(Date.UTC(2026, 5, 15, 20, 0, 0)), // Monday
      schedule: { cadence: "weekly", hour: 9, minute: 0 },
      lastCaptureAt: "2026-06-07T10:00:00", // Sunday (last week)
    });
    // Next Sunday is 2026-06-21.
    expect(r).toBe("2026-06-21T09:00:00.000Z");
  });
});

describe("delayUntilNextDue", () => {
  it("returns 0 when the input is null", () => {
    expect(delayUntilNextDue(null, new Date())).toBe(0);
  });

  it("returns 0 when the due time is in the past", () => {
    expect(
      delayUntilNextDue("2020-01-01T00:00:00Z", new Date("2026-01-01T00:00:00Z")),
    ).toBe(0);
  });

  it("returns the positive delta when the due time is in the future", () => {
    const r = delayUntilNextDue(
      "2026-01-02T00:00:00Z",
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(r).toBe(86_400_000);
  });
});

describe("detectNotificationSupport", () => {
  it("returns false when window is undefined", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      expect(detectNotificationSupport()).toBe(false);
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});

describe("BrowserLocal provider", () => {
  it("writes the next-due timestamp to the persisted store on schedule()", async () => {
    const store = new InMemoryNotificationStore();
    // The provider computes the next due in UTC. We pin the
    // clock to 2026-06-15 08:00 UTC and ask for 18:00 — the
    // next-due should be the same day at 18:00 UTC.
    const nowUtcMs = Date.UTC(2026, 5, 15, 8, 0, 0);
    const provider = new BrowserLocal({
      store,
      now: () => nowUtcMs,
      notificationCtor: undefined,
    });
    const r = await provider.schedule({
      cadence: "daily",
      lastCaptureAt: null,
      hour: 18,
      minute: 0,
    });
    expect(r.nextDueAt).toBe("2026-06-15T18:00:00.000Z");
    const loaded = await store.load();
    expect(loaded?.nextDueAt).toBe("2026-06-15T18:00:00.000Z");
    expect(loaded?.schedule.cadence).toBe("daily");
  });

  it("cancel() clears the persisted next-due", async () => {
    const store = new InMemoryNotificationStore();
    const provider = new BrowserLocal({ store });
    await provider.schedule({
      cadence: "daily",
      lastCaptureAt: null,
      hour: 9,
      minute: 0,
    });
    await provider.cancel();
    const loaded = await store.load();
    expect(loaded?.nextDueAt).toBeNull();
    expect(loaded?.schedule.cadence).toBe("off");
  });

  it("onTick listeners fire when the timer fires", async () => {
    const store = new InMemoryNotificationStore();
    let nowMs = new Date("2026-06-15T17:59:55Z").getTime();
    const fired: number[] = [];
    const pendingTimers: Array<{
      cb: () => void;
      delay: number;
      handle: number;
    }> = [];
    let nextHandle = 1;
    // Stub Notification BEFORE constructing the provider so the
    // armTimer branch is taken at schedule() time.
    Object.defineProperty(globalThis, "Notification", {
      value: { permission: "granted" },
      configurable: true,
    });
    let provider: BrowserLocal;
    try {
      provider = new BrowserLocal({
        store,
        now: () => nowMs,
        setTimeoutFn: ((cb: () => void, delay: number) => {
          const h = nextHandle++;
          pendingTimers.push({ cb, delay, handle: h });
          return h as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout,
        clearTimeoutFn: (() => {}) as typeof clearTimeout,
      });
      const unsubscribe = provider.onTick(() => fired.push(nowMs));
      await provider.schedule({
        cadence: "daily",
        lastCaptureAt: null,
        hour: 18,
        minute: 0,
      });
      // Sanity: a timer was armed.
      expect(pendingTimers.length).toBe(1);
      // Advance time past the due moment.
      nowMs = new Date("2026-06-15T18:00:01Z").getTime();
      // Fire the captured timer.
      for (const t of pendingTimers.splice(0)) t.cb();
      expect(fired.length).toBeGreaterThan(0);
      unsubscribe();
    } finally {
      delete (globalThis as { Notification?: unknown }).Notification;
    }
  });

  it("restore() re-arms the timer from the persisted state", async () => {
    const store = new InMemoryNotificationStore();
    await store.save({
      schedule: { cadence: "daily", hour: 9, minute: 0 },
      nextDueAt: "2030-01-01T09:00:00.000Z",
      lastFiredAt: null,
      lastCaptureAt: null,
    });
    let armed: number | null = null;
    Object.defineProperty(globalThis, "Notification", {
      value: { permission: "granted" },
      configurable: true,
    });
    let provider: BrowserLocal;
    try {
      provider = new BrowserLocal({
        store,
        setTimeoutFn: (((_cb: () => void, delay: number) => {
          armed = delay;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout),
        clearTimeoutFn: (() => {}) as typeof clearTimeout,
      });
      const r = await provider.restore();
      expect(r.nextDueAt).toBe("2030-01-01T09:00:00.000Z");
      // The setTimeout was invoked with a positive delay.
      expect(armed).not.toBeNull();
      expect(armed).toBeGreaterThan(0);
    } finally {
      delete (globalThis as { Notification?: unknown }).Notification;
    }
  });

  it("default schedule is off at 9:00", () => {
    expect(DEFAULT_NOTIFICATION_SCHEDULE.cadence).toBe("off");
    expect(DEFAULT_NOTIFICATION_SCHEDULE.hour).toBe(9);
    expect(DEFAULT_NOTIFICATION_SCHEDULE.minute).toBe(0);
  });
});

describe("engine notification surface", () => {
  it("the engine wires the notification methods end-to-end", async () => {
    const store = new InMemoryNotificationStore();
    const provider = new BrowserLocal({ store });
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
      notifications: provider,
    });
    __setEngineForTesting(engine);
    // The engine returns a boolean for the permission request.
    Object.defineProperty(globalThis, "Notification", {
      value: {
        permission: "granted",
        requestPermission: () => Promise.resolve("granted"),
      },
      configurable: true,
    });
    try {
      const granted = await engine.requestNotificationPermission();
      expect(granted).toBe(true);
      await engine.scheduleNotifications({
        cadence: "daily",
        lastCaptureAt: null,
        hour: 9,
        minute: 0,
      });
      const s = await engine.getNotificationState();
      expect(s.schedule.cadence).toBe("daily");
      // The tick listener returns an unsubscribe.
      const off = engine.onNotificationTick(() => {});
      expect(typeof off).toBe("function");
      off();
      await engine.cancelNotifications();
      const s2 = await engine.getNotificationState();
      expect(s2.schedule.cadence).toBe("off");
    } finally {
      delete (globalThis as { Notification?: unknown }).Notification;
    }
  });

  it("IdbNotificationStore round-trips through Dexie", async () => {
    const { IdbNotificationStore } = await import(
      "../../src/engine/notifications/provider"
    );
    const store = new IdbNotificationStore();
    const next: PersistedNotificationState = {
      schedule: { cadence: "weekly", hour: 8, minute: 30 },
      nextDueAt: "2030-12-25T08:30:00.000Z",
      lastFiredAt: null,
      lastCaptureAt: "2030-12-18T08:30:00.000Z",
    };
    await store.save(next);
    const loaded = await store.load();
    expect(loaded).toEqual(next);
    // The row is keyed by NOTIFICATION_ROW_KEY in appSettings.
    const row = await getDb().appSettings.get(NOTIFICATION_ROW_KEY);
    expect(row).toBeDefined();
    // Clear wipes the row.
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
