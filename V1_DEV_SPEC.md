# Little Loop: V1 Development Spec

## 1. Product definition

A local-first, installable phone web app that lets a parent capture or import **one photo per day or week**, store it privately on the device, and export the timeline as a vertical flipbook-style MP4.

### Core promise

> Capture one moment at a time. Watch your child grow.

## 2. V1 goals

V1 must:

- Work immediately without account creation.
- Work in a mobile browser and as an installed PWA.
- Require no backend, database, authentication, or ongoing server infrastructure.
- Store photos locally on the user’s device.
- Support daily and weekly timelines.
- Allow photos to be taken with the camera.
- Allow photos to be selected from the camera roll.
- Display the photos chronologically.
- Generate a downloadable MP4 locally in the browser.
- Provide a backup/export mechanism so users can move or restore their timeline.
- Be private by default, with no image uploads.

## 3. Explicitly out of scope for V1

Do not build these in V1:

- User accounts
- Cloud sync
- Google Drive integration
- Google Photos integration
- Notifications or reminders
- Social feeds
- Public sharing pages
- Comments or family collaboration
- AI captions or facial recognition
- Music licensing
- In-app photo editing
- Growth charts
- Multiple children or multiple timelines
- Server-side rendering
- Analytics or advertising

Google Drive should be treated as a V2 feature. Adding it to V1 would introduce OAuth configuration, additional permission handling, external API failure modes, and a less clear privacy story.

---

# 4. Target platforms

## Required support

- iOS Safari 17+
- Android Chrome 120+
- Installed PWA on iOS and Android
- Desktop browser support for restoring and exporting a project is desirable but not required

## Browser requirement

The app must work at:

```text
https://app.example.com
```

It must not require:

- A native app-store installation
- An account
- A backend session
- A local development environment
- An API key

The user may install it to their home screen, but the browser version must remain fully usable.

---

# 5. Recommended technical approach

## Application

- React
- TypeScript
- Vite
- React Router or a minimal screen-state router
- CSS or Tailwind CSS
- PWA plugin/service worker

## Local persistence

- IndexedDB
- Dexie for database access
- Browser File/Blob APIs
- `navigator.storage.persist()` where supported

Photos should not be stored in `localStorage`.

## Local media processing

- Decode imported or captured images in the browser
- Normalize them to JPEG
- Resize to a maximum long edge of 1600 px
- Store the normalized image rather than the full camera original
- Generate a smaller thumbnail for timeline display

This keeps storage requirements manageable. V1 is a memory-journal product, not a full-resolution photo archive.

## MP4 generation

Use `ffmpeg.wasm` in a Web Worker.

Requirements:

- Use the single-threaded core for maximum browser compatibility.
- Lazy-load FFmpeg only when the user starts an export.
- Cache the FFmpeg core after the first export.
- Downscale export frames to 720 × 1280.
- Keep the UI responsive while rendering.
- Show export progress.
- Never upload photos to a server.

The app should display a clear message during export:

> Keep this screen open while your video is being created.

A failed export must not delete or modify the source timeline.

## Hosting

Use static hosting only:

- Cloudflare Pages
- GitHub Pages
- Netlify static hosting
- Vercel static output

The application should be deployable as static files with no server functions.

Expected V1 infrastructure cost: approximately zero on a free static hosting tier.

---

# 6. User experience

## Screen 1: First-run setup

The first launch displays a short setup form.

Fields:

- Child name or nickname
- Date of birth
- Capture cadence:
  - Daily
  - Weekly

Primary action:

> Create timeline

The date of birth is used only to display the child’s age beside timeline entries and in exported video metadata if enabled.

No email or account is requested.

## Screen 2: Home

The home screen should provide one obvious next action.

### If the current period has no photo

Display:

> Capture this week’s moment

or:

> Capture today’s moment

Actions:

- **Take photo**
- **Choose from camera roll**
- **View timeline**
- **Export flipbook**

### If the current period already has a photo

Display:

> This period is captured

Actions:

- **Replace photo**
- **View timeline**
- **Export flipbook**
- **Backup timeline**

The user must never be punished for missing a period. Do not use negative language such as “You missed three days.”

Use neutral language:

> 18 moments captured

## Screen 3: Capture

The capture screen uses the device camera where supported.

Primary behaviour:

1. Request camera permission only after the user taps **Take photo**.
2. Open the rear-facing camera.
3. Capture one image.
4. Show a preview.
5. Offer:
   - Use photo
   - Retake
   - Cancel

After confirmation:

- Normalize the image.
- Store it locally.
- Associate it with the current daily or weekly period.
- Return to the home screen.

The app should not automatically add a caption or open an editing flow.

