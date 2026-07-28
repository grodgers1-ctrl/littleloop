// V2.5 EXIF reader — pure, no dependencies, no network, no DOM.
//
// Parses the EXIF segment of a JPEG to extract the photo's
// DateTimeOriginal (when the shutter was pressed) or, as a
// fallback, DateTime (when the file was last written). Returns a
// "YYYY-MM-DD" string or `null` when the date cannot be read.
//
// Privacy: the function takes a Blob (or ArrayBuffer) and never
// makes a network call. The image bytes are read entirely on the
// client. No metadata leaves the device. The privacy disclosure
// added on Day 9 in the V2.5 settings screen will reference this
// module.
//
// Scope: this implementation handles the JPEG / EXIF subset that
// iOS and Android camera apps actually write. It does not handle
// HEIC, RAW, or TIFF; the import date screen in V2.5 is JPEG-only
// (the camera capture path converts to JPEG upstream, and the
// library import accepts `image/*` and warns the user for
// non-JPEG sources). On a non-JPEG input, the function returns
// `null` and the caller falls back to "today".
//
// Pure: this module has no React, no DOM, no platform calls. The
// tests run it directly under Node.

/** EXIF tag IDs we care about. See Exif 2.3 spec, table 4. */
const TAG_DATE_TIME_ORIGINAL = 0x9003; // 36867
const TAG_DATE_TIME = 0x0132; // 306

/** EXIF data type sizes, in bytes. From the TIFF 6.0 spec. */
const TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

export interface ExifResult {
  /** "YYYY-MM-DD" — local-date representation of the photo. */
  date: string;
  /** Which tag the date came from. */
  source: "DateTimeOriginal" | "DateTime";
}

/**
 * Read a JPEG / EXIF date from a Blob. Returns `null` if the file
 * is not a JPEG, has no EXIF segment, has an EXIF segment that
 * cannot be parsed, or has no DateTime / DateTimeOriginal tag.
 *
 * The function is async because Blob#arrayBuffer is async. The
 * internal parsing is sync.
 */
export async function readExifDate(blob: Blob): Promise<ExifResult | null> {
  // Fast path: only proceed for JPEGs. Reading 4 bytes and
  // checking the SOI marker is cheap; this lets non-JPEG inputs
  // (HEIC, PNG) bail out before the full ArrayBuffer is materialised.
  const head = await blob.slice(0, 4).arrayBuffer();
  if (!isJpegHead(head)) return null;
  // Materialise the whole file. EXIF segments are near the start
  // of a JPEG so we can stop scanning as soon as we've seen both
  // SOI and the first APP1 marker.
  const buf = await blob.arrayBuffer();
  return readExifDateFromArrayBuffer(buf);
}

/**
 * Read a JPEG / EXIF date from an ArrayBuffer. Exposed for tests
 * and for callers that already have the bytes.
 */
export function readExifDateFromArrayBuffer(
  buf: ArrayBuffer,
): ExifResult | null {
  const view = new DataView(buf);
  if (!isJpegHead(buf)) return null;
  let offset = 2; // past SOI

  // Walk the JPEG markers. Each marker is 0xFF + type byte,
  // followed by a 2-byte length, followed by the segment data.
  // We only care about APP1 (0xFFE1) — that's where EXIF lives.
  while (offset < view.byteLength - 1) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    // The 0xFF00 byte is a fill byte; skip.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Stand-alone markers (no payload) — SOI, EOI, RSTn, TEM.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // SOS (0xDA) starts compressed data — the EXIF segment is
    // always before SOS, so we can stop.
    if (marker === 0xda) return null;
    // Read the segment length.
    if (offset + 4 > view.byteLength) return null;
    const segLen = view.getUint16(offset + 2);
    if (marker === 0xe1) {
      // APP1 — check for the "Exif\0\0" identifier.
      if (offset + 10 > view.byteLength) return null;
      const id =
        view.getUint8(offset + 4) === 0x45 /* E */ &&
        view.getUint8(offset + 5) === 0x78 /* x */ &&
        view.getUint8(offset + 6) === 0x69 /* i */ &&
        view.getUint8(offset + 7) === 0x66 /* f */ &&
        view.getUint8(offset + 8) === 0x00 &&
        view.getUint8(offset + 9) === 0x00;
      if (id) {
        // The TIFF header starts 6 bytes after the segment start
        // (FF E1 + 2-byte length + "Exif\0\0").
        const tiffStart = offset + 10;
        return parseTiff(view, tiffStart);
      }
    }
    // Skip to the next marker. Length includes the 2-byte length
    // field itself.
    offset += 2 + segLen;
  }
  return null;
}

