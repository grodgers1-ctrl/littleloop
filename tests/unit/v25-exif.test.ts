// V2.5 Day 3 — EXIF date detection.
//
// We build minimal synthetic JPEGs in JS so the parser is tested
// against the same byte layout iOS / Android cameras produce.
// The helper constructs: SOI + APP1(EXIF) + APP0(JFIF) + EOI.
//
// The EXIF segment has:
//   - "Exif\0\0" identifier
//   - TIFF header (byte order, magic, IFD0 offset)
//   - IFD0 with the requested tag(s)
//   - Sub-IFD (ExifIFD) if DateTimeOriginal is requested
//   - The actual ASCII value bytes
//
// This lets us exercise:
//   - DateTimeOriginal (preferred source)
//   - DateTime (fallback source)
//   - Missing EXIF
//   - Non-JPEG input
//   - Malformed EXIF (e.g. wrong magic)
//   - Future / past dates (normalisation only — the UI caps
//     against today)

import { describe, expect, it } from "vitest";
import { readExifDateFromArrayBuffer } from "../../src/engine/exif/read";
import { readExifDate } from "../../src/engine/exif";

/** Build a minimal JPEG with a single ASCII EXIF date. */
function buildJpegWithExifDate(opts: {
  /** Tag to populate. Default: DateTime (0x0132 in IFD0). */
  which?: "DateTime" | "DateTimeOriginal";
  /** Raw EXIF datetime string, e.g. "2025:06:01 12:30:45". */
  raw: string;
  /** Byte order. Default "II" (little-endian). */
  byteOrder?: "II" | "MM";
}): ArrayBuffer {
  const which = opts.which ?? "DateTime";
  const order = opts.byteOrder ?? "II";
  const little = order === "II";
  const put16 = (v: number): Uint8Array =>
    little
      ? new Uint8Array([v & 0xff, (v >> 8) & 0xff])
      : new Uint8Array([(v >> 8) & 0xff, v & 0xff]);
  const put32 = (v: number): Uint8Array =>
    little
      ? new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff])
      : new Uint8Array([(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);

  // Build the TIFF block first so we know its length.
  // - TIFF header: 8 bytes
  // - IFD0: 2 (entry count) + N * 12 (entries) + 4 (next IFD offset = 0)
  // - (Optional) ExifIFD: 2 + M * 12 + 4
  // - DateTimeOriginal ASCII value (20 bytes incl. NUL)
  // - DateTime ASCII value (20 bytes incl. NUL)

  const dateBytes = new TextEncoder().encode(opts.raw + "\0");
  // DateTime needs 20 bytes; DateTimeOriginal needs 20 bytes. EXIF
  // spec mandates 20 chars including the trailing NUL. We pad.
  const padded = new Uint8Array(20);
  padded.set(dateBytes.slice(0, 19));

  const hasOriginal = which === "DateTimeOriginal";
  const exifIfdEntryCount = 1; // 0x9003 + value offset

  const tiffHeader = 8;
  const ifd0Start = tiffHeader;
  const exifIfdSize = 2 + exifIfdEntryCount * 12 + 4;

  // IFD0 entry count: DateTime + ExifIFD pointer when
  // building DateTimeOriginal.
  const realIfd0EntryCount = hasOriginal ? 2 : 1;
  const realIfd0Size = 2 + realIfd0EntryCount * 12 + 4;
  const realExifIfdStart = ifd0Start + realIfd0Size;
  const realValueStart = realExifIfdStart + (hasOriginal ? exifIfdSize : 0);
  const realDateTimeValueOffset = realValueStart;
  const realDateTimeOriginalValueOffset = realValueStart + (hasOriginal ? 20 : 0);

  const totalTiffLen =
    tiffHeader +
    realIfd0Size +
    (hasOriginal ? exifIfdSize : 0) +
    (hasOriginal ? 20 : 0) +
    20;

  const tiff = new Uint8Array(totalTiffLen);
  let p = 0;
  // TIFF header: byte order + magic + IFD0 offset
  tiff[p++] = order.charCodeAt(0);
  tiff[p++] = order.charCodeAt(1);
  tiff.set(put16(0x002a), p);
  p += 2;
  tiff.set(put32(ifd0Start), p);
  p += 4;
  // IFD0
  tiff.set(put16(realIfd0EntryCount), p);
  p += 2;
  if (hasOriginal) {
    // Entry: ExifIFD pointer (0x8769), LONG, count=1, value=offset
    tiff.set(put16(0x8769), p);
    p += 2;
    tiff.set(put16(4), p);
    p += 2; // type LONG
    tiff.set(put32(1), p);
    p += 4; // count
    tiff.set(put32(realExifIfdStart), p);
    p += 4; // value (offset to ExifIFD)
  }
  // Entry: DateTime (0x0132), ASCII, count=20, value=offset
  tiff.set(put16(0x0132), p);
  p += 2;
  tiff.set(put16(2), p);
  p += 2; // type ASCII
  tiff.set(put32(20), p);
  p += 4; // count
  tiff.set(put32(realDateTimeValueOffset), p);
  p += 4;
  // IFD0 next-IFD offset (0 = no more IFDs)
  tiff.set(put32(0), p);
  p += 4;

  if (hasOriginal) {
    // ExifIFD
    tiff.set(put16(exifIfdEntryCount), p);
    p += 2;
    tiff.set(put16(0x9003), p);
    p += 2; // DateTimeOriginal
    tiff.set(put16(2), p);
    p += 2; // ASCII
    tiff.set(put32(20), p);
    p += 4;
    tiff.set(put32(realDateTimeOriginalValueOffset), p);
    p += 4;
    tiff.set(put32(0), p);
    p += 4;
  }
  // Value bytes.
  if (hasOriginal) {
    tiff.set(padded, p);
    p += 20;
  }
  tiff.set(padded, p);
  p += 20;

  // Wrap in a JPEG: SOI + APP1(EXIF) + EOI
  const segLen = 2 + 6 + totalTiffLen; // length includes itself
  const out = new Uint8Array(2 + 2 + segLen + 2);
  out[0] = 0xff;
  out[1] = 0xd8; // SOI
  out[2] = 0xff;
  out[3] = 0xe1; // APP1
  out[4] = (segLen >> 8) & 0xff;
  out[5] = segLen & 0xff;
  // "Exif\0\0" identifier
  out[6] = 0x45; // E
  out[7] = 0x78; // x
  out[8] = 0x69; // i
  out[9] = 0x66; // f
  out[10] = 0x00;
  out[11] = 0x00;
  out.set(tiff, 12);
  // EOI
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9;
  return out.buffer;
}

describe("readExifDateFromArrayBuffer", () => {
  it("extracts DateTime from a JPEG", () => {
    const buf = buildJpegWithExifDate({ raw: "2025:06:01 12:30:45" });
    const r = readExifDateFromArrayBuffer(buf);
    expect(r).toEqual({ date: "2025-06-01", source: "DateTime" });
  });

  it("prefers DateTimeOriginal when present", () => {
    const buf = buildJpegWithExifDate({
      which: "DateTimeOriginal",
      raw: "2024:12:31 23:59:59",
    });
    const r = readExifDateFromArrayBuffer(buf);
    expect(r).toEqual({ date: "2024-12-31", source: "DateTimeOriginal" });
  });

  it("returns null for non-JPEG input", () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer; // PNG signature
    expect(readExifDateFromArrayBuffer(buf)).toBeNull();
  });

  it("returns null for a JPEG with no EXIF segment", () => {
    // SOI + APP0 (JFIF) + EOI — no EXIF, no dates.
    const out = new Uint8Array(2 + 2 + 16 + 2);
    out[0] = 0xff;
    out[1] = 0xd8;
    out[2] = 0xff;
    out[3] = 0xe0;
    out[4] = 0x00;
    out[5] = 0x10;
    out[out.length - 2] = 0xff;
    out[out.length - 1] = 0xd9;
    expect(readExifDateFromArrayBuffer(out.buffer)).toBeNull();
  });

  it("returns null for a JPEG whose EXIF magic is wrong", () => {
    // SOI + APP1 with length but no "Exif\0\0" identifier.
    const out = new Uint8Array(2 + 2 + 8 + 2);
    out[0] = 0xff;
    out[1] = 0xd8;
    out[2] = 0xff;
    out[3] = 0xe1;
    out[4] = 0x00;
    out[5] = 0x0a;
    out[out.length - 2] = 0xff;
    out[out.length - 1] = 0xd9;
    expect(readExifDateFromArrayBuffer(out.buffer)).toBeNull();
  });

  it("returns null for an EXIF date with a malformed month", () => {
    // Build a JPEG with raw "2025:13:01 00:00:00" (month 13 invalid).
    const buf = buildJpegWithExifDate({ raw: "2025:13:01 00:00:00" });
    // The parser normalises via normaliseExifDate, which rejects
    // month > 12 — the entry stays but the result is null.
    expect(readExifDateFromArrayBuffer(buf)).toBeNull();
  });

  it("handles big-endian (MM) byte order", () => {
    const buf = buildJpegWithExifDate({
      raw: "2023:03:15 09:00:00",
      byteOrder: "MM",
    });
    const r = readExifDateFromArrayBuffer(buf);
    expect(r).toEqual({ date: "2023-03-15", source: "DateTime" });
  });

  it("returns null for an empty buffer", () => {
    expect(readExifDateFromArrayBuffer(new ArrayBuffer(0))).toBeNull();
  });
});

describe("readExifDate (Blob entry point)", () => {
  it("extracts DateTime from a Blob", async () => {
    const buf = buildJpegWithExifDate({ raw: "2025:01:15 18:00:00" });
    const blob = new Blob([buf], { type: "image/jpeg" });
    const r = await readExifDate(blob);
    expect(r).toEqual({ date: "2025-01-15", source: "DateTime" });
  });

  it("returns null for an empty Blob (no JPEG head)", async () => {
    const blob = new Blob([new Uint8Array([0, 0, 0, 0])], { type: "image/jpeg" });
    expect(await readExifDate(blob)).toBeNull();
  });
});