## Screen 4: Camera roll import

The user can choose an image from the camera roll.

V1 should support:

- JPEG
- PNG
- WebP
- Browser-decodable HEIC/HEIF where supported

The selected image is previewed before saving.

The user may choose:

- Use today/current period
- Select another date

For imported photos, date selection is important because parents may want to backfill older moments.

If the file contains a usable capture date, pre-fill that date. Otherwise use the current date and let the user change it.

## Screen 5: Timeline

Display entries in chronological order, newest first.

Each entry contains:

- Photo thumbnail
- Display date
- Child’s age at capture
- Capture status, if applicable
- Replace action
- Delete action

Example:

```text
14 March 2026
3 months, 2 weeks old

[photo]
```

The timeline should not require a calendar view in V1.

### Empty state

```text
Your first moment starts here.

Take a photo or choose one from your camera roll.
```

## Screen 6: Export

The export screen contains only the decisions required for a useful MP4.

### Required controls

- Date range:
  - All moments
  - Current month
  - Custom range
- Speed:
  - Slow: 0.8 seconds per image
  - Standard: 0.5 seconds per image
  - Fast: 0.25 seconds per image
- Show dates:
  - On by default
  - Optional toggle

### Output

V1 output is always:

```text
MP4
Vertical 9:16
720 × 1280
H.264 video
No audio
```

The video should:

- Use chronological order.
- Omit missing periods.
- Show each still for the selected duration.
- Apply a subtle crossfade or page-flick transition.
- Use a neutral warm background.
- Keep the image centered and fully visible.
- Use `object-fit: contain` rather than aggressively cropping faces.
- Add a small date label when enabled.

### Export states

The interface must show:

1. Preparing images
2. Rendering video
3. Finalizing MP4
4. Download ready
5. Export failed

When complete:

> Your flipbook is ready.

Primary action:

> Download MP4

The resulting file should have a predictable name:

```text
child-name-flipbook-2026-03-14.mp4
```

The user downloads the file through the browser. V1 does not need an in-app social-share flow.

---

# 7. Timeline and period rules

## Daily mode

The timeline uses local calendar dates.

Example:

```text
2026-03-14
2026-03-15
2026-03-16
```

There is one primary photo per date.

## Weekly mode

The timeline uses a weekly period beginning on Monday.

Example:

```text
Week of 2026-03-09
Week of 2026-03-16
Week of 2026-03-23
```

There is one primary photo per week.

## Replacement

If a user adds another photo to a period that already has an image:

```text
This period already has a photo.

Replace it?
```

Actions:

- Replace
- Keep existing
- Cancel

V1 does not support multiple photos within one period.

## Missing periods

Missing days or weeks are not represented as blank frames.

For example, an export with photos from:

```text
March 1
March 4
March 8
```

contains only those three photos.

---

# 8. Local data model

A simple IndexedDB schema is sufficient.

## Project

```ts
type Project = {
  id: string;
  childName: string;
  dateOfBirth: string; // YYYY-MM-DD
  cadence: "daily" | "weekly";
  createdAt: string;
  updatedAt: string;
};
```

V1 supports one active project per browser installation. The data model may include an `id` to make future multi-child support possible, but the UI does not need to expose multiple projects yet.

## Entry

```ts
type Entry = {
  id: string;
  projectId: string;
  periodKey: string; // e.g. "2026-03-14" or "2026-W11"
  capturedDate: string; // YYYY-MM-DD
  imageBlobId: string;
  thumbnailBlobId: string;
  createdAt: string;
  updatedAt: string;
};
```

## Asset

```ts
type Asset = {
  id: string;
  projectId: string;
  type: "image" | "thumbnail";
  mimeType: "image/jpeg";
  width: number;
  height: number;
  byteSize: number;
  blob: Blob;
  createdAt: string;
};
```

The image blob and thumbnail blob should be stored separately so the timeline does not need to load full-size images.

---

# 9. Backup and restore

Because V1 has no cloud storage, backup is essential.

## Export backup

The user can select:

> Backup timeline

The app creates a `.babyflip` file containing:

```text
manifest.json
images/
  2026-03-14.jpg
  2026-03-21.jpg
thumbnails/
  ...
```

The manifest contains:

- Child name
- Date of birth
- Cadence
- Entry dates
- Period keys
- App schema version

The backup should be a ZIP file generated in the browser.

Example filename:

```text
child-name-timeline-backup-2026-03-14.babyflip
```

## Restore

The user can select:

> Restore timeline

They choose a `.babyflip` file from the device.

The app must:

1. Validate the file format.
2. Show the project name and number of photos.
3. Ask for confirmation.
4. Import the project into IndexedDB.
5. Replace the current local timeline only after successful validation.
6. Preserve the existing timeline if import fails or is cancelled.

## Warning

Display this during setup and in settings:

> Your timeline is stored on this device. Back it up regularly so it can be restored if the device is lost or the browser data is cleared.

This is one of the most important V1 product requirements.

---

# 10. Privacy and permissions

V1 should make a strong privacy claim:

> Photos stay on this device unless you choose to export them.

Required permissions:

- Camera permission, only when taking a photo
- File access through normal browser file pickers

Not required:

- Location
- Contacts
- Microphone
- Notifications
- Google account
- Drive access
- User tracking

Do not add analytics in V1. If basic product diagnostics are eventually required, add them only after an explicit privacy review.

---

# 11. Storage management

The app should estimate storage usage and show it in a simple settings screen.

Display:

```text
Photos stored: 42
Storage used: 38 MB
```

Use:

```ts
navigator.storage.persist?.()
navigator.storage.estimate?.()
```

If storage is approaching the browser quota, show:

> Your device is running low on space for this timeline. Back it up before adding more photos.

V1 should provide:

- Delete individual photo
- Delete all timeline data
- Export backup
- Restore backup

Deleting the app or clearing browser data may delete the timeline. This must be documented clearly.

---

# 12. Visual direction

The interface should feel like a private keepsake, not a social media app.

Recommended characteristics:

- Warm neutral background
- Large images
- Minimal controls
- Soft rounded cards
- High-contrast buttons
- Readable typography
- No excessive illustrations
- No gamification
- No streak counters
- No guilt language
- Designed for one-handed use

The timeline should make the changing face and body of the child the primary visual focus.

---

# 13. Error handling

The app must handle these cases gracefully.

## Camera permission denied

```text
Camera access is off.

You can still choose a photo from your camera roll.
```

## Unsupported image

```text
This image format is not supported by your browser. Try choosing a JPEG or PNG.
```

## Storage unavailable

```text
This browser is not allowing local storage. Try opening the app in Safari or Chrome outside private browsing.
```

## Export failure

```text
The flipbook could not be created.

Your timeline is safe. Try again, or export a shorter date range.
```

## Large export

Before rendering a large timeline:

```text
This video contains 365 photos and may take several minutes to create. Keep the app open while it renders.
```

## Browser backgrounding

If the page becomes hidden during export, the app should pause or continue safely. If the browser suspends the process, show a recoverable state rather than losing the export.

---

# 14. V1 acceptance criteria

The V1 is complete when all of the following work on a real iPhone and Android phone.

## Setup

- User can open the app without signing in.
- User can create a timeline in under one minute.
- User can choose daily or weekly cadence.
- Refreshing the page preserves the project.

## Capture

- User can take a photo from the app.
- User can import a photo from the camera roll.
- A saved photo appears in the timeline.
- A photo can be replaced for the same period.
- A photo can be deleted.
- Imported photos can be assigned a date.

## Timeline

- Entries appear chronologically.
- The child’s age is calculated correctly.
- Missing periods do not create blank entries.
- The timeline works after closing and reopening the browser.

## Export

- User can export all timeline entries to MP4.
- Output is vertical 9:16.
- Photos appear in chronological order.
- Dates can be enabled or disabled.
- Export progress is visible.
- The app remains responsive during rendering.
- The resulting MP4 downloads successfully on iOS and Android.
- Source photos remain intact after export.

## Backup

- User can export a `.babyflip` backup.
- User can restore a `.babyflip` backup.
- A failed restore does not destroy existing data.
- The backup includes the project settings and photos.

## Privacy

- No photos are sent to a server.
- No account is required.
- No Google permissions are requested.
- No analytics or tracking requests are made.

---

# 15. Suggested build order

## Phase 1: Static PWA shell

- Create Vite React TypeScript app.
- Add mobile layout.
- Add PWA manifest and service worker.
- Deploy to static hosting.
- Verify the app loads from a production URL.

## Phase 2: Local project and timeline

- Add Dexie schema.
- Add first-run setup.
- Persist project settings.
- Render empty and populated timeline states.

## Phase 3: Photo capture and import

- Add camera capture.
- Add camera-roll picker.
- Normalize images.
- Store image and thumbnail blobs.
- Add replacement and deletion.

## Phase 4: Local backup

- Add `.babyflip` export.
- Add `.babyflip` restore.
- Add schema versioning.
- Test browser-data deletion and restoration.

## Phase 5: MP4 export

- Add lazy-loaded `ffmpeg.wasm`.
- Add Worker-based rendering.
- Add 9:16 frame generation.
- Add date overlays.
- Add progress reporting.
- Add MP4 download.

