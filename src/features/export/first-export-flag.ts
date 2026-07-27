// Persisted UI flags. Kept in localStorage so they survive refreshes
// but don't need to live in IndexedDB. Each flag has a typed getter
// and a safe setter that no-ops on the server (or in non-browser
// test envs).

const KEYS = {
  firstExportDone: "ll:firstExportDone",
} as const;

function safeGet(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage might be full or disabled (private mode); ignore.
  }
}

export function hasCompletedFirstExport(): boolean {
  return safeGet(KEYS.firstExportDone) === "1";
}

export function markFirstExportDone(): void {
  safeSet(KEYS.firstExportDone, "1");
}