// Filename helpers. Sanitize user-controlled strings so the resulting
// filename is safe on every common OS (Windows, macOS, iOS, Android).

export function sanitizeFilename(input: string): string {
  // Strip control chars and characters forbidden on Windows.
  // Keep letters, digits, space, dash, underscore, dot, parens.
  const cleaned = input
    .normalize("NFKD")
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return cleaned || "timeline";
}

export function flipbookFilename(childName: string, date: string): string {
  const safe = sanitizeFilename(childName);
  return `${safe}-flipbook-${date}.mp4`;
}

/**
 * Default V2 backup filename. The `.babyloop` extension replaces
 * V1's `.babyflip` — the V2 backup service still reads both formats
 * for backwards compatibility. New backups always write `.babyloop`.
 */
export function backupFilename(childName: string, date: string): string {
  const safe = sanitizeFilename(childName);
  return `${safe}-timeline-backup-${date}.babyloop`;
}

/**
 * V1 backup filename. Kept as a separate helper so legacy callers
 * (e.g. tests that need to verify V1 archive compatibility) can
 * generate the V1-style name.
 */
export function backupFilenameV1(childName: string, date: string): string {
  const safe = sanitizeFilename(childName);
  return `${safe}-timeline-backup-${date}.babyflip`;
}

/** Detect the format of an uploaded backup file by extension. */
export type BackupFormat = "babyloop" | "babyflip" | "unknown";

export function detectBackupFormat(filename: string): BackupFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".babyloop")) return "babyloop";
  if (lower.endsWith(".babyflip")) return "babyflip";
  return "unknown";
}