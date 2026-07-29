// V2.5.1 redesign — V2 Home Screen.
//
// Layout (top to bottom):
//   1. Reminders banner (if notifications are off and the user
//      hasn't dismissed it). Single line, soft accent. One tap
//      to settings; X to dismiss for this session.
//   2. Memory lane — always present. The user asked for a
//      graceful empty state instead of hidden, so the card
//      surfaces the feature on day 1 with a "+ Add a moment"
//      CTA in the empty branch.
//   3. Subject tiles — vertical list, single column. The
//      per-tile primary is "+ Add photo" (per the user's
//      choice: per-tile primary Add photo, not global). The
//      secondary is "Export". Rename / Type / Settings live
//      in a less-prominent row below.
//   4. Bottom CTA — "+ Add a moment" (subject creation).
//   5. Restore purchases link (free users only).
//   6. Ad banner (free users only).
//
// Copy: "subject" → "moment" / "timeline" where it reads better.
// The kickoff said the user-visible label for a Subject is
// "Timeline" but the codebase still uses "subject" in user-
// facing copy. The V2.5.1 redesign smooths that out.

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { useEngine, useSubjects, useUnlock } from "../../engine/hooks";
import { getDb } from "../../db/database";
import { SUBJECT_TYPES } from "../../engine/state";
import type { Subject, SubjectType } from "../../engine/state";
import { AdBanner } from "./AdBanner";
import { MemoryLane } from "../memory-lane/MemoryLane";
import { RemindersBanner } from "./RemindersBanner";

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

interface SubjectTileProps {
  subject: Subject;
  onOpen: (id: string) => void;
  onSettings: (id: string) => void;
  /**
   * V2.5.1 hotfix — quick-action callbacks. The primary action
   * on the tile is "+ Add photo" (per the user's choice: per-
   * tile primary, not global). Export is the secondary.
   */
  onAddPhoto?: (subjectId: string) => void;
  onExport?: (subjectId: string) => void;
  /** Disable inline editing (used by tests and the settings screen). */
  readonly?: boolean;
}

