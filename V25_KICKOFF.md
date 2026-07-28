# V2.5 — Day-by-Day Sprint Plan

> Engagement + creative content. Universal friction-killers first, then Studio-only features. The V2 foundation stays untouched.

---

## Sprint scope (mirroring V2.0's structure)

By the end of the sprint, a user on `https://babyflipbook.dev` can:

1. Capture with **onion-skin overlay** showing the previous entry as a translucent guide — dramatic friction reduction for daily capture.
2. Import library photos with **EXIF date detection** — the date picker pre-fills from the photo's metadata.
3. Add **per-entry notes** (≤280 chars) on any entry, edit inline on the timeline view.
4. See an **"On this day"** memory lane on the home screen showing entries from past years that match today's date.
5. Receive **daily/weekly local notifications** (permission asked once, off by default).
6. As a **Studio unlock**: choose a **transition** (crossfade, slide-left, slide-up, flip-3D, zoom-in) for the export.
7. As a **Studio unlock**: apply a **filter** (warm, cool, BW, sepia, vignette, soft-focus, slight-grain) to every frame.
8. As a **Studio unlock**: pick a **theme** (Vintage, Studio, Memory, Pop) that bundles a transition + filter + speed.

---

## Operating rules (inherited from V2.0)

- **Pass gates before commit**: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build` all clean.
- **Don't break V2.0**: All 194 existing tests must stay green. V2.0 subjects / IAP / export / share / backup / restore continue to work unchanged.
- **Engine boundary stays clean**: no React imports from `src/engine/`. New engine modules live alongside the V2 ones.
- **Studio features behind unlock state**: `engine.useUnlock()` returns `'free' | 'clean' | 'studio'`. Studio features gate on `unlock === 'studio'`. Free and Clean users see locked-with-upgrade-prompt cards (same pattern as V2.0's Style section).
- **Per-export bypass**: Studio features can be toggled per-export. The "locked" affordance is a permanent card; the actual controls appear when the user has Studio.
- **Update `DAY_BY_DAY_V2_SPRINT.md` (or new `DAY_BY_DAY_V25_SPRINT.md`)** at the end of each day.
- **Don't expand scope mid-sprint**: bugs found outside the sprint scope go in a "Discovered issues" section and ship later.
- **Bundle budget**: 250 KB gzipped main bundle. Current V2.0 is 195.56 KB / 61.20 KB. V2.5 has ~55 KB of headroom.

---

## Part 1 — V2.5 Architecture

### 1.1 New engine modules

```
src/engine/
├── notifications/
│   ├── provider.ts          (NotificationProvider interface + BrowserLocal impl)
│   └── schedule.ts          (compute next-due timestamps from cadence + last shot)
├── transitions/
│   ├── catalog.ts           (Transition[] — name, ffmpegFilter, defaultDurationMs)
│   └── apply.ts             (translate to FFmpeg -vf chain)
├── filters/
│   ├── catalog.ts           (Filter[] — name, ffmpegFilter)
│   └── apply.ts             (compose into -vf chain)
├── themes/
│   └── catalog.ts           (Theme[] — bundles Transition + Filter + Speed)
└── exif/
    └── read.ts              (parse DateTimeOriginal from JPEG EXIF)
```

### 1.2 Engine surface additions

```ts
class Engine {
  // NEW: notifications
  async requestNotificationPermission(): Promise<boolean>;
  async scheduleNotifications(opts: ScheduleOpts): Promise<void>;
  async cancelNotifications(): Promise<void>;
  onNotificationTick(cb: () => void): () => void;   // for in-app banner

  // NEW: entry notes
  async setEntryNote(entryId: string, note: string): Promise<Entry>;

  // NEW: export pipeline gains transitions / filters / themes
  async export(request: ExportRequestV2, onProgress: (p: ExportProgress) => void): Promise<ExportResult>;
}

