// Safe browser download helper. Falls back to opening a blob URL
// when anchor-click downloads are blocked (e.g. on iOS Safari for
// large files).

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Defer revoke to give the browser time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}