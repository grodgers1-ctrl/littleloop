// V2.5.1 redesign — thin Reminders banner.
//
// User picked "settings-only" for reminders in the V2.5 design
// round, then upgraded to "thin home banner, unobtrusive" in
// the V2.5.1 redesign. This banner is the unobtrusive version:
// a single horizontal line with a bell icon, one sentence, a
// "Set reminder" button, and an X to dismiss for the session.
//
// The banner is not a full CTAs row — it's a hint. The CTA
// takes the user to the Settings screen Reminders card; the
// actual scheduling is a one-line action there.

interface RemindersBannerProps {
  /** Tap on the banner body — opens Settings. */
  onTap: () => void;
  /** Tap on the X — dismisses for this session. */
  onDismiss: () => void;
}

export function RemindersBanner({ onTap, onDismiss }: RemindersBannerProps) {
  return (
    <div
      className="ll-reminders-banner"
      role="region"
      aria-label="Reminders not set up"
      data-testid="reminders-banner"
    >
      <button
        type="button"
        className="ll-reminders-banner-body"
        onClick={onTap}
      >
        <span className="ll-reminders-banner-icon" aria-hidden="true">
          {/* Bell glyph — same Unicode char the V2 settings card
              uses so the visual language is consistent. */}
          {"\u2407"}
        </span>
        <span className="ll-reminders-banner-text">
          Set a daily reminder so you don't forget.
        </span>
      </button>
      <button
        type="button"
        className="ll-reminders-banner-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss reminder prompt"
      >
        {"\u00d7"}
      </button>
    </div>
  );
}
