// V2.5 notifications engine module.
//
// Day 1 ships the directory + barrel. The concrete `NotificationProvider`
// interfaces and the `BrowserLocal` implementation land on Day 6. The
// engine's `requestNotificationPermission`, `scheduleNotifications`,
// `cancelNotifications`, and `onNotificationTick` methods in
// `engine.ts` consume this module via the barrel.
//
// Architecture target (for context; details on Day 6):
//   - `provider.ts` — `NotificationProvider` interface with
//     `requestPermission`, `schedule`, `cancel`. The `BrowserLocal`
//     implementation uses the `Notification` API + a `setTimeout`
//     chain (not `setInterval`, to avoid the Node 32-bit overflow
//     pitfall documented in V2.0 lessons).
//   - `schedule.ts` — pure functions that compute the next-due
//     timestamps given a cadence, last-capture time, and time-of-day.
//     Tested in isolation.

export {};
