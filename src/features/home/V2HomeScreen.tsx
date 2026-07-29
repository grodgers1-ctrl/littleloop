// V2 Home Screen. A vertical list of subject tiles. Each tile shows:
//
//   - The most recent entry's image as a small thumbnail
//   - The subject name (tap to rename inline)
//   - The subject type (tap to cycle through the 8 types)
//   - The cadence ("daily" / "weekly")
//   - The entry count
//
// A "+ Add subject" button at the top opens the AddSubjectSheet. On
// Day 7 the V1 home screen is replaced by this one in App.tsx; until
// then this component is wired only by V2App (a separate shell, not
// the main entry).

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { useEngine, useSubjects } from "../../engine/hooks";
import { getDb } from "../../db/database";
import { SUBJECT_TYPES } from "../../engine/state";
import type { Subject, SubjectType } from "../../engine/state";
import { AddSubjectSheet } from "./AddSubjectSheet";
import { AdBanner } from "./AdBanner";
import { MemoryLane } from "../memory-lane/MemoryLane";

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
   * V2.5 hotfix — quick-action callbacks. When provided, the
   * tile renders Add Photo (primary) + Export flipbook
   * (secondary) buttons so the user doesn't have to drill
   * into the subject screen to do anything.
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
        {/* V2.5 hotfix — quick actions so the user can act on
            a subject without first tapping into it. The buttons
            are rendered only when their callbacks are wired
            (which they are under the V2App shell, but not in
            the test harness that passes readonly). */}
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
                aria-label={`Export ${subject.name} as a flipbook`}
              >
                Export
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
            aria-label="Rename subject"
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
}

export function V2HomeScreen({
  onOpenSubject,
  onOpenSubjectSettings,
  onRestore,
  onSettings,
  onOpenEntry,
  onAddPhoto,
  onExport,
}: Props) {
  const subjects = useSubjects();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Note: we deliberately do NOT call engine.listSubjects() in a
  // useEffect here. That would create a feedback loop:
  //   useEffect → listSubjects() → setSubjects() → subjects-changed
  //   → useSubjects re-renders → useEffect runs again.
  // The engine already seeds the cache via init(), and any subsequent
  // mutation (create / rename / reclassify / delete) emits
  // subjects-changed, which keeps the React snapshot in sync.

  return (
    <div className="ll-content ll-stack-lg">
      <div className="ll-card">
        <div className="ll-subjects-header">
          <div>
            <h2 style={{ margin: 0 }}>Your subjects</h2>
            <p style={{ color: "var(--ll-text-soft)", margin: "4px 0 0 0" }}>
              {subjects.length === 0
                ? "Add your first subject to get started."
                : subjects.length === 1
                  ? "1 subject"
                  : `${subjects.length} subjects`}
            </p>
          </div>
          <Button variant="primary" onClick={() => setSheetOpen(true)} aria-label="Add subject">
                      + Add subject
                    </Button>
                    {onSettings ? (
                      <Button variant="ghost" onClick={onSettings}>
                        Settings
                      </Button>
                    ) : null}
        </div>
      </div>

      {/* V2.5 — "On this day" memory lane. Renders nothing when
          no past-year entries match today. */}
      {subjects.length > 0 ? (
        <MemoryLane
          onOpenEntry={
            onOpenEntry ??
            ((subjectId) => onOpenSubject(subjectId))
          }
        />
      ) : null}

      {subjects.length === 0 ? (
        <div className="ll-card">
          <p style={{ color: "var(--ll-text-soft)" }}>
            One photo at a time. Watch anything grow.
          </p>
          <p>
            Track a baby, a plant, a fitness cut, a renovation — anything
            that benefits from "same time, same angle" snapshots.
          </p>
          <Button
            variant="primary"
            block
            onClick={() => setSheetOpen(true)}
          >
            Add your first subject
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
          <AdBanner />
          <button
            type="button"
            className="ll-restore-link"
            onClick={() => onRestore?.()}
          >
            Restore purchases
          </button>
        </div>
      )}

      <AddSubjectSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={(id) => {
          setSheetOpen(false);
          onOpenSubject(id);
        }}
      />
    </div>
  );
}
