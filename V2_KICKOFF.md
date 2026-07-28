# Little Loop V2.0 — Implementation Kickoff

You are starting **V2.0** of the Little Loop PWA. This is a fresh session — do not assume prior context beyond what is on disk.

## Read first, in this order

1. `V2_DEV_SPEC.md` — the product spec. Read the whole thing before changing code. If a sprint item conflicts with the spec, the spec wins.
2. `DAY_BY_DAY_V2_SPRINT.md` — the 20-day execution order, including the V2.0 architecture in Part 1. Follow the day-by-day plan. Update the file as you go (move the open questions to resolved, mark day status).
3. `V1_DEV_SPEC.md` and `DAY_BY_DAY_DEV_SPRINT.md` — read for context. The V1 export path, FFmpeg worker, and IndexedDB schema are the foundation. Do not break them.
4. `CLAUDE.md` (if it exists) — any project-local instructions.

## Project state

- Working directory: `C:\Users\Admin\Hermes\little-loop`
- Current branch: `main`. Last V1.1 (iOS Safari fix) commit was `60128aa`. The V2 docs are committed at `a782ee6`, `be05527`, and `ddc67ba` but **no V2 code has been written yet**.
- The app is a Vite + React + TypeScript PWA. Tests use Vitest. E2E tests use Playwright.
- The export pipeline runs FFmpeg.wasm in a Web Worker. The v11 fix (image2 demuxer with sequential frame_%03d.png) is the current production path. **Do not change the worker protocol or the FFmpeg invocation without strong reason.**
- The user has explicitly cut soft launch from the sprint (no PWA install base to sample). V2.0 ships to 100% on deploy.

## Sprint goal

By Day 20, a user on `https://babyflipbook.dev` can:

1. See a home screen with their migrated V1 subject + add unlimited new subjects.
2. Configure and export an MP4 of any subject, with the existing v11 export quality.
3. Save the MP4 to their camera roll (via share sheet on iOS, download on desktop).
4. Share the MP4 via the platform share sheet (Instagram, WhatsApp, iMessage, Mail).
5. See a subtle watermark on free exports and a small banner ad on the home screen.
6. Buy the £1.99 "Clean exports" unlock and the £4.99 "Studio" unlock via IAP (in dev: the dev provider auto-grants).
7. Restore purchases on a new device.
8. Restore from a `.babyloop` file backup.
9. Have all V1 capabilities still work (regression-free).

The biggest single change in the sprint is the **engine boundary** (Days 1-3). Everything after builds on that.

## Operating rules

- **Read V2_DEV_SPEC.md completely before changing code.** If you find a conflict between the spec and the sprint, flag it and resolve before continuing.
- **Pass gates before commit**: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, and `npm run build` must all be clean. CI on `main` is the Vercel deploy trigger.
- **Update `DAY_BY_DAY_V2_SPRINT.md` as you work** — at the end of each day, mark the day as complete and note any deviations.
- **Don't break the V1 export path.** The v11 worker protocol (`init` / `frame` / `encode`) is the production path. The engine in V2.0 *wraps* it; the worker code does not change.
- **Watermark on main thread, not in the worker.** Draw the watermark in the engine's `drawFrame` before `canvasToPng()`. The worker just receives PNG bytes.
- **IAP behind feature flags.** `VITE_IAP_APPLE_ENABLED`, `VITE_IAP_GOOGLE_ENABLED`, `VITE_IAP_STRIPE_ENABLED` default to false. The dev provider is the only active provider in V2.0. Do not enable real IAP without explicit user sign-off.
- **Engine is plain TypeScript, no React.** All engine modules in `src/engine/` must not import React, no DOM, no platform-specific calls. React consumes the engine through `useEngine` / `useSubjects` / `useUnlock` / `useExportProgress` hooks.
- **Test on real iPhone** before claiming a Safari render issue is fixed. Use the existing `tests/e2e/iphone-export-probe.spec.mjs` and `tests/e2e/ios-fix.spec.mjs` patterns. The user has only an iPhone, not a Mac — Web Inspector is unavailable to them.
- **Bugs found outside the sprint scope**: log them in a "Discovered issues" section at the bottom of `DAY_BY_DAY_V2_SPRINT.md` and continue. Don't expand the sprint to fix them.

