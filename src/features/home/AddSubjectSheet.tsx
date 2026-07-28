// V2 Subject creation sheet. Slides up from the bottom (or renders
// inline on small viewports) with three sections:
//
//   1. Name — 1–60 chars free text.
//   2. Type — 8-tile grid of suggested subject types.
//   3. Cadence — Daily / Weekly.
//
// On submit, calls `engine.createSubject(input)`. Validates locally
// before calling the engine. Closing the sheet without submitting
// discards the input.

import { useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useEngine } from "../../engine/hooks";
import { SUBJECT_TYPES, type SubjectType } from "../../engine/state";
import type { Cadence } from "../../db/schema";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a subject is successfully created. */
  onCreated: (subjectId: string) => void;
}

const TYPE_LABELS: Record<SubjectType, string> = {
  baby: "Baby",
  plant: "Plant",
  fitness: "Fitness",
  recovery: "Recovery",
  home: "Home",
  creative: "Creative",
  pet: "Pet",
  other: "Other",
};

const TYPE_HINTS: Record<SubjectType, string> = {
  baby: "Watch them grow",
  plant: "New leaf every week",
  fitness: "Cut, bulk, or maintain",
  recovery: "Healing progress",
  home: "Renovation, room by room",
  creative: "Drawing, painting, craft",
  pet: "Puppy to senior",
  other: "Anything else",
};

export function AddSubjectSheet({ open, onClose, onCreated }: Props) {
  const engine = useEngine();
  const [name, setName] = useState("");
  const [type, setType] = useState<SubjectType>("baby");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setType("baby");
    setCadence("daily");
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your subject a name.");
      return;
    }
    if (trimmed.length > 60) {
      setError("Names must be 60 characters or fewer.");
      return;
    }
    setSubmitting(true);
    try {
      const subject = await engine.createSubject({
        name: trimmed,
        type,
        cadence,
      });
      reset();
      onCreated(subject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save subject.");
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="Add subject" onClose={close}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="ll-field">
          <label htmlFor="v2-subject-name">Name</label>
          <input
            id="v2-subject-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mia, Basil, Morning run"
            maxLength={60}
            autoFocus
            aria-invalid={Boolean(error)}
          />
          <div className="ll-field-help">
            {name.trim().length}/60 characters
          </div>
        </div>

        <div className="ll-field">
          <label>What are you tracking?</label>
          <div className="ll-type-grid" role="radiogroup" aria-label="Subject type">
            {SUBJECT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                className={`ll-type-tile ${type === t ? "is-active" : ""}`}
                onClick={() => setType(t)}
              >
                <div className="ll-type-tile-title">{TYPE_LABELS[t]}</div>
                <div className="ll-type-tile-hint">{TYPE_HINTS[t]}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="ll-field">
          <label>How often?</label>
          <div className="ll-radio-row">
            <label
              className={`ll-radio-card ${cadence === "daily" ? "is-active" : ""}`}
            >
              <input
                type="radio"
                name="v2-cadence"
                checked={cadence === "daily"}
                onChange={() => setCadence("daily")}
              />
              <div className="ll-radio-card-title">Daily</div>
              <div className="ll-radio-card-desc">One moment a day</div>
            </label>
            <label
              className={`ll-radio-card ${cadence === "weekly" ? "is-active" : ""}`}
            >
              <input
                type="radio"
                name="v2-cadence"
                checked={cadence === "weekly"}
                onChange={() => setCadence("weekly")}
              />
              <div className="ll-radio-card-title">Weekly</div>
              <div className="ll-radio-card-desc">One moment a week</div>
            </label>
          </div>
        </div>

        {error ? (
          <div className="ll-status ll-status-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="ll-stack">
          <Button
            type="submit"
            variant="primary"
            block
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Add subject"}
          </Button>
          <Button
            type="button"
            block
            onClick={close}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
