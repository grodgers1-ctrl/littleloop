// The V2.0 Engine. Plain TypeScript, no React, no DOM, no platform-specific
// calls. The engine owns:
//   - the subject list (with V1 → V2 migration on init)
//   - the export pipeline (wraps the V1 worker protocol)
//   - the IAP provider (dev in V2.0; apple/google/stripe wired in V2.5)
//   - the platform adapter (browser share / camera-roll / file-system)
//   - the ad provider (placeholder banner)
//
// On Day 1 the methods throw "not implemented" so the wiring can be
// verified end to end. Each subsequent day fills in the relevant
// subset — Day 2 does the migration, Day 3 the subject list, Day 4
// the IAP module, Day 8 the export engine, Day 10–11 platform, Day 6
// ads.
//
// The engine is a singleton within the app session. Use `getEngine()`
// to obtain the instance. The React layer consumes the engine through
// `useEngine` / `useSubjects` / `useUnlock` / `useExportProgress`
// from `hooks.ts` — those hooks subscribe to engine events to drive
// React renders.

import type {
  CreateSubjectInput,
  EngineEvent,
  EngineEventHandler,
  EngineEventName,
  ExportProgress,
  ExportRequest,
  ExportResult,
  IapProduct,
  PurchaseResult,
  ShareOptions,
  ShareResult,
  Subject,
  SubjectType,
  UnlockState,
} from "./state";
import type { Cadence } from "../db/schema";
import {
  createSubject as repoCreateSubject,
  deleteSubject as repoDeleteSubject,
  listSubjects as repoListSubjects,
  newProjectId as repoNewProjectId,
  updateProject as repoUpdateProject,
  updateSubject as repoUpdateSubject,
} from "../db/repositories";
import { getDb } from "../db/database";
import {
  runSandboxV1ToV2Migration,
  runV1ToV2Migration,
} from "../db/migrations/v1-to-v2";

// ---------------------------------------------------------------------------
// Provider interfaces (declared here for type-completeness on Day 1;
// concrete implementations land in subsequent days).
// ---------------------------------------------------------------------------

/** IAP provider. The dev implementation is selected in development;
 *  apple/google/stripe are stubbed on V2.0 and real in V2.5+. */
export interface IapProvider {
  isAvailable(): boolean;
  buy(product: IapProduct): Promise<PurchaseResult>;
  restore(): Promise<UnlockState>;
  getUnlock(): Promise<UnlockState>;
}

/** Platform adapter. Browser implementation lands on Day 10–11. */
export interface Platform {
  share(blob: Blob, filename: string, options: ShareOptions): Promise<ShareResult>;
  saveToCameraRoll(blob: Blob, filename: string): Promise<boolean>;
  saveToFiles(blob: Blob, filename: string, mimeType: string): Promise<boolean>;
  pickFile(accept: string): Promise<File | null>;
}

