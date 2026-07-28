# Little Loop: V2 Development Spec

## 1. Product definition

A local-first, installable phone web app that lets anyone capture or import **one photo at a regular cadence** (daily or weekly), align each new shot to the previous one with an onion-skin overlay, store the result privately on the device, and export the timeline as a short MP4 with optional transitions, filters, and themes.

V1 framed this as a baby-tracker. V2 widens the use case to anything that benefits from "one photo at the same time, same angle, every day/week" — recovery progress, fitness cuts, plant growth, renovation, drawing practice, aging parents, aging pets. The data model is project-agnostic; only the copy, iconography, and onboarding copy change.

### Core promise

> One photo at a time. Watch anything grow.

### V1 → V2 evolution

- V1: "Watch your child grow" — baby-specific, one project, free, no sharing.
- V2: "One photo at a time" — any subject, unlimited subjects, share to camera roll, optional paid unlocks, no cloud, no auth.

V3 (separate spec, not in this document): wrap the V2 PWA in a Capacitor shell, ship to Google Play Store, add IAP for paid unlocks, and a follow-on App Store submission.

## 2. V2 goals

V2 must:

- Inherit every V1 capability without regression.
- Generalise the project concept from "child" to "subject" without forcing a rename of user data.
- Support **unlimited subjects** (one or more per device, no account).
- Generate downloadable MP4s that the user can save to their **camera roll / Photos** and share via the platform share sheet (WhatsApp, Instagram, iMessage, Mail).
- Add a **subtle watermark** to free exports and a small banner ad on the home screen. The £1.99 unlock removes both.
- Add **transitions, filters, and themes** to MP4 export. The £4.99 unlock enables all of them.
- Process all in-app purchases as **lifetime, one-off unlocks**. No subscriptions, ever.
- Continue to require no backend, no authentication, and no cloud sync.
- Remain installable as a PWA, deployable as a web bundle, and architecturally ready for the V3 native shell.

## 3. Explicitly out of scope for V2

Do not build these in V2:

- User accounts or login walls.
- Cloud sync (iCloud, Google Drive, Dropbox, custom backend).
- Push notifications (local notifications only; defer until V2.5).
- Social feeds, public sharing pages, comments, family collaboration.
- AI captions, facial recognition, body composition analysis, growth charts.
- Music licensing or audio in the MP4 (audio requires rights clearance and increases file size substantially; defer until V3 or later).
- Subscription billing of any kind.
- In-app photo editing beyond crop and orientation fix.
- Cross-device handoff (handoff between iPhone and iPad, for example).
- Web Bluetooth or external sensor integrations.
- Analytics platforms (no Firebase, no Mixpanel, no PostHog).
- Server-side rendering or a server runtime.
- A web-only "team" or "shared subject" model.
- Any feature that requires a stable user identity to work.

## 4. Pricing model

V2 introduces two paid unlocks. Both are **lifetime, one-off, in-app purchases** processed by Apple App Store / Google Play Store IAP. There are no subscriptions, no trials, no paywalls before value, and no nag screens.

| Unlock | Price | What you get |
|---|---|---|
| Free | £0 | Unlimited subjects, unlimited local storage, all export lengths, watermark on every export, banner ad on home screen. |
| Clean exports | **£1.99** lifetime | No banner ad. No watermark. Same export paths and lengths. |
| Studio | **£4.99** lifetime | Everything in Clean exports, plus all transitions, all filters, all themes. |

A user with Studio unlock sees a "Studio" badge in the export screen; otherwise the upgrade prompts are silent. Once a user has paid, the app never asks again.

### Pricing principles

