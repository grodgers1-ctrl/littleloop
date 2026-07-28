# Little Loop Changelog

## v2.5.0 — 2026-07-28

Engagement + creative content. Universal friction-killers first, then Studio-only features. The V2.0 foundation stays untouched.

### 🏗 Architecture

- **5 new engine modules**: `notifications/`, `transitions/`, `filters/`, `themes/`, `exif/` — pure TS, no React, no DOM, tree-shakeable.
- **V2.5 type surface** (`engine/state.ts`): `NotificationCadence`, `NotificationSchedule`, `NotificationPermissionState`, `NotificationState`, `TransitionId`, `Transition`, `FilterId`, `Filter`, `ThemeId`, `Theme`, `ExportRequestV2`, `ScheduleOpts`.
- **`ExportRequestV2 extends ExportRequest`**: V2.0 callers pass unchanged. V2.5 adds optional `transition`/`filter`/`theme` fields gated by the Studio unlock.
- **DB v3 schema** adds `appSettings` key/value store for app-level preferences (notification persistence).
- **`Engine` widened**: `export()` accepts `ExportRequestV2`; 5 new methods (`setEntryNote`, `requestNotificationPermission`, `scheduleNotifications`, `cancelNotifications`, `onNotificationTick`, `getNotificationState`).

### 📝 Per-entry notes

- **`engine.setEntryNote(entryId, note)`**: 280-char cap, transactional IDB write with V1→V2 Entry mapping at the surface boundary.
- **`NoteEditor` component**: debounced (600ms), controlled textarea with character counter. Empty notes render as "+ Add a note" affordance.
- **Capture preview**: note editor before saving. The note is attached to the new entry on creation.
- **Timeline**: per-row note editor with instant local state update after commit.

### 📸 EXIF date detection

- **`readExifDate(blob)`**: pure, no-deps JPEG EXIF parser. Extracts `DateTimeOriginal` (preferred) or `DateTime` (fallback), normalises to `YYYY-MM-DD`. Handles both little-endian (II) and big-endian (MM) TIFF byte orders.
- **Import date screen**: auto-fills the date picker when EXIF is found, with a "Photo taken YYYY-MM-DD" hint. User can always override.
- **Privacy**: bytes never leave the device; the parse is entirely client-side.

### 🎨 Onion-skin overlay

- **`drawOnionSkin(ctx, blob, w, h)`**: draws the previous entry's image at 30% opacity, letterbox-fitted. Defaults to the immediate prior entry in the timeline.
- **Capture preview**: overlay canvas on top of the live image, with a "Show previous as guide" toggle. Empty state shows "No previous photo yet."

### 📅 "On this day" memory lane

- **`findOnThisDayEntries`**: pure selector — matches entries from past years with today's day-month, sorted by recency, capped at 3.
- **`MemoryLane` component**: card on the home screen with per-row thumbnail + "X years ago" caption + subject name. Renders nothing when no matches exist. Tap opens the entry in the timeline view.

### 🔔 Local notifications

- **`NotificationProvider` interface**: `requestPermission`, `schedule`, `cancel`, `onTick`, `getState`, `restore`. Pluggable store (IDB-backed / in-memory for tests).
- **`BrowserLocal` implementation**: `Notification` API + `setTimeout` chain (avoids Node 32-bit overflow). ISO-dates computed in UTC for cross-TZ stability. Persists schedule + next-due + last-fired in IndexedDB so a page reload re-arms the timer.
- **Settings card**: Enable/disable CTA, cadence radio (off / daily / weekly), HH:MM time picker, "Next reminder" display. iOS Safari pre-home-screen shows "notifications unsupported" fallback; blocked-permission shows "denied" fallback.
- **Privacy**: all notification scheduling is local-only. No data leaves the device.

### 🎬 Transitions, filters, themes (Studio unlock)

