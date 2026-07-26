# Little Loop V1: Day-by-Day Development Sprint

> This sprint is designed to be handed to a fresh coding session using the `/goal` command.
>
> The implementation source of truth is `V1_DEV_SPEC.md`. This sprint is the execution order. If a sprint item conflicts with the Implementation Detail Addendum in the spec, follow the addendum.

## Sprint objective

Build and verify a production-buildable, static, local-only PWA called **Little Loop**.

By the end of the sprint, a user must be able to:

1. Open the app without creating an account.
2. Create one baby timeline with a name, date of birth, and daily or weekly cadence.
3. Capture a photo using the mobile camera path or select one from the camera roll.
4. Assign a date to an imported photo.
5. Store normalized images and thumbnails in IndexedDB.
6. View, replace, and delete timeline entries.
7. Export and restore a `.babyflip` local backup.
8. Render a vertical MP4 flipbook locally in a Worker.
9. Download the MP4.
10. Use the app again after a page reload and after an offline reload once the app has been cached.

The product must have zero runtime backend infrastructure and must not upload user photos.

## Operating rules for the coding session

- Work directly in the current Little Loop project directory.
- Read `V1_DEV_SPEC.md` completely before changing code.
- Inspect the repository before choosing whether to scaffold or continue an existing app.
- Do not stop at a plan, mockup, stub, or partial implementation.
- Work through the sprint in order, but adapt the day boundary to the available time.
- After each day, run the relevant verification commands and fix failures before moving on.
- Prefer a small, complete implementation over extra features.
- Do not add V2 features: accounts, cloud sync, Google Drive, notifications, analytics, social sharing, comments, AI, music, or multi-child support.
- Do not introduce a server, API, database service, authentication SDK, telemetry endpoint, or image upload path.
- Do not claim mobile-device verification unless it was actually performed.
- If an external dependency or browser limitation blocks a requirement, document the limitation, implement the closest honest fallback, and continue with the rest of the sprint.
- Maintain a useful `README.md` as implementation proceeds.
- Use tests for pure logic and critical persistence/backup behaviour. Do not spend the sprint building an elaborate test framework.

## Definition of done

The sprint is complete only when:

- `npm run lint` passes, or the project has an equivalent documented lint command.
- `npm run test` passes, or the project has an equivalent documented test command.
- `npm run build` passes.
- The production build has been served and smoke-tested in a browser.
- Setup, reload persistence, photo import, replacement, deletion, backup, restore, and export have all been exercised.
- The source and built output contain no photo upload implementation, analytics, authentication, or server endpoint.
- `README.md` contains setup, architecture, privacy model, verification commands, and known limitations.
- The final response reports actual commands and results, not assumed results.

---

# Day 1: Scaffold and product shell

## Outcome

A running Vite React TypeScript PWA with the basic Little Loop visual shell, production build, and offline app shell.

## Work

1. Inspect the repository and existing files.
2. If no app exists, scaffold a Vite React TypeScript app in the current directory.
3. Add the required package dependencies from the spec, keeping the dependency set minimal.
4. Configure TypeScript, Vite, linting, formatting, and tests.
5. Add the PWA manifest, icons or temporary valid placeholders, theme colour, and service worker configuration.
6. Create the initial mobile-first design tokens and global styles.
7. Create the app shell with placeholder navigation/state for setup, home, timeline, export, and settings.
8. Add an initial `README.md` with the product boundary and local-only privacy promise.

## Verification

Run:

```bash
npm install
npm run lint
npm run test
npm run build
```

Serve the production build using the project’s documented static preview command and verify:

- The app loads without console errors.
- The page has a mobile viewport layout.
- The manifest is detected.
- The build contains no backend configuration.

## Exit criteria

A fresh developer can clone/open the project, run the documented install command, and see the Little Loop shell in a browser.

---

# Day 2: IndexedDB model and setup flow

## Outcome

A user can create a project, persist it in IndexedDB, and return to the home screen after reload.

## Work

