# Little Loop

> A no-login, local-only PWA that captures or imports one dated baby photo
> per day or week, stores it privately on the phone, and creates a
> downloadable vertical MP4 flipbook entirely in the browser.

This repository contains the **V1 implementation** specified in
[`V1_DEV_SPEC.md`](./V1_DEV_SPEC.md). It is a static client-side PWA with
**no backend, no accounts, no analytics, and no cloud uploads**.

## What it does

- First-run setup captures a child name, date of birth, and cadence
  (daily or weekly).
- Capture one photo per period with the device camera or the camera roll.
- Photos are normalised to JPEG (long edge ≤ 1600 px) plus a thumbnail
  (long edge ≤ 480 px) and stored in IndexedDB.
- Timeline shows entries newest-first with the child's age beside each.
- Replace and delete individual entries.
- Export a `.babyflip` backup ZIP and restore from one — the local
  equivalent of cloud sync.
- Export a vertical MP4 (720 × 1280, no audio, H.264) flipbook in a
  Web Worker using `ffmpeg.wasm`.
- Installs as a PWA on iOS and Android.

## Local-only privacy

Photos, project metadata, thumbnails, backup archives, and rendered videos
**stay in the browser** unless the user explicitly downloads or shares
them through the operating system. The only network requests the app makes
are for the static application assets (the bundle itself) and, when an
export is started, the FFmpeg core files served from the public
`unpkg.com` CDN.

There is no:
- account flow
- analytics or telemetry endpoint
- Google Drive / Photos / OAuth integration
- image upload path
- backend function or API route

## Quick start

```bash
# install dependencies (Node 20+ recommended)
npm install

# verify the project
npm run lint
npm run test
npm run build

# serve the production build locally
npm run preview
# → http://127.0.0.1:4173

# or run the dev server with HMR
npm run dev
# → http://127.0.0.1:5173

# run the smoke test against a fresh preview server
npm run smoke
```

## Architecture

Static React + TypeScript SPA built with Vite. Persistence via Dexie
(`little-loop-db`). Backup via JSZip. MP4 via `@ffmpeg/ffmpeg` running in
a dedicated Web Worker. Service worker and manifest produced by
`vite-plugin-pwa` so the app installs as a PWA.

### Source layout

```
src/
  app/             App shell + screen router
  components/      Reusable UI primitives
  db/              Dexie schema, repositories, types
  features/
    setup/         First-run form
    home/          Main screen, capture triggers, low-space warning
    capture/       Camera preview + import-with-date flows
    timeline/      Entry list + transactional replace/delete
    export/        Export config + Worker dispatch
    backup/        .babyflip create + restore with full validation
    settings/      Project edit + storage + restore + delete-all
  lib/             Pure utilities (dates, filenames, image pipeline, storage)
  styles/          Design tokens + global CSS
  workers/         video-render.worker.ts (FFmpeg + progress)
  main.tsx         React root + SW registration
tests/
  unit/            64 unit tests covering pure logic + persistence + backup
public/
  icons/           PWA icons (180, 192, 512)
```

### Data model

Three IndexedDB tables:

- `projects` — one row per project (V1 exposes only one).
- `entries` — one row per captured period; indexed by `[projectId+periodKey]`
  to enforce the one-photo-per-period rule in application code.
- `assets` — JPEG bytes for full-size images and thumbnails, separate so
  the timeline never loads the full image.

The compound index `[projectId+periodKey]` enforces uniqueness: a
duplicate-period attempt throws rather than silently overwriting.

### Replace transaction ordering

Replacing an entry:
1. Decode and normalise the new image.
2. Write the new image asset and thumbnail asset.
3. Update the entry to reference the new assets.
4. Delete the old assets only after the entry update commits.

If any step before commit fails, the previous photo is preserved.

### Backup format

`.babyflip` is a ZIP archive containing:

```
manifest.json
images/<entry-id>.jpg
```

