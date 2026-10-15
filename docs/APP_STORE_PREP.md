# App Store Preparation — Little Loop

> Everything that must be true before the App Store / Play Store
> submission, split into **done (code-side, this sprint)** and
> **blocked on you (accounts, hardware, decisions)**.
>
> Prepared 14 October 2026 against V2.5.1 + app-store polish pass.

---

## ✅ Done — code-side (this sprint)

### UX polish (verified by walking every screen)

- **Timeline dead-end fixed** — the subject screen's empty state
  ("Your first moment starts here.") now has an **Add your first
  photo** button wired to the library picker, instead of leaving
  users stranded with no action.
- **Paywall cleaned up** — duplicate heading removed; stale "ships
  behind a feature flag until V2.5" copy replaced; the "Sign in to
  your account" restore copy corrected (Little Loop has no accounts —
  unlocks are tied to the *app store* account); Studio blurb updated
  (transitions/filters/themes are live, not "when V2.5 lands").
- **Home empty state de-duplicated** — no more "Little Loop" heading
  twice; the repeated "One photo at a time…" paragraph merged.
- **Memory-lane CTA is truthful** — now reads "Start your first
  timeline" / "Add another timeline" (it opens the subject sheet;
  before, "Add a moment" read like "add a photo" and dead-ended).
- **Settings → Defaults actually works** — Save persists to
  localStorage and the Add Subject sheet seeds from it (was a fake
  "Saved" toast).
- **Settings → About links are real** — Privacy policy, Terms of
  service open the shipped static pages; version bumped to 2.5.1.
- **Accessibility touch-ups** — subject-type tiles now expose
  readable names ("Baby — Watch them grow") to screen readers.

### Compliance assets (shipped in the build)

- `public/privacy.html` — full privacy policy, written for a
  local-only app (no data collection claims, purchases, children's
  privacy section).
- `public/terms.html` — terms of service.
- **Restore purchases** — present on home + paywall (Apple
  requirement) with honest copy.

### Health

- Gates green: `tsc --noEmit`, `eslint .`, `vitest run` (289 tests),
  `npm run build` (231 KB / 70.9 KB gzip, budget < 250 KB).

---

## 🔒 Blocked on you (cannot be done from code)

### Apple App Store

| Item | What's needed | Status |
|---|---|---|
| Apple Developer account | Reactivate ($99/yr) — enrolled org or individual | ⬜ |
| Build machine | Codemagic subscription **or** a friend's Mac with Xcode (V2.6 Phase 3 decision) | ⬜ |
| App Store Connect app entry | Bundle ID `com.littleloop.app`, name, primary language | ⬜ |
| IAP products | `com.littleloop.clean` (£1.99) + `com.littleloop.studio` (£4.99), Non-Consumable | ⬜ |
| Sandbox testing | TestFlight build + sandbox Apple ID purchase walk | ⬜ |
| Screenshots | 6.7" iPhone set (min 3); capture from the polished UI walk | ⬜ |
| Support URL | ✅ **Live** — `https://little-loop.app` (deployed 15 Oct 2026, PR #1) | ✅ |
| Privacy policy URL | ✅ **Live** — `https://little-loop.app/privacy.html` (verified 200) | ✅ |
| Age rating | Questionnaire — expect 4+ (no user content, no collection) | ⬜ |
| Export compliance | Standard encryption only (HTTPS) → answer "exempt" | ⬜ |
| Review notes | Draft below | ⬜ |

### Google Play (V2.7 per kickoff, but prep now)

| Item | What's needed | Status |
|---|---|---|
| Play Console account | $25 one-time | ⬜ |
| Signed APK/AAB | V2.6 Phase 2 builds the APK; AAB needed for Play listing | ⬜ |
| Data-safety form | Answer: "collects no data" — matches privacy policy | ⬜ |
| Content rating | IARC questionnaire — expect Everyone / PEGI 3 | ⬜ |

---

## 📝 Draft metadata (edit, then paste into the store consoles)

**App name:** Little Loop — one photo at a time

**Subtitle** (Apple, 30 chars): *Daily photos become a flipbook*

**Short description** (Play, 80 chars): *One photo a day or week. Turn them into a shareable flipbook video. Private — everything stays on your phone.*

**Description draft:**

> Little Loop helps you capture one photo per day or week and turns
> the series into a beautiful vertical flipbook video — entirely on
> your device.
>
> - **Private by design.** No accounts, no cloud, no uploads. Photos
>   stay on your phone unless you choose to export them.
> - **Any timeline.** Track a baby, a plant, a fitness journey, a
>   renovation — anything that benefits from "same time, same angle".
> - **On this day.** See moments from the same date in past years.
> - **Flipbook export.** Render a 720×1280 MP4 with dates, in your
>   choice of speed and style.
> - **Reminders.** A gentle local nudge when it's time to capture.
> - **Backup & restore.** Export a portable backup anytime.
>
> One-time unlocks, no subscriptions: **Clean exports** removes the
> watermark and the banner ad; **Studio** adds transitions, filters,
> and themes.

**Keywords** (Apple, 100 chars): `baby photo journal,daily photo,video flipbook,time lapse,photo diary,first year,growth tracker,memory keeping`

**Review notes draft:**

> Little Loop is a local-only app: no accounts, no servers, no
> analytics. To test purchases, use a sandbox Apple ID (IAP is
> Non-Consumable). The Restore purchases button is on the Unlock
> screen and the home screen. Photos are stored on-device in the
> app; the share/export flows use the standard iOS share sheet.

---

## ⚠️ Before submission — replace placeholders

1. **Support mailbox** — the app and legal pages now use
   `support@little-loop.app`. Create/forward that mailbox so mail
   reaches you before launch.
2. **Hosting** — deploy to Vercel and attach `little-loop.app`;
   store consoles then get
   `https://little-loop.app/privacy.html` (privacy) and the same
   domain for the support URL.
3. **Prices** — paywall shows `£1.99 / £4.99` hard-coded
   (`PaywallScreen.tsx`). **Base currency is GBP** (decided 14 Oct
   2026) — the paywall already matches. Stores auto-localize IAP
   prices from the tier you pick; confirm the hard-coded display
   prices match your final store tiers, or move to store-provided
   price strings when the real providers land (V2.6 Phase 3).
4. **Domain + support email** — ✅ **Resolved 14 Oct 2026:
   `little-loop.app` claimed free (year one) via Vercel Pro**; the
   un-hyphenated `littleloop.app` belongs to a third party and is
   unused by us. The app now points at `support@little-loop.app`
   (`V2SettingsScreen.tsx`, `public/privacy.html`,
   `public/terms.html`). Remaining: create that mailbox (or forward
   it somewhere you read), deploy the site to Vercel, and use
   **`https://little-loop.app/privacy.html`** as the privacy policy
   URL in both store consoles.
5. **Bundle ID** — ✅ **Decided 14 Oct 2026: `app.little-loop.littleloop`**
   (anchored to the claimed domain; replaces the kickoff's
   `com.littleloop.app`, which leaned on the third-party domain).
   Not referenced in code yet — set it when the Capacitor scaffold
   lands (V2.6 Phase 2).

---

## Verification approach for review

The "sprint-surface-verify" rule applies: after any further change,
walk the live UI as a user — first run → create timeline → add photo
→ see it on the timeline → export sheet → paywall → settings — and
confirm every shipped feature is reachable from a button.
`../audit/ux-walk.mjs` (workspace) automates exactly this walk with
screenshots; re-run it after changes.