/** Ad provider. Stub banner lands on Day 6. */
export interface AdProvider {
  shouldShow(): boolean;
  /** The banner is rendered by the UI layer using this signal; the
   *  provider exposes state, not DOM. */
  impression(): void;
  lastImpressionAt(): Date | null;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class Engine {
  private subjects: Subject[] = [];
  private unlock: UnlockState = "free";
  private exportProgress: ExportProgress | null = null;
  private ready = false;

  /** Set on `init()` to expose the active IAP provider to the React layer. */
  readonly iap: IapProvider;
  readonly platform: Platform;
  readonly ads: AdProvider;

  /** Simple listener registry keyed by event name. */
  private listeners: Map<EngineEventName, Set<EngineEventHandler<EngineEventName>>> = new Map();

  constructor(deps: {
    iap: IapProvider;
    platform: Platform;
    ads: AdProvider;
  }) {
    this.iap = deps.iap;
    this.platform = deps.platform;
    this.ads = deps.ads;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Run V1 → V2 migration (idempotent), load unlock state, initialise
   *  providers. Safe to call more than once — subsequent calls are no-ops. */
  async init(): Promise<void> {
    if (this.ready) return;
    // Day 2: run the V1 → V2 subject migration. The migration is
    // idempotent and self-guards via localStorage, so calling init()
    // repeatedly is safe.
    const [realResult, sandboxResult] = await Promise.all([
      runV1ToV2Migration(),
      runSandboxV1ToV2Migration(),
    ]);
    if (!realResult.ok) {
      console.error("[engine] V1 → V2 migration failed:", realResult.error);
    }
    if (!sandboxResult.ok) {
      console.error(
        "[engine] sandbox V1 → V2 migration failed:",
        sandboxResult.error,
      );
    }
    // After migration, seed the in-memory subject cache.
    const subjects = await repoListSubjects();
    this.setSubjects(subjects);
    // Day 4 loads the unlock state from IndexedDB and starts the
    //   30-day revalidation timer.
    // Day 6 initialises the ad provider.
    this.ready = true;
    this.emit({ type: "ready" });
  }

  isReady(): boolean {
    return this.ready;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  on<E extends EngineEventName>(
    event: E,
    handler: EngineEventHandler<E>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    // The listener registry is keyed by event name and stores handlers
    // that have been narrowed to that event's payload type. The cast
    // through `unknown` lets the union-shaped storage accept any of
    // them without TypeScript losing the narrowing at the call site.
    set.add(handler as unknown as EngineEventHandler<EngineEventName>);
    return () => {
      set?.delete(handler as unknown as EngineEventHandler<EngineEventName>);
    };
  }

  private emit(event: EngineEvent): void {
    const set = this.listeners.get(event.type);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as unknown as (payload: EngineEvent) => void)(event);
      } catch (err) {
        // Listeners must not crash the engine. Log and continue.
        console.error("[engine] event handler threw:", err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Subjects (filled in on Days 2 and 3)
  // -------------------------------------------------------------------------

  async listSubjects(): Promise<Subject[]> {
    const subjects = await repoListSubjects();
    this.setSubjects(subjects);
    return subjects;
  }

  /** Synchronous snapshot for `useSyncExternalStore`. Mirrors the
   *  current in-memory subject list. The cache is kept in sync via
   *  `setSubjects()` (called by `init()` and by every mutating
   *  subject method). */
  listSubjectsSync(): Subject[] {
    return [...this.subjects];
  }

  async createSubject(input: CreateSubjectInput): Promise<Subject> {
    // The V1 engine path's home screen reads from the `projects`
    // table. To keep V1 callers coherent when a V2 subject is added,
    // we also write a parallel Project row. Both rows share the
    // same id so existing entry queries (which key on projectId ==
    // subject id) resolve correctly. The V1 Project gets the legacy
    // shape: `childName` mirrors the V2 `name`, `dateOfBirth` is
    // empty string (V1 needs a DOB; we don't have one for non-baby
    // subjects), `cadence` mirrors V2.
    const subject = await repoCreateSubject({
      ...input,
      name: input.name.trim(),
    });
    // Best-effort mirror into the V1 Project table. If it fails
    // (quota, etc.) the V2 Subject still exists; V1 callers will
    // not see the subject, but Day 7 will replace the V1 home with
    // the V2 home, so this is bounded risk.
    try {
      await getDb().projects.add({
        id: subject.id,
        childName: subject.name,
        dateOfBirth: "",
        cadence: subject.cadence,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
      });
    } catch (err) {
      console.warn(
        "[engine] could not mirror new subject into V1 Project table:",
        err,
      );
    }
    // Refresh the in-memory cache and notify.
    const all = await repoListSubjects();
    this.setSubjects(all);
    // repoNewProjectId is unused on the V2 path; the import keeps
    // the tree-shaker honest about which V1 helpers remain live.
    void repoNewProjectId;
    return subject;
  }

  async deleteSubject(id: string): Promise<void> {
    await repoDeleteSubject(id);
    const all = await repoListSubjects();
    this.setSubjects(all);
  }

  async renameSubject(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Subject name cannot be empty");
    if (trimmed.length > 60) {
      throw new Error("Subject name must be 60 characters or fewer");
    }
    await repoUpdateSubject(id, { name: trimmed });
    // Mirror to V1 so V1 callers reading `Project.childName` see the
    // new name. Failure is logged, not thrown — V2 is the source of
    // truth from Day 7 onward.
    try {
      await repoUpdateProject(id, { childName: trimmed });
    } catch (err) {
      console.warn(
        "[engine] could not mirror subject rename into V1 Project table:",
        err,
      );
    }
    const all = await repoListSubjects();
    this.setSubjects(all);
  }

  async reclassifySubject(id: string, type: SubjectType): Promise<void> {
    await repoUpdateSubject(id, { type });
    const all = await repoListSubjects();
    this.setSubjects(all);
  }

  async setSubjectCadence(id: string, cadence: Cadence): Promise<void> {
    await repoUpdateSubject(id, { cadence });
    try {
      await repoUpdateProject(id, { cadence });
    } catch (err) {
      console.warn(
        "[engine] could not mirror subject cadence into V1 Project table:",
        err,
      );
    }
    const all = await repoListSubjects();
    this.setSubjects(all);
  }

  // -------------------------------------------------------------------------
  // Export (filled in on Day 8)
  // -------------------------------------------------------------------------

  async export(
    _request: ExportRequest,
    onProgress: (p: ExportProgress) => void,
  ): Promise<ExportResult> {
    // The orchestrator wires `onProgress` into the export-progress event
    // for the UI layer. On Day 1 we forward synthetic progress so callers
    // can be wired up before Day 8 lands.
    onProgress({ phase: "error", ratio: 0, message: "not implemented (Day 8)" });
    throw new Error("Engine.export not implemented (Day 8)");
  }

  async saveToCameraRoll(_blob: Blob, _filename: string): Promise<boolean> {
    throw new Error("Engine.saveToCameraRoll not implemented (Day 10)");
  }

  async share(
    _blob: Blob,
    _filename: string,
    _options: ShareOptions,
  ): Promise<ShareResult> {
    throw new Error("Engine.share not implemented (Day 11)");
  }

  async backupToFile(): Promise<File> {
    throw new Error("Engine.backupToFile not implemented (Day 12)");
  }

  async restoreFromFile(_file: File): Promise<void> {
    throw new Error("Engine.restoreFromFile not implemented (Day 12)");
  }

  // -------------------------------------------------------------------------
  // IAP (filled in on Days 4 and 5)
  // -------------------------------------------------------------------------

  async iapBuy(_product: IapProduct): Promise<UnlockState> {
    throw new Error("Engine.iapBuy not implemented (Day 4)");
  }

  async iapRestore(): Promise<UnlockState> {
    throw new Error("Engine.iapRestore not implemented (Day 4)");
  }

  // -------------------------------------------------------------------------
  // Reactive getters — these are set by the methods above and read by
  // the React hooks. They are intentionally synchronous reads; the
  // engine emits events when they change so the UI layer can re-render.
  // -------------------------------------------------------------------------

  getUnlockState(): UnlockState {
    return this.unlock;
  }

  getExportProgress(): ExportProgress | null {
    return this.exportProgress;
  }

  /** Internal: called by IAP code on Day 4 to update the cached unlock
   *  state and notify subscribers. */
  protected setUnlockState(next: UnlockState): void {
    if (next === this.unlock) return;
    this.unlock = next;
    this.emit({ type: "unlock-changed", unlock: next });
  }

  /** Internal: called by export code on Day 8 to publish progress. */
  protected setExportProgress(progress: ExportProgress): void {
    this.exportProgress = progress;
    this.emit({ type: "export-progress", progress });
  }

  /** Internal: called by subject code on Days 2 and 3. */
  protected setSubjects(next: Subject[]): void {
    this.subjects = next;
    this.emit({ type: "subjects-changed" });
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor. The first call constructs the engine; subsequent
// calls return the same instance. Tests can call `__setEngineForTesting`
// to swap it.
// ---------------------------------------------------------------------------

let _engine: Engine | null = null;

export function getEngine(): Engine {
  if (!_engine) {
    throw new Error(
      "Engine not initialised. Call setEngine() with provider deps in main.tsx before getEngine().",
    );
  }
  return _engine;
}

export function setEngine(engine: Engine): void {
  _engine = engine;
}

export function __setEngineForTesting(engine: Engine | null): void {
  _engine = engine;
}
