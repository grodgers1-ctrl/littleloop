# Little Loop V2.0: Day-by-Day Development Sprint

> This sprint covers V2.0 only — the smallest shippable V2. V2.5 (engagement + creative) and V2.6 (V3 prep) get their own sprint docs.
>
> The implementation source of truth is `V2_DEV_SPEC.md`. This sprint is the execution order. If a sprint item conflicts with the spec, follow the spec.
>
> **Sprint scope**: 4 weeks (20 working days). Targets: pricing model live, share path live, IAP receipts validating, V1 regression-tested, ship to 100% of PWA users on deploy.
>
> **Out of scope for this sprint** (V2.5 / V2.6): daily reminders, auto-crop face, burst capture, onion-skin overlay, transitions/filters/themes creative content, EXIF date detection, memory lane, per-entry notes, multi-subject timeline UI polish, Capacitor shell, store submission.

## Sprint objective

By the end of the sprint, a user on `https://babyflipbook.dev` must be able to:

1. Open the app and see the home screen with their existing subject (migrated from V1's "Project" data).
2. Add additional subjects — unlimited, no account, no cloud.
3. Re-classify an existing subject's type (e.g. from "baby" to "plant") in Settings.
4. Export the timeline of any subject to an MP4 (existing V1 export path, plus the camera-roll save button).
5. Save the exported MP4 to the device's camera roll / Photos.
6. Share the exported MP4 via the platform share sheet (Instagram, WhatsApp, iMessage, Mail).
7. See a subtle watermark on free exports.
8. See a small banner ad on the home screen.
9. Buy the £1.99 "Clean exports" unlock and see the watermark and ad disappear.
10. Buy the £4.99 "Studio" unlock and gain access to the Style section in the export sheet (even if the section is empty for V2.0).
11. Restore purchases on a new device via "Restore purchases" in Settings.
12. Use the app on a fresh device, with full data restored from a `.babyloop` file.

The product remains a local-first PWA. The V2.0 release is a web build, not a native app — V3 ships the native shell.

## Operating rules for the coding session

- Work directly in the current Little Loop project directory.
- Read `V2_DEV_SPEC.md` completely before changing code. The spec's open questions in section 22 should be resolved before this sprint starts; if any are still open, treat the spec as authoritative and the open question as deferred.
- Inspect the repository before choosing whether to scaffold or continue an existing app.
- New code must pass the existing `eslint`, `tsc`, and `vitest` gates before commit. The V2.0 architecture is the largest single change in this sprint — it touches the engine boundary, the IAP module, and the export sheet.
- Use feature flags for IAP. IAP must be disabled in dev (so engineers don't accidentally trigger real Apple/Google charges) and behind a build-time flag in production until receipts have been validated end-to-end.
- The V1 export path (Worker protocol, FFmpeg invocation) is preserved unchanged. V2.0 wraps it with the new engine boundary; the V1 paths inside the worker do not change.
- The watermark is added in the **main thread's draw path**, not the worker. The worker is purely FFmpeg encoding. This preserves the v11 image2-demuxer fix.

---

## Part 1: V2.0 Architecture

The architecture work is the foundation of the sprint. It must land in the first three days; everything else builds on it.

### 1.1 The engine boundary

V2 introduces a real engine boundary. Today, the export flow is woven through `ExportScreen.tsx` and `export-worker.ts` — the screen knows the FFmpeg protocol, the IAP state, and the watermark format. V2.0 splits this into four concerns that talk through a narrow interface:

```
┌─────────────────────────────────────────────────────────────────┐
│  UI layer  (React components, screens, sheets)                   │
│  - Renders state from engine                                     │
│  - Sends user actions to engine (capture, export, share, IAP)    │
│  - Renders native error/empty/loading states                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ engine.export(), engine.saveToCameraRoll(),
                               │ engine.iap.buy('clean'), engine.watermark.canRemove()
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Engine layer  (src/engine/)                                    │
│  - Owns the subject list, the export pipeline, the IAP state     │
│  - Coordinates the worker, the IAP provider, the share intent    │
│  - Pure: no React, no DOM, no platform-specific calls            │
└──────┬────────────────┬────────────────────┬───────────────────┘
       │                │                    │
       ▼                ▼                    ▼
┌──────────────┐ ┌──────────────┐ ┌────────────────────┐
│  Renderer    │ │  IAP         │ │  Platform           │
│  - canvas,   │ │  - Apple/   │ │  - Share Sheet      │
│  - FFmpeg    │ │    Google,  │ │  - Camera Roll      │
│  - worker    │ │    Stripe   │ │  - File System      │
└──────────────┘ └──────────────┘ └────────────────────┘
```

The engine is a set of plain TypeScript modules. No React. No DOM. No platform-specific calls. It can be unit-tested in Node.

The renderer is the worker's existing protocol. The IAP module is a single interface with three implementations (Apple, Google, Stripe). The platform module is a single interface with one implementation today (browser) and a second (Capacitor) in V3.

### 1.2 Engine module structure

```
src/engine/
├── index.ts                  // public engine entry point
├── engine.ts                 // the Engine class, owns state
├── state.ts                  // Subject / Entry / Asset types (re-export from db/)
├── subjects/
│   ├── list.ts               // list, create, delete, rename, reclassify
│   └── migrate-v1.ts         // one-time V1 Project -> V2 Subject migration
├── export/
│   ├── engine.ts             // runExport: takes RenderRequest, returns Blob + filename
│   ├── request.ts            // RenderRequest, RenderEntry, RenderSpeed, types
│   ├── watermark.ts          // applyWatermark(ctx, position): draws to canvas
│   └── progress.ts           // ExportProgress event types
├── iap/
│   ├── provider.ts           // IapProvider interface
│   ├── apple.ts              // Apple App Store non-consumable
│   ├── google.ts             // Google Play non-consumable
│   ├── stripe.ts             // Web Stripe Checkout
│   ├── dev.ts                // dev/QA: always grants unlock, no charge
│   └── state.ts              // unlock state, restore, validate
├── platform/
│   ├── share.ts              // PlatformShare interface, browser impl
│   ├── camera-roll.ts        // save MP4 to device Photos library
│   ├── file-system.ts        // .babyloop backup, .babyloop restore
│   └── index.ts              // Platform facade
└── ads/
    ├── banner.ts             // small banner ad renderer
    └── index.ts
```

The engine exposes one class:

```ts
class Engine {
  subjects: Subject[];                          // reactive getter
  unlock: UnlockState;                          // 'free' | 'clean' | 'studio'
  iap: IapProvider;
  platform: Platform;
  ads: AdProvider;

  async init(): Promise<void>;
  async listSubjects(): Promise<Subject[]>;
  async createSubject(input: CreateSubjectInput): Promise<Subject>;
  async deleteSubject(id: string): Promise<void>;
  async renameSubject(id: string, name: string): Promise<void>;
  async reclassifySubject(id: string, type: SubjectType): Promise<void>;
  async setSubjectCadence(id: string, cadence: Cadence): Promise<void>;

  async export(request: ExportRequest, onProgress: (p: ExportProgress) => void): Promise<ExportResult>;
  async saveToCameraRoll(blob: Blob, filename: string): Promise<boolean>;
  async share(blob: Blob, filename: string, options: ShareOptions): Promise<ShareResult>;
  async backupToFile(): Promise<File>;
  async restoreFromFile(file: File): Promise<void>;

  async iapBuy(product: 'clean' | 'studio'): Promise<UnlockState>;
  async iapRestore(): Promise<UnlockState>;
}
```

React components consume the engine through a thin hook layer:

```ts
function useEngine(): Engine;
function useSubjects(): Subject[];                    // reactive
function useUnlock(): UnlockState;                    // reactive
function useExportProgress(): ExportProgress | null;   // during export
```

The `Engine` class is a singleton within the app session. The hook layer subscribes to engine events to drive React renders.

### 1.3 IAP module

The IAP module's signature:

```ts
interface IapProvider {
  /** Returns whether the current platform supports this provider. */
  isAvailable(): boolean;

  /** Begin purchase. Resolves when the user completes or cancels. */
  buy(product: 'clean' | 'studio'): Promise<PurchaseResult>;

  /** Restore purchases from the store. Returns the highest unlock found. */
  restore(): Promise<UnlockState>;

  /** Get current unlock state. Cached locally. */
  getUnlock(): Promise<UnlockState>;
}

type PurchaseResult =
  | { ok: true; unlock: UnlockState; receipt: Receipt }
  | { ok: false; reason: 'cancelled' | 'failed' | 'unavailable' };

type UnlockState = 'free' | 'clean' | 'studio';
type Receipt = { platform: 'apple' | 'google' | 'stripe'; token: string; product: 'clean' | 'studio' };
```

The Apple implementation uses `StoreKit` via the browser's `IAP` API where exposed, falling back to Stripe on web. The Google implementation uses the Play Billing client. Both are wrapped to look identical.

The dev provider (`iap/dev.ts`) is selected when `import.meta.env.DEV` is true. It always returns `'studio'` and skips the actual purchase. The build pipeline never ships this provider to production — the production bundle uses Apple or Google based on the deployment target.

Receipt validation:
- Apple: validate JWS locally using the App Store receipt; cache the unlock state in IndexedDB keyed by `(subject, receipt-token)`.
- Google: validate via Play Developer API on-device; same cache shape.
- Stripe: rely on the Stripe Customer Portal for refund management; cache a signed unlock token in IndexedDB.

The unlock is re-validated every 30 days when the user is online. If the receipt no longer validates (refund, chargeback), the unlock reverts to `free`. The user is warned 7 days before the reversion via a one-time banner on the home screen.

### 1.4 Platform module

The platform module's signature:

```ts
interface Platform {
  share(blob: Blob, filename: string, options: ShareOptions): Promise<ShareResult>;
  saveToCameraRoll(blob: Blob, filename: string): Promise<boolean>;
  saveToFiles(blob: Blob, filename: string, mimeType: string): Promise<boolean>;
  pickFile(accept: string): Promise<File | null>;
}

type ShareOptions = {
  title?: string;
  text?: string;
};
type ShareResult = { shared: boolean; reason?: 'cancelled' | 'unavailable' };
```

The browser implementation:
- `share`: Web Share API with file support (`navigator.share({ files: [file] })`). If Web Share is unavailable, fall back to direct buttons: "Open in WhatsApp" (wa.me link with media), "Open in Instagram" (no public deep link; show instructions), "Email to self" (mailto with attachment), "Save to Files" (File System Access API).
- `saveToCameraRoll`: on iOS Safari PWA, this is `<a download>` to a `.mp4` file. The user picks "Save to Files" then drags to Photos. This is a known limitation of the PWA target — the V3 Capacitor build uses the Camera Roll plugin. Document this in the export sheet ("Tap share then 'Save Image' to put it in your Photos").
- `saveToFiles`: same as above but with the suggested file name pre-filled.
- `pickFile`: `<input type="file">` for restore.

The Capacitor implementation (V2.6 prep, not in V2.0) uses the native plugins.

### 1.5 Ads module

The ads module's signature:

```ts
interface AdProvider {
  /** Returns whether an ad should be shown right now (frequency cap). */
  shouldShow(): boolean;
  /** Render the ad into the given DOM element. */
  render(target: HTMLElement): void;
  /** Track an impression. */
  impression(): void;
}
```

V2.0 ships with a stub `AdProvider` that renders a small banner placeholder with the text "Sponsored" and a "Learn more" link. The actual ad network integration (AdMob, Carbon, or a custom in-house system) is deferred to V2.5. The placeholder respects the frequency cap (one impression per 30 minutes per user) so the eventual integration can drop in without code changes elsewhere.

The ad is shown:
- On the home screen, below the subject tiles.
- When `unlock === 'free'`.
- When `shouldShow()` returns true.

The ad is NOT shown:
- During export.
- During capture.
- During onboarding.
- When `unlock === 'clean'` or `unlock === 'studio'`.
- For 30 minutes after the last impression.

### 1.6 Watermark module

The watermark is drawn on the main thread onto the same canvas that draws the photo. The worker never sees it.

```ts
function applyWatermark(ctx: CanvasRenderingContext2D, position: WatermarkPosition): void;

type WatermarkPosition = 'bottom-right';
```

The watermark is:
- 12pt text, white with 1px black shadow, 30% opacity.
- Reads "made with little-loop" with a tiny ⌐ icon, OR just the ⌐ icon if the icon is available.
- Anchored to the bottom-right with 24px margin.

The watermark is always drawn by the main thread in `drawFrame()` before `canvasToPng()`. The orchestrator gates the call:

```ts
if (unlock === 'free') {
  applyWatermark(ctx, 'bottom-right');
}
```

This is the only place watermark is rendered. The worker just receives the PNG bytes.

### 1.7 Engine initialization

The engine boots on app load. It:

1. Runs the V1 → V2 migration if needed (one-time, idempotent).
2. Loads the unlock state from IndexedDB and starts a 30-day revalidation timer.
3. Initializes the platform adapter (browser or, in V2.6+, Capacitor).
4. Initializes the IAP provider (Apple / Google / Stripe / dev).
5. Initializes the ad provider.

The engine exposes a `ready` event. The app renders a splash until the engine is ready, then renders the home screen.

### 1.8 Migration from V1

V1 stored one `Project` per device. V2 stores zero or more `Subject`s. On first V2 launch:

1. Check IndexedDB for the V1 `projects` table.
2. If present, read the single project.
3. Create a `Subject` with `name = project.childName`, `type = 'baby'`, `cadence = project.cadence`.
4. Re-link the existing `entries` to point at the new subject.
5. Drop the V1 `projects` table (or mark it migrated).
6. Mark migration complete in localStorage so it never runs again.

The user sees a single "Mia" subject on the home screen, with all their existing entries. The internal rename (`Project` → `Subject`) is invisible.

### 1.9 File layout

After V2.0:

```
src/
├── engine/                    # NEW
│   ├── index.ts
│   ├── engine.ts
│   ├── subjects/
│   ├── export/
│   ├── iap/
│   ├── platform/
│   └── ads/
├── features/
│   ├── capture/              # unchanged
│   ├── timeline/             # unchanged
│   ├── export/               # REWRITTEN to use engine
│   │   ├── ExportScreen.tsx  # uses useEngine, useExportProgress
│   │   └── export-sheet/     # NEW: bottom-sheet UI for export options
│   ├── home/                 # NEW: home screen with subject tiles
│   │   └── HomeScreen.tsx
│   ├── subject/              # NEW: subject detail / settings
│   │   ├── SubjectScreen.tsx
│   │   └── SubjectSettingsScreen.tsx
│   ├── iap/                  # NEW: paywall, restore
│   │   ├── PaywallScreen.tsx
│   │   └── RestorePurchasesButton.tsx
│   └── ...
├── workers/
│   └── video-render.worker.ts  # UNCHANGED (V1 protocol)
├── db/
│   ├── database.ts
│   ├── schema.ts             # EXTENDED: Subject (replaces Project)
│   ├── repositories.ts       # EXTENDED: listSubjects, etc.
│   └── migrations/
│       └── v1-to-v2.ts       # NEW
└── App.tsx                   # REWIRED: routes through engine
```

V1's `Project` type stays in `db/schema.ts` but is marked `@deprecated`. New code uses `Subject`. The `Project` type is removed in V2.5.

### 1.10 Data model

`Subject`:
- `id` (UUID, generated on creation)
- `name` (1-60 chars, free text)
- `type` (enum: 'baby' | 'plant' | 'fitness' | 'recovery' | 'home' | 'creative' | 'pet' | 'other')
- `cadence` ('daily' | 'weekly')
- `referenceImageBlobId` (optional, used for first-photo onion-skin later)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)
- `sortIndex` (integer, user-controlled)

`Entry` (V1 schema unchanged, but `projectId` field is renamed to `subjectId`):
- `id`
- `subjectId` (was `projectId`)
- `periodKey`
- `capturedDate`
- `imageBlobId`
- `thumbnailBlobId`
- `note` (NEW in V2.0 — optional free text, 280 chars max; default empty)
- `createdAt`
- `updatedAt`

`Asset` (V1 schema unchanged).

`UnlockState` (new IndexedDB store):
- `platform` ('apple' | 'google' | 'stripe')
- `product` ('clean' | 'studio')
- `token` (receipt token)
- `purchasedAt` (timestamp)
- `lastValidatedAt` (timestamp)

The V2.0 schema migration adds the `subjects` and `unlocks` stores, renames `projectId` → `subjectId` in entries, and copies the V1 project row into a new subject. Backwards-compatible reads in the migration script handle partial state.

---

## Part 2: Day-by-day plan

The plan is 20 working days. The first 3 days are architecture. The next 7 are migration + subject model + IAP. The final 10 are export, share, watermark, ads, and polish.

### Week 1: Architecture, migration, subject model

#### Day 1 — Engine skeleton ✅ done 2026-07-28

**Morning**
- Create `src/engine/` directory.
- Define all the type interfaces in `src/engine/state.ts` (Subject, SubjectType, Cadence, UnlockState, etc.).
- Define the `Engine` class skeleton in `src/engine/engine.ts` with empty method bodies that throw "not implemented."

**Afternoon**
- Create the `useEngine`, `useSubjects`, `useUnlock`, `useExportProgress` hooks in `src/engine/hooks.ts`.
- Wire `App.tsx` to instantiate the engine and provide it via a React context.
- Update `tsconfig` if needed to support the new directory.

**End-of-day check**: `npx tsc --noEmit` passes. `npm run build` succeeds. The app boots, shows a blank screen because nothing renders yet. The engine is wired but inert.

**Day 1 shipped**:
- `src/engine/state.ts` — all V2.0 type interfaces (Subject, Entry, UnlockState, Receipt, StoredUnlock, IAP types, Platform types, Export types, EngineEvent union, EngineFeatureFlags).
- `src/engine/engine.ts` — `Engine` class with the full public surface from spec §1.2. Methods throw "not implemented (Day N)" so the skeleton is type-safe. Listener registry keyed by event name; `on()` returns an unsubscribe; `setUnlockState` / `setExportProgress` / `setSubjects` are protected emitters used by later-day code.
- `src/engine/hooks.ts` — `useEngine`, `useEngineOrNull`, `useEngineReady`, `useSubjects` (uses `useSyncExternalStore`), `useUnlock`, `useExportProgress`. Hooks subscribe to engine events and re-render on change.
- `src/engine/providers.ts` — stub factories for the dev IAP provider, the browser platform, and the placeholder ad provider. All return "unavailable" on Day 1; concrete behaviour lands on Days 4, 6, 10–11.
- `src/engine/index.ts` — public barrel re-export.
- `src/main.tsx` — instantiates `Engine` with stub providers, registers it via `setEngine`, calls `engine.init()` fire-and-forget. V1 routes in `App.tsx` are untouched, so V1 keeps working.

**Deviations from plan**:
- App.tsx was NOT modified. The kickoff calls for wiring the engine via React context; on Day 1 the V1 routes do not touch the engine, so the singleton (`setEngine` / `getEngine`) is sufficient. Context-based wiring lands when Day 3 starts consuming `useSubjects` in the home screen. This keeps the V1 surface 100% unchanged through Day 7.
- Added a `listSubjectsSync()` method on Engine for `useSyncExternalStore`. The plan called for `listSubjects()` (async); the synchronous snapshot mirror is required by the React 18 store contract. The async list method stays.

**Verification**: `npx tsc --noEmit` clean. `npx eslint .` clean. `npx vitest run` — 94/94 V1 tests pass (no regressions). `npm run build` — 204.15 KB main bundle (62.75 KB gzipped, under the 250 KB budget).

#### Day 2 — V1 → V2 migration

**Morning**
- Add the `subjects` and `unlocks` stores to `db/schema.ts`.
- Write the migration script in `db/migrations/v1-to-v2.ts` that runs once on engine init.
- Update `repositories.ts`: rename `listProjects` → `listSubjects`, `createProject` → `createSubject`. Keep the V1 names as deprecated wrappers that call the new functions, so V1 callers don't break in the same commit.

**Afternoon**
- Run the migration against a fresh IndexedDB. Verify the V1 single-project case becomes one Subject.
- Run the migration against an empty IndexedDB. Verify it no-ops.
- Run the migration twice. Verify it's idempotent.
- Write a unit test for the migration in `tests/unit/migration.test.ts` that uses fake-indexeddb.

**End-of-day check**: All existing V1 tests still pass. New migration tests pass. The dev console shows the engine runs migration on init without errors.

#### Day 3 — Subject list + create

**Morning**
- Build the home screen (`features/home/HomeScreen.tsx`). For V2.0, the home screen is a single vertical scroll of subject tiles. Each tile shows the most-recent entry's image as a small thumbnail, the subject name, the cadence, and the entry count. The "+ Add subject" button is at the top.
- Build the subject creation sheet (`features/home/AddSubjectSheet.tsx`). The sheet asks for name (1-60 chars), type (8-tile grid), and cadence (two buttons). On submit, calls `engine.createSubject()`.
- Wire the engine to reactively update the `useSubjects` hook.

**Afternoon**
- Build the subject detail screen (`features/subject/SubjectScreen.tsx`). For V2.0, the subject screen is the V1 timeline view with the subject name in the header. Reuse V1's `TimelineScreen.tsx` with a thin wrapper.
- Build the subject settings screen (`features/subject/SubjectSettingsScreen.tsx`). For V2.0, the settings screen allows rename, reclassify (change type), change cadence, and delete. Delete is permanent with a "this is permanent" confirmation.
- Add a "this is permanent" confirmation modal for delete. The user must type the subject's name to confirm.

**End-of-day check**: The home screen renders with the migrated V1 subject. The user can add a new subject. The user can delete a subject. The user can rename and reclassify. All of these update the home screen reactively.

#### Day 4 — IAP module + dev provider

**Morning**
- Implement `IapProvider` interface and the `iap/dev.ts` provider (always returns 'studio').
- Implement `iap/state.ts`: the unlock state read/write, the 30-day revalidation timer.
- Add the unlock state to the engine.

**Afternoon**
- Build the paywall screen (`features/iap/PaywallScreen.tsx`). For V2.0, the paywall is a single screen with two purchase options (Clean, Studio) and a "Restore purchases" link at the bottom. The paywall is reached from the export sheet and from a banner on the home screen.
- Add the "Restore purchases" button to the home screen and the export sheet.
- Wire the engine's `iapBuy` method. In dev mode, it returns 'studio' immediately. In production, the build pipeline swaps in the Apple/Google/Stripe provider.

**End-of-day check**: In dev mode, the user can "buy" Clean and Studio, the unlock state updates, and the home screen re-renders without the ad. The Restore purchases button restores the dev unlock.

#### Day 5 — Apple and Google IAP providers (web stubs)

**Morning**
- Implement `iap/apple.ts` as a web stub. The stub detects iOS Safari and would call the App Store IAP API, but the actual purchase is deferred to a follow-up. The stub returns 'unavailable' on web.
- Implement `iap/google.ts` as a web stub. Same pattern: detects Chrome on Android, deferred.
- Implement `iap/stripe.ts` for web. Uses Stripe Checkout. Defer the actual Stripe wiring — for V2.0, the Stripe provider is a placeholder that returns 'unavailable' and the user is told "Stripe checkout coming soon."

**Afternoon**
- Wire the provider selection in the engine init: prefer Apple on iOS, Google on Android, Stripe on desktop, dev in development.
- Add feature flags to the build:
  - `VITE_IAP_STRIPE_ENABLED` (default false in V2.0)
  - `VITE_IAP_APPLE_ENABLED` (default false in V2.0)
  - `VITE_IAP_GOOGLE_ENABLED` (default false in V2.0)
- Without these flags, only the dev provider is active and the paywall says "coming soon."

**End-of-day check**: On a desktop browser, the paywall shows "coming soon" for all products. The dev provider still works (build with `VITE_IAP_*` unset defaults to dev). The architecture supports real IAP providers; the wiring happens in V2.5 once the V2.0 product is validated.

#### Day 6 — Home screen polish

**Morning**
- Add the banner ad to the home screen. The ad is a small (320×50 or similar) horizontal banner below the subject tiles. On a free user, it's visible. On a paid user, it's hidden.
- Implement the ad frequency cap (one impression per 30 minutes per user).
- Style the home screen for the new layout.

**Afternoon**
- Add subject sort: the user can drag to reorder. The sortIndex updates on drop.
- Add subject rename inline: tap the name to edit.
- Add subject reclassify inline: tap the type icon to change.

**End-of-day check**: The home screen has a polished, native-feeling look. Subjects can be reordered. The ad is visible on free users. The home screen renders correctly on a 360px-wide screen (smallest supported).

#### Day 7 — Week 1 wrap

**Morning**
- Run the full V1 regression suite. Every V1 capability must work unchanged: capture, library import, timeline, MP4 export, `.babyflip` backup, restore.
- Run the V1 e2e test (`tests/e2e/preview.spec.mjs`) end to end.

**Afternoon**
- Fix any V1 regressions. The migration rename of `projectId` → `subjectId` in entries is the most likely source of regressions.
- Update the V1 backup file extension to `.babyloop` (V2 reads both, V2 writes `.babyloop`). The V1 `.babyflip` extension is still readable for backwards compatibility.
- Write a unit test for `.babyflip` (V1) → `.babyloop` (V2) restore compatibility.

**End-of-day check**: All V1 capabilities work. The V1 e2e test passes. A V1 user upgrading to V2 sees their data preserved and can use the app unchanged.

### Week 2: Export, share, watermark

#### Day 8 — Export engine

**Morning**
- Implement `engine/export/engine.ts` — the `runExport` function. For V2.0, this is the V1 export path wrapped with the new engine API. The signature is:
  ```ts
  runExport(request: ExportRequest, onProgress: (p: ExportProgress) => void): Promise<ExportResult>
  ```
- Move the V1 export logic from `features/export/export-worker.ts` into `engine/export/engine.ts`. Keep the V1 file as a thin re-export for backwards compatibility.
- The engine export takes an optional `watermark: boolean` parameter. When true, the main thread draws the watermark on each frame before PNG encoding.

**Afternoon**
- Implement `engine/export/watermark.ts` — the `applyWatermark` function. The watermark is drawn on the main thread.
- Wire the watermark to be applied when `unlock === 'free'`.
- Add unit tests for the watermark function: it should draw a small mark in the bottom-right, at 30% opacity, on a test canvas.

**End-of-day check**: The engine's `runExport` produces a watermarked MP4 for free users and a clean MP4 for paid users. The unit test verifies the watermark is present and positioned correctly.

#### Day 9 — Export sheet UI

**Morning**
- Build the export sheet (`features/export/export-sheet/ExportSheet.tsx`). The sheet slides up from the bottom and has:
  - Date range selector (radio: all, this month, custom)
  - Speed selector (radio: fast, standard, slow)
  - Style section (locked-with-upgrade-prompt for non-Studio users)
  - Show date on each frame toggle
  - "Export" button
- The sheet replaces the V1 export screen's config UI. The V1 screen is still a route (`/export`) that opens the sheet.

**Afternoon**
- Wire the sheet to the engine. Tapping "Export" calls `engine.export()`, listens to `useExportProgress`, and shows the V1 progress UI.
- After the export completes, show the result with: inline video player, "Save to Photos" button, "Share" button, "Save backup" button.
- The "Style" section is locked for non-Studio users with a "Get Studio for transitions" prompt. The prompt is a one-time per-session message.

**End-of-day check**: The export sheet works end to end. The user can configure export options, see progress, and reach the result. The watermark is visible on free exports.

#### Day 10 — Camera roll save

**Morning**
- Implement `engine/platform/camera-roll.ts` for the browser. The browser implementation:
  - For iOS Safari: a button that opens the share sheet with the MP4 file. The user picks "Save Image" (or equivalent) to put it in Photos.
  - For other browsers: a download button (`<a download>`).
- Add the camera-roll save button to the export result screen.

**Afternoon**
- Add a help text under the button: "On iPhone, tap the share button and pick 'Save to Photos'."
- Test on iOS Safari 17+ via Playwright (the iPhone device emulation).
- Test on desktop Chrome to verify the download fallback.

**End-of-day check**: Tapping "Save to Photos" on iOS opens the share sheet. The user can save to Photos. On desktop, the file downloads with the correct filename.

#### Day 11 — Share intents

**Morning**
- Implement `engine/platform/share.ts`. Uses Web Share API where available:
  ```ts
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
  } else {
    // Fallback UI: direct buttons for WhatsApp, Instagram, Email, Files
  }
  ```
- Build the share fallback sheet for browsers that don't support Web Share API with files. The sheet shows four buttons: WhatsApp, Instagram, Email, Save to Files.
- WhatsApp deep link: `https://wa.me/?text=<message>` (cannot pre-attach media on web).
- Instagram: no public deep link for media. Show instructions.
- Email: `mailto:?subject=...&body=...`. Cannot attach on web without a backend.

**Afternoon**
- Wire the share button on the export result screen.
- Add a "Copy link" button for advanced sharing (placeholder; the link feature is V2.5).
- Test on iOS Safari, desktop Chrome, and Android Chrome via Playwright.

**End-of-day check**: The share button opens the platform share sheet on iOS, Android. On desktop, the fallback sheet shows. WhatsApp opens the wa.me link with the message text. Email opens the mail client.

#### Day 12 — Backup / restore

**Morning**
- Update the V1 `.babyflip` backup to `.babyloop` for V2 writes. Keep V1 read compatibility.
- Update the backup to include ALL subjects, not just one (V1 was per-project).
- Implement the restore flow: pick a `.babyloop` file, validate the contents, show a preview of the subjects and entry counts, confirm restore, then merge into the local store.

**Afternoon**
- Add a "Backup" button on the home screen and a "Restore" button in Settings.
- The restore flow has a "merge vs replace" choice:
  - **Merge**: keep existing subjects, add subjects from the backup that don't exist locally (matched by name).
  - **Replace**: delete all local subjects and entries, restore from the backup.
- Default to merge. Replace requires explicit confirmation.

**End-of-day check**: The user can back up all subjects to a `.babyloop` file. The user can restore from a V1 `.babyflip` or V2 `.babyloop` file. The merge option preserves existing data.

#### Day 13 — Watermark polish

**Morning**
- Add the asset for the ⌐ icon (12pt monogram). Use a single SVG path inline.
- Update the watermark to render: ⌐ icon + "little-loop" text, or just the ⌐ icon if the text overflows.
- Test the watermark on dark, light, and patterned photos. The watermark must be legible on all three.

**Afternoon**
- Add a setting in Subject Settings to disable the watermark for the next export only (one-off bypass). The setting resets after the export.
- This is a UX improvement that lets the user preview a clean export without paying. The setting is per-export, not persisted.

**End-of-day check**: The watermark is legible on all backgrounds. The one-off bypass works. The free tier always applies the watermark unless the user explicitly bypasses (or pays).

#### Day 14 — Week 2 wrap

**Morning**
- Run the full V1 e2e test.
- Run the V2.0 e2e test (a new test that exercises: create subject, capture, export, save to camera roll, share, backup, restore).
- Fix any regressions.

**Afternoon**
- Code review: walk through every changed file with a focus on the engine boundary. Ensure no React component imports from `engine/`, only from `engine/hooks.ts`.
- Update the V1 backup to read both `.babyflip` and `.babyloop` formats.
- Commit a clean checkpoint.

**End-of-day check**: V1 regression suite passes. V2.0 e2e test passes (or is at 90% — final 10% may be platform-specific). The engine boundary is clean. No React code reaches into engine internals.

### Week 3: Polish, accessibility, ship

#### Day 15 — Paywall polish

**Morning**
- Build the post-purchase "Welcome to Studio" toast (or "Welcome to Clean exports" for £1.99). The toast appears once per purchase, dismissable, never shown again.
- Build the "Restore purchases" success / failure states. Success: "Welcome back." Failure: "We couldn't find any purchases on this device."
- Add the "Restore purchases" button to the home screen and to Settings.

**Afternoon**
- Add the per-device fingerprint for unlock storage. The fingerprint is a SHA-256 of `(navigator.userAgent + screen dimensions + timezone)`. This is used to detect when the user re-installs on a different device.
- When the fingerprint changes (new device), the unlock state is invalidated. The user must restore purchases.
- This prevents the simplest "refund abuse" vector: re-install after a refund.

**End-of-day check**: The post-purchase flow is smooth. Restore purchases works on the same device and is required on a new device.

#### Day 16 — Settings screen

**Morning**
- Build the V2 Settings screen (`features/subject/SettingsScreen.tsx` for app-wide settings, separate from per-subject settings).
- Settings items:
  - Default cadence for new subjects (daily / weekly)
  - Subject type default
  - Watermark preview (live preview of the watermark on a sample image)
  - Restore purchases
  - About / version
  - Privacy policy link (placeholder, real link in V2.5)
  - Terms of service link (placeholder)

**Afternoon**
- Add a "Send feedback" button that opens a mailto link.
- Add a "Rate Little Loop" button that opens the App Store / Play Store listing (placeholder URLs in V2.0, real in V3).

**End-of-day check**: The Settings screen is comprehensive. All links and placeholders are wired.

#### Day 17 — Performance + bundle size

**Morning**
- Profile the export pipeline end to end with a 30-photo subject. Measure: time to first frame, total export time, peak memory.
- Identify any optimisation opportunities. The FFmpeg.wasm core (32MB) is the biggest cost. Document that for the V3 Capacitor build, the core will be downloaded once and cached.

**Afternoon**
- Lazy-load the engine modules. The `iap/apple.ts`, `iap/google.ts`, `iap/stripe.ts` providers should only be loaded if the user reaches the paywall.
- Code-split the home screen, export sheet, and settings screen. Each should be a separate chunk.
- Verify the main bundle is under 250KB gzipped (current: 200KB). The budget gives us headroom for the engine refactor.

**End-of-day check**: The main bundle is under budget. The engine is split correctly. The export pipeline is profiled and documented.

#### Day 18 — Accessibility + ad frequency tuning

**Morning**
- Audit the home screen, export sheet, capture flow, and settings screen for accessibility:
  - All interactive elements have minimum 44×44 pt touch targets.
  - All controls are reachable by VoiceOver / TalkBack with descriptive labels.
  - The export flow works with the screen reader active.
  - The ad placement does not overlap any interactive element.
  - Colour contrast on all text is WCAG AA or better.
  - The watermark doesn't interfere with the photo's focal point.

**Afternoon**
- Tune the ad frequency cap. The placeholder `AdProvider` is the active implementation in V2.0; the cap (one impression per 30 minutes) is enforced but not yet tuned. Run a session with the team: how often does the ad feel too frequent? Adjust the constant.
- Audit the ad placement for visual quality. The placeholder text "Sponsored" should not look broken or unfinished.
- Add a small `prefers-reduced-motion` check for users with motion sensitivity (used by future V2.5 transitions; for V2.0 it just affects the export sheet's slide-in animation).

**End-of-day check**: Accessibility checklist is complete. The ad frequency is tuned. The app respects `prefers-reduced-motion`.

#### Day 19 — V1 regression sweep

**Morning**
- Run the V1 e2e test. The test is the canonical V1 acceptance suite.
- Run the new V2.0 e2e test (subject create, export, save, share, backup, restore).
- Run all unit tests.

**Afternoon**
- Fix any remaining issues. The most likely sources of regressions:
  - The `Project` → `Subject` rename in entries.
  - The new IAP module's `dev` provider interfering with V1 (it shouldn't, but check).
  - The home screen breaking on small screens.
  - The watermark accidentally showing on paid exports (regression).
- Run the existing Playwright iOS probe to ensure the export still works on iPhone.

**End-of-day check**: All V1 tests pass. All V2.0 tests pass. The app is in a deployable state.

#### Day 20 — Week 3 + sprint wrap

**Morning**
- Write the V2.0 changelog. Mirror the v1 changelog style. List every user-facing change and every internal change.
- Update the V1 dev sprint doc to mention V2.0 ships.

**Afternoon**
- Final code review. The engine boundary must be clean. The IAP module must be correct. The migration must be idempotent.
- Tag the commit: `v2.0.0`.
- Deploy to production via the existing Vercel pipeline.
- Notify the team: V2.0 is live on `https://babyflipbook.dev`.

**End-of-day check**: V2.0 is deployed to 100% of PWA users. The team knows the sprint is done.

---

## Part 3: What ships in V2.0 vs. what's deferred

| Feature | V2.0 | V2.5 | V2.6 / V3 |
|---|---|---|---|
| Unlimited subjects | ✅ | | |
| Subject settings (rename, reclassify, delete) | ✅ | | |
| V1 → V2 migration | ✅ | | |
| £1.99 / £4.99 lifetime unlocks (IAP wired, dev provider in V2.0) | ✅ | | |
| Apple / Google / Stripe IAP providers (real receipts) | stubs | ✅ | ✅ |
| Watermark (subtle, bottom-right) | ✅ | | |
| Banner ad (placeholder) | ✅ | | |
| Save MP4 to camera roll | ✅ | | |
| Share intent (Web Share API + fallback) | ✅ | | |
| Backup / restore (`.babyloop` file) | ✅ | | |
| Per-entry notes | | ✅ | |
| Daily/weekly local notifications | | ✅ | |
| Onion-skin overlay | | ✅ | |
| Auto-crop face | | ✅ | |
| Burst capture | | ✅ | |
| EXIF date detection | | ✅ | |
| Memory lane ("on this day") | | ✅ | |
| Transitions / filters / themes (Studio content) | | ✅ | |
| Capacitor shell (iOS + Android) | | | ✅ |
| App Store / Play Store submission | | | ✅ |
| Privacy policy / ToS | | | ✅ |

---

## Part 4: Test plan

V2.0 has these automated tests:

**Unit tests** (Vitest)
- `tests/unit/migration.test.ts` — V1 → V2 migration, idempotency, edge cases.
- `tests/unit/watermark.test.ts` — watermark rendering on a test canvas.
- `tests/unit/engine.test.ts` — Engine class methods, state transitions.
- `tests/unit/iap-state.test.ts` — unlock state read/write, fingerprinting, revalidation.

**Integration tests** (Vitest + fake-indexeddb)
- `tests/integration/subject-flow.test.ts` — create subject, add entries, export, verify blob.
- `tests/integration/backup-restore.test.ts` — backup to .babyloop, restore from .babyloop, V1 .babyflip compatibility.
- `tests/integration/iap-flow.test.ts` — dev provider grants unlock, unlock persists across reload, unlock removed on fingerprint change.

**E2E tests** (Playwright)
- `tests/e2e/v2-preview.spec.mjs` — the V2 user flow: home, add subject, capture, export, save, share, backup. Mirrors the V1 e2e test.
- `tests/e2e/ios-fix.spec.mjs` — already exists, re-verify it still passes with V2.
- `tests/e2e/full-export-probe.spec.mjs` — already exists, re-verify it still passes with V2.

**Manual QA checklist** (run on real iPhone + real Android)
- Home screen renders correctly on a 360×640 viewport (smallest supported).
- Subject creation sheet fits on a 320×568 viewport (iPhone SE 1st gen).
- The "Save to Photos" button works on iOS 17+ and Android 13+.
- The share sheet works with the platform share sheet (iOS) and the Android share intent.
- The `.babyloop` backup is recognized by AirDrop and Files on iOS.
- The watermark is legible on light photos, dark photos, and patterned photos.
- The banner ad does not overlap any interactive element.
- All IAP buttons in the dev environment do not trigger real charges (verified by attempting to buy in a real iOS device with a sandbox Apple ID).

---

## Part 5: Risk register for the sprint

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| V1 → V2 migration breaks existing user data. | Low | Critical | Migration is idempotent and tested against fake-indexeddb with realistic V1 data. V2.0 is shipped to 100% on deploy, so the impact of a bad migration is bounded by the V1 user base (small at the time of V2.0 launch). |
| The `Project` → `Subject` rename breaks V1 callers. | High | Medium | Keep V1 names as deprecated wrappers in the same commit. The rename is internal; the V1 export path still works. |
| IAP receipts fail to validate on real Apple / Google devices. | Medium | High | IAP is behind a feature flag in V2.0. The dev provider is the only active provider until V2.5. |
| The new home screen's subject tiles are slow with 50+ subjects. | Low | Medium | Virtualize the list. For V2.0, 50+ subjects is uncommon; the limit is 1000 in IndexedDB. |
| The watermark overlaps important photo content. | Low | Low | The watermark is in the bottom-right with 24px margin. The date banner is also in the bottom. They stack. If the user has important content there, they can pay to remove the watermark. |
| The share intent fails on iOS Safari. | Medium | Medium | Tested with Playwright iOS device emulation. Fallback to direct buttons. Document the limitation. |
| The export sheet's "Style" section is empty for paid users. | High | Low | This is correct — V2.0 ships the unlock, not the creative content. The paywall is honest about this. |
| The V2.0 IAP architecture doesn't survive to V3. | Low | High | The `IapProvider` interface is identical for Apple, Google, and Stripe. V3 just swaps implementations. The dev provider proves the architecture. |

---

## Part 6: Definition of done

V2.0 ships when:

1. All 20 working days are complete.
2. All unit, integration, and e2e tests pass.
3. The V1 e2e test passes (no regression).
4. The V2.0 e2e test passes.
5. The IAP architecture is verified end to end with the dev provider.
6. The watermark is verified on light, dark, and patterned photos.
7. The home screen renders correctly on a 360×640 viewport.
8. The ad frequency cap is tuned and accessible.
9. The team has done a final code review.
10. The V2.0 changelog is written.
11. The tag `v2.0.0` is committed and pushed.
12. The deploy is verified on `https://babyflipbook.dev`.

After V2.0 ships, V2.5 starts.

---

*End of V2.0 sprint.*
