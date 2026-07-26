// Storage helpers: persistent storage request + storage estimate + low-space warning.

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    typeof navigator.storage.persist === "function"
  ) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    typeof navigator.storage.estimate === "function"
  ) {
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? null, quota: est.quota ?? null };
    } catch {
      return { usage: null, quota: null };
    }
  }
  return { usage: null, quota: null };
}

export function isLowStorage(info: StorageInfo): boolean {
  if (info.usage == null || info.quota == null || info.quota === 0) return false;
  return info.usage / info.quota > 0.85;
}