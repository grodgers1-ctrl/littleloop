// V2.5 notifications engine module — public barrel.

export {
  computeNextDue,
  delayUntilNextDue,
  detectNotificationSupport,
  DEFAULT_NOTIFICATION_SCHEDULE,
  mapPermission,
} from "./schedule";
export {
  BrowserLocal,
  IdbNotificationStore,
  InMemoryNotificationStore,
  NOTIFICATION_ROW_KEY,
} from "./provider";
export type {
  NotificationProvider,
  NotificationStore,
  PersistedNotificationState,
  BrowserLocalOptions,
} from "./provider";