1. Implement the Dexie database named `little-loop-db`.
2. Add the `projects`, `entries`, and `assets` tables and indexes from `V1_DEV_SPEC.md`.
3. Define TypeScript domain types for project, entry, asset, and application state.
4. Implement repository functions for:
   - Get active project.
   - Create project.
   - Update project.
   - Delete all project data.
   - Count entries and calculate stored bytes.
5. Implement date-only utility functions.
6. Implement daily period keys.
7. Implement Monday-based weekly period keys.
8. Implement validation for child name, date of birth, cadence, and future dates.
9. Build the first-run setup form.
10. Request persistent storage after successful setup without blocking if unsupported or denied.
11. Load project state at startup and route to setup or home accordingly.

## Tests

Add tests for:

- Valid and invalid setup data.
- Daily period keys around midnight-safe date handling.
- Weekly Monday period keys across month and year boundaries.
- Future date rejection.
- Project persistence and reload state.

## Verification

```bash
npm run test
npm run lint
npm run build
```

Manual browser check:

- Create a project.
- Refresh the page.
- Confirm setup does not return.
- Close and reopen the browser tab.
- Confirm the project remains.

---

# Day 3: Image import, normalization, and timeline persistence

## Outcome

A user can select an image, preview it, assign a date, normalize it, and see it persist in the timeline.

## Work

1. Implement the shared image-processing pipeline from the spec.
2. Validate image MIME type and the 25 MB input limit.
3. Decode with `createImageBitmap` and provide the HTML image fallback.
4. Resize normalized images to a maximum long edge of 1600 px.
5. Generate a maximum 480 px thumbnail.
6. Export normalized JPEG blobs with the specified quality values.
7. Implement camera-roll input with `accept="image/*"`.
8. Add the preview state.
9. Add the date-selection state for imported images.
10. Implement transactional asset and entry creation.
11. Render timeline entries newest first using thumbnail object URLs.
12. Calculate and display the child’s age for each captured date.
13. Add empty state and captured-count display.

## Tests

Add tests for:

- Image type and size validation.
- Aspect-ratio-preserving resize calculations.
- Thumbnail generation metadata.
- Entry and asset persistence.
- Correct chronological ordering.
- Child-age boundary cases.
- Object URL cleanup where testable.

## Verification

```bash
npm run test
npm run lint
npm run build
```

Manual browser check:

- Import a real photo.
- Assign today’s date.
- Confirm the image appears after refresh.
- Confirm the timeline shows the date and age.
- Confirm no network request contains the image.

---

# Day 4: Mobile capture, replacement, deletion, and settings

## Outcome

The core capture ritual works on mobile-compatible browsers, and the user can safely manage entries and project settings.

## Work

1. Add a native capture input using:
   - `accept="image/*"`
   - `capture="environment"`
2. Ensure the same processing pipeline handles captured and imported files.
3. Add capture preview actions:
   - Use photo.
   - Retake.
   - Cancel.
4. Implement current-period capture for daily and weekly modes.
5. Detect an existing entry for the period.
6. Add explicit replace confirmation.
7. Implement replacement transaction ordering from the spec.
8. Add explicit delete confirmation.
9. Ensure deleting an entry deletes its image and thumbnail assets.
10. Build the settings screen with:
    - Name edit.
    - Date-of-birth edit.
    - Cadence edit.
    - Backup and restore actions as placeholders until Day 5.
    - Storage estimate.
    - Delete-all-data action.
    - Local-storage privacy warning.
    - App version.
11. Handle denied or unavailable camera access without breaking camera-roll import.

## Tests

Add tests for:

- Replacement does not leave orphaned assets.
- Failed replacement does not destroy the old image.
- Deletion removes entry and assets.
- Changing cadence preserves existing entries.
- Camera input has the required attributes.

## Verification

```bash
npm run test
npm run lint
npm run build
```

Manual browser check:

- Use the camera input if the current device supports it.
- Confirm cancel leaves the timeline unchanged.
- Replace an existing period and confirm only the replacement remains.
- Delete an entry and confirm it stays deleted after reload.
- Deny camera permission and confirm camera-roll import still works.

