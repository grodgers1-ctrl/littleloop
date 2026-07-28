# V2.0 Changelog

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