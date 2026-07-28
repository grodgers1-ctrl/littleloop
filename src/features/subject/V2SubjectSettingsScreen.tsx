// V2 Subject Settings Screen. Per-subject settings:
//
//   - Rename (with the V1 Project mirrored)
//   - Reclassify (change type)
//   - Change cadence (with the V1 Project mirrored)
//   - Delete subject (with a "type the subject's name to confirm" guard)
//
// The screen reads and writes via the engine, which keeps the V1
// Project rows coherent (the V1 SettingsScreen reads the V1 Project
// table for backward-compatibility — the mirror writes keep both
// views in step).

import { useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useEngine } from "../../engine/hooks";
import {
  SUBJECT_TYPES,
  type Subject,
  type SubjectType,
} from "../../engine/state";
import type { Cadence } from "../../db/schema";

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

interface Props {
  subject: Subject;
  onBack: () => void;
  onDeleted: () => void;
}

export function V2SubjectSettingsScreen({
  subject,
  onBack,
  onDeleted,
}: Props) {
  const engine = useEngine();
  const [name, setName] = useState(subject.name);
  const [type, setType] = useState<SubjectType>(subject.type);
  const [cadence, setCadence] = useState<Cadence>(subject.cadence);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const dirty =
    name.trim() !== subject.name ||
    type !== subject.type ||
    cadence !== subject.cadence;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (name.trim() !== subject.name) {
        await engine.renameSubject(subject.id, name.trim());
      }
      if (type !== subject.type) {
        await engine.reclassifySubject(subject.id, type);
      }
      if (cadence !== subject.cadence) {
        await engine.setSubjectCadence(subject.id, cadence);
      }
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirmText.trim() !== subject.name) return;
    setDeleting(true);
    try {
      await engine.deleteSubject(subject.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete subject.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="ll-content ll-stack-lg">
      <h2>Subject settings</h2>

      <div className="ll-card">
        <form onSubmit={handleSave} noValidate>
          <div className="ll-field">
            <label htmlFor="v2-subject-rename">Name</label>
            <input
              id="v2-subject-rename"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
            <div className="ll-field-help">
              {name.trim().length}/60 characters
            </div>
          </div>

          <div className="ll-field">
            <label>Type</label>
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
                </button>
              ))}
            </div>
          </div>

          <div className="ll-field">
            <label>Cadence</label>
            <div className="ll-radio-row">
              <label
                className={`ll-radio-card ${cadence === "daily" ? "is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="v2-cadence-edit"
                  checked={cadence === "daily"}
                  onChange={() => setCadence("daily")}
                />
                <div className="ll-radio-card-title">Daily</div>
              </label>
              <label
                className={`ll-radio-card ${cadence === "weekly" ? "is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="v2-cadence-edit"
                  checked={cadence === "weekly"}
                  onChange={() => setCadence("weekly")}
                />
                <div className="ll-radio-card-title">Weekly</div>
              </label>
            </div>
            <div className="ll-field-help">
              Changing cadence does not delete existing photos.
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
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" block onClick={onBack}>
              Cancel
            </Button>
          </div>
        </form>
      </div>

      <div className="ll-card">
        <h3>Delete subject</h3>
        <p>
          This permanently deletes <strong>{subject.name}</strong> and every
          photo in this subject from this device. Export a backup first if
          you want to keep anything.
        </p>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmDelete(true);
            setDeleteConfirmText("");
          }}
        >
          Delete subject
        </Button>
      </div>

      <Modal
        open={confirmDelete}
        title={`Delete "${subject.name}"?`}
        onClose={() => setConfirmDelete(false)}
      >
        <p>
          This cannot be undone. Photos that are not exported will be lost.
        </p>
        <p>
          Type <strong>{subject.name}</strong> to confirm.
        </p>
        <div className="ll-field">
          <label htmlFor="v2-delete-confirm" className="sr-only">
            Type the subject name to confirm
          </label>
          <input
            id="v2-delete-confirm"
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            autoFocus
          />
        </div>
        <div className="ll-stack">
          <Button
            variant="danger"
            block
            disabled={
              deleteConfirmText.trim() !== subject.name || deleting
            }
            onClick={handleDelete}
          >
            {deleting ? "Deleting…" : "Delete everything"}
          </Button>
          <Button block onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