---

# Day 5: `.babyflip` backup and restore

## Outcome

A user can export a complete local backup, validate it, and restore it without risking existing data.

## Work

1. Implement the versioned backup manifest from the spec.
2. Generate a ZIP archive with `manifest.json` and normalized JPEG images.
3. Use safe archive paths based on entry IDs, not user-provided names.
4. Add a `.babyflip` download with a sanitized filename.
5. Implement archive size and image-count safety limits.
6. Implement restore file input.
7. Validate the archive fully before writing to IndexedDB.
8. Decode every referenced image and regenerate thumbnails during validation/import.
9. Show restore preview with child name, cadence, and image count.
10. Ask for explicit confirmation before replacing the current project.
11. Import using a transaction or staging approach so a failed import leaves existing data untouched.
12. Add format-version handling and honest error messages.
13. Wire backup and restore into home/settings.
14. Document that browser storage is not a permanent backup and that users should export regularly.

## Tests

Add tests for:

- Valid backup creation.
- Missing manifest.
- Unsupported format version.
- Missing referenced image.
- Duplicate entry IDs.
- Duplicate period keys.
- Invalid archive paths.
- Corrupt image data.
- Failed restore preserving existing data.
- Successful restore reproducing project and entries.

## Verification

```bash
npm run test
npm run lint
npm run build
```

Manual browser check:

1. Create at least two entries.
2. Export a `.babyflip` file.
3. Delete the local timeline.
4. Restore the backup.
5. Confirm the project and images return.
6. Try restoring a deliberately invalid archive.
7. Confirm the invalid restore does not alter the current timeline.

---

# Day 6: Local MP4 renderer

## Outcome

The app can turn one or more locally stored images into a downloadable vertical MP4 without blocking the UI.

## Work

1. Add `@ffmpeg/ffmpeg` and `@ffmpeg/util` using the smallest compatible browser build.
2. Lazy-load the FFmpeg code only after the user starts an export.
3. Create the video-render Worker.
4. Define typed request, progress, success, and error messages.
5. Read selected entry assets from IndexedDB before starting the Worker.
6. Sort render entries by captured date ascending.
7. Render 720 x 1280 frames with letterboxing and no default crop.
8. Support the three specified speeds.
9. Add optional date labels.
10. Produce an MP4 with no audio.
11. Return progress updates for preparation, rendering, and finalization.
12. Clean up FFmpeg virtual files and object URLs.
13. Keep source assets unchanged on success or failure.
14. Add the export filename convention.
15. Implement a clear error state and retry action.

The first reliable implementation may use hard cuts between frames. A page-turn transition is optional and must not delay a working MP4.

## Tests

Add tests for:

- Export entry ordering.
- Speed-to-frame-duration mapping.
- Date-label toggle mapping.
- 9:16 letterbox calculations.
- Filename sanitization.
- Worker message validation.

If a full FFmpeg integration test is too slow for the unit suite, add a focused browser/manual verification path and run it before completion.

## Verification

```bash
npm run test
npm run lint
npm run build
```

Manual browser check:

- Export one image.
- Export at least three images.
- Try each speed.
- Toggle dates.
- Confirm the downloaded file is labelled `.mp4`.
- Confirm the file is playable in a local video player.
- Confirm the UI shows progress and remains responsive.
- Confirm a failed export leaves the timeline intact.

Do not silently substitute WebM for MP4. If MP4 is impossible in the target browser/build, document the limitation and implement an explicitly labelled fallback only after the honest MP4 path has been attempted.

---

# Day 7: Offline PWA, storage UX, and resilience

## Outcome

The app is installable, reload-safe, and usable after the initial static assets have been cached.

## Work