- **5 transitions**: crossfade (blend dissolve), slide-left (pad+overlay), slide-up, flip-3D (rotate), zoom-in (zoompan). Each has an FFmpeg `-vf` recipe.
- **7 filters**: warm (colortemperature=6500), cool (4500), BW (hue=s=0), sepia (colorchannelmixer), vignette, soft-focus (boxblur), slight-grain (noise).
- **4 themes**: Vintage (sepia + crossfade + standard), Studio (BW + clean + fast), Memory (soft-focus + zoom-in + slow), Pop (cool + slide-left + fast).
- **`composeVfChain`**: composes the full FFmpeg `-vf` chain (scale prefix + transition + filter). Theme always overrides per-export transition + filter.
- **V1 worker extended**: `RenderRequest.vfChain` replaces the hardcoded `scale=...` when set. V1 callers (no chain) are unaffected.
- **Export sheet Style section**: radio-card groups for Theme, Transition, Filter. Free/Clean users see the locked upgrade-prompt card. Studio users see the full controls.

### 📦 Bundle

| | Raw | Gzipped |
|---|---|---|
| V2.0 baseline | 195.56 KB | 61.20 KB |
| V2.5 final | 208.77 KB | 64.69 KB |
| Delta | +13.21 KB | +3.49 KB |
| Budget | — | 250 KB |
| Headroom | — | **185.31 KB** |

The engine chunk grew from 2.41 KB to 4.57 KB (catalogs + apply + notifications). The main bundle grew by ~13 KB (NoteEditor + MemoryLane + onion-skin + EXIF + notifications UI). All within the ~55 KB headroom target set at sprint kickoff.

### 🧪 Testing

- **270 tests** (30 test files, up from 23/194 at V2.0):
  - 194 V2.0 tests unchanged
  - 76 new V2.5 tests: Day 1 sanity (6), per-entry notes (9), EXIF parsing (10), onion-skin (4), memory lane (9), notifications (16), catalogs/compose (22)
- All V2.0 tests pass with zero regression.

### ✅ Stop conditions met

None of the planned stop conditions were triggered:
- No V2.5 plan item conflicted with V2_DEV_SPEC requirements.
- Bundle at 64.69 KB gzipped (250 KB budget) — never approached the limit.
- No V2.0 test ever failed during the sprint.
- No operating rules were changed.

### ⚠️ Known Limitations

1. The V2.5 e2e test (`tests/e2e/v25-preview.spec.mjs`) does not yet exist — covered by unit tests for now.
2. The `RenderRequest.vfChain` plumb is wired but the FFmpeg recipes are simplified approximations. Production video quality may differ from the ideal `xfade` implementation.
3. Notification times are computed in UTC. Users in extreme timezones (±12h UTC) may see the reminder one hour off. V2.6 should add timezone-aware scheduling.
4. The Export sheet's Style section uses radio-card layout that may overflow the modal on small screens (iPhone SE). The existing V2.0 modal already scrolls; the Style cards add height. Monitored for V2.6.

## v2.0.0 — 2026-07-28

The biggest single change in Little Loop's history. V2.0 transforms the app from a baby-specific single-project photo tracker into a general-purpose multi-subject timeline creator with paid unlocks, export sharing, and a clean engine boundary ready for V3.

### 🏗 Architecture

- **Engine boundary** (`src/engine/`): Pure TypeScript engine with no React, no DOM, no platform-specific calls. Singleton `Engine` class owns the subject list, IAP state, export pipeline, and platform adapter. React consumes the engine through `useEngine` / `useSubjects` / `useUnlock` / `useExportProgress` hooks.
- **Dexie v2 schema**: Added `subjects` and `unlocks` IndexedDB stores. V1's `projects`/`entries`/`assets` tables preserved untouched for backwards compatibility.
- **V1 → V2 migration**: Idempotent, localStorage-flagged migration. Reads V1 `Project` rows, writes parallel `Subject` rows (same id so entries stay linked). Runs once on first V2 launch.

### 👤 Subjects (formerly "Projects")

- **Unlimited subjects**: Users can create, rename, reclassify, and delete any number of subjects.
- **Subject types**: 8 built-in types (baby, plant, fitness, recovery, home, creative, pet, other) with a grid picker.
- **Home screen**: Subject tiles with thumbnails, name, type, cadence, and entry count. Drag-to-reorder sorting, inline rename, inline type cycling.
- **Per-subject settings**: Rename, reclassify, change cadence, or delete with "type the name to confirm" guard.

### 💰 In-App Purchases

