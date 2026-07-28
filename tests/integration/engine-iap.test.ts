// IAP integration tests. Use fake-indexeddb so the engine + IAP
// state module touch a real Dexie instance. The dev IAP provider is
// exercised end to end: buy → state change → restore → persistence
// across "reload" (fresh engine instance, same DB).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import {
  __clearUnlockCacheForTesting,
  deviceFingerprint,
  loadEffectiveUnlock,
} from "../../src/engine/iap/state";
import type {
  AdProvider,
  IapProvider,
  Platform,
} from "../../src/engine/engine";
import type { IapProduct } from "../../src/engine/state";

function freshDb(): LittleLoopDB {
  return new LittleLoopDB(
    `little-loop-db-test-${Math.random().toString(36).slice(2)}`,
  );
}

function stubPlatform(): Platform {
  return {
    share: () => Promise.resolve({ shared: false, reason: "unavailable" }),
    saveToCameraRoll: () => Promise.resolve(false),
    saveToFiles: () => Promise.resolve(false),
    pickFile: () => Promise.resolve(null),
  };
}

function stubAds(): AdProvider {
  return {
    shouldShow: () => false,
    impression: () => {},
    lastImpressionAt: () => null,
  };
}

function freshEngine(overrides: { iap?: IapProvider } = {}): Engine {
  return new Engine({
    iap:
      overrides.iap ??
      createDevIapProvider({ available: true }),
    platform: stubPlatform(),
    ads: stubAds(),
  });
}

beforeEach(() => {
  __clearUnlockCacheForTesting();
});

afterEach(() => {
  __setEngineForTesting(null);
  resetDbForTesting();
  __clearUnlockCacheForTesting();
});

describe("IAP state helpers", () => {
  it("deviceFingerprint is stable across calls", () => {
    expect(deviceFingerprint()).toBe(deviceFingerprint());
  });

  it("loadEffectiveUnlock returns free on empty DB", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const eff = await loadEffectiveUnlock();
    expect(eff.state).toBe("free");
    expect(eff.receipt).toBeNull();
  });
});

describe("Dev IAP provider", () => {
  it("isAvailable() returns true when explicitly available", () => {
    const provider = createDevIapProvider({ available: true });
    expect(provider.isAvailable()).toBe(true);
  });

  it("buy('clean') persists a receipt and returns ok=true with unlock=clean", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();

    const result = await engine.iapBuy("clean");

    // The dev provider returns the result from buy() directly.
    // We don't rely on its return value shape here, only on the
    // engine's effective state after the call.
    expect(result).toBe("clean");
    const stored = await db.unlocks.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].product).toBe("clean");
    expect(stored[0].token.startsWith("dev_clean_")).toBe(true);
  });

  it("buy('studio') upgrades the unlock to studio", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();

    const result = await engine.iapBuy("studio");
    expect(result).toBe("studio");

    // Buying studio should not require clean to be bought first.
    const stored = await db.unlocks.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].product).toBe("studio");
  });

  it("iapBuy emits unlock-changed and updates useUnlock subscribers", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();
    expect(engine.getUnlockState()).toBe("free");

    let observed = ["free"];
    engine.on("unlock-changed", (e) => {
      observed = [...observed, e.unlock];
    });

    await engine.iapBuy("clean");
    expect(engine.getUnlockState()).toBe("clean");
    expect(observed).toEqual(["free", "clean"]);

    // Buying studio while clean is owned → upgrade to studio.
    await engine.iapBuy("studio");
    expect(engine.getUnlockState()).toBe("studio");
    expect(observed).toEqual(["free", "clean", "studio"]);
  });

  it("iapRestore returns the highest tier among stored receipts", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();

    // Empty DB → free
    expect(await engine.iapRestore()).toBe("free");

    // After a clean purchase → clean
    await engine.iapBuy("clean");
    expect(await engine.iapRestore()).toBe("clean");

    // After a studio purchase → studio (higher wins)
    await engine.iapBuy("studio");
    expect(await engine.iapRestore()).toBe("studio");
  });

  it("unlock state persists across a fresh engine instance", async () => {
    const db = freshDb();
    setDbForTesting(db);
    // First engine: buy studio
    const engine1 = freshEngine();
    __setEngineForTesting(engine1);
    await engine1.init();
    await engine1.iapBuy("studio");
    expect(engine1.getUnlockState()).toBe("studio");

    // Second engine against the SAME db: state survives.
    __setEngineForTesting(null);
    resetDbForTesting();
    setDbForTesting(db); // re-attach the same db
    const engine2 = freshEngine();
    __setEngineForTesting(engine2);
    await engine2.init();
    expect(engine2.getUnlockState()).toBe("studio");
  });

  it("buy returns ok=false when the provider is unavailable", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const unavailable = createDevIapProvider({ available: false });
    const engine = freshEngine({ iap: unavailable });
    __setEngineForTesting(engine);
    await engine.init();

    const result = await unavailable.buy("clean");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unavailable");
  });
});

describe("Engine integration with dev IAP", () => {
  it("init() seeds the unlock state from IndexedDB", async () => {
    const db = freshDb();
    setDbForTesting(db);
    // Pre-seed an unlock row directly (simulates a returning user).
    await db.unlocks.put({
      token: "dev_studio_seed",
      platform: "stripe",
      product: "studio",
      purchasedAt: "2025-01-01T00:00:00.000Z",
      lastValidatedAt: "2025-01-01T00:00:00.000Z",
      deviceFingerprint: deviceFingerprint(),
    });

    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();
    expect(engine.getUnlockState()).toBe("studio");
  });

  it("upgrade path: clean then studio persists both receipts", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    __setEngineForTesting(engine);
    await engine.init();

    await engine.iapBuy("clean");
    await engine.iapBuy("studio");

    const stored = await db.unlocks.toArray();
    expect(stored).toHaveLength(2);
    const products = stored.map((s) => s.product).sort();
    expect(products).toEqual(["clean", "studio"]);
    expect(engine.getUnlockState()).toBe("studio");
  });
});

describe("Engine.iapBuy with each IAP product", () => {
  for (const product of ["clean", "studio"] as IapProduct[]) {
    it(`iapBuy('${product}') sets engine unlock state to '${product}'`, async () => {
      const db = freshDb();
      setDbForTesting(db);
      const engine = freshEngine();
      __setEngineForTesting(engine);
      await engine.init();
      await engine.iapBuy(product);
      expect(engine.getUnlockState()).toBe(product);
    });
  }
});
