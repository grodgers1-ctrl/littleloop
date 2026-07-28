// V2.5 — NotificationProvider interface + BrowserLocal implementation.
//
// The provider is the engine-facing surface for local
// notifications. The interface is narrow on purpose so a future
// Capacitor impl (V3) can swap in without changes to the engine.
//
// `BrowserLocal` uses the Notification API + a `setTimeout`
// chain. We avoid `setInterval` to dodge the Node 32-bit
// overflow pitfall documented in the V2.0 sprint: when a daily
// reminder is scheduled, the next tick is at most 24 hours
// away (~86.4M ms), well under 2^31. After firing, we
// recompute the next-due and re-arm — the chain self-extends.
//
// The schedule + next-due timestamp are persisted in IDB so a
// page reload can re-arm without waiting for the user to open
// the app.

import type {
  NotificationPermissionState,
  NotificationSchedule,
  ScheduleOpts,
} from "../state";
import {
  DEFAULT_NOTIFICATION_SCHEDULE,
  computeNextDue,
  delayUntilNextDue,
  detectNotificationSupport,
  mapPermission,
} from "./schedule";

/** Engine-facing surface for local notifications. */
export interface NotificationProvider {
  /** Whether the underlying API is available on this device. */
  isSupported(): boolean;
  /** The current browser-level permission. */
  getPermission(): NotificationPermissionState;
  /**
   * Request permission. Returns the new permission state. The
   * browser collapses overlapping requests; calling this when
   * the permission is already granted or denied is a no-op
   * that returns the current state.
   */
  requestPermission(): Promise<NotificationPermissionState>;
  /**
   * (Re-)arm the schedule. Computes the next-due timestamp and
   * schedules a setTimeout. Persists the schedule + next-due in
   * IDB so a reload can re-arm. Idempotent: calling repeatedly
   * resets the timer.
   */
  schedule(opts: ScheduleOpts): Promise<{ nextDueAt: string | null }>;
  /** Cancel any pending timer and clear the persisted next-due. */
  cancel(): Promise<void>;
  /**
   * Subscribe to in-app ticks. Fires when the timer fires (or
   * immediately if a tick is "due now"). Returns an unsubscribe.
   */
  onTick(cb: () => void): () => void;
  /** Read the current persisted state (schedule + next-due). */
  getState(): Promise<PersistedNotificationState>;
  /** Restore from persisted state on app boot. */
  restore(): Promise<{ nextDueAt: string | null }>;
}

/** What the provider persists in IDB. */
export interface PersistedNotificationState {
  schedule: NotificationSchedule;
  nextDueAt: string | null;
  lastFiredAt: string | null;
  lastCaptureAt: string | null;
}

/** A small persistent store the provider reads + writes. */
export interface NotificationStore {
  load(): Promise<PersistedNotificationState | null>;
  save(state: PersistedNotificationState): Promise<void>;
  clear(): Promise<void>;
}

/** IDB-backed store. Implementation lives in the V2.5 db layer. */
export class IdbNotificationStore implements NotificationStore {
  async load(): Promise<PersistedNotificationState | null> {
    // Imported lazily so the provider module stays engine-bound
    // (no top-level React/IDB). The `getDb` accessor returns
    // the singleton; if the engine isn't booted yet this returns
    // a fresh DB which still has no row.
    const { getDb } = await import("../../db/database");
    const row = await getDb().appSettings.get(NOTIFICATION_ROW_KEY);
    if (!row) return null;
    const value = row.value;
    return value as PersistedNotificationState;
  }
  async save(state: PersistedNotificationState): Promise<void> {
    const { getDb } = await import("../../db/database");
    const now = new Date().toISOString();
    await getDb().appSettings.put({
      key: NOTIFICATION_ROW_KEY,
      value: state,
      updatedAt: now,
    });
  }
  async clear(): Promise<void> {
    const { getDb } = await import("../../db/database");
    await getDb().appSettings.delete(NOTIFICATION_ROW_KEY);
  }
}

/** The single row key in the appSettings table. */
export const NOTIFICATION_ROW_KEY = "v25.notifications.v1";

/** In-memory store for tests. */
export class InMemoryNotificationStore implements NotificationStore {
  private state: PersistedNotificationState | null = null;
  async load() {
    return this.state;
  }
  async save(s: PersistedNotificationState) {
    this.state = s;
  }
  async clear() {
    this.state = null;
  }
}

export interface BrowserLocalOptions {
  store?: NotificationStore;
  /**
   * Override the `setTimeout` implementation. Tests use this to
   * avoid leaking real timers into jsdom.
   */
  setTimeoutFn?: typeof setTimeout;
  /**
   * Override the `clearTimeout` implementation.
   */
  clearTimeoutFn?: typeof clearTimeout;
  /**
   * Override the constructor the provider uses to fire
   * notifications. Tests stub it to capture calls without
   * showing actual notifications.
   */
  notificationCtor?: typeof Notification;
  /**
   * Clock function. Tests override to control "now". Defaults
   * to `Date.now`.
   */
  now?: () => number;
}

export class BrowserLocal implements NotificationProvider {
  private store: NotificationStore;
  private setTimeoutFn: typeof setTimeout;
  private clearTimeoutFn: typeof clearTimeout;
  private notificationCtor: typeof Notification | undefined;
  private now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();
  private cached: PersistedNotificationState;

