// V2.5 — Notification scheduling (pure functions).
//
// Given a cadence (daily / weekly), the user's last-capture
// timestamp, and a time-of-day, compute the next due timestamp
// and the time-of-day for the firing. These are pure functions
// so they can be tested in isolation against a pinned "now".

import type { NotificationSchedule } from "../state";

/**
 * Compute the next-due ISO timestamp for a notification.
 *
 * Rules:
 *   - cadence === "off" → null (no schedule)
 *   - daily: next occurrence of `hour:minute` strictly after `now`.
 *     If `now` is already past today's `hour:minute`, schedule for
 *     tomorrow.
 *   - weekly: next occurrence of `hour:minute` on the same weekday
 *     as `lastCaptureAt`, strictly after `now`. If `now` is past
 *     this week's slot, schedule for next week's slot.
 *
 * `lastCaptureAt` is informational for weekly cadence (it pins the
 * weekday). For daily cadence it is unused.
 */
export function computeNextDue(opts: {
  now: Date;
  schedule: NotificationSchedule;
  lastCaptureAt: string | null;
}): string | null {
  if (opts.schedule.cadence === "off") return null;
  const { hour, minute } = opts.schedule;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (opts.schedule.cadence === "daily") {
    return nextDailyOccurrence(opts.now, hour, minute).toISOString();
  }
  if (!opts.lastCaptureAt) {
    // Without a prior capture, fall back to tomorrow at the
    // requested time. The user hasn't established a cadence
    // anchor yet, so the engine can only pick a sensible
    // default.
    const tomorrow = new Date(
      Date.UTC(
        opts.now.getUTCFullYear(),
        opts.now.getUTCMonth(),
        opts.now.getUTCDate() + 1,
        hour,
        minute,
        0,
        0,
      ),
    );
    return tomorrow.toISOString();
  }
  const anchor = new Date(opts.lastCaptureAt);
  if (isNaN(anchor.getTime())) return null;
  return nextWeeklyOccurrence(opts.now, anchor, hour, minute).toISOString();
}

function nextDailyOccurrence(now: Date, hour: number, minute: number): Date {
  // Use UTC math so the test environment (any timezone) and
  // production (any timezone) agree. "9:00" is interpreted as
  // UTC 9:00. The engine surface layer can localise when needed;
  // for V2.5 we ship a single fixed-tz interpretation and revisit
  // in V2.6 if feedback shows users want tz-aware behaviour.
  const candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
      0,
    ),
  );
  if (candidate.getTime() > now.getTime()) return candidate;
  // Today's slot has passed — schedule for tomorrow.
  candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

function nextWeeklyOccurrence(
  now: Date,
  anchor: Date,
  hour: number,
  minute: number,
): Date {
  const candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
      0,
    ),
  );
  // Start with this week's slot, on the same weekday as anchor.
  const anchorDow = anchor.getUTCDay();
  const currentDow = candidate.getUTCDay();
  const diff = (anchorDow - currentDow + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + diff);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  return candidate;
}

/**
 * Compute the millisecond delay from `now` to the next due time.
 * Returns 0 if the due time has already passed (the caller should
 * fire immediately and reschedule).
 */
export function delayUntilNextDue(nextDueAt: string | null, now: Date): number {
  if (!nextDueAt) return 0;
  const due = new Date(nextDueAt).getTime();
  if (isNaN(due)) return 0;
  return Math.max(0, due - now.getTime());
}

/**
 * Detect whether the Notification API is available. Centralised
 * so tests can stub it cleanly and so the iOS-Safari fallback
 * can use the same predicate.
 */
export function detectNotificationSupport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  return true;
}

/** Map the browser's permission string to the V2.5 state enum. */
export function mapPermission(p: NotificationPermission): "default" | "granted" | "denied" {
  return p as "default" | "granted" | "denied";
}

/** Default schedule. Off, 9:00 AM. */
export const DEFAULT_NOTIFICATION_SCHEDULE: NotificationSchedule = {
  cadence: "off",
  hour: 9,
  minute: 0,
};
