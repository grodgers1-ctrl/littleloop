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

export function backupFilename(childName: string, date: string): string {
  const safe = sanitizeFilename(childName);
  return `${safe}-timeline-backup-${date}.babyflip`;
}