interface ExportRequestV2 extends ExportRequest {
  transition?: TransitionId;       // Studio only
  filter?: FilterId;               // Studio only
  theme?: ThemeId;                 // Studio only; if set, overrides transition+filter
}
```

### 1.3 Watermark stays the same. EXIF date detection is a UI hint, not a schema change.

---

## Part 2 — Day-by-day plan

### Week 1 — Friction killers (universal value)

#### Day 1 — V2.5 architecture scaffold

- Add new engine module directories (notifications/, transitions/, filters/, themes/, exif/).
- Extend `engine/state.ts` with `NotificationState`, `TransitionId`, `FilterId`, `ThemeId`, `Transition`, `Filter`, `Theme` types.
- Extend `Engine` with the new method stubs (throws "not implemented" until later days).
- Add a Day 1 E2E sanity test that loads the app and confirms nothing regressed.
- Update `DAY_BY_DAY_V25_SPRINT.md` with deviations and verification.

**End-of-day check**: All 194 V2 tests pass. New directories compile. Engine boots cleanly.

#### Day 2 — Per-entry notes UI

- Add a `NoteEditor` component (inline textarea, ≤280 chars, debounced save).
- Wire into `CapturePreviewScreen` (post-capture) and `TimelineScreen` (per-entry row).
- Persist via `engine.setEntryNote(entryId, note)`.
- Empty note renders as "+ Add a note" affordance.
- E2E test: capture a photo, add a note, reload, note persists.

**End-of-day check**: Notes round-trip through IDB. Timeline shows notes inline. 196+ tests pass.

#### Day 3 — EXIF date detection

- Add `src/engine/exif/read.ts` — parses JPEG EXIF (DateTimeOriginal + DateTime tags). Pure function, no deps.
- Wire into `ImportDateScreen`: when a library photo is picked, extract the EXIF date and pre-fill the date input. User can override.
- Show "Photo taken YYYY-MM-DD" hint below the input when EXIF was found.
- Test: a known JPEG with EXIF returns the right date.

**End-of-day check**: EXIF date pre-fills correctly. Override still works. Tests cover happy path + missing EXIF + malformed EXIF.

#### Day 4 — Onion-skin overlay

- Add `src/lib/onion-skin.ts` — fetches the previous entry's image asset, draws it on a canvas at 30% opacity.
- Wire into `CapturePreviewScreen` as an overlay layer. Toggle button "Show previous as guide".
- The onion-skin shows the immediately-prior entry's image at 30% opacity, aligned to the canvas (V1 already does letterbox-fit). Spec §7 wording: "Onion-skin overlay against the previous entry. If there is no previous entry, the optional referenceImageBlobId is used."
- Test: with no prior entry → no overlay, helpful message. With prior → overlay renders. Toggle works.

**End-of-day check**: Overlay works for daily and weekly cadence. Toggle persists per-session.

### Week 2 — Memory lane + notifications

#### Day 5 — On this day (memory lane)

- Add `useOnThisDay(subjectId, today) => Entry[]` hook that queries IDB for entries whose `capturedDate` matches the day-month of `today` in any past year.
- Build `MemoryLane` component on the home screen: a small card showing up to 3 entries from past years that match today.
- Per-entry thumbnail + caption "On this day, 2 years ago" style.
- Tap → opens that entry in the timeline view.
- Test: seeded IDB with historical entries → MemoryLane renders correctly.

**End-of-day check**: MemoryLane renders only when there's a match. Empty state is graceful. Test covers 1-year, 2-year, 3-year matches.

#### Day 6 — Local notifications

- Add `NotificationProvider` interface with `requestPermission`, `schedule`, `cancel`.
- Browser impl uses `Notification` API + a `setTimeout` chain (not `setInterval` — see V2.0 lesson about Node 32-bit overflow).
- `scheduleNotifications({cadence, lastCaptureAt, hour, minute})` computes next-due timestamps; persists them in IDB so a page reload can re-schedule.
- Add notification settings to V2SettingsScreen: enable toggle, daily/weekly, time-of-day picker. Permission asked when enable is toggled on.
- iOS Safari doesn't support Notification API in PWA mode — show "Not supported in this browser" gracefully.
- Test: schedule a notification 1 second in the future, mock time, verify it's triggered.

**End-of-day check**: Notifications persist across page reload. iOS Safari shows graceful fallback. Permission flow is non-blocking.

### Week 3 — Studio creative content

#### Day 7 — Transitions + filters + themes

- Build `src/engine/transitions/catalog.ts`: crossfade (xfade), slide-left, slide-up, flip-3D (hlslice), zoom-in (zoompan). Each has an FFmpeg `-vf` recipe.
- Build `src/engine/filters/catalog.ts`: warm (colortemperature=6500), cool (4500), BW (hue=s=0), sepia (colorchannelmixer), vignette, soft-focus (boxblur), slight-grain (noise).
- Build `src/engine/themes/catalog.ts`: Vintage (sepia + grain + crossfade + 0.5s), Studio (BW + clean-cut + 0.4s), Memory (soft-focus + zoom-in + 0.6s), Pop (cool + slide-left + 0.4s).
- Wire into `ExportRequestV2` and the export engine. The `extraDraw` hook from V2.0 stays; new hooks compose the FFmpeg command.
- Test: each transition/filter/theme produces a valid FFmpeg `-vf` chain string.

**End-of-day check**: All 5 transitions + 7 filters + 4 themes produce valid FFmpeg recipes. No iOS Safari regressions.

#### Day 8 — Export sheet UI for Style

- Extend `ExportSheet.tsx` with the Style section. When `unlock === 'studio'`, show: Theme (radio cards), Transition (radio cards), Filter (radio cards). Precedence: Theme overrides Transition + Filter.
- When locked (free or clean), show the "Get Studio for transitions" prompt card.
- The `engine.export()` call now passes `theme` / `transition` / `filter` through to `ExportRequestV2`.
- Update FFmpeg invocation: the `-vf` chain now reads from the selected theme (or transition + filter), composes correctly.
- Test: sheet renders 3 sections when Studio. Locked card when not Studio. Selection round-trips through export.

**End-of-day check**: Style section visible only for Studio. FFmpeg command reflects the selection. Watermark (V2.0) still applies on top.

### Week 4 — Polish + ship

#### Day 9 — Polish pass

- Verify all Week 1-3 features work together: notes + EXIF + onion-skin + memory lane + notifications + transitions/filters/themes.
- Update V2_CHANGELOG.md to include V2.5 sections.
- Update V2.5 e2e test (`tests/e2e/v25-preview.spec.mjs`).
- Code review pass on engine boundary.

**End-of-day check**: 196+ tests pass. Bundle < 250 KB gzipped. V2.0 + V2.5 both work end-to-end.

#### Day 10 — V2.5 wrap + tag

- Final regression sweep.
- Tag `v2.5.0`.
- Push to prod.

---

## Definition of Done (V2.5 ships when all 10 are checked)

1. All 10 working days are complete.
2. All V2 unit/integration tests still pass.
3. New V2.5 tests cover notes, EXIF, onion-skin, memory lane, notifications, transitions, filters, themes.
4. The onion-skin reduces daily-capture friction for users.
5. EXIF date detection removes the manual date picker step.
6. "On this day" shows past entries that match today.
7. Notifications fire at the user's chosen time.
8. Studio unlock reveals transitions, filters, themes in the export sheet.
9. The main bundle is still under 250 KB gzipped.
10. Tag `v2.5.0` is committed and pushed to `main`.

---

## Open questions for V2.5 (resolve before sprint start)

1. **Onion-skin opacity**: spec says "translucent guide" without a number. Pick 30% (matches watermark logic) or test with a designer.
2. **Notifications on iOS**: PWA notifications require the user to "Add to Home Screen" first on iOS 16.4+. The Day 6 implementation needs to detect this and explain it inline.
3. **Multiple photos per period**: out of V2.5 scope per the V2 spec. Day 2's note UI is the entry point for "more content per period" without changing the period model.
4. **EXIF privacy**: spec doesn't say, but reading EXIF requires loading the image into a `<img>` element. We don't exfiltrate anything; the parse happens entirely client-side. Document this in the privacy placeholder on Day 9.
5. **Themes for free users**: spec §10 says themes are Studio only. But themes could also be a free discovery feature ("preview Vintage for free"). Decision: lock all themes behind Studio for V2.5 to match the spec exactly; revisit V2.6 if free discovery proves valuable.

---

## Risks for V2.5 (track and adjust)

| Risk | Likelihood | Mitigation |
|---|---|---|
| FFmpeg `-vf` chains for transitions/filters have edge cases (e.g. `xfade` with mismatched frame counts). | Medium | Day 7 unit-tests every transition + filter recipe against a real FFmpeg.wasm in CI. The V2.0 worker already runs FFmpeg; reuse it. |
| Notification permission denied on iOS Safari is silent — users won't know why they don't see prompts. | High | Day 6 includes a Settings UI that explains the iOS PWA requirement + an in-app fallback banner. |
| "On this day" memory lane with no historical data looks empty — feels broken. | Medium | Empty state is a friendly "No memories for today yet — capture one to start your time machine." |
| Per-entry notes + memory lane + notifications + onion-skin + Style all hit the bundle. Bundle may exceed 250 KB. | Medium | Lazy-load Style (Day 8) into a separate chunk since only Studio users see it. Day 9 measures the final bundle. |
| Notes field may collect spam / abuse. | Low | V2.5 caps at 280 chars per spec. No moderation needed for local-only data. |

---

## What ships in V2.5 vs deferred

| Feature | V2.5 | V2.6 / later |
|---|---|---|
| Onion-skin overlay | ✅ | |
| Per-entry notes (≤280 chars) | ✅ | |
| EXIF date detection | ✅ | |
| "On this day" memory lane | ✅ | |
| Daily/weekly local notifications | ✅ | |
| Transitions (5) + filters (7) + themes (4) | ✅ Studio | |
| Auto-crop face | | V2.5+ Studio, on-device model |
| Burst capture | | V2.5+ Studio |
| Multiple photos per period | | V2.6 spec update |
| Cloud sync, family sharing | | Out of scope per V2 spec |