## Engine boundary — the most important architecture in the sprint

This is the foundation. Get it right on Days 1-3. The full interface is in `DAY_BY_DAY_V2_SPRINT.md` Part 1.2. Key things:

- `src/engine/engine.ts` — `Engine` class. Singleton. Owns subject list, unlock state, IAP provider, platform adapter, ad provider.
- `src/engine/iap/provider.ts` — `IapProvider` interface with `buy`, `restore`, `getUnlock`, `isAvailable`. Implementations: `iap/apple.ts`, `iap/google.ts`, `iap/stripe.ts`, `iap/dev.ts` (active in V2.0).
- `src/engine/platform/share.ts` — `Platform` interface. Web Share API where available; direct-button fallback where not.
- `src/engine/export/watermark.ts` — `applyWatermark(ctx, position)`. Drawn on main thread.
- `src/engine/hooks.ts` — React hooks. The only place React touches the engine.
- `src/db/migrations/v1-to-v2.ts` — one-time V1 → V2 migration. Idempotent. Tested with fake-indexeddb.

## Subject model

V1 stored one `Project`. V2 stores many `Subject`s. The user-visible label stays "Timeline" — the rename is internal. V1's data is migrated on first V2 launch:

- V1 `Project.childName` → V2 `Subject.name` (type='baby', default cadence from V1)
- V1 `Project.id` → V2 `Subject.id` (new UUID; re-link entries)
- V1 `Entry.projectId` → V2 `Entry.subjectId`
- Mark migration complete in `localStorage` so it never runs again.

The V1 `Project` type stays in `db/schema.ts` as `@deprecated`. New code uses `Subject`. The V1 name is removed in V2.5.

## Definition of done (V2.0 ships when all 12 are checked)

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

## Where to start

Day 1. Read the spec and the sprint again (skim the parts you skimmed the first time). Then implement the engine skeleton:

- `src/engine/` directory
- Type interfaces in `src/engine/state.ts`
- `Engine` class skeleton in `src/engine/engine.ts` with empty method bodies
- `useEngine` / `useSubjects` / `useUnlock` / `useExportProgress` hooks
- Wire into `App.tsx` so the app boots and renders a blank screen (engine wired but inert)

Verify: `npx tsc --noEmit` and `npm run build` pass. Commit. Move to Day 2.

## When you get stuck

- **The spec doesn't say** → add a "Discovered questions" section at the bottom of `DAY_BY_DAY_V2_SPRINT.md` and continue. Resolve in the next planning pass.
- **The V1 export breaks** → revert the offending change, write a failing test that reproduces the regression, fix forward.
- **Engine boundary feels wrong** → stop and write a 1-page design note in `docs/`. Don't refactor in flight.
- **You need a UI decision the spec doesn't cover** → pick the option that follows V1's visual style and document the choice in the changelog. Don't ask; the user is busy.
- **A bug shows up in production** → fix it as a P0 outside the sprint, log in changelog, continue. Don't expand the sprint.

## Communication

- Update `DAY_BY_DAY_V2_SPRINT.md` at the end of each day. Mark day N done with a one-line summary of what shipped.
- At Day 20, write a `V2_CHANGELOG.md` (mirror V1 changelog style) and a `V2.0_RELEASE_NOTES.md` (user-facing).
- Commit cadence: commit at the end of every day, push at the end of every week. Don't accumulate commits.

## Stop conditions

Stop and ask the user if:

- The V1 export path needs to change.
- The migration script needs to do something the spec doesn't cover.
- The pricing changes from what the spec says.
- The watermark placement / format changes from what the spec says.
- The IAP provider selection logic changes from "Apple on iOS, Google on Android, Stripe on desktop, dev in development."

Otherwise, use your judgement. The sprint is well-scoped; if you're not sure about something small, pick the option that matches the spec and move on.

Good luck. Ship it.