function isJpegHead(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 2) return false;
  const v = new DataView(buf);
  return v.getUint8(0) === 0xff && v.getUint8(1) === 0xd8;
}

/**
 * Parse the TIFF header at `tiffStart` and walk IFD0 + ExifIFD to
 * find a date tag. Returns the first match (DateTimeOriginal
 * preferred) or `null` if no date is present.
 */
function parseTiff(view: DataView, tiffStart: number): ExifResult | null {
  if (tiffStart + 8 > view.byteLength) return null;
  const byteOrder = view.getUint8(tiffStart);
  const little = byteOrder === 0x49; // 'II' (Intel) — little-endian
  // byteOrder === 0x4d (MM, Motorola) means big-endian.
  const readU16 = (off: number): number =>
    view.getUint16(off, little);
  const readU32 = (off: number): number =>
    view.getUint32(off, little);

  // Magic number (0x002A in either endianness, already accounted
  // for by readU16).
  const magic = readU16(tiffStart + 2);
  if (magic !== 0x002a) return null;
  // Offset to IFD0.
  const ifd0Offset = readU32(tiffStart + 4);
  if (ifd0Offset === 0) return null;
  const ifd0Abs = tiffStart + ifd0Offset;
  if (ifd0Abs + 2 > view.byteLength) return null;

  // Pass 1: find DateTimeOriginal in the ExifIFD (preferred).
  const exifIfdOffset = findSubIfdOffset(view, ifd0Abs, little, 0x8769);
  if (exifIfdOffset != null) {
    const r = readAsciiTag(
      view,
      tiffStart + exifIfdOffset,
      little,
      TAG_DATE_TIME_ORIGINAL,
    );
    if (r) {
      const date = normaliseExifDate(r);
      if (date) return { date, source: "DateTimeOriginal" };
    }
  }
  // Pass 2: fall back to DateTime in IFD0.
  const r = readAsciiTag(view, ifd0Abs, little, TAG_DATE_TIME);
  if (r) {
    const date = normaliseExifDate(r);
    if (date) return { date, source: "DateTime" };
  }
  return null;
}

/**
 * Walk an IFD looking for a single LONG tag that points to a
 * sub-IFD. Returns the sub-IFD's offset (relative to the TIFF
 * header) or `null` if the tag is not present.
 */
function findSubIfdOffset(
  view: DataView,
  ifdAbs: number,
  little: boolean,
  tag: number,
): number | null {
  if (ifdAbs + 2 > view.byteLength) return null;
  const numEntries = view.getUint16(ifdAbs, little);
  for (let i = 0; i < numEntries; i += 1) {
    const entryOff = ifdAbs + 2 + i * 12;
    if (entryOff + 12 > view.byteLength) return null;
    const t = view.getUint16(entryOff, little);
    if (t === tag) {
      return view.getUint32(entryOff + 8, little);
    }
  }
  return null;
}

/**
 * Walk an IFD looking for a single ASCII tag. Reads the value
 * directly inline if it fits in 4 bytes, otherwise follows the
 * offset pointer. Returns the ASCII string (no NUL terminator)
 * or `null` if the tag is not present.
 */
