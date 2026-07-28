// Browser platform implementation. Provides the real browser
// implementations of the Platform interface.
//
// saveToCameraRoll:
//   - iOS Safari: uses the Web Share API with a file. Opens the
//     share sheet; the user can pick "Save to Photos" or share to
//     another app. Returns true if shared.
//   - Other browsers: creates an `<a download>` element and clicks
//     it. The file downloads to the user's Downloads folder.
//   - Falls back to `<a download>` when Web Share is unavailable.
//
// share:
//   - Uses the Web Share API with file support. If `navigator.canShare`
//     is available and accepts the file, opens the platform share
//     sheet. Otherwise returns `{ shared: false, reason: "unavailable" }`.
//     Day 11 adds the fallback UI (WhatsApp/Instagram/Email/Files).
//
// saveToFiles:
//   - Creates an `<a download>` element with the given filename.
//     The browser's native Save dialog lets the user choose a folder.
//
// pickFile:
//   - Creates a hidden `<input type="file">` and returns the selected
//     File. Resolves to null if the user cancels.

import type { Platform } from "../engine";
import type { ShareOptions, ShareResult } from "../state";

export function createBrowserPlatform(): Platform {
  return {
    async saveToCameraRoll(blob: Blob, filename: string): Promise<boolean> {
      // Try Web Share API first — works on iOS Safari 15+ and opens
      // the share sheet where the user can pick "Save to Photos".
      if (typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
        const file = new File([blob], filename, { type: "video/mp4" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            // User completed the share. On iOS the share sheet
            // includes "Save to Photos" — the user chose it, so
            // we report success.
            return true;
          } catch {
            // User cancelled the share sheet. Fall through to the
            // download fallback so the user still has a way to get
            // the file.
          }
        }
      }

      // Fallback: create an anchor element and click it.
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        // The download is initiated. We can't tell whether the user
        // actually saved or cancelled (no feedback API), so we report
        // true to indicate the download was started.
        return true;
      } finally {
        // Give the browser time to start the download before revoking.
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    },

    async share(
      blob: Blob,
      filename: string,
      options: ShareOptions,
    ): Promise<ShareResult> {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function"
      ) {
        const file = new File([blob], filename, { type: "video/mp4" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: options.title,
              text: options.text,
            });
            return { shared: true };
          } catch {
            return { shared: false, reason: "cancelled" };
          }
        }
      }
      return { shared: false, reason: "unavailable" };
    },

    async saveToFiles(blob: Blob, filename: string, _mimeType: string): Promise<boolean> {
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    },

    pickFile(accept: string): Promise<File | null> {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.style.display = "none";
        input.onchange = () => {
          const file = input.files?.[0] ?? null;
          input.remove();
          resolve(file);
        };
        // If the user cancels the file picker, the change event never
        // fires. We add a blur listener as a heuristic for "cancelled."
        input.onblur = () => {
          // Wait a brief tick in case the blur was from the file picker
          // opening. The file picker focus is inside the OS dialog, not
          // on the element, so blur fires when the dialog opens.
          setTimeout(() => {
            if (!input.files?.length) {
              input.remove();
              resolve(null);
            }
          }, 100);
        };
        document.body.appendChild(input);
        input.click();
      });
    },
  };
}