function SubjectTile({
  subject,
  onOpen,
  onSettings,
  onAddPhoto,
  onExport,
  readonly,
}: SubjectTileProps) {
  const engine = useEngine();
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState<number>(0);
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState<"top" | "bottom" | null>(null);

  useEffect(() => {
    let cancelled = false;
    let urlToRevoke: string | null = null;
    void (async () => {
      const db = getDb();
      const entries = await db.entries
        .where("projectId")
        .equals(subject.id)
        .toArray();
      entries.sort((a, b) => b.capturedDate.localeCompare(a.capturedDate));
      if (cancelled) return;
      setEntryCount(entries.length);
      const latest = entries[0];
      if (!latest) {
        setThumbUrl(null);
        return;
      }
      const asset = await db.assets.get(latest.thumbnailBlobId);
      if (!asset || cancelled) return;
      const url = URL.createObjectURL(asset.blob);
      urlToRevoke = url;
      setThumbUrl(url);
    })();
    return () => {
      cancelled = true;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [subject.id, subject.updatedAt]);

  // Inline rename — local draft state until blur or Enter.
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(subject.name);
  const draftInputRef = useRef<HTMLInputElement | null>(null);

  function startRename() {
    if (readonly) return;
    setDraftName(subject.name);
    setRenaming(true);
  }

  useEffect(() => {
    if (renaming && draftInputRef.current) {
      draftInputRef.current.focus();
      draftInputRef.current.select();
    }
  }, [renaming]);

  async function commitRename() {
    const next = draftName.trim();
    setRenaming(false);
    if (!next || next === subject.name) return;
    try {
      await engine.renameSubject(subject.id, next);
    } catch {
      // Engine surfaces errors via the snackbar / error path; for
      // Day 6 we swallow inline errors and revert on the next render.
    }
  }

  // Inline reclassify — tap the type label to cycle through the 8 types.
  async function cycleType() {
    if (readonly) return;
    const idx = SUBJECT_TYPES.indexOf(subject.type);
    const nextType = SUBJECT_TYPES[(idx + 1) % SUBJECT_TYPES.length];
    try {
      await engine.reclassifySubject(subject.id, nextType);
    } catch {
      /* swallow; UI re-renders on next engine event */
    }
  }

  const cadenceLabel = subject.cadence === "daily" ? "Daily" : "Weekly";
  const countLabel =
    entryCount === 0
      ? "No moments yet"
      : entryCount === 1
        ? "1 moment"
        : `${entryCount} moments`;

  return (
    <div
      className={`ll-subject-tile ${dragOver ? `ll-subject-tile-drop-${dragOver}` : ""} ${dragging ? "is-dragging" : ""}`}
      draggable={!readonly}
      onDragStart={(e) => {
        setDragging(true);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", subject.id);
      }}
      onDragEnd={() => {
        setDragging(false);
        setDragOver(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const halfway = rect.top + rect.height / 2;
        setDragOver(e.clientY < halfway ? "top" : "bottom");
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={async (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        const targetPos =
          dragOver === "top" ? "before" : "after";
        setDragOver(null);
        setDragging(false);
        if (!draggedId || draggedId === subject.id) return;
        const subjects = engine.listSubjectsSync();
        const fromIdx = subjects.findIndex((s) => s.id === draggedId);
        const toIdx = subjects.findIndex((s) => s.id === subject.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const target = targetPos === "before" ? toIdx : toIdx + 1;
        await engine.moveSubject(draggedId, target);
      }}
    >
      <button
        type="button"
        className="ll-subject-tile-main"
        onClick={() => onOpen(subject.id)}
        aria-label={`Open ${subject.name}`}
      >
        <div className="ll-subject-tile-thumb" aria-hidden="true">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" />
          ) : (
            <div className="ll-subject-tile-thumb-empty">
              {subject.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="ll-subject-tile-body">
          <div className="ll-subject-tile-name-row">
            <div className="ll-subject-tile-name-text" aria-label={subject.name}>
              {subject.name}
            </div>
          </div>
          <div className="ll-subject-tile-meta">
            <span>{TYPE_LABELS[subject.type]}</span>
            <span aria-hidden="true"> · </span>
            <span>{cadenceLabel}</span>
            <span aria-hidden="true"> · </span>
            <span>{countLabel}</span>
          </div>
        </div>
      </button>
      <div className="ll-subject-tile-actions">
        {/* V2.5.1 redesign — per-tile primary action. The user
            picked "per-tile primary Add photo" over "global
            primary" because their primary action loop is
            "open app → add today's photo to the subject I have
            in mind." Each subject surfaces its own Add
            photo CTA; the bottom-of-screen "+ Add a moment"
            covers the new-subject case. */}
        {onAddPhoto || onExport ? (
          <div className="ll-subject-tile-quick">
            {onAddPhoto ? (
              <Button
                variant="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPhoto(subject.id);
                }}
                aria-label={`Add a photo to ${subject.name}`}
              >
                + Add photo
              </Button>
            ) : null}
            {onExport ? (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onExport(subject.id);
                }}
                aria-label={`Export ${subject.name} as a video`}
              >
                Make a video
              </Button>
            ) : null}
          </div>
        ) : null}
        {renaming ? (
          <input
            ref={draftInputRef}
            className="ll-subject-tile-rename"
            type="text"
            value={draftName}
            maxLength={60}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setRenaming(false);
                setDraftName(subject.name);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Rename timeline"
          />
        ) : (
          <button
            type="button"
            className="ll-subject-tile-rename-btn"
            onClick={(e) => {
              e.stopPropagation();
              startRename();
            }}
            aria-label={`Rename ${subject.name}`}
          >
            Rename
          </button>
        )}
        <button
          type="button"
          className="ll-subject-tile-type-btn"
          onClick={(e) => {
            e.stopPropagation();
            cycleType();
          }}
          aria-label={`Change type (currently ${TYPE_LABELS[subject.type]})`}
        >
          Type: {TYPE_LABELS[subject.type]}
        </button>
        <button
          type="button"
          className="ll-subject-tile-settings"
          aria-label={`Open settings for ${subject.name}`}
          onClick={() => onSettings(subject.id)}
        >
          Settings
        </button>
      </div>
    </div>
  );
}

interface Props {
  onOpenSubject: (id: string) => void;
  onOpenSubjectSettings: (id: string) => void;
  /** Navigate to the paywall's restore section. */
  onRestore?: () => void;
  /** Navigate to the app-wide Settings screen. */
  onSettings?: () => void;
  /** Navigate to a specific entry (timeline view). */
  onOpenEntry?: (subjectId: string, entryId: string) => void;
  /**
   * V2.5 hotfix — trigger the library file picker for a
   * subject, then navigate to the import-date screen.
   * Wired by V2App to the shared hidden file input.
   */
  onAddPhoto?: (subjectId: string) => void;
  /**
   * V2.5 hotfix — open the V2 ExportSheet for a subject. The
   * user can then pick date range + speed + Style and render
   * the MP4.
   */
  onExport?: (subjectId: string) => void;
  /**
   * V2.5.1 redesign — invoked when the user taps the memory
   * lane empty-state CTA or the "Add a moment" footer button.
   * On a fresh install (no subjects yet), the home screen
   * surfaces a single primary CTA; once a subject exists, the
   * memory lane CTA is the entry point.
   */
  onAddMoment?: () => void;
}

export function V2HomeScreen({
  onOpenSubject,
  onOpenSubjectSettings,
  onRestore,
  onSettings,
  onOpenEntry,
  onAddPhoto,
  onExport,
  onAddMoment,
}: Props) {
  const subjects = useSubjects();
  const unlock = useUnlock();

  // The user picked "settings-only" for reminders in the
  // previous design round. The V2.5.1 redesign adds a thin
  // banner above the home content — unobtrusive, dismissible.
  // The banner lives only when reminders are not configured;
  // the user can dismiss it for the session.
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Note: we deliberately do NOT call engine.listSubjects() in a
  // useEffect here. That would create a feedback loop:
  //   useEffect → listSubjects() → setSubjects() → subjects-changed
  //   → useSubjects re-renders → useEffect runs again.
  // The engine already seeds the cache via init(), and any subsequent
  // mutation (create / rename / reclassify / delete) emits
  // subjects-changed, which keeps the React snapshot in sync.

  // When there's at least one subject, "Add a moment" in the
  // footer opens the AddSubjectSheet inline. When there are
  // zero subjects, the home screen surfaces a single primary
  // CTA ("Start your first timeline") that opens the same
  // sheet. The sheet itself is owned by V2App so the home
  // screen stays free of sheet-state plumbing; we just call
  // the onAddMoment prop which V2App wires to open it.
  const handleAddMoment = onAddMoment ?? (() => {});

  return (
    <div className="ll-content ll-stack-lg">
      {/* V2.5.1 redesign — thin reminders banner at the top.
          Hidden when reminders are already on, when the user
          has dismissed it for this session, or when there's
          no settings entry (i.e. engine not ready). The user
          asked for "unobtrusive" so the styling stays flat
          and the dismiss is a one-tap X. */}
      {subjects.length > 0 &&
      !bannerDismissed &&
      onSettings ? (
        <RemindersBanner
          onTap={onSettings}
          onDismiss={() => setBannerDismissed(true)}
        />
      ) : null}

      <div className="ll-card">
        <div className="ll-subjects-header">
          <div>
            <h2 style={{ margin: 0 }}>
              {subjects.length === 0
                ? "Little Loop"
                : "Your moments"}
            </h2>
            <p style={{ color: "var(--ll-text-soft)", margin: "4px 0 0 0" }}>
              {subjects.length === 0
                ? "One photo at a time. Watch anything grow."
                : subjects.length === 1
                  ? "1 timeline"
                  : `${subjects.length} timelines`}
            </p>
          </div>
          {onSettings ? (
            <Button variant="ghost" onClick={onSettings} aria-label="Settings">
              Settings
            </Button>
          ) : null}
        </div>
      </div>

      {/* V2.5.1 — memory lane is always shown, including the
          empty branch (with a soft "Add a moment" CTA). The
          user asked for a graceful empty state so the feature
          is discoverable from day 1. */}
      <MemoryLane
        onOpenEntry={
          onOpenEntry ??
          ((subjectId) => onOpenSubject(subjectId))
        }
        onAddMoment={handleAddMoment}
      />

      {subjects.length === 0 ? (
        <div className="ll-card">
          <p style={{ color: "var(--ll-text-soft)" }}>
            One photo at a time. Watch anything grow.
          </p>
          <p>
            Track a baby, a plant, a fitness cut, a renovation —
            anything that benefits from "same time, same angle"
            snapshots.
          </p>
          <Button variant="primary" block onClick={handleAddMoment}>
            Start your first timeline
          </Button>
        </div>
      ) : (
        <div className="ll-subject-tile-list">
          {subjects.map((subject) => (
            <SubjectTile
              key={subject.id}
              subject={subject}
              onOpen={onOpenSubject}
              onSettings={onOpenSubjectSettings}
              onAddPhoto={onAddPhoto}
              onExport={onExport}
            />
          ))}
          {/* V2.5.1 redesign — "+ Add a moment" footer CTA. The
              user's pick: per-tile primary for adding to a
              specific subject, but they still need a way to
              create a new timeline. The footer surfaces the
              create-new path without competing with the
              per-tile Add photo (which is the primary "do
              the thing" surface). */}
          <Button
            variant="ghost"
            block
            onClick={handleAddMoment}
            aria-label="Add a moment"
          >
            + Add a moment
          </Button>
          <AdBanner />
          {unlock === "free" ? (
            <button
              type="button"
              className="ll-restore-link"
              onClick={() => onRestore?.()}
            >
              Restore purchases
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
