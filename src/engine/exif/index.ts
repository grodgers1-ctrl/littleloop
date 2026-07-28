// V2.5 EXIF engine module.
//
// Day 1 ships the directory + barrel. The `read.ts` pure function
// (parses DateTimeOriginal + DateTime tags from a JPEG's EXIF
// segment) lands on Day 3. The function takes a `Blob` or `ArrayBuffer`
// and returns `{ date: string /* YYYY-MM-DD */ } | null`. It runs
// entirely client-side — no network calls, no exfiltration.
//
// The UI layer (ImportDateScreen) consumes this to pre-fill the
// date picker when the user picks a library photo. The user can
// always override the pre-filled value.

export {};
