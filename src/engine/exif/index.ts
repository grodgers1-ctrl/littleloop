// V2.5 EXIF engine module — public barrel.
//
// `readExifDate` reads DateTimeOriginal (or DateTime as a
// fallback) from a JPEG's EXIF segment. It is pure, async, and
// has no dependencies. The UI layer (ImportDateScreen) consumes
// the Blob entry point; tests and any future non-UI consumer
// (e.g. an offline-bulk-rewrite tool) can use the ArrayBuffer
// entry point directly.
//
// Privacy: the parse happens entirely client-side. The bytes
// never leave the device. The Day 9 V2.5 settings screen adds a
// privacy disclosure that references this module.
//
// Scope: JPEG only. HEIC, RAW, and TIFF fall through and the
// import date screen falls back to "today". The capture path
// converts to JPEG upstream; the library import path accepts
// `image/*` and warns on non-JPEG.

export { readExifDate, readExifDateFromArrayBuffer } from "./read";
export type { ExifResult } from "./read";
