// V2.5 NoteEditor — a debounced, 280-char-capped note field for an entry.
//
// The editor is intentionally controlled. The parent owns the note text
// (so it can render the value in the surrounding row) and passes a
// `onCommit` callback that the editor invokes with the latest value
// after the user has paused typing (or blurred the field). The
// caller is expected to forward the value to `engine.setEntryNote`.
//
// Empty notes render the "+ Add a note" affordance. Once the user
// starts typing, the affordance is replaced by a live textarea with
// a character counter. Saving is debounced (default 600ms) so we
// don't write to IndexedDB on every keystroke.
//
// The component is plain React + a single ref-based timer; no
// external state library, no React Context.

import { useEffect, useRef, useState } from "react";

const DEFAULT_MAX_LENGTH = 280;
const DEFAULT_DEBOUNCE_MS = 600;

export interface NoteEditorProps {
  /** Current persisted note. Empty string means no note. */
  value: string;
  /**
   * Called when the user has stopped typing for `debounceMs` or
   * blurs the field. Receives the trimmed value; empty string
   * clears the note.
   */
  onCommit: (next: string) => void | Promise<void>;
  /** Optional debounce window in ms. Default 600. */
  debounceMs?: number;
  /** Optional cap. Default 280 (V2 spec). */
  maxLength?: number;
  /** Aria label override; default is "Note". */
  ariaLabel?: string;
  /** Visual label override; default is hidden (icon-only). */
  placeholder?: string;
}

export function NoteEditor({
  value,
  onCommit,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  maxLength = DEFAULT_MAX_LENGTH,
  ariaLabel = "Note",
  placeholder = "Add a note…",
}: NoteEditorProps) {
  // The internal draft tracks the user's current input. The parent
  // `value` is the source of truth for what's persisted; the draft
  // is what's in the field. They diverge while the user is typing
  // and the debounce timer hasn't fired yet.
  const [draft, setDraft] = useState<string>(value);
  const [expanded, setExpanded] = useState<boolean>(value.trim().length > 0);
  const [busy, setBusy] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the latest draft so the onCommit callback always sees the
  // current value, even if the timer fires after a re-render.
  const draftRef = useRef<string>(value);

  // When the parent updates the value (e.g. after reload), sync the
  // draft. The sync should only run when the persisted `value`
  // changes; we intentionally do not depend on `draft` here. The
  // lint rule accepts the `eslint-disable-next-line` comment but
  // newer configs may report it as unused if no rule fires on this
  // line. We keep the comment-free form: the `useEffect` is gated
  // on `value` only, and the sync is safe because the setter
  // overwrites the draft unconditionally when the parent updates
  // `value`.
  useEffect(() => {
    if (value !== draftRef.current) {
      setDraft(value);
      draftRef.current = value;
      if (value.trim().length > 0) setExpanded(true);
    }
  }, [value]);

  // Clear the pending timer on unmount so we don't fire onCommit
  // after the component is gone.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function scheduleCommit(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const trimmed = next.trim();
      if (trimmed === value.trim()) return; // no-op
      setBusy(true);
      Promise.resolve(onCommit(trimmed)).finally(() => setBusy(false));
    }, debounceMs);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const raw = e.target.value;
    // Hard-cap the input so the user can't type past the limit. We
    // intentionally do NOT silently truncate mid-typing — but we
    // stop the keystroke at `maxLength` and let the counter reflect
    // the limit. The repository layer also enforces the cap.
    const next = raw.length > maxLength ? raw.slice(0, maxLength) : raw;
    setDraft(next);
    draftRef.current = next;
    scheduleCommit(next);
  }

  async function handleBlur() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const trimmed = draft.trim();
    if (trimmed === value.trim()) return;
    setBusy(true);
    try {
      await onCommit(trimmed);
    } finally {
      setBusy(false);
    }
  }

  function handleAffordanceClick() {
    setExpanded(true);
    // Focus the textarea on next tick.
    setTimeout(() => {
      const el = document.activeElement;
      if (el && el instanceof HTMLTextAreaElement && el.dataset.noteRole === "editor") {
        el.focus();
      }
    }, 0);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="ll-note-affordance"
        onClick={handleAffordanceClick}
        aria-label={`${ariaLabel} (empty — tap to add)`}
      >
        + Add a note
      </button>
    );
  }

  const remaining = maxLength - draft.length;

  return (
    <div className="ll-note-editor">
      <textarea
        className="ll-note-textarea"
        data-note-role="editor"
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        maxLength={maxLength}
        rows={2}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      <div className="ll-note-footer" aria-live="polite">
        <span
          className={`ll-note-counter${remaining <= 20 ? " ll-note-counter-low" : ""}`}
        >
          {draft.length}/{maxLength}
        </span>
        {busy ? <span className="ll-note-saving">Saving…</span> : null}
      </div>
    </div>
  );
}