- **No subscription, ever.** Subscriptions work for SaaS that delivers ongoing value. The MP4 is a one-shot artifact; the user is done with us once they have it. Charging forever to use a thing they've already used is hostile to the audience we're serving.
- **No trial, no countdown, no nag.** No "you have 2 exports left this week." No "your free trial is ending in 3 days." No upgrade interstitial after every action. The user pays or doesn't; the app never pressures them.
- **Free first, paid second.** The first 3 MP4s are always free with no friction. The user must feel the magic before any money is mentioned.
- **Watermark is a signature, not an ad.** It is a small mark, bottom-right, low opacity, that says "made with little-loop" or shows a small ⌐ icon. It is not a sales pitch. It is not a logo with a tagline. The £1.99 unlock removes it.

### Expected distribution

These are rough targets for unit-economics planning, not commitments:

- 95%+ of users stay on free.
- Of paying users, ~70% buy £1.99 only, ~30% buy £4.99.
- Of total revenue, ~50% comes from £1.99, ~50% from £4.99.

## 5. Positioning and framing

V1's positioning was baby-specific: "Watch your child grow." V2's positioning is general but keeps the parent-of-baby use case as the lead example.

### Framing change

- The product is still called **Little Loop**.
- The product is described as: *"One photo at a time. Watch anything grow."*
- The default onboarding flow uses a baby as the example subject, with a "different subject" option surfaced immediately for users who are tracking a plant, a workout, a renovation, etc.
- The internal data type for a tracked entity is called a **Subject** (V1 called it a `Project`). The user-visible label is **Timeline** (V1 used the same word). The renaming is internal; existing user data migrates without UI prompts.

### Where the framing shows up

- App store description: lead with the general framing, follow with 3-4 example use cases (baby, plant, fitness, recovery), baby photos still used as the hero.
- Marketing landing page (separate concern, not in this spec): same structure.
- In-app onboarding: ask "What are you tracking?" with a small set of suggested subjects; user can name the subject freely.
- Settings screen: subject type is shown but is editable; the user can re-classify a subject at any time.
- Share text: the export filename and any share intent text default to the subject's name ("Mia's 2026"). The user can override per-export.

## 6. Subject model (formerly "Project")

### Data model

A Subject has:

- `id` (UUID)
- `name` (free text, 1-60 chars)
- `type` (one of: `baby`, `plant`, `fitness`, `recovery`, `home`, `creative`, `pet`, `other`)
- `cadence` (`daily` | `weekly`)
- `referenceImageBlobId` (optional; the "template" image used for onion-skin on the very first photo of the subject)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)
- `sortIndex` (integer; user-controlled ordering on home screen)

Subjects are stored in IndexedDB. There is no per-device cap. There is no per-account cap (because there is no account).

### Migration from V1

V1 stored one `Project` per device. V2 reads any existing V1 `Project` and re-presents it as a `Subject` of type `baby` (the default). The user can change the type in settings at any time. No data is lost.

### Home screen

The home screen shows subjects in `sortIndex` order. Each tile shows:

- A live preview thumbnail (most recent entry's image)
- The subject name
- The cadence ("daily" / "weekly")
- The entry count
- A small badge for paid unlocks the subject has used (none today, "Studio" if a transition is applied to the most recent export, etc.)

The home screen also has a primary "+ Add subject" button. Tapping it opens a sheet that asks for name, type, and cadence.

## 7. Capture flow (extended)

V2's capture flow inherits V1's and adds:

- **Onion-skin overlay against the previous entry** (for daily cadence) or **last week's entry** (for weekly cadence). If there is no previous entry, the optional `referenceImageBlobId` is used as the alignment template.
- **Auto-crop face** is a paid feature (Studio unlock, §11).
- **EXIF-based date detection** — when importing from camera roll, the capture's EXIF date is offered as the default entry date. The user can override. If EXIF is missing, fall back to today.
- **Burst capture** (3-5 rapid shots) is a paid feature (Studio unlock).
- **Front/back camera switch** is a free feature.
- **Live Photo / short-video import** is out of scope for V2.

The capture flow is always free to use. Watermark and ads are display concerns, not flow concerns.

## 8. Timeline

The timeline view is largely unchanged from V1. V2 changes:

- It displays subjects as separate timelines. Switching subjects is a top-level navigation choice (home → subject).
- The "share this moment" affordance lives in the timeline (long-press a photo → share intent).
- The "add note" affordance lives in the timeline. Notes are free-form text, up to 280 chars, optional, one per entry. Notes are free.

## 9. Export and share

V2's export path is the heart of the product. The user has produced a subject; now they want a deliverable.

### Export flow

1. User taps "Export" on the home screen or in a subject's timeline.
2. App shows the export sheet:
   - Date range (default: all entries; alternatives: this month, custom range).
   - Speed (default: fast at 0.25s per frame; alternatives: standard 0.5s, slow 0.8s).
   - Style (visible only with Studio unlock; otherwise locked). Lists available transitions, filters, and themes. Default: clean cut.
   - Aspect ratio: 9:16 (default; the only option in V2).
   - "Show date on each frame" toggle (default on).
3. User taps "Export."
4. App shows progress. When complete, presents the result with:
   - Inline video player.
   - "Save to Photos" (camera roll).
   - "Share" (platform share sheet).
   - "Save backup" (`.babyflip` file).
   - "Save to Files" (any folder via the platform file picker).

### Share targets

The platform share sheet (Web Share API) handles the actual selection. V2 ensures the export is a real `File` object (not a blob URL) so Instagram, WhatsApp, and Mail all accept it. If the platform share sheet is unavailable, V2 falls back to direct buttons: "Open in WhatsApp", "Open in Instagram", "Email to self", "Save to Files".

### Watermark behaviour

The watermark is a small mark applied to the bottom-right corner of each frame during PNG export on the main thread. It is:

- 12pt text reading "made with little-loop" with a tiny ⌐ icon, or just the ⌐ icon.
- White text, 30% opacity, 1px black shadow for legibility on light photos.
- Always present on the free tier. Removed entirely on Clean or Studio.

The watermark is **not configurable** by the user. The unlock is the only way to remove it. We do not offer a "smaller watermark" tier; that would be a complexity we don't need.

### MP4 file naming

- Default: `<subject-name>-<YYYY-MM-DD>.mp4` (e.g. `Mia-2026-07-27.mp4`).
- Sanitised for filesystem safety (`/` removed, etc.).
- User can override per export in the export sheet.

## 10. Pricing unlocks in detail

### £1.99 — Clean exports

Unlocks:
- No banner ad on the home screen.
- No watermark on MP4 exports.
- The "Studio" badge never appears (it requires Studio).

Does NOT unlock:
- Transitions (still hard cut).
- Filters (still none).
- Themes (still none).

A user with Clean exports but not Studio sees the Style section of the export sheet greyed out, with a "Get Studio for transitions" prompt. The prompt is a one-time per-session message; the user is not nagged repeatedly.

### £4.99 — Studio

Unlocks everything in Clean exports, plus:

- **Transitions** (applied between consecutive photos): clean-cut, crossfade, slide-left, slide-up, flip-3D, zoom-in.
- **Filters** (applied per frame): none, warm, cool, BW, sepia, vignette, soft-focus, slight-grain.
- **Themes** (pre-coordinated combinations): "Vintage" (sepia + grain + crossfade), "Studio" (BW + clean cut), "Memory" (soft-focus + slow zoom), and 1-2 more.
- **Auto-crop face** in the capture flow.
- **Burst capture** in the capture flow.

The first export with any paid feature shows a small, dismissable "Welcome to Studio" toast. No further upsells. No "you might also like." No streak counters. The user paid; the app respects that.

## 11. Transitions, filters, and themes — implementation

The creative processing happens entirely in the FFmpeg invocation. No new client-side image processing. The orchestrator builds an FFmpeg command like:

```
ffmpeg -framerate 30 -i frame_%03d.png \
  -vf "scale=720:1280,fade=in:0:30,fade=out:30:30" \
  -r 30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an out.mp4
```

### Transitions

Implemented as `-vf` filter chains. Each transition is a `xfade` or `fade` filter that applies to a specific segment of frames. The orchestrator pre-computes the filter graph per export based on the user's selections.

Initial transition set:
- **Clean cut** — no filter.
- **Crossfade** — 0.4s `xfade=transition=fade:duration=0.4`.
- **Slide-left** — `xfade=transition=slideleft`.
- **Slide-up** — `xfade=transition=slideup`.
- **Flip-3D** — `xfade=transition=hlslice` (a 3D-ish flip).
- **Zoom-in** — `zoompan` per-frame on the transition segments.

### Filters

Applied to every frame via a single `-vf`:
- **None** — no filter.
- **Warm** — `colortemperature=6500`.
- **Cool** — `colortemperature=4500`.
- **BW** — `hue=s=0`.
- **Sepia** — `colorchannelmixer` matrix.
- **Vignette** — `vignette`.
- **Soft-focus** — `boxblur=1:1` (very subtle).
- **Slight-grain** — `noise=alls=5:allf=t+u`.

### Themes

A theme is a preset triple: `(transition, filter, default-speed)`. The user picks a theme; the orchestrator applies the triple. Custom mixing (e.g., "BW with crossfade") is available under Studio.

Initial theme set:
- **Vintage** — sepia + slight-grain + crossfade, 0.5s.
- **Studio** — BW + clean-cut, 0.4s.
- **Memory** — soft-focus + zoom-in, 0.6s.
- **Pop** — cool + slide-left, 0.4s.

### Implementation cost

The FFmpeg arg construction is one or two days of work. The user-facing UI for selecting transitions/filters/themes is a third day. The IAP wiring is a fourth day.

## 12. IAP implementation

V2 ships IAP on:

- Apple App Store (in-app purchase consumable or non-consumable, App Store small-business program eligible).
- Google Play Store (in-app product, non-consumable).
- Web (Stripe Checkout, for users who want to pay without installing).

The non-consumable IAP is the right type: a one-time purchase that unlocks features forever on the device that purchased it.

### Receipt validation

V2 validates receipts locally. The un-lock state is stored in IndexedDB. There is no server. Receipt validation is:

- Apple: validate the JWS signature against the App Store receipt.
- Google: validate the purchase token against the Play Developer API on the user's device (the API call goes from device to Google; we never see it).
- Web: rely on Stripe's hosted checkout, store a signed token in localStorage, verify on subsequent loads.

Receipt validation is the single biggest security concern in V2. It is the difference between "the unlock works" and "the user can change their device clock to bypass the unlock." Standard patterns: store the unlock state in IndexedDB keyed by a stable device fingerprint, require re-verification every 30 days against the receipt, and accept a one-time restore if the user re-installs. See V2 implementation notes for the exact pattern.

### Restore purchases

The user can restore their purchases by tapping "Restore purchases" in Settings. This re-validates any receipt and re-applies the unlock. Restore is free, no friction, no support form. It is reachable from the home screen and from the export sheet.

## 13. Backup and portability

V2 retains V1's `.babyflip` ZIP backup. V2 adds:

- **`.babyloop` is the new file extension** for V2 backups. (V1 was `.babyflip`; V2 reads both, writes `.babyloop`.) The MIME type is `application/zip`.
- **Export to Files** — the user can drop the backup into any folder via the platform file picker.
- **AirDrop on iOS** — `.babyloop` is registered as a known file type for AirDrop.
- **Multiple subjects in one backup** — V1 was one-project-per-backup. V2 backs up all subjects in one ZIP.

Restore is local. There is no cloud destination. The user's backup strategy is whatever they choose: email to self, save to iCloud Drive, AirDrop to laptop, save to a USB stick.

## 14. PWA → V3 prep

V2 keeps the V1 PWA architecture but introduces the abstractions V3 needs:

- **Engine boundary** — renderer, storage, project manager, IAP, paywall, share, watermark. Each is a self-contained module that can be swapped or driven from a native shell.
- **Build pipeline** — `npm run build` emits a web bundle. The same bundle is the input to a V3 Capacitor shell.
- **IAP abstraction** — `iap.buy(clean)` and `iap.buy(studio)`. The web implementation uses Stripe; the V3 native implementation uses Apple/Google IAP. The interface is identical.
- **Camera abstraction** — V2 uses the browser's `getUserMedia` and `<input type="file" capture>`. V3 wraps these in a Capacitor Camera plugin. Same interface.
- **File-system abstraction** — V2 uses the File System Access API where available, falling back to `<a download>`. V3 uses Capacitor Filesystem. Same interface.

V2 must not introduce any web-only path that would not work in a WKWebView. Specifically: do not depend on `getUserMedia` from the home screen widget, do not assume IndexedDB quota of more than 50MB, do not use `window.open` for share (use the Web Share API).

## 15. Ads

V2 ships with a single ad placement: a small banner ad at the bottom of the home screen, only when no subject is selected. The ad does not appear on the export sheet, the capture flow, or any in-progress view. The ad does not appear once the user has bought Clean or Studio.

The ad is implemented as an HTML element with a fixed ad slot. V2 will integrate with one ad network. The choice of network is an implementation detail deferred to the build phase; the constraints are:

- Self-hosted-friendly (no third-party JS that breaks offline).
- Frequency-capped (no more than one impression per 30 minutes per user).
- Settles within the App Store / Play Store advertising policies (no tracking that requires consent if the app targets children, which baby-tracking apps may under COPPA — defer the COPPA determination to the V3 store-listing process).

If banner ads become a UX problem (negative reviews citing the ad), drop them entirely. The £1.99 unlock is more valuable than a year of banner-ad revenue from a small user base.

## 16. Onboarding

V2's onboarding:

- First launch: a single screen that says "One photo at a time. Watch anything grow." with one button: "Get started."
- Second screen: "What are you tracking?" with a small grid of suggested subject types (baby, plant, fitness, recovery, home, creative, pet, other) and a free-text name field.
- Third screen: "How often?" — daily or weekly.
- Fourth screen: a camera-ready view with the onion-skin or reference image visible.
- Fifth screen: confirmation and the home screen.

No permissions are requested before the user is on a screen where they make sense. The first permission request is the camera, on the camera-ready screen, immediately before capture. The Photos permission is requested on the first library import.

## 17. Localisation and accessibility

V2 is shipped in English only. We will revisit localisation after V3. V2's accessibility targets:

- All interactive elements have minimum 44×44 pt touch targets.
- All controls are reachable by VoiceOver / TalkBack.
- The export flow works with the screen reader active.
- The ad placement does not overlap any interactive element.
- Colour contrast on all text is WCAG AA or better.

## 18. Phase breakdown

V2 is a single V2 release, but it is internally phased for engineering and shipping:

### V2.0 — Monetisation + share (the smallest shippable V2)

- Generalise the project model to "Subject" with unlimited count.
- Implement the £1.99 and £4.99 unlocks via IAP.
- Add watermark (free tier only) and banner ad.
- Implement the export-sheet flow with camera roll save, platform share, and `.babyloop` backup.
- Implement the home screen with subject tiles and sort.
- Migrate V1 `Project` data to V2 `Subject` on first launch.
- Test the entire V1 surface for regressions.
- Soft launch to 10% of PWA users for 1 week; full launch.

**Scope estimate: 3-4 weeks of focused engineering.**

### V2.5 — Engagement and creative processing

- Daily/weekly local notifications (permission asked once on first use, not in onboarding).
- Auto-crop face (Studio unlock, uses on-device model).
- Burst capture (Studio unlock).
- Onion-skin overlay against the previous entry.
- Per-entry notes.
- Transitions, filters, themes (the Studio creative content).
- EXIF-based date detection on library import.
- "On this day" memory lane on the home screen.

**Scope estimate: 4-5 weeks.**

### V2.6 — V3 prep

- Extract the engine-boundary module boundaries.
- Test the entire app inside a Capacitor shell (iOS first, Android second).
- IAP validation across all three platforms.
- App icon, splash screen, store assets.
- Privacy policy and terms of service.
- V3 store submission preparation.

**Scope estimate: 3-4 weeks.**

## 19. Success metrics

V2 is successful if, six months after full launch:

- 100,000+ monthly active subjects in PWA install base.
- 2-3% paying users across both tiers.
- Average revenue per user (ARPU) is at least $0.10.
- 4.5+ star rating on the App Store (V3) and 4.0+ on the Play Store.
- < 0.5% refund rate on paid unlocks.
- 80%+ of exports are completed (not abandoned at the share sheet).
- The home screen "share to WhatsApp / Instagram" button is the second-most-tapped element after the capture button.

## 20. Risks and mitigations

| Risk | Mitigation |
|---|---|
| App Store rejects the app for "subscription fatigue" or "misleading free trial" framing. | We have no subscriptions, no trials, no countdown, no nag. We document this clearly in the App Store review notes. |
| Users abuse the £1.99 refund window. | The price is small enough that abuse is bounded. Per-device unlock, not per-account, means refunds are processed by the store and the user keeps the unlock on the device. |
| The watermark is intrusive enough to draw negative reviews. | The watermark is small, low-opacity, signature-style. If reviews cite it, remove it from the free tier entirely and rely on the banner ad. |
| FFmpeg.wasm regressions on new browser versions. | The same `image2`-with-glob workaround that ships in v11 is the production-tested path. The Capacitor shell in V3 has a single WebView version, which makes regressions far less likely. |
| Unlimited subjects are abused for storage abuse. | IndexedDB quota is per-origin; on iOS this is ~1GB. We monitor storage usage and warn the user at 80% full. We do not silently cap. |
| Cloud sync is a constant feature request. | We have a public position: "no cloud, by design, your data is your data." This is a feature, not a gap. The V2 landing page makes this clear. |
| A competitor copies the product. | The local-only / no-cloud / no-auth / no-subscription positioning is a moat. We move fast and ship creative features (themes) faster than a large competitor would. |

## 21. Day-by-day implementation rhythm

V2 is a 10-14 week project. The day-by-day dev sprint document is created at the start of V2.0 with the same granularity as `DAY_BY_DAY_DEV_SPRINT.md` for V1.

## 22. Open questions for the V2 spec

The following questions need answers before V2.0 starts:

1. **Ad network choice.** AdMob vs. house ads vs. none. Deferred to implementation; default is "house ad placeholder" if no network choice is made.
2. **Watermark icon vs. text.** A tiny ⌐ monogram, or the literal text "made with little-loop"? Default: icon-only, text fallback for accessibility.
3. **Pricing in non-USD markets.** £1.99 is the UK anchor. €1.99 / $1.99 / ¥300 / ₹99 are all candidates. Default: same numeric price in user's local currency, rounded to a "nice" number.
4. **Subject type list.** The eight default types (baby, plant, fitness, recovery, home, creative, pet, other) — final list? Default: yes, defer to user feedback in V2.5.
5. **How to handle a user who wants to delete a subject.** Free, irreversible, with a "this is permanent" confirmation. The user can re-create the subject at any time. We do not keep backups of deleted subjects. (We keep backups of the user's other subjects.)
6. **"Welcome to Studio" toast placement.** On the export sheet, or on the home screen? Default: home screen, shown once, dismissable, never shown again.

## 23. V1/V2 spec change log

- V1 (existing): "Watch your child grow." Baby-specific. Single project. Free. No sharing.
- V2 (this document): "One photo at a time. Watch anything grow." Subject-agnostic. Unlimited subjects. Camera roll save and share. Paid unlocks. No cloud, no auth, no subscription.

---

*End of V2 spec.*