`manifest.json` includes the project, entry list, format identifier
(`babyflip`) and format version (currently `1`). Thumbnails are NOT
included; they are regenerated on restore.

Every backup is fully validated before any data is written:

- ZIP is readable.
- `manifest.format === "babyflip"`.
- `formatVersion` is supported.
- Project fields are valid.
- Every referenced image exists in the archive.
- Every image decodes successfully.
- Entry IDs and period keys are unique within the manifest.
- No path escapes the archive root.
- Archive size and entry count are within safe limits (500 MB / 5 000 photos).

### Export pipeline

The export runs in a dedicated Web Worker (`video-render.worker.ts`):

1. Main thread collects entries in the selected range and pulls the
   normalised image bytes from IndexedDB.
2. The Worker lazy-loads the FFmpeg single-threaded core from
   `https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/`.
3. Each entry is rendered as one or more 720 × 1280 PNG frames depending
   on the chosen speed (0.8 / 0.5 / 0.25 seconds per image). Frames are
   letterboxed onto a warm neutral background — never cropped.
4. FFmpeg concatenates frames into an H.264 MP4 (`libx264`, `yuv420p`,
   `+faststart`, no audio).
5. The Worker returns the resulting `Blob` to the main thread for
   download via a temporary object URL.

A failed export does not modify the source timeline.

## Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Vite dev server with HMR on `127.0.0.1:5173` |
| `npm run build` | `tsc -b` + Vite production build into `dist/` |
| `npm run preview` | Serve the production build on `127.0.0.1:4173` |
| `npm run lint` | ESLint over `src/` and `tests/` |
| `npm run test` | Vitest run (single pass, ~4 s, 64 tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | Build then start a preview server and curl the PWA artifacts |

## Testing

The test suite covers the pure logic and persistence layers:

- `tests/unit/dates.test.ts` — daily / weekly period keys (Mon-anchored,
  month and year boundaries), `isValidDateOnly` overflow rejection, age
  boundary cases, reversed-date defensive zero.
- `tests/unit/validation.test.ts` — child name length, future DOB,
  unrealistic year.
- `tests/unit/filenames.test.ts` — Windows-forbidden chars, collapse,
  truncation.
- `tests/unit/image-processing.test.ts` — landscape / portrait / thumbnail
  resize math.
- `tests/unit/persistence.test.ts` — Dexie CRUD, ordering by date, the
  compound `[projectId+periodKey]` index, cascade delete, transactional
  replacement leaves no orphans, duplicate-period rejection.
- `tests/unit/backup.test.ts` — backup create + manifest, round-trip read,
  rejection of missing manifest / wrong version / missing image / path
  escape / duplicate IDs, failed-restore preserves existing data,
  successful restore reproduces project + entries.
- `tests/unit/export-renderer.test.ts` — letterbox math for landscape and
  portrait inputs, per-speed frame counts.

End-to-end MP4 rendering, real camera capture, and HEIC decoding are
**not** exercised by automated tests in this environment (see
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md)).

## Browser requirements

- iOS Safari 17+
- Android Chrome 120+
- Modern desktop browsers (Chromium, Firefox, Safari) for restore +
  export flows

The PWA service worker only caches static application assets. It never
caches user-generated media through a server (there is no server).

## Deployment

Any static host works:

- Cloudflare Pages
- GitHub Pages
- Netlify static hosting
- Vercel (static output)

There is no runtime server, so free tiers are sufficient. The `dist/`
directory produced by `npm run build` is the entire deployable artifact.

## Privacy on the wire

Source inspection confirms there is no upload path. The full set of
"outbound" surfaces in `src/`:

- The browser's normal static-asset fetches for the app shell.
- The lazy FFmpeg core load (`unpkg.com/@ffmpeg/core@0.12.6/dist/umd/`)
  when the user starts an export.

There are no `fetch` calls that send user photos, no `XMLHttpRequest`,
no `navigator.sendBeacon`, no `FormData` upload, and no analytics SDK.

## License

This is an internal V1 implementation. License is whatever applies to the
parent project.