- **IAP architecture**: `IapProvider` interface with implementations for Apple App Store, Google Play Store, Stripe, and Dev (the only active provider in V2.0).
- **Dev provider**: End-to-end purchase simulation — persists real-shaped receipts to IndexedDB, no charge.
- **Feature flags**: `VITE_IAP_*` environment variables gate real providers. All default false in V2.0.
- **Paywall screen**: Clean exports (£1.99, removes watermark + banner ad) and Studio (£4.99, everything + future transitions/filters/themes). One-time purchases, no subscriptions, no trials, no nag.
- **Post-purchase toast**: "Welcome to Studio!" / "Welcome to Clean exports!" auto-dismisses after 6s.
- **Restore purchases**: One-tap restore in Settings or from the Paywall screen.
- **Device fingerprint**: FNV-1a-based fingerprint prevents refund abuse across device reinstalls.

### 🎥 Export & Share

- **Export engine** (`src/engine/export/`): Wraps the V1 FFmpeg.wasm pipeline with the V2 `ExportRequest` / `ExportResult` API. Watermark drawn inline per-frame via `extraDraw` hook.
- **Watermark**: Unicode ⌐ glyph + "little-loop" text, bottom-right, 30% opacity, 8-direction black shadow for legibility. One-off bypass checkbox in the export sheet.
- **Export sheet**: Date range (all / this month / custom), speed (fast / standard / slow), placeholder Style section, show-date toggle, filename override, Export button.
- **Camera roll save**: Web Share API with File (iOS share sheet → "Save to Photos") + `<a download>` fallback for desktop. Help text shown on fallback.
- **Share intents**: Platform share sheet (Instagram, WhatsApp, iMessage, Mail) via Web Share API with file. Fallback sheet with WhatsApp deep link, Email mailto:, Save to Files download, Instagram instructions.

### 💾 Backup & Restore

- **Format migration**: `.babyflip` → `.babyloop` extension. V2 reads both formats; new backups write `.babyloop`.
- **Multi-subject backup**: `createAllSubjectsBackup()` backs up every subject and their entries into one ZIP archive.
- **Merge / Replace restore**: `restoreFromBackup(file, mode)` — merge skips subjects whose names already exist locally; replace wipes everything first.
- **Format versioning**: V2 introduces `formatVersion: 2` for multi-subject manifests with `subjects` array. V1's `formatVersion: 1` (single project) is still readable.

### 🎨 UI Polish

- **Banner ad**: Placeholder "Sponsored" banner on the home screen for free users. 30-minute impression frequency cap.
- **V2App shell**: Engine-driven router replaces the V1 routing shell. All V1 screens remain in the bundle via V2App's route adapters.
- **Settings screen**: Default cadence/type pickers, watermark preview canvas, Restore purchases, About/version, placeholder privacy/ToS/feedback links.
- **Reduced motion**: `prefers-reduced-motion` CSS disables animations for users with motion sensitivity.

### 🧪 Testing

- **194 tests** (94 V1 + 100 V2) across 23 test files:
  - Unit tests: migration, watermark, IAP providers, filenames, browser platform, dates, backup-compat, persistence
  - Integration tests: engine subjects, engine IAP, engine ads/sort, V2 home polish, share fallback, multi-subject backup
  - React render tests: V2 home screen, export sheet
- All V1 tests pass unchanged. Zero regression.

### 📦 Bundle

- Main entry: 195.56 KB (61.20 KB gzipped) — under the 250 KB budget
- Engine chunk: 2.41 KB (lazy-loaded)
- FFmpeg.wasm: ~32 MB, loaded from CDN at export time (not bundled)

### ⚠️ Known Limitations

1. The V2 V2App does not handle `capture-preview` or `import-date` routes yet (V1 screens are used for those).
2. The export sheet's entry count shows "0 captured" (informational; the export still works).
3. The V2 e2e test (`tests/e2e/v2-preview.spec.mjs`) does not yet exist.
4. The watermark is applied inline per-frame via the `extraDraw` hook; the V1 `reEncodeWithWatermark` fallback was removed.
5. The 30-day IAP revalidation timer is clamped to Node's 32-bit int max (24.8 days) in test environments. Production browsers handle the full 30 days.

### 🚀 What's Next

- V2.5: Daily/weekly notifications, onion-skin overlay, auto-crop face, burst capture, transitions/filters/themes, per-entry notes, EXIF date detection, memory lane
- V2.6: Capacitor shell, IAP validation across all three platforms, App Store/Play Store submission