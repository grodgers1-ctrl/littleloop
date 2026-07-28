// V2.0 engine provider stubs. Day 1 wires the skeleton so the engine
// boundary exists end to end; concrete implementations land on later
// days. Each provider is intentionally minimal — enough for the
// engine to construct and `init()` to resolve without errors, so the
// V1 app keeps working unchanged through Day 7.
//
// DO NOT add real IAP / share / ads logic here. Day 4 does IAP, Day
// 10–11 does platform, Day 6 does ads.

import type {
  AdProvider,
  IapProvider,
  Platform,
} from "./engine";
import type {
  IapProduct,
  PurchaseResult,
  ShareOptions,
  ShareResult,
  UnlockState,
} from "./state";

/** Dev IAP provider. Day 4 fills in the real `getUnlock()` read/write
 *  and the receipt store. For Day 1 it just reports `isAvailable() =
 *  false` so the paywall (when it lands) shows "coming soon" rather
 *  than offering a dev-grant unlock. */
export function createDevIapProvider(): IapProvider {
  return {
    isAvailable: () => false,
    buy: (_product: IapProduct): Promise<PurchaseResult> =>
      Promise.resolve({ ok: false, reason: "unavailable" }),
    restore: (): Promise<UnlockState> => Promise.resolve("free"),
    getUnlock: (): Promise<UnlockState> => Promise.resolve("free"),
  };
}

/** Stub platform adapter. Day 10 implements camera-roll, Day 11
 *  implements share, Day 12 implements file-system. */
export function createBrowserPlatform(): Platform {
  return {
    share: (_blob: Blob, _filename: string, _options: ShareOptions): Promise<ShareResult> =>
      Promise.resolve({ shared: false, reason: "unavailable" }),
    saveToCameraRoll: (_blob: Blob, _filename: string): Promise<boolean> =>
      Promise.resolve(false),
    saveToFiles: (_blob: Blob, _filename: string, _mimeType: string): Promise<boolean> =>
      Promise.resolve(false),
    pickFile: (_accept: string): Promise<File | null> => Promise.resolve(null),
  };
}

/** Stub ad provider. Day 6 fills in the placeholder banner and the
 *  frequency cap. */
export function createPlaceholderAdProvider(): AdProvider {
  return {
    shouldShow: () => false,
    impression: () => {
      /* no-op */
    },
    lastImpressionAt: () => null,
  };
}
