// V2 AdBanner. Renders a small placeholder banner below the subject
// tiles on the home screen. The banner is hidden when:
//
//   - The user has a Clean / Studio unlock (the spec says: "ad does
//     not appear once the user has bought Clean or Studio").
//   - The frequency cap is in effect (an impression was logged in
//     the last 30 minutes).
//   - The AdProvider reports `shouldShow() === false`.
//
// When the banner is shown, it calls `engine.ads.impression()` once
// (on mount) so the cap ticks. The actual UI is a placeholder card
// with "Sponsored" + "Learn more" text. V2.5 drops in a real ad
// network behind the same interface.

import { useEffect, useRef } from "react";
import { useEngine, useUnlock } from "../../engine/hooks";

export function AdBanner() {
  const engine = useEngine();
  const unlock = useUnlock();
  const impressionLogged = useRef(false);

  const show =
    unlock === "free" && engine.ads.shouldShow();

  useEffect(() => {
    if (!show || impressionLogged.current) return;
    engine.ads.impression();
    impressionLogged.current = true;
  }, [engine, show]);

  if (!show) return null;

  return (
    <aside className="ll-ad-banner" aria-label="Sponsored content">
      <div className="ll-ad-banner-body">
        <div className="ll-ad-banner-text">
          <div className="ll-ad-banner-label">Sponsored</div>
          <div className="ll-ad-banner-headline">
            Little Loop is free thanks to ads like this.
          </div>
        </div>
        <a
          className="ll-ad-banner-cta"
          href="#"
          onClick={(e) => e.preventDefault()}
        >
          Learn more
        </a>
      </div>
      <div className="ll-ad-banner-note">
        Remove ads with Clean exports (£1.99).
      </div>
    </aside>
  );
}
