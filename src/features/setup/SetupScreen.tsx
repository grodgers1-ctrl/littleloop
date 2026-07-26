import { useState } from "react";
import { Button } from "../../components/Button";
import {
  hasErrors,
  validateSetup,
  type SetupValidation,
} from "../../lib/validation";
import { createProject } from "../../db/repositories";
import { requestPersistentStorage } from "../../lib/storage";
import type { Cadence, Project } from "../../db/schema";
import { todayDateOnly, parseDateOnly } from "../../lib/dates";

interface Props {
  onComplete: (project: Project) => void;
}

export function SetupScreen({ onComplete }: Props) {
  const [childName, setChildName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState(
    // sensible default: 6 months ago today
    (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return todayDateOnly(d);
    })(),
  );
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [errors, setErrors] = useState<SetupValidation>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateSetup({ childName, dateOfBirth });
    setErrors(v);
    if (hasErrors(v)) return;
    setBusy(true);
    try {
      const project = await createProject({
        childName,
        dateOfBirth: parseDateOnly(dateOfBirth)
          ? dateOfBirth
          : dateOfBirth, // validated above
        cadence,
      });
      // Don't block setup on storage persist.
      void requestPersistentStorage();
      onComplete(project);
    } catch (err) {
      setErrors({
        childName: err instanceof Error ? err.message : "Could not create timeline",
      });
      setBusy(false);
    }
  }

  return (
    <div className="ll-content ll-stack-lg">
      <div className="ll-card">
        <h1>Welcome to Little Loop</h1>
        <p>
          Capture one moment at a time. Watch your child grow.
          Photos stay on this device unless you choose to export them.
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="ll-field">
            <label htmlFor="childName">Child's name or nickname</label>
            <input
              id="childName"
              type="text"
              autoComplete="off"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              aria-invalid={Boolean(errors.childName)}
              maxLength={60}
            />
            {errors.childName ? (
              <div className="ll-field-error">{errors.childName}</div>
            ) : null}
          </div>

          <div className="ll-field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              max={todayDateOnly()}
              onChange={(e) => setDateOfBirth(e.target.value)}
              aria-invalid={Boolean(errors.dateOfBirth)}
            />
            <div className="ll-field-help">
              Used to display your child's age beside each photo.
            </div>
            {errors.dateOfBirth ? (
              <div className="ll-field-error">{errors.dateOfBirth}</div>
            ) : null}
          </div>

          <div className="ll-field">
            <label>Capture cadence</label>
            <div className="ll-radio-row">
              <label
                className={`ll-radio-card ${cadence === "daily" ? "is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="cadence"
                  value="daily"
                  checked={cadence === "daily"}
                  onChange={() => setCadence("daily")}
                />
                <div className="ll-radio-card-title">Daily</div>
                <div className="ll-radio-card-desc">One photo each day</div>
              </label>
              <label
                className={`ll-radio-card ${cadence === "weekly" ? "is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="cadence"
                  value="weekly"
                  checked={cadence === "weekly"}
                  onChange={() => setCadence("weekly")}
                />
                <div className="ll-radio-card-title">Weekly</div>
                <div className="ll-radio-card-desc">One photo each week</div>
              </label>
            </div>
          </div>

          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? "Creating…" : "Create timeline"}
          </Button>
        </form>
      </div>

      <div className="ll-status ll-status-info">
        Your timeline is stored on this device. Back it up regularly so it can
        be restored if the device is lost or the browser data is cleared.
      </div>
    </div>
  );
}