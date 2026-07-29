# Little Loop V2.5: Day-by-Day Development Sprint

> Engagement + creative content. Universal friction-killers first, then Studio-only features. The V2.0 foundation stays untouched.
>
> The implementation source of truth is `V2_DEV_SPEC.md` (sections 6, 7, 9, 10 are most relevant for V2.5) and `V25_KICKOFF.md`. If a sprint item conflicts with the spec, follow the spec.
>
> **Sprint scope**: 10 working days. Targets: per-entry notes, EXIF date detection, onion-skin overlay, "on this day" memory lane, daily/weekly local notifications, transitions / filters / themes (Studio unlock). Bug-free V2.0 regression test coverage.
>
> **Out of scope for this sprint** (V2.6 / V3.0): auto-crop face, burst capture, multiple photos per period, Capacitor shell, App Store / Play Store submission, cloud sync, family sharing.

This sprint is the V2.5 follow-on to the V2.0 sprint. The V2.0 sprint doc is `DAY_BY_DAY_V2_SPRINT.md` — it's the source of truth for V2.0 architecture and operating rules. V2.5 inherits those rules and extends the engine surface for engagement + creative content.

## Operating rules (inherited from V2.0)

- **Pass gates before commit**: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build` all clean.
- **Don't break V2.0**: All V2.0 unit, integration, and e2e tests must stay green. V2.0 subjects / IAP / export / share / backup / restore continue to work unchanged.
- **Engine boundary stays clean**: no React imports from `src/engine/`. New engine modules live alongside the V2 ones.
- **Studio features behind unlock state**: `engine.useUnlock()` returns `'free' | 'clean' | 'studio'`. Studio features gate on `unlock === 'studio'`. Free and Clean users see locked-with-upgrade-prompt cards (same pattern as V2.0's Style section).
- **Per-export bypass**: Studio features can be toggled per-export. The "locked" affordance is a permanent card; the actual controls appear when the user has Studio.
- **Bundle budget**: 250 KB gzipped main bundle. V2.0 baseline is 195.56 KB / 61.20 KB. V2.5 has ~55 KB of headroom.
- **Commit cadence**: commit at the end of every day, push at the end of every week.
- **Don't expand scope mid-sprint**: bugs found outside the sprint scope go in a "Discovered issues" section and ship later.

## Definition of Done (V2.5 ships when all 10 are checked)

1. All 10 working days are complete.
2. All V2.0 unit/integration tests still pass.
3. New V2.5 tests cover notes, EXIF, onion-skin, memory lane, notifications, transitions, filters, themes.
4. The onion-skin reduces daily-capture friction for users.
5. EXIF date detection removes the manual date picker step.
6. "On this day" shows past entries that match today.
7. Notifications fire at the user's chosen time.
8. Studio unlock reveals transitions, filters, themes in the export sheet.
9. The main bundle is still under 250 KB gzipped.
10. Tag `v2.5.0` is committed and pushed to `main`.

## Part 1: V2.5 Architecture overview

The V2.5 architecture extends the V2.0 engine boundary rather than refactoring it. Five new engine modules live alongside the V2.0 ones:

```
src/engine/
├── notifications/    (V2.5 — provider.ts + schedule.ts)
├── transitions/      (V2.5 — catalog.ts + apply.ts)
├── filters/          (V2.5 — catalog.ts + apply.ts)
├── themes/           (V2.5 — catalog.ts)
└── exif/             (V2.5 — read.ts)
```

The engine surface grows:

```ts
class Engine {
  // V2.5 additions
  async requestNotificationPermission(): Promise<boolean>;
  async scheduleNotifications(opts: ScheduleOpts): Promise<void>;
  async cancelNotifications(): Promise<void>;
  onNotificationTick(cb: () => void): () => void;
  getNotificationState(): NotificationState;

  async setEntryNote(entryId: string, note: string): Promise<Entry>;

  // Widened: V2.0 ExportRequest still works (subtype). V2.5 adds
  // transition / filter / theme.
  async export(request: ExportRequestV2, onProgress: (p: ExportProgress) => void): Promise<ExportResult>;
}