  constructor(opts: BrowserLocalOptions = {}) {
    this.store = opts.store ?? new InMemoryNotificationStore();
    this.setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
    if (opts.notificationCtor) {
      this.notificationCtor = opts.notificationCtor;
    } else if (typeof Notification !== "undefined") {
      this.notificationCtor = Notification;
    }
    this.now = opts.now ?? Date.now;
    this.cached = {
      schedule: { ...DEFAULT_NOTIFICATION_SCHEDULE },
      nextDueAt: null,
      lastFiredAt: null,
      lastCaptureAt: null,
    };
  }

  isSupported(): boolean {
    return detectNotificationSupport();
  }

  getPermission(): NotificationPermissionState {
    if (!this.isSupported()) return "unsupported";
    if (typeof Notification === "undefined") return "unsupported";
    return mapPermission(Notification.permission);
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.isSupported() || typeof Notification === "undefined") {
      return "unsupported";
    }
    try {
      const result = await Notification.requestPermission();
      return mapPermission(result);
    } catch {
      return "denied";
    }
  }

  async schedule(opts: ScheduleOpts): Promise<{ nextDueAt: string | null }> {
    this.clearTimer();
    const nextDue = computeNextDue({
      now: new Date(this.now()),
      schedule: {
        cadence: opts.cadence,
        hour: opts.hour,
        minute: opts.minute,
      },
      lastCaptureAt: opts.lastCaptureAt,
    });
    this.cached = {
      schedule: { cadence: opts.cadence, hour: opts.hour, minute: opts.minute },
      nextDueAt: nextDue,
      lastFiredAt: this.cached.lastFiredAt,
      lastCaptureAt: opts.lastCaptureAt,
    };
    await this.store.save(this.cached);
    if (nextDue && this.isSupported() && this.getPermission() === "granted") {
      this.armTimer(nextDue);
    }
    return { nextDueAt: nextDue };
  }

  async cancel(): Promise<void> {
    this.clearTimer();
    this.cached = {
      schedule: { ...DEFAULT_NOTIFICATION_SCHEDULE },
      nextDueAt: null,
      lastFiredAt: this.cached.lastFiredAt,
      lastCaptureAt: this.cached.lastCaptureAt,
    };
    await this.store.save(this.cached);
  }

  onTick(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async getState(): Promise<PersistedNotificationState> {
    const loaded = await this.store.load();
    if (loaded) this.cached = loaded;
    return { ...this.cached };
  }

  async restore(): Promise<{ nextDueAt: string | null }> {
    this.clearTimer();
    const loaded = await this.store.load();
    if (loaded) {
      this.cached = loaded;
    }
    if (
      this.cached.nextDueAt &&
      this.isSupported() &&
      this.getPermission() === "granted"
    ) {
      this.armTimer(this.cached.nextDueAt);
    }
    return { nextDueAt: this.cached.nextDueAt };
  }

  private armTimer(nextDueAt: string) {
    const delay = delayUntilNextDue(nextDueAt, new Date(this.now()));
    if (delay === 0) {
      // Fire on the next microtask to avoid recursive
      // setTimeout chains in the same call stack.
      this.setTimeoutFn(() => this.fire(), 0);
      return;
    }
    // Cap delay to ~24.8 days (Node's 32-bit setTimeout limit).
    // For daily / weekly reminders this never bites; the cap
    // exists so a manual back-dated test doesn't crash.
    const safe = Math.min(delay, 2_147_483_000);
    this.timer = this.setTimeoutFn(() => this.fire(), safe);
  }

  private clearTimer() {
    if (this.timer != null) {
      try {
        this.clearTimeoutFn(this.timer);
      } catch {
        /* best-effort */
      }
      this.timer = null;
    }
  }

  private fire() {
    this.timer = null;
    // Update lastFiredAt and notify listeners BEFORE the
    // first await. The async work (store save + re-arm) is
    // queued as a microtask; listeners run on the same tick
    // so tests and in-app banner UIs see the tick immediately.
    const nowIso = new Date(this.now()).toISOString();
    this.cached = {
      ...this.cached,
      lastFiredAt: nowIso,
    };
    // Notify in-app listeners synchronously so callers that
    // don't await `fire()` still see the tick.
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {
        /* listeners must not crash the provider */
      }
    }
    // Show the notification (best-effort; browser may deny).
    if (
      this.isSupported() &&
      this.notificationCtor &&
      this.getPermission() === "granted"
    ) {
      try {
        new this.notificationCtor("Little Loop", {
          body: "Time to capture today's moment.",
          tag: "littleloop-reminder",
        });
      } catch {
        /* best-effort */
      }
    }
    // Persist + re-arm asynchronously.
    void (async () => {
      try {
        await this.store.save(this.cached);
        // Re-arm if the schedule is still active.
        if (this.cached.schedule.cadence !== "off") {
          const next = computeNextDue({
            now: new Date(this.now()),
            schedule: this.cached.schedule,
            lastCaptureAt: this.cached.lastCaptureAt,
          });
          this.cached = { ...this.cached, nextDueAt: next };
          await this.store.save(this.cached);
          if (next) this.armTimer(next);
        }
      } catch {
        /* best-effort persistence */
      }
    })();
  }
}