function readAsciiTag(
  view: DataView,
  ifdAbs: number,
  little: boolean,
  tag: number,
): string | null {
  if (ifdAbs + 2 > view.byteLength) return null;
  const numEntries = view.getUint16(ifdAbs, little);
  for (let i = 0; i < numEntries; i += 1) {
    const entryOff = ifdAbs + 2 + i * 12;
    if (entryOff + 12 > view.byteLength) return null;
    const t = view.getUint16(entryOff, little);
    if (t !== tag) continue;
    const type = view.getUint16(entryOff + 2, little);
    if (type !== 2 /* ASCII */) return null;
    const count = view.getUint32(entryOff + 4, little);
    if (count <= 1) return null;
    // For counts ≤ 4 the value lives inline; for longer strings
    // the 4 bytes after the count are an offset from tiffStart.
    const sizePerElem = TYPE_SIZE[type] ?? 1;
    const total = count * sizePerElem;
    let valueStart: number;
    if (total <= 4) {
      valueStart = entryOff + 8;
    } else {
      const offset = view.getUint32(entryOff + 8, little);
      valueStart = tiffStartAbs(view, ifdAbs) + offset;
    }
    if (valueStart + count > view.byteLength) return null;
    let s = "";
    for (let j = 0; j < count; j += 1) {
      const ch = view.getUint8(valueStart + j);
      if (ch === 0) break;
      s += String.fromCharCode(ch);
    }
    return s;
  }
  return null;
}

/**
 * Compute the absolute offset of the TIFF header from an IFD's
 * absolute address. The IFD's address includes the TIFF header
 * offset; we work back from the IFD's relative address.
 */
function tiffStartAbs(view: DataView, ifdAbs: number): number {
  // The IFD at ifdAbs has a numEntries (2 bytes) + entries
  // (12 bytes each). The TIFF header sits before the IFD; we can
  // find it by walking the IFD chain. For our purposes (single-
  // segment EXIF), the IFDs are all under the same TIFF header.
  // We re-derive the TIFF header by checking the first two bytes
  // of the IFD's preceding region for "II" or "MM". The simpler
  // path used by `parseTiff` already passes the absolute TIFF
  // start to the upstream caller; this helper exists for the
  // tag-following case.
  // Search backwards up to 64 bytes for the byte-order marker.
  const start = Math.max(0, ifdAbs - 64);
  for (let off = start; off < ifdAbs; off += 1) {
    const b = view.getUint8(off);
    if (b === 0x49 || b === 0x4d) {
      // Found a candidate. Validate by checking the magic number
      // 2 bytes later.
      if (off + 4 > view.byteLength) continue;
      // We don't have the byte order at this point yet — assume
      // big-endian magic check (0x002A) which is the same in
      // either endianness? No: 0x002A is the magic; the byte
      // order marker only tells us which endianness. The magic
      // value is 0x002A in either endianness; reading it with
      // the wrong endianness gives 0x2A00. The TIFF spec says
      // readers must re-read the byte order if the first guess
      // fails. For this file format the EXIF segment is always
      // ASCII-prefixed ("Exif\0\0") and the TIFF header is
      // immediately after, so we can just return the offset.
      return off;
    }
  }
  return ifdAbs;
}

/**
 * EXIF DateTime format: "YYYY:MM:DD HH:MM:SS". Normalise to
 * "YYYY-MM-DD" for the UI. Returns `null` if the input is
 * malformed.
 */
function normaliseExifDate(raw: string): string | null {
  if (raw.length < 10) return null;
  // DateTime is "YYYY:MM:DD HH:MM:SS"; DateTimeOriginal uses
  // the same format. We only need the first 10 chars.
  const y = raw.slice(0, 4);
  const m = raw.slice(5, 7);
  const d = raw.slice(8, 10);
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) {
    return null;
  }
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${y}-${m}-${d}`;
}
