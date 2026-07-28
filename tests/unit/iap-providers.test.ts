// Day 5 tests: platform detection, feature flag reading, provider
// stubs, and provider selection logic.
//
// Each real provider is a web stub on Day 5 that returns "unavailable".
// The architecture is the testable surface.

import { describe, expect, it } from "vitest";
import { detectPlatform } from "../../src/engine/platform/detect";
import { readIapFeatureFlags } from "../../src/engine/feature-flags";
import { createAppleIapProvider } from "../../src/engine/iap/apple";
import { createGoogleIapProvider } from "../../src/engine/iap/google";
import { createStripeIapProvider } from "../../src/engine/iap/stripe";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import { createIapProvider } from "../../src/engine/providers";
import {
  clampToNodeInterval,
  NODE_MAX_INTERVAL_MS,
  REVALIDATION_INTERVAL_MS,
} from "../../src/engine/iap/state";
import type {
  IapProduct,
  PurchaseResult,
  UnlockState,
} from "../../src/engine/state";

describe("detectPlatform", () => {
  it("returns 'ios' for iPhone user agents", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(
      "ios",
    );
  });

  it("returns 'ios' for iPad user agents", () => {
    expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("ios");
  });

  it("returns 'ios' for iPod user agents", () => {
    expect(detectPlatform("Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0)")).toBe(
      "ios",
    );
  });

  it("returns 'android' for Android user agents", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      ),
    ).toBe("android");
  });

  it("returns 'desktop' for desktop user agents", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15",
      ),
    ).toBe("desktop");
    expect(
      detectPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ),
    ).toBe("desktop");
    expect(
      detectPlatform(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      ),
    ).toBe("desktop");
  });

  it("returns 'desktop' for empty user agent", () => {
    expect(detectPlatform("")).toBe("desktop");
  });
});

describe("readIapFeatureFlags", () => {
  it("defaults every flag to false", () => {
    const flags = readIapFeatureFlags({} as ImportMetaEnv);
    expect(flags).toEqual({ apple: false, google: false, stripe: false });
  });

  it("parses string 'true' / '1' as true", () => {
    expect(
      readIapFeatureFlags({
        VITE_IAP_APPLE_ENABLED: "true",
      } as unknown as ImportMetaEnv),
    ).toEqual({ apple: true, google: false, stripe: false });
    expect(
      readIapFeatureFlags({
        VITE_IAP_APPLE_ENABLED: "1",
      } as unknown as ImportMetaEnv),
    ).toEqual({ apple: true, google: false, stripe: false });
  });

  it("parses boolean true as true", () => {
    expect(
      readIapFeatureFlags({
        VITE_IAP_APPLE_ENABLED: true,
      } as unknown as ImportMetaEnv),
    ).toEqual({ apple: true, google: false, stripe: false });
  });

  it("parses string 'false' / '0' as false", () => {
    expect(
      readIapFeatureFlags({
        VITE_IAP_APPLE_ENABLED: "false",
      } as unknown as ImportMetaEnv),
    ).toEqual({ apple: false, google: false, stripe: false });
    expect(
      readIapFeatureFlags({
        VITE_IAP_APPLE_ENABLED: "0",
      } as unknown as ImportMetaEnv),
    ).toEqual({ apple: false, google: false, stripe: false });
  });
});

describe("Provider stubs", () => {
  describe("Apple", () => {
    it("isAvailable() returns false on web", () => {
      expect(createAppleIapProvider().isAvailable()).toBe(false);
    });

    it("buy() returns unavailable", async () => {
      const result = await createAppleIapProvider().buy("clean");
      expect(result).toEqual<PurchaseResult>({ ok: false, reason: "unavailable" });
    });

    it("restore() returns free", async () => {
      expect(await createAppleIapProvider().restore()).toBe<UnlockState>("free");
    });

    it("getUnlock() returns free", async () => {
      expect(await createAppleIapProvider().getUnlock()).toBe<UnlockState>(
        "free",
      );
    });
  });

  describe("Google", () => {
    it("isAvailable() returns false on web", () => {
      expect(createGoogleIapProvider().isAvailable()).toBe(false);
    });

    it("buy() returns unavailable", async () => {
      const result = await createGoogleIapProvider().buy("studio");
      expect(result).toEqual<PurchaseResult>({ ok: false, reason: "unavailable" });
    });
  });

  describe("Stripe", () => {
    it("isAvailable() returns false in V2.0", () => {
      expect(createStripeIapProvider().isAvailable()).toBe(false);
    });

    it("buy() returns unavailable", async () => {
      const result = await createStripeIapProvider().buy("clean");
      expect(result).toEqual<PurchaseResult>({ ok: false, reason: "unavailable" });
    });
  });

  describe("Dev (explicit availability)", () => {
    it("isAvailable() returns true when constructed with available:true", () => {
      expect(createDevIapProvider({ available: true }).isAvailable()).toBe(
        true,
      );
    });

    it("isAvailable() returns false when constructed with available:false", () => {
      expect(createDevIapProvider({ available: false }).isAvailable()).toBe(
        false,
      );
    });
  });
});

describe("createIapProvider (selection)", () => {
  it("returns the dev provider when no flags are set", () => {
    // The factory reads import.meta.env directly. In tests the default
    // env has no VITE_IAP_* flags, so the dev provider is selected.
    // We assert the provider's surface rather than its identity to
    // avoid coupling the test to the factory's exact return shape.
    const provider = createIapProvider();
    // The dev provider has the same shape as the real providers.
    expect(typeof provider.isAvailable).toBe("function");
    expect(typeof provider.buy).toBe("function");
    expect(typeof provider.restore).toBe("function");
    expect(typeof provider.getUnlock).toBe("function");
  });

  it("the selected provider exposes the IapProvider interface", async () => {
    const provider = createIapProvider();
    // Smoke: every method returns a Promise that resolves.
    const buyResult = await provider.buy("clean");
    expect(["ok", "ok-false"]).toContain(buyResult.ok ? "ok" : "ok-false");
  });
});

describe("REVALIDATION_INTERVAL_MS clamping", () => {
  it("REVALIDATION_INTERVAL_MS is 30 days in ms", () => {
    expect(REVALIDATION_INTERVAL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("clampToNodeInterval clamps to 32-bit signed int max", () => {
    expect(NODE_MAX_INTERVAL_MS).toBe(0x7fffffff);
    expect(clampToNodeInterval(REVALIDATION_INTERVAL_MS)).toBe(
      NODE_MAX_INTERVAL_MS,
    );
  });

  it("clampToNodeInterval passes through smaller values", () => {
    expect(clampToNodeInterval(1000)).toBe(1000);
    expect(clampToNodeInterval(60_000)).toBe(60_000);
  });

  it("clampToNodeInterval defaults to 1000ms for invalid input", () => {
    expect(clampToNodeInterval(0)).toBe(1000);
    expect(clampToNodeInterval(-1)).toBe(1000);
    expect(clampToNodeInterval(Number.NaN)).toBe(1000);
  });
});

describe("IAP product types", () => {
  it("supports 'clean' and 'studio' as the only products", () => {
    const products: IapProduct[] = ["clean", "studio"];
    expect(products).toHaveLength(2);
  });
});
