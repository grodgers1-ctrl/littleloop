// V2 Paywall Screen. Two purchase options (Clean £1.99, Studio
// £4.99) plus a "Restore purchases" link at the bottom. The
// paywall is reached from the export sheet and from a banner on
// the home screen (Day 6). On the V2.0 dev provider, tapping a
// purchase immediately grants the unlock with no charge. On real
// providers (V2.5) it shows the App Store / Play Store / Stripe
// flow and only resolves when the user completes or cancels.
//
// The screen is purely presentational — all state reads / writes go
// through the engine via the React hooks layer.

import { useState } from "react";
import { Button } from "../../components/Button";
import { CelebrationToast } from "../../components/CelebrationToast";
import { useEngine, useUnlock } from "../../engine/hooks";
import type { IapProduct, UnlockState } from "../../engine/state";

interface Props {
  onClose: () => void;
  /** Where the user came from. The paywall copy is the same in
   *  V2.0; the source lets us close to the right place. */
  source: "home" | "export-sheet";
}

interface ProductInfo {
  product: IapProduct;
  title: string;
  price: string;
  blurb: string;
  unlocks: string[];
}

const PRODUCTS: ProductInfo[] = [
  {
    product: "clean",
    title: "Clean exports",
    price: "£1.99",
    blurb: "No banner ad. No watermark. Same export paths and lengths.",
    unlocks: [
      "Removes the watermark on every MP4 export",
      "Removes the banner ad on the home screen",
    ],
  },
  {
    product: "studio",
    title: "Studio",
    price: "£4.99",
    blurb:
      "Everything in Clean exports, plus the Style section in the export sheet: transitions, filters, and themes.",
    unlocks: [
      "Everything in Clean exports",
      "Transitions, filters, and themes in the export sheet",
    ],
  },
];

export function PaywallScreen({ onClose }: Props) {
  const engine = useEngine();
  const currentUnlock = useUnlock();
  const [busy, setBusy] = useState<IapProduct | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isAvailable = engine.iap.isAvailable();

  async function handleBuy(product: IapProduct) {
    setError(null);
    setBusy(product);
    try {
      await engine.iapBuy(product);
      // Post-purchase toast. The message stays until dismissed.
      if (product === "studio") {
        setToast("Welcome to Studio!");
      } else {
        setToast("Welcome to Clean exports!");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete purchase.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore() {
    setError(null);
    setRestoreMessage(null);
    setRestoring(true);
    try {
      const tier = await engine.iapRestore();
      if (tier === "free") {
        setRestoreMessage(
          "We couldn't find any purchases on this device.",
        );
      } else {
        setRestoreMessage(`Welcome back. You're on ${labelFor(tier)}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="ll-content ll-stack-lg">
      {/* The app header already shows "Unlock Little Loop"; no
          duplicate heading here. */}
      <p style={{ color: "var(--ll-text-soft)" }}>
        One-time unlocks. No subscription. No trials. No nag.
      </p>

      {!isAvailable ? (
        <div className="ll-card">
          <p>
            Purchases aren't enabled in this build yet. They're rolling out
            with the next release — your timelines and exports work exactly
            the same in the meantime.
          </p>
        </div>
      ) : (
        <>
          {PRODUCTS.map((p) => {
            const isOwned = ownsProduct(currentUnlock, p.product);
            const isBusy = busy === p.product;
            return (
              <div className="ll-card" key={p.product}>
                <div className="ll-paywall-row">
                  <div>
                    <h3 style={{ margin: 0 }}>{p.title}</h3>
                    <p
                      style={{
                        color: "var(--ll-text-soft)",
                        margin: "4px 0 0 0",
                      }}
                    >
                      {p.blurb}
                    </p>
                    <ul className="ll-paywall-bullets">
                      {p.unlocks.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="ll-paywall-price">{p.price}</div>
                </div>
                <Button
                  variant="primary"
                  block
                  disabled={isOwned || isBusy}
                  onClick={() => handleBuy(p.product)}
                >
                  {isOwned
                    ? "Already unlocked"
                    : isBusy
                      ? "Processing…"
                      : `Unlock for ${p.price}`}
                </Button>
              </div>
            );
          })}
        </>
      )}

      {error ? (
        <div className="ll-status ll-status-error" role="alert">
          {error}
        </div>
      ) : null}

      {restoreMessage ? (
        <div className="ll-status ll-status-success" role="status">
          {restoreMessage}
        </div>
      ) : null}

      <div className="ll-card ll-card-quiet">
        <Button onClick={handleRestore} disabled={restoring}>
          {restoring ? "Restoring…" : "Restore purchases"}
        </Button>
        <p
          style={{
            color: "var(--ll-text-soft)",
            marginTop: 8,
            fontSize: 13,
          }}
        >
          Bought Little Loop on another device? Your unlock is tied to your
          app store account — use the same account on this device, then tap
          Restore purchases to re-apply it. Little Loop itself has no
          accounts and stores nothing in the cloud.
        </p>
      </div>

      <Button onClick={onClose}>Back</Button>

      <CelebrationToast
        open={Boolean(toast)}
        message={toast ?? ""}
        detail="The watermark and banner ad are now removed."
        onClose={() => setToast(null)}
      />
    </div>
  );
}

function ownsProduct(tier: UnlockState, product: IapProduct): boolean {
  if (product === "studio") return tier === "studio";
  return tier === "clean" || tier === "studio";
}

function labelFor(tier: UnlockState): string {
  return tier === "studio" ? "Studio" : tier === "clean" ? "Clean exports" : "Free";
}
