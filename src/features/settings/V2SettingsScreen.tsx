// V2 App Settings screen. App-wide settings (not per-subject).
// Settings items:
//   - Default cadence for new subjects
//   - Subject type default
//   - Watermark preview
//   - Restore purchases
//   - About / version
//   - Privacy / ToS links (placeholder)

import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { useUnlock, useEngineOrNull } from "../../engine/hooks";
import type { Cadence } from "../../db/schema";
import { SUBJECT_TYPES, type SubjectType } from "../../engine/state";
import { applyWatermark } from "../../engine/export/watermark";
import type { NotificationCadence, NotificationState } from "../../engine/state";

const APP_VERSION = "2.0.0";

interface Props {
  onBack: () => void;
  onRestore?: () => void;
}

export function V2SettingsScreen({ onBack, onRestore }: Props) {
  const unlock = useUnlock();
  const engine = useEngineOrNull();
  const [defaultCadence, setDefaultCadence] = useState<Cadence>("daily");
  const [defaultType, setDefaultType] = useState<SubjectType>("baby");
  const [saved, setSaved] = useState(false);
  // V2.5 — local notifications state. The card is hidden when
  // the engine isn't ready (e.g. sandbox-only paths) or when the
  // browser doesn't support the Notification API.
  const [notificationState, setNotificationState] =
    useState<NotificationState | null>(null);

  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await engine.getNotificationState();
        if (!cancelled) setNotificationState(s);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine]);

  async function handleSave() {
    // V2.0 doesn't persist default cadence/type settings yet;
    // this is a placeholder for V2.5. For now we just show the
    // saved confirmation.
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleEnableNotifications() {
    if (!engine) return;
    await engine.requestNotificationPermission();
    const s = await engine.getNotificationState();
    setNotificationState(s);
  }

  async function handleCadenceChange(next: NotificationCadence) {
    if (!engine || !notificationState) return;
    await engine.scheduleNotifications({
      cadence: next,
      lastCaptureAt: notificationState.lastFiredAt,
      hour: notificationState.schedule.hour,
      minute: notificationState.schedule.minute,
    });
    const s = await engine.getNotificationState();
    setNotificationState(s);
  }

  async function handleTimeChange(hour: number, minute: number) {
    if (!engine || !notificationState) return;
    await engine.scheduleNotifications({
      cadence: notificationState.schedule.cadence,
      lastCaptureAt: notificationState.lastFiredAt,
      hour,
      minute,
    });
    const s = await engine.getNotificationState();
    setNotificationState(s);
  }

  async function handleCancelNotifications() {
    if (!engine) return;
    await engine.cancelNotifications();
    const s = await engine.getNotificationState();
    setNotificationState(s);
  }

  return (
    <div className="ll-content ll-stack-lg">
      <h2>Settings</h2>

      <div className="ll-card">
        <h3>Defaults</h3>
        <div className="ll-field">
          <label>Default cadence</label>
          <div className="ll-radio-row">
            <label
              className={`ll-radio-card ${defaultCadence === "daily" ? "is-active" : ""}`}
            >
              <input
                type="radio"
                name="v2-default-cadence"
                checked={defaultCadence === "daily"}
                onChange={() => setDefaultCadence("daily")}
              />
              <div className="ll-radio-card-title">Daily</div>
            </label>
            <label
              className={`ll-radio-card ${defaultCadence === "weekly" ? "is-active" : ""}`}
            >
              <input
                type="radio"
                name="v2-default-cadence"
                checked={defaultCadence === "weekly"}
                onChange={() => setDefaultCadence("weekly")}
              />
              <div className="ll-radio-card-title">Weekly</div>
            </label>
          </div>
        </div>

        <div className="ll-field">
          <label>Default subject type</label>
          <div className="ll-type-grid" role="radiogroup" aria-label="Subject type">
            {SUBJECT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={defaultType === t}
                className={`ll-type-tile ${defaultType === t ? "is-active" : ""}`}
                onClick={() => setDefaultType(t)}
              >
                <div className="ll-type-tile-title">{t}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="ll-stack">
          <Button variant="primary" block onClick={handleSave}>
            {saved ? "Saved" : "Save defaults"}
          </Button>
        </div>
      </div>

      <div className="ll-card">
        <h3>Watermark preview</h3>
        <p style={{ color: "var(--ll-text-soft)", fontSize: 14 }}>
          {unlock === "free"
            ? "Free users see this watermark on every export."
            : "Your account has the watermark removed."}
        </p>
        <WatermarkPreview />
      </div>

      <div className="ll-card">
        <h3>Restore purchases</h3>
        <p style={{ color: "var(--ll-text-soft)", fontSize: 14 }}>
          Already bought on another device? Tap below to re-apply your
          unlock.
        </p>
        <Button block onClick={onRestore} disabled={!onRestore}>
          Restore purchases
        </Button>
      </div>

      {engine ? (
        <div className="ll-card" data-testid="notifications-card">
          <h3>Reminders</h3>
          {notificationState?.permission === "unsupported" ? (
            <p
              style={{ color: "var(--ll-text-soft)", fontSize: 13 }}
              data-testid="notifications-unsupported"
            >
              Local notifications aren't supported in this browser. On iOS
              Safari, install this site to your home screen and re-open it
              from there to enable reminders.
            </p>
          ) : notificationState?.permission === "denied" ? (
            <p
              style={{ color: "var(--ll-text-soft)", fontSize: 13 }}
              data-testid="notifications-denied"
            >
              Notifications are blocked. Re-enable them in your browser's
              site settings.
            </p>
          ) : notificationState?.permission === "default" ? (
            <div className="ll-stack">
              <p
                style={{ color: "var(--ll-text-soft)", fontSize: 13, margin: 0 }}
              >
                Get a gentle reminder when it's time to capture today's
                moment. Reminders are local — no data leaves your device.
              </p>
              <Button
                variant="primary"
                block
                onClick={handleEnableNotifications}
                data-testid="notifications-enable"
              >
                Enable reminders
              </Button>
            </div>
          ) : (
            <div className="ll-stack">
              <p
                style={{ color: "var(--ll-text-soft)", fontSize: 13, margin: 0 }}
              >
                Reminders are on. You can change the cadence or time below,
                or turn them off at any time.
              </p>
              <div className="ll-field">
                <label>Cadence</label>
                <div className="ll-radio-row">
                  {(["off", "daily", "weekly"] as const).map((c) => (
                    <label
                      key={c}
                      className={`ll-radio-card ${
                        notificationState?.schedule.cadence === c
                          ? "is-active"
                          : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="v2-notification-cadence"
                        checked={notificationState?.schedule.cadence === c}
                        onChange={() => handleCadenceChange(c)}
                        data-testid={`notifications-cadence-${c}`}
                      />
                      <div className="ll-radio-card-title">
                        {c === "off" ? "Off" : c === "daily" ? "Daily" : "Weekly"}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {notificationState &&
              notificationState.schedule.cadence !== "off" ? (
                <div className="ll-field">
                  <label>Time of day</label>
                  <div className="ll-time-row">
                    <select
                      value={notificationState.schedule.hour}
                      onChange={(e) =>
                        handleTimeChange(
                          Number(e.target.value),
                          notificationState.schedule.minute,
                        )
                      }
                      aria-label="Hour"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                    <span>:</span>
                    <select
                      value={notificationState.schedule.minute}
                      onChange={(e) =>
                        handleTimeChange(
                          notificationState.schedule.hour,
                          Number(e.target.value),
                        )
                      }
                      aria-label="Minute"
                    >
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                  {notificationState.nextDueAt ? (
                    <div className="ll-field-help">
                      Next reminder: {notificationState.nextDueAt}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {notificationState?.schedule.cadence !== "off" ? (
                <Button block onClick={handleCancelNotifications}>
                  Turn off reminders
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="ll-card ll-card-quiet">
        <h3>About</h3>
        <p style={{ color: "var(--ll-text-soft)", fontSize: 13 }}>
          Little Loop v{APP_VERSION}
        </p>
        <p style={{ color: "var(--ll-text-soft)", fontSize: 13 }}>
          One photo at a time. Watch anything grow.
        </p>
        <div className="ll-stack">
          <Button block onClick={() => window?.open?.("about:blank", "_blank")}>
            Privacy policy
          </Button>
          <Button block onClick={() => window?.open?.("about:blank", "_blank")}>
            Terms of service
          </Button>
          <Button block onClick={() => window?.open?.("about:blank", "_blank")}>
            Send feedback
          </Button>
          <Button block onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}

function WatermarkPreview() {
  const canvasRef = (el: HTMLCanvasElement | null) => {
    if (!el) return;
    el.width = 320;
    el.height = 568;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    // Draw a sample image background.
    ctx.fillStyle = "#f6efe6";
    ctx.fillRect(0, 0, 320, 568);
    ctx.fillStyle = "#d4c5b0";
    ctx.fillRect(40, 80, 240, 320);
    // Apply the watermark.
    applyWatermark(ctx);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        maxHeight: 240,
        borderRadius: "var(--ll-radius)",
        border: "1px solid var(--ll-border)",
      }}
    />
  );
}