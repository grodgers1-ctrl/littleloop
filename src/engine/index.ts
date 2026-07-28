// Public entry point for the V2.0 + V2.5 engine boundary.
//
// Engine modules (in `src/engine/`) are plain TypeScript — no React, no
// DOM, no platform-specific calls. They can be unit-tested in Node.
//
// React components consume the engine through the hooks in `./hooks`.
// That is the ONLY place React is allowed to touch the engine.
//
// V2.0 (Day 1) wires the skeleton. V2.5 (Day 1+) extends the surface
// with notifications, transitions, filters, themes, EXIF, and the
// per-entry notes API. The provider implementations
// (`iap/dev.ts`, `platform/browser.ts`, `ads/placeholder.ts`) land in
// later days; this file exposes factory helpers so `main.tsx` can
// assemble the engine with concrete deps.

export { Engine, getEngine, setEngine, __setEngineForTesting } from "./engine";
export type { IapProvider, Platform, AdProvider } from "./engine";

export {
  useEngine,
  useEngineOrNull,
  useEngineReady,
  useSubjects,
  useUnlock,
  useExportProgress,
} from "./hooks";

export {
  SUBJECT_TYPES,
  RENDER_SPEED_SECONDS,
} from "./state";
export type {
  // V2.0 surface
  Subject,
  SubjectType,
  CreateSubjectInput,
  Entry,
  UnlockState,
  Receipt,
  StoredUnlock,
  IapProduct,
  PurchaseResult,
  ShareOptions,
  ShareResult,
  AdImpression,
  RenderSpeed,
  DateRange,
  DateRangeKind,
  ExportRequest,
  ExportResult,
  ExportProgress,
  ExportPhase,
  EngineEvent,
  EngineEventName,
  EngineEventHandler,
  EngineFeatureFlags,
  // V2.5 surface
  ExportRequestV2,
  NotificationCadence,
  NotificationSchedule,
  NotificationPermissionState,
  NotificationState,
  ScheduleOpts,
  TransitionId,
  Transition,
  FilterId,
  Filter,
  ThemeId,
  Theme,
} from "./state";
// Router + V2Splash are imported directly from their files to keep
// the engine barrel free of mixed component / non-component exports,
// which trips the react-refresh lint rule.