## Phase 6: Mobile QA

Test at minimum:

- iPhone Safari
- iPhone installed PWA
- Android Chrome
- Android installed PWA
- Camera permission denied
- Offline after first load
- Empty timeline
- One image
- Thirty images
- One year of weekly images
- One year of daily images
- Browser refresh during normal use
- Failed and successful restore

---

# V1 definition in one sentence

> A no-login, local-only PWA that captures or imports one dated baby photo per day or week, stores it privately on the phone, and creates a downloadable vertical MP4 flipbook entirely in the browser.

The critical product decision is to exclude Google Drive from V1 and make the local `.babyflip` backup robust enough to provide user confidence without introducing cloud infrastructure.

---

# Implementation Detail Addendum

This addendum turns the product requirements into an implementation contract for a fresh coding session. When a requirement in this addendum conflicts with an earlier example, this addendum is authoritative.

## A. V1 architecture contract

The application is a static client-side PWA. There is no API route, server function, database server, authentication flow, telemetry endpoint, image CDN, or runtime secret.

The only network request required after the app is deployed is the normal request for static application assets. Photos, project metadata, thumbnails, backup archives, and rendered videos remain in browser memory or local device storage unless the user explicitly downloads or shares them through the operating system.

### Required package roles

- `react`, `react-dom`: UI.
- `typescript`, `vite`: application and build tooling.
- `dexie`: IndexedDB persistence.
- `vite-plugin-pwa`: installable offline shell.
- `jszip`: `.babyflip` archive creation and extraction.
- `@ffmpeg/ffmpeg` and `@ffmpeg/util`: browser-side MP4 rendering, loaded lazily in a Worker.
- `vitest`, `@testing-library/react`, and `jsdom`: unit and component tests.
- `playwright`: browser smoke tests where practical.

Do not add a state-management framework, router, UI component library, backend SDK, analytics package, or authentication package unless implementation evidence shows it is necessary.

## B. Recommended source layout

Use this structure unless the generated scaffold has a strong equivalent:

```text
little-loop/
  public/
    icons/
    manifest.webmanifest
  src/
    app/
      App.tsx
      routes.ts
    components/
      Button.tsx
      EmptyState.tsx
      ImagePreview.tsx
      Modal.tsx
      ProgressBar.tsx
    db/
      database.ts
      repositories.ts
      schema.ts
    features/
      setup/
      capture/
      timeline/
      export/
      backup/
      settings/
    lib/
      dates.ts
      image-processing.ts
      filenames.ts
      download.ts
      storage.ts
      validation.ts
    workers/
      video-render.worker.ts
    styles/
      tokens.css
      globals.css
    main.tsx
  tests/
    unit/
    components/
    e2e/
  README.md
  package.json
  vite.config.ts
  tsconfig.json
```

Feature code should own its UI and orchestration. Date calculations, image normalization, backup validation, and filename sanitization must be pure, independently tested utilities.

## C. Data and persistence rules

Use a Dexie database named `little-loop-db` with these tables:

```text
projects: &id
entries: &id, projectId, [projectId+periodKey], capturedDate
assets: &id, projectId, type
```

The compound `[projectId+periodKey]` index must enforce one entry per period in application logic. If a duplicate period is encountered during restore, the import must fail validation rather than silently overwrite data.

All writes that replace an entry must be transactional:

1. Create the new image and thumbnail assets.
2. Update the entry to reference the new assets.
3. Delete the previous assets only after the entry update succeeds.

All reads should revoke generated object URLs when the owning component unmounts or an image is replaced.

The app must request persistent storage on first successful setup when the API exists, but must not block setup if the request is denied.

## D. Date and age rules

All user-facing date calculations use the device’s local timezone. Store dates as date-only ISO strings, never as locale-formatted strings.

- Daily `periodKey`: `YYYY-MM-DD`.
- Weekly `periodKey`: ISO week beginning Monday, represented as `YYYY-MM-DD` for the Monday date. Do not rely on JavaScript week-number formatting.
- The current period is calculated at the moment the home screen is rendered.
- A backfilled image uses the selected capture date for its period, not the file’s modification date.
- Child age is calculated from date-only values. Display years, months, weeks, and days using deterministic thresholds and tested boundary cases.
- Future capture dates are rejected.
- Date of birth may not be after the current local date.

## E. Image processing contract

Create one pure processing pipeline used by both camera capture and camera-roll import:

1. Validate that the selected file is an image and below a reasonable input limit of 25 MB.
2. Decode it with `createImageBitmap` where available, with an HTML image fallback.
3. Correct EXIF orientation where the browser exposes orientation data, or use the browser’s oriented decode path.
4. Resize the long edge to at most 1600 px while preserving aspect ratio.
5. Draw onto a canvas with a white or transparent-free background.
6. Export a normalized JPEG at quality `0.88`.
7. Generate a thumbnail with a long edge of at most 480 px at quality `0.82`.
8. Return dimensions, blobs, and byte sizes.

The export renderer must letterbox images into the 720 x 1280 canvas. It must never crop the child’s face by default.

## F. Camera implementation contract

Use a native file input with `accept="image/*"` and `capture="environment"` as the primary mobile capture path. This is more reliable across Safari and installed PWAs than requiring a custom `getUserMedia` camera implementation for V1.

The feature must still work when `capture` is ignored by the browser. In that case, the normal camera roll picker is acceptable.

Do not request camera permission on page load. Do not retain a live camera stream after the user leaves the capture flow.

## G. Video rendering contract

Rendering must run outside the main UI thread. The main thread communicates with the Worker using typed messages:

```ts
type RenderRequest = {
  entries: RenderEntry[];
  speedSeconds: 0.8 | 0.5 | 0.25;
  showDates: boolean;
  childName: string;
};

type RenderProgress = {
  phase: "preparing" | "rendering" | "finalizing";
  completed: number;
  total: number;
};

type RenderResult =
  | { type: "success"; blob: Blob; filename: string }
  | { type: "error"; message: string };
```

The first implementation may use a simple hard cut between frames. A subtle transition is desirable, but it is lower priority than a reliable MP4. Do not delay the MVP for a page-turn effect.

The renderer must:

- Sort entries ascending by captured date.
- Produce a valid MP4 for one image and multiple images.
- Use no audio track.
- Use H.264-compatible output where the chosen FFmpeg build supports it.
- Revoke temporary object URLs and delete temporary virtual files.
- Preserve source assets when rendering fails.

If the selected browser cannot produce MP4 reliably with the chosen FFmpeg build, implement a clearly labelled fallback download of a WebM only as a temporary compatibility fallback and record the limitation in `README.md`. Do not silently call WebM an MP4.

## H. Backup format contract

A `.babyflip` file is a ZIP archive with this structure:

```text
manifest.json
images/<entry-id>.jpg
```

Thumbnails are regenerated on restore and do not need to be included. This keeps backups smaller and prevents duplicated derived data.

The manifest must include:

```ts
type BackupManifest = {
  format: "babyflip";
  formatVersion: 1;
  exportedAt: string;
  project: Project;
  entries: Array<{
    id: string;
    periodKey: string;
    capturedDate: string;
    imagePath: string;
  }>;
};
```

Validate before writing anything to IndexedDB:

- ZIP is readable.
- `manifest.format` is `babyflip`.
- `formatVersion` is supported.
- Project fields are valid.
- Every referenced image exists.
- Every image decodes successfully.
- Entry IDs and period keys are unique.
- No path escapes the archive root.
- Archive size and extracted image count are within safe limits.

## I. UI state and navigation contract

V1 needs these user-visible states:

```text
setup
home
capture-preview
import-date
timeline
export-config
export-progress
export-complete
settings
restore-preview
```

A reload must return to `setup` when no project exists and to `home` when a project exists. A cancelled operation must return to the previous screen without changing persisted data.

Use browser-native dialogs only where mobile compatibility is better than a custom modal. Destructive actions, replacement, and restore confirmation must be explicit.

## J. Settings contract

Settings contains only:

- Child name and date of birth edit.
- Daily or weekly cadence edit, with an explanation that existing entries are not deleted.
- Backup timeline.
- Restore timeline.
- Storage usage estimate.
- Delete all timeline data.
- Privacy and local-storage warning.
- App version.

No notification, account, cloud, sharing, or social settings appear in V1.

## K. Quality gates for a fresh implementation

Before declaring completion, the coding session must:

1. Run the formatter and linter.
2. Run unit and component tests.
3. Run a production build.
4. Serve the production build locally and perform a browser smoke test.
5. Verify that the built app contains no API URLs, analytics SDKs, auth libraries, or server endpoints.
6. Verify that `grep` or equivalent source inspection finds no upload/fetch path for user photos.
7. Test persistence after a full page reload.
8. Test backup, restore, replacement, and deletion.
9. Test MP4 export with one image and at least three images.
10. Update `README.md` with setup, architecture, local-only privacy model, known browser limitations, and exact verification commands.

If a platform-specific feature cannot be verified in the current environment, state that limitation in `README.md` and verify the closest available browser path instead. Do not claim real-device verification without doing it.