1. Verify the service worker caches the application shell.
2. Configure asset caching without caching user-generated media through a server.
3. Add an offline indicator or status message where useful.
4. Ensure IndexedDB reads and writes continue offline.
5. Add storage estimates using `navigator.storage.estimate()` where available.
6. Add a low-storage warning without blocking normal use.
7. Ensure object URLs and Worker resources are cleaned up during navigation.
8. Handle export cancellation or browser backgrounding without corrupting data.
9. Add a safe “delete all timeline data” flow.
10. Add a final privacy screen or settings copy explaining local-only storage.
11. Check accessibility basics:
    - Labels for controls.
    - Keyboard access on desktop.
    - Visible focus states.
    - Sufficient colour contrast.
    - Status announcements for export progress and errors.
    - Touch targets large enough for one-handed use.

## Tests and verification

```bash
npm run test
npm run lint
npm run build
```

Manual browser check:

1. Load the app once online.
2. Disable network in browser developer tools.
3. Reload the app.
4. Confirm the app shell and stored timeline still load.
5. Confirm a new image can be stored offline if the browser permits file access.
6. Re-enable network and confirm no sync or upload is attempted.

---

# Day 8: End-to-end hardening and release candidate

## Outcome

A release candidate with documented evidence for every V1 requirement.

## Work

1. Review `V1_DEV_SPEC.md` line by line against the implementation.
2. Remove accidental V2 features, dead code, placeholder copy, and unused dependencies.
3. Add or finish browser smoke tests with Playwright if the environment supports them.
4. Test these scenarios from a clean browser profile:
   - First-run setup.
   - Daily project.
   - Weekly project.
   - Import and date assignment.
   - Current-period capture.
   - Replacement.
   - Deletion.
   - Reload persistence.
   - Backup and restore.
   - One-image MP4 export.
   - Three-image MP4 export.
   - Date toggle and all speed choices.
   - Offline reload after initial caching.
5. Inspect the network panel during image import and export.
6. Verify no image or metadata request leaves the browser.
7. Run dependency and production build checks.
8. Add `KNOWN_LIMITATIONS.md` if real-device testing is not available.
9. Update `README.md` with exact commands and actual results.
10. Create a concise release checklist in the repository.

## Required final commands

Use the project’s actual scripts. The expected shape is:

```bash
npm run lint
npm run test
npm run build
npm run preview
```

If a script does not exist, add it or document the project-specific equivalent. Do not report a command as passed unless it was run.

## Release candidate acceptance

The implementation is ready for user review only if:

- The production build succeeds.
- The test suite succeeds.
- The core flows work in a real browser.
- The backup can restore the timeline.
- An MP4 is actually generated and playable, or a clearly documented browser limitation remains.
- The app is installable as a PWA in a supported browser.
- The privacy claim is technically true.
- The README tells a fresh developer how to run and verify the app.

---

# Fresh-session `/goal` command

Start a fresh Hermes session in `C:/Users/Admin/Hermes/little-loop`, then give it this goal:

```text
/goal Build the Little Loop V1 app from the repository files. Read V1_DEV_SPEC.md completely, then read DAY_BY_DAY_DEV_SPRINT.md and execute the sprint from Day 1 through Day 8. Work directly in this project directory. Do not stop at a plan or a stub: create the working static local-only PWA, run the app, test the core flows, and fix failures. Keep the implementation focused on V1 and do not add accounts, cloud sync, Google Drive, notifications, social sharing, analytics, AI, music, or server infrastructure. Use tests for core logic and persistence. Run lint, tests, production build, and a browser smoke test before declaring completion. Update README.md with the actual commands and results, and report any mobile or FFmpeg limitation honestly. Continue working across turns until the definition of done in DAY_BY_DAY_DEV_SPRINT.md is satisfied.
```

## Optional first message after setting the goal

If the fresh session does not automatically begin working after `/goal`, send:

```text
Begin Day 1 now. Inspect the project, read both specification files, and implement the first complete slice. Do not just describe what you plan to do.
```

## What a successful one-shot should produce

- A working project in `C:/Users/Admin/Hermes/little-loop`.
- Source code and tests.
- A production build.
- A documented local preview command.
- A working local backup and restore path.
- A real MP4 export attempt with verification evidence.
- A README containing actual test/build results and known limitations.

The fresh session should not declare success merely because files exist. It must exercise the application and report observed results.