interface ExportRequestV2 extends ExportRequest {
  transition?: TransitionId;       // Studio only
  filter?: FilterId;               // Studio only
  theme?: ThemeId;                 // Studio only; overrides transition + filter
}
```

The V2.0 export pipeline ignores the new fields; the V2.5 export pipeline (built on Day 7) reads them. The V2.0 path keeps working unchanged.

Watermark stays the same. EXIF date detection is a UI hint, not a schema change.

---

## Part 2: Day-by-day plan

### Week 1 — Friction killers (universal value)

#### Day 1 — V2.5 architecture scaffold ✅ done

- Add new engine module directories (notifications/, transitions/, filters/, themes/, exif/).
- Extend `engine/state.ts` with `NotificationState`, `TransitionId`, `FilterId`, `ThemeId`, `Transition`, `Filter`, `Theme`, `ExportRequestV2`, `ScheduleOpts` types.
- Extend `Engine` with the new method stubs (throws "not implemented" until later days) — `setEntryNote`, `requestNotificationPermission`, `scheduleNotifications`, `cancelNotifications`, `onNotificationTick`, `getNotificationState`.
- Widen `engine.export()` signature to accept `ExportRequestV2` (V2.0 callers still pass `ExportRequest` unchanged).
- Add a Day 1 sanity test that confirms: the five directories exist, the V2.5 types are re-exported, the engine boots cleanly, the V2.5 method stubs throw the right "not implemented (Day N)" message, and the V2.0 `ExportRequest` shape round-trips through `engine.export()` without compile errors.

**End-of-day check**: All 194 V2.0 tests pass. New directories compile. Engine boots cleanly. 200 tests pass (194 V2.0 + 6 V2.5 Day 1 sanity).

**Day 1 shipped**:
- `src/engine/notifications/index.ts` — placeholder barrel with a comment explaining the Day 6 target.
- `src/engine/transitions/index.ts` — placeholder barrel with the Day 7 catalog target.
- `src/engine/filters/index.ts` — placeholder barrel with the Day 7 catalog target.
- `src/engine/themes/index.ts` — placeholder barrel with the Day 7 catalog target.
- `src/engine/exif/index.ts` — placeholder barrel with the Day 3 EXIF read target.
- `src/engine/state.ts` — added V2.5 section: `NotificationCadence`, `NotificationSchedule`, `NotificationPermissionState`, `NotificationState`, `TransitionId`, `Transition`, `FilterId`, `Filter`, `ThemeId`, `Theme`, `ExportRequestV2`, `ScheduleOpts`.
- `src/engine/engine.ts` — added V2.5 method stubs (`setEntryNote`, `requestNotificationPermission`, `scheduleNotifications`, `cancelNotifications`, `onNotificationTick`, `getNotificationState`) and widened `export()` to accept `ExportRequestV2`. The V2.0 backward-compat contract is preserved: a V2.0 `ExportRequest` is structurally assignable to `ExportRequestV2`, so V2.0 callers (the V2 export pipeline, the V2 home screen, the V2 integration suite) keep working unchanged.
- `src/engine/index.ts` — re-exported the V2.5 types from the engine barrel.
- `tests/unit/v25-day1-sanity.test.ts` — 6 tests covering: module directories exist, V2.5 types re-exported, engine boots + `ready` event fires, V2.5 method stubs throw the right day markers, V2.0 `ExportRequest` round-trips, V2.5 `ExportRequestV2` accepts the Studio fields.

**Verification**:
- `npx tsc --noEmit` clean.
- `npx vitest run` — 200 tests pass (194 V2.0 + 6 V2.5 Day 1).
- `npm run build` — bundle builds cleanly, V2.0 bundle size unchanged (Day 1 adds no JS to the production bundle — only types + stub methods that throw, all tree-shakeable).

**Deviations from kickoff**: none. The kickoff lists `NotificationState`, `TransitionId`, `FilterId`, `ThemeId`, `Transition`, `Filter`, `Theme` as the V2.5 state additions. I added those plus `NotificationCadence`, `NotificationSchedule`, `NotificationPermissionState`, `ScheduleOpts`, and `ExportRequestV2` because the engine's method stubs reference them and the existing V2.0 export pipeline needs the wider `ExportRequestV2` shape. This is a strict superset of the kickoff's named types — no new abstract concepts, just the supporting types that the named ones require.

#### Day 2 — Per-entry notes UI

- Add a `NoteEditor` component (inline textarea, ≤280 chars, debounced save).
- Wire into `CapturePreviewScreen` (post-capture) and `TimelineScreen` (per-entry row).
- Persist via `engine.setEntryNote(entryId, note)`.
- Empty note renders as "+ Add a note" affordance.
- E2E test: capture a photo, add a note, reload, note persists.

**End-of-day check**: Notes round-trip through IDB. Timeline shows notes inline. 200+ tests pass.

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

**End-of-day check**: 200+ tests pass. Bundle < 250 KB gzipped. V2.0 + V2.5 both work end-to-end.

#### Day 10 — V2.5 wrap + tag

- Final regression sweep.
- Tag `v2.5.0`.
- Push to prod.

---

## Part 3: Test plan for V2.5

V2.5 inherits V2.0's test plan (23 test files, 194 tests) and adds:

**Unit tests** (Vitest)
- `tests/unit/v25-day1-sanity.test.ts` — Day 1 done (6 tests).
- `tests/unit/v25-notes.test.ts` — Day 2 target.
- `tests/unit/v25-exif.test.ts` — Day 3 target.
- `tests/unit/v25-onion-skin.test.ts` — Day 4 target.
- `tests/unit/v25-memory-lane.test.ts` — Day 5 target.
- `tests/unit/v25-notifications.test.ts` — Day 6 target.
- `tests/unit/v25-catalogs.test.ts` — Day 7 target (transitions / filters / themes produce valid FFmpeg `-vf` chains).
- `tests/unit/v25-export-sheet.test.tsx` — Day 8 target (Style section visibility).

**Integration tests** (Vitest + fake-indexeddb)
- `tests/integration/v25-notes-flow.test.ts` — Day 2 target.
- `tests/integration/v25-studio-export.test.ts` — Day 8 target.

**E2E tests** (Playwright)
- `tests/e2e/v25-preview.spec.mjs` — Day 9 target. Full V2.5 user flow: home + memory lane → capture with optional note + onion-skin → export with optional Studio style → save / share.

**Manual QA checklist** (extends V2.0's)
- Onion-skin overlay is visible at the right opacity (~30%) and aligns with the canvas.
- EXIF date detection pre-fills the date picker correctly on iOS Safari and Android Chrome.
- "On this day" memory lane shows the right entries on today's date.
- Notifications fire at the user's chosen time on both Android Chrome and iOS Safari (PWA installed).
- Transitions / filters / themes compose correctly in the MP4 output.
- The Style section shows the locked-with-upgrade card for free / clean users.
- Bundle stays under 250 KB gzipped on the production build.

---

## Part 4: Risk register for V2.5

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| FFmpeg `-vf` chains for transitions/filters have edge cases (e.g. `xfade` with mismatched frame counts). | Medium | Medium | Day 7 unit-tests every transition + filter recipe against a real FFmpeg.wasm in CI. The V2.0 worker already runs FFmpeg; reuse it. |
| Notification permission denied on iOS Safari is silent — users won't know why they don't see prompts. | High | Medium | Day 6 includes a Settings UI that explains the iOS PWA requirement + an in-app fallback banner. |
| "On this day" memory lane with no historical data looks empty — feels broken. | Medium | Low | Empty state is a friendly "No memories for today yet — capture one to start your time machine." |
| Per-entry notes + memory lane + notifications + onion-skin + Style all hit the bundle. Bundle may exceed 250 KB. | Medium | High | Lazy-load Style (Day 8) into a separate chunk since only Studio users see it. Day 9 measures the final bundle. |
| Notes field may collect spam / abuse. | Low | Low | V2.5 caps at 280 chars per spec. No moderation needed for local-only data. |
| V2.0 export regression from widened `export()` signature. | Low | High | `ExportRequestV2 extends ExportRequest`, so V2.0 callers pass unchanged. Day 1 sanity test asserts the structural subtype relationship. Full V2.0 test suite (194 tests) gates every commit. |

---

## Part 5: Discovered issues

Bugs found outside the V2.5 sprint scope go here. Resolved in V2.6 or later.

(none yet)

---

*End of V2.5 sprint doc. Updates at the end of each day.*

---

## V2.5 hotfix follow-up — V2 home action gap

Discovered after the `v2.5.0` tag was shipped and the user verified on iPhone: the V2 home screen (`V2HomeScreen.tsx`) has only "+ Add subject". It does not surface Add Photo, Export, Reminders, or Notes — every one of the features built across V2.0 and V2.5 is reachable only by first creating a subject, tapping it, and discovering nothing in the resulting V1 TimelineScreen. The Capture / Import / Export / Memory lane / Notes / Reminders code paths all exist and work; they're just not wired to a button.

This is a V2.0 completion gap surfaced by the V2.5 verify pass. Per the operating rules, it lives in this "Discovered issues" section rather than being silently rolled into V2.5.

### Phase 1 — Surface the existing features (hotfix)

Branch: `fix/v2-home-actions` (post-`v2.5.0`).

- Add "+ Add photo" + "Export flipbook" buttons to the V2 home subject tile (and in the empty-state CTA row).
- Add a per-subject action bar to `V2SubjectScreen.tsx` so the user can act on a subject from the timeline (V1 TimelineScreen only has Replace/Delete).
- Capture / Import / Export / Style screens are already built — no new work there. Re-use the V1 `Route` types from `src/app/routes.ts` and adapt the navigation in `V2SubjectScreen.tsx` to forward capture/import/export routes through the V2 router.

Scope: ~60 lines of wiring + tests. Should land as `v2.5.1`.

### Phase 2 — iPhone verify

Run on real iPhone (user has only iPhone, no Mac Web Inspector):

- Add Photo launches, returns to timeline with the new entry + note affordance
- Export button opens the V2.5 ExportSheet with the Style section visible
- Memory lane card renders on the home screen when an entry matches today
- Notes round-trip through IDB
- Reminders card surfaces "Enable reminders" on settings
- No console errors, no broken layouts on small screens

Use `tests/e2e/ios-fix.spec.mjs` and `tests/e2e/full-export-probe.spec.mjs` as templates for what to script vs verify manually.

### Phase 3 — V2 home surface design (deferred, brainstorm)

The hotfix is the minimum that gets the features to the user. The right fix is a V2 home redesign:

- Subject tiles with quick actions (Add photo + Export as primary buttons on the tile)
- Memory lane card always above the subject list
- Reminders surface on the home screen (not buried in Settings)
- Per-subject quick view of the latest entry thumbnail
- Settings + Paywall reachable from the home header

This is a real product design pass, not a hotfix. Defer to V2.0.x or V2.6 planning.

---

*End of V2.5 sprint doc. Updates at the end of each day.*

---

## V2.5.1 redesign — V2 home surface

The V2.5.1 hotfix made features reachable; the V2.5.1 redesign made the home surface worth reaching. Branch: `feature/v2-home-redesign`. Day-9 design pass decisions:

- Persona: multiple subjects, browsing. Per-tile primary Add photo.
- Memory lane: home, with graceful empty state (was: hidden when no matches).
- Reminders: thin home banner, unobtrusive, dismissible.
- Empty state CTA: "Start your first timeline" (was: "Add your first subject"). User asked for "more cuddly than subject" — copy is now "timeline" / "moment" / "Make a video" rather than "subject" / "Export flipbook".
- Layout: single-column tile list (no grid, no collapsed strip).
- Header: "Your moments" title; Settings button on the right; reminders banner above the title.
- Visual style: keep V1 cream-and-brown palette.

The redesign is a 22 KB raw / 6 KB gzipped delta. The engine chunk is unchanged.

---

*End of V2.5.1 sprint doc.*
