# V2.6 — Stripe + Capacitor + Native IAP

> Turn the V2 PWA into a shippable product. Stripe Checkout unlocks web revenue. Capacitor + native IAP unlocks App Store / Play Store presence.
>
> V2.0 / V2.5 finished the engine surface. V2.6 finishes the money path.

---

## Operating rules (inherited)

- **Pass gates before commit**: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build` all clean.
- **Don't break V2.5.1**: all 289 tests stay green. V2 home / subject / export / memory lane / reminders all unchanged.
- **Engine boundary stays clean**: no React in `src/engine/`. The new Stripe provider lives in `src/engine/iap/stripe.ts` per the existing pattern.
- **Stop conditions**: ask if the spec conflicts with a V2 plan item, if a Stripe / Capacitor dependency blocks a phase, if an Apple or Google API contract is unclear, or if any V2.5.1 test regresses. Otherwise, ship through.

## User constraints (Q1, Q2)

- Q1 = C (Stripe first, then Capacitor + Apple, then Android follows in V2.7 once console ready). User elected to **build the Android APK in V2.6 even without the Play Store console** — sideload the APK + ship the console later.
- Q2 = no Mac, no Apple dev account yet (re-activatable), no Play Console, **yes Stripe account**, Apple path deferred (Codemagic or Xcode-on-a-friend's-Mac — decide when we get there).

## Stripe in the engine

The architecture from V2.0 is already in place:

- `src/engine/iap/provider.ts` defines `IapProvider` (`isAvailable` / `buy` / `restore` / `getUnlock`).
- `src/engine/iap/apple.ts`, `google.ts`, `stripe.ts` are stubs that return `isAvailable() === false`.
- `src/engine/iap/dev.ts` is the V2.0 / V2.5 working default.
- `src/engine/iap/state.ts` has `recordPurchase` / `loadEffectiveUnlock` / `revalidate` — the persistence layer.
- `src/engine/providers.ts::createIapProvider` selects Apple/Google/Stripe/Dev via `VITE_IAP_*` feature flags.

V2.6 wires Stripe for real. Apple + Google are still stubs (their real implementations land in Phase 3 for Apple, V2.7 for Google).

---

## Phase 1 — Stripe Checkout on web (Days 1-5)

**Goal**: a web user can click "Buy" in the V2 paywall, complete Stripe Checkout, return to a success page, and have the unlock persisted in IDB. The dev provider stays as the test / dev path.

**Architecture**: Stripe-hosted Checkout (redirect). User clicks Buy → leave to `checkout.stripe.com` → return to `/billing/success?session_id=...` → success page POSTs the session_id to `/api/stripe/verify` → that endpoint looks up the session on Stripe → writes the unlock to IDB → redirects to the V2 home. The webhook at `/api/stripe/webhook` is the source of truth (handles `checkout.session.completed` and `charge.refunded`).

### Day 1 — Stripe dashboard + price products

- Create two products in Stripe dashboard: `Little Loop Clean` ($1.99) and `Little Loop Studio` ($4.99), both non-consumable one-time.
- Save the price IDs as `STRIPE_CLEAN_PRICE_ID` and `STRIPE_STUDIO_PRICE_ID` in Vercel env (no GitHub commit).
- Note: Stripe requires live mode + test mode toggles. V2.6 ships test mode first; live mode is a flag flip.

### Day 2 — Vercel Edge Function: `POST /api/stripe/checkout`

- New file: `api/stripe/checkout.ts` (Vercel Edge Function).
- Body: `{ product: "clean" | "studio" }`.
- Looks up the price ID, calls `stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price, quantity: 1 }], success_url, cancel_url, metadata: { product, deviceFingerprint } })`.
- Returns `{ url: session.url }`.
- The success URL is the SPA's `/billing/success` route; the cancel URL is the V2 paywall.
- Metadata carries the device fingerprint + product so the success page can verify without a server-side round trip.

### Day 3 — Vercel Edge Function: `POST /api/stripe/webhook` + `POST /api/stripe/verify`

- `api/stripe/webhook.ts`: handles `checkout.session.completed` (writes unlock to IDB-equivalent — we don't have server-side IDB, so the webhook writes to a small Postgres table on Vercel Postgres / Neon that maps `(session_id, product, deviceFingerprint, purchased_at)`). Handles `charge.refunded` (deletes the row).
- `api/stripe/verify.ts`: body `{ session_id, deviceFingerprint }`. Looks up the webhook-stored row. If found, returns the product + a signed token. The success page then writes the unlock via `recordPurchase({ platform: "stripe", product, token })` (a new `stripe` platform in `StoredUnlock`).
- New `StripeReceipt` type or a new platform literal — we extend `StoredUnlock["platform"]` from `"apple" | "google" | "stripe"` to keep the V2.0 contract but allow Stripe to land.
- **Webhook signature verification**: the webhook reads the `Stripe-Signature` header and verifies with `stripe.webhooks.constructEvent`. Reject 400 on signature mismatch.

### Day 4 — V2 `StripeIapProvider` implementation

- Replace `src/engine/iap/stripe.ts` stub with a real implementation.
- `isAvailable()` returns `true` (always, on the web; the `VITE_IAP_STRIPE_ENABLED` feature flag gates the build).
- `buy(product)`: POSTs to `/api/stripe/checkout` with the product + the device fingerprint; on success, redirects the window to the returned URL. On redirect-back, calls `restore()`.
- `restore()`: POSTs to `/api/stripe/verify` with every stored Stripe token (we have a `StripeRestoreRequest` helper that lists tokens from `localStorage`); picks the highest tier; calls `recordPurchase` for any new ones. Falls back to `"free"` if nothing matches.
- `getUnlock()`: read from the IDB unlocks table (already done by `loadEffectiveUnlock`).
- New helper: `src/lib/stripe-fingerprint.ts` that hashes `(userAgent + screen + tz + product)` to a stable per-device id; sent with every request.

### Day 5 — Wire the V2 paywall to the new provider

- The V2 paywall (`PaywallScreen.tsx`) already renders a "Buy" button per product and calls `engine.iapBuy(product)`. No UX change needed — the new provider implements the same interface.
- Add a "Pay with Stripe" hint chip when the Stripe provider is active (small text under the Buy button).
- Add a `/billing/success` route in the V2 router. The success page reads `?session_id=...` and `?product=...`, calls `engine.iapRestore()`, and renders "Welcome to Studio" / "Welcome to Clean" before redirecting home.
- Add a `/billing/cancel` route. Renders "Checkout cancelled" and bounces to the V2 home.

**Phase 1 Definition of Done**:
- A web user can click "Buy Clean" / "Buy Studio" in the V2 paywall, complete Stripe Checkout in test mode, return to the app, and have the unlock visible in the home screen (no watermark, ad-free, etc.).
- Stripe webhook signature verified. Refund in Stripe dashboard removes the unlock within 30s.
- 290+ tests pass. New `tests/integration/stripe-checkout.test.ts` covers the provider's `buy` / `restore` / `getUnlock` paths against a mocked Stripe response.

---

## Phase 2 — Capacitor + Android + Stripe on native (Days 6-15)

**Goal**: a real Android APK that sideloads. Stripe on the native build uses the **Capacitor Stripe plugin** (or the system browser for the redirect) — same checkout flow, no Apple/Google IAP.

### Day 6 — Capacitor scaffold

- New dep: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`.
- New file: `capacitor.config.ts` at the project root. `appId: "com.littleloop.app"`, `appName: "Little Loop"`, `webDir: "dist"`, `server.url: "https://babyflipbook.dev"`.
- New npm scripts: `cap:sync`, `cap:open:android`.
- Add `android/` to `.gitignore` (Capacitor generates it; we don't want to commit build artefacts).

### Day 7 — Capacitor config + Android manifest

- `capacitor.config.ts` — add `plugins.StripeBrowser` config: `scheme: "little-loop-stripe"`. (Or pick whatever the Stripe SDK recommends for native.)
- `npx cap add android` — generates the Android project.
- Edit `android/app/build.gradle`: bump `minSdkVersion` to 24 (Stripe's minimum), `targetSdkVersion` to 34.
- Edit `android/app/src/main/AndroidManifest.xml`: deep-link intent filter for the `little-loop-stripe://` scheme (so the redirect-back from Stripe lands in our app, not the system browser).
- Add a `network_security_config.xml` to allow cleartext traffic to `localhost` only (Vercel preview URLs in dev).

### Day 8 — Build APK locally

- `npm run build` → `npx cap sync android` → `cd android && ./gradlew assembleDebug`.
- Verify the APK installs on an emulator (`emulator -avd Pixel_7_API_34`).
- Verify the V2 PWA loads inside the WebView at the configured server URL.
- Document the build path in `docs/capacitor-build.md` (new file, ~30 lines).

### Day 9-10 — Stripe on the native shell

- The Stripe redirect flow is identical to web. On the native build, we use **`@capacitor-community/stripe`** — an in-app webview that hosts the Stripe Checkout session without leaving the app.
- Add the plugin via `npm i @capacitor-community/stripe`. Configure the plugin in `capacitor.config.ts` with the publishable key + the deep-link scheme.
- The success URL deep-links back into the app (`little-loop-stripe://success?session_id=...`) and the cancel URL goes to the V2 paywall.
- **Why in-app webview (option B) over system browser (option A)**: keeps the user in the app throughout checkout. Industry-typical conversion uplift is +5-15% on embedded vs external browser for paid mobile IAP. User picked option B on the V2.6 planning call.

### Day 11-12 — Android emulator test pass

- The user has no Android device, so we test via emulator. Spin up an Android Studio AVD with API 34, install the debug APK, walk:
  - Sign-up / first subject creation.
  - Add photo via the library picker.
  - Memory lane appears (empty state with the + Add a moment CTA from the V2.5.1 redesign).
  - Tap Paywall → Buy Studio → Stripe redirect (in custom tabs) → test card 4242 4242 4242 4242 → success → unlock visible.
  - Restart app → unlock persists.
  - Notifications card → enable reminders (browser fallback because Android Chrome doesn't have Notification permission in PWA mode).
  - Export → MP4 rendered.
- Document the test results in `docs/v2.6-android-test.md`.

### Day 13-15 — APK signing + Play Store prep (but no console yet)

- Generate a release keystore. Store the password in Vercel env (never commit).
- `./gradlew assembleRelease` produces a signed APK.
- The user (later) can upload this APK to the Play Store console when ready. V2.6 doesn't ship to Play — the user will do that as a follow-up.
- Wire the Vercel project to **build the APK on every commit to main** (Vercel doesn't build Android natively — use GitHub Actions or skip the CI for V2.6 and document the manual build path).
- Update `README.md` with the Android build path.

**Phase 2 Definition of Done**:
- A signed APK builds from this PC.
- The APK installs on an Android emulator and runs the V2 PWA.
- Stripe Checkout works end to end on the Android build (with deep-link return).
- 295+ tests pass. New `tests/integration/capacitor-config.test.ts` pins the build configuration.
- `docs/capacitor-build.md` documents the build path so you (or a friend) can rebuild later.

---

## Phase 3 — Capacitor + Apple IAP via Codemagic (Days 16-25) — *deferred*

**Status**: deferred until we get there. The user explicitly chose to defer the Apple / Codemagic decision on the V2.6 planning call — there's a real chance the path becomes "borrow a Mac and use Xcode directly" rather than Codemagic. We don't need to decide now. The phase will be re-planned when Phase 2 closes.

When we get here, the prerequisites are:

### Day 16-17 — Apple Developer + App Store Connect setup

- User reactivates the Apple Developer account.
- Create the App Store Connect app entry: `Little Loop`, bundle ID `com.littleloop.app`, primary language English.
- Create the IAP products in App Store Connect: `com.littleloop.clean` ($1.99) and `com.littleloop.studio` ($4.99), type "Non-Consumable".
- Note: Apple IAP price tiers are fixed. $1.99 = Tier 2, $4.99 = Tier 5. App Store Connect enforces this; no code work.

### Day 18 — Codemagic + signing

- New file: `codemagic.yaml` at the project root.
- Define the iOS workflow: checkout → `npm ci` → `npm run build` → `npx cap sync ios` → `xcodebuild` (Codemagic's macOS runner has Xcode pre-installed) → archive → export → upload to App Store Connect.
- Certs: P12 + provisioning profile stored as Codemagic env vars (uploaded once via the Codemagic UI, never in Git).
- Test: trigger a build from the Codemagic UI. The first build is the slowest (Xcode download, signing cert verification). Subsequent builds are minutes.

### Day 19-20 — `AppleIapProvider` implementation

- Replace `src/engine/iap/apple.ts` stub with a real implementation.
- Use `@capacitor-community/in-app-purchases` (or the official `@capawesome/capacitor-in-app-purchases`) plugin. The plugin exposes StoreKit 2 to the JS layer.
- `isAvailable()` returns `true` when running on iOS native (the Capacitor build), `false` on web.
- `buy(product)`: calls `InAppPurchases.purchaseProduct({ productId: "com.littleloop.clean" })`. On success, posts the receipt to `/api/apple/verify` (Vercel Edge Function — verifies the JWS with App Store, persists the unlock to the same Postgres table Stripe uses, returns a signed token). The JS layer then calls `recordPurchase` with `platform: "apple"`.
- `restore()`: calls `InAppPurchases.restorePurchases()`, posts each receipt to verify, picks the highest tier.
- `getUnlock()`: standard IDB path.

### Day 21-22 — `POST /api/apple/verify`

- Vercel Edge Function: takes the JWS receipt from the client, calls App Store Server API (`api.appstoreconnect.apple.com/v1/transactions`), verifies the JWS with Apple's public cert, persists the unlocked-product + transaction id to Postgres.
- Same Postgres table as Stripe — one `purchases` table with `(platform, transaction_id, product, device_fingerprint, purchased_at)`. The V2.6 schema migration adds the `purchases` table.
- New dep: `appstore-server-sdk` (or just `node:crypto` to verify the JWS).

### Day 23 — Codemagic → TestFlight

- First build on Codemagic uploads to TestFlight. The user installs via the TestFlight iOS app.
- Test on the iPhone: same walk as Android — sign up, capture, export, paywall → Buy → StoreKit sheet → sandbox test account → success → unlock.

### Day 24-25 — App Store submission prep

- App Store Connect: screenshots, description, privacy policy URL, support URL.
- Codemagic auto-submits to App Store Connect on a tag push. The first submission takes days to weeks for Apple review.
- Document the submission process in `docs/v2.6-app-store.md`.

**Phase 3 Definition of Done**:
- A signed iOS .ipa builds via Codemagic without a local Mac.
- The .ipa installs via TestFlight on the user's iPhone.
- Apple IAP works end to end (sandbox test account, $1.99 Clean + $4.99 Studio).
- 300+ tests pass.
- App Store Connect submission is **ready** (not necessarily approved — that's a process that takes days/weeks).

---

## Cross-phase concerns

### Bundle budget

V2.5.1 redesign: 232.7 KB / 70.9 KB gzipped. V2.6 adds:
- Stripe.js (lazy-loaded, doesn't count against the main bundle).
- Capacitor plugin glue: ~5-10 KB raw (the runtime is in the native shell, not the web bundle).
- Apple / Google IAP provider code: small.

Expected post-V2.6 web bundle: 240 KB / 73 KB gzipped. Still under 250 KB. If Stripe.js + IAP provider code push us over, lazy-load the paywall screen.

### Stops

The phase-level Definition of Done lists the test / verify bars. If any phase fails the bar, the phase re-iterates. Cross-phase:
- If Stripe webhook signature verification fails in production, stop and ask.
- If Apple App Store review rejects, iterate on the metadata; don't fight Apple.
- If Google Play Console is still TBD by the end of Phase 2, ship the signed APK as a download link, not as a Play Store listing.

### Open questions for later phases

- All Phase 1 / Phase 2 questions locked.
- Phase 3 questions (Apple dev account reactivation, Codemagic vs friend's-Mac, App Store Connect setup) are deferred to Phase 3.
- **Revenue split** between Stripe (web) and Apple / Google (native). Stripe is 2.9% + 30¢ per transaction; Apple is 30% (15% for small business program); Google is 30% (15% for first $1M). The $1.99 Clean and $4.99 Studio price points are the same across stores. Document the fees in `docs/v2.6-revenue.md`.

---

## What ships in V2.6 vs deferred

| Feature | V2.6 | Deferred |
|---|---|---|
| Stripe Checkout on web | ✅ Phase 1 | — |
| Capacitor + Android APK | ✅ Phase 2 (sideload) | — |
| Play Store listing | — | V2.7 (after console is set up) |
| Apple IAP (native) | — | V2.6 Phase 3 (deferred) |
| App Store listing | — | V2.6 Phase 3 (deferred) |
| Google Play Billing | — | V2.7 (after Play Store console + Android device available) |
| Receipt revalidation | ✅ Stripe (webhook) + Apple (Server API) | Google: V2.7 |
| 30-day receipt expiry | ✅ existing revalidation timer (V2.0) | unchanged |
| Refund flow | ✅ Stripe (webhook `charge.refunded`) + Apple (App Store Server Notification) | Google: V2.7 |
| Subscription model | — | Out of scope (per V2.0 spec) |

---

## Stop conditions for the sprint

The kickoff's stop conditions (inherited from V2.0) say ask the user if:
- A V2 plan item conflicts with the V2 spec.
- Bundle approaches the 250 KB limit.
- A V2.5.1 test fails.
- The operating rules change.

For V2.6, add:
- A Stripe API contract changes (e.g. new SCA rules, new Checkout version).
- An Apple App Store review rejection that requires a code change (not a metadata fix).
- A Capacitor breaking change in a major version bump.
- A Codemagic pricing change that breaks the build budget.

Otherwise, ship through.

---

## Verification approach

The user has only an iPhone. Phase 1 verifies on iPhone Safari. Phase 2 verifies on Android emulator (no Android device). Phase 3 verifies on iPhone via TestFlight.

The V2.5.1 sprint added a "sprint-surface-verify" skill that says: walk the live UI as a user, confirm every shipped feature is reachable from a button, before declaring done. Apply that here. After each phase, walk the verify path and confirm the user can complete the user-loop.

End of V2.6 kickoff.
