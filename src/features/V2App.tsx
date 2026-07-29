// V2App — the V2 surface (home, subject detail, subject settings).
// Wired to the engine via the React hooks layer. NOT yet mounted in
// main.tsx; this is a parallel component that Day 7 unifies with V1
// after the V1 regression suite is green.

import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { V2HomeScreen } from "./home/V2HomeScreen";
import { V2SubjectScreen } from "./subject/V2SubjectScreen";
import { V2SubjectSettingsScreen } from "./subject/V2SubjectSettingsScreen";
import { PaywallScreen } from "./iap/PaywallScreen";
import { ExportSheet } from "./export/export-sheet/ExportSheet";
import { ExportResultScreen } from "./export/export-sheet/ExportResultScreen";
import { V2SettingsScreen } from "./settings/V2SettingsScreen";
import {
  useV2Router,
  type V2Route,
} from "../engine/router";
import { V2Splash } from "../engine/V2Splash";
import { CapturePreviewScreen } from "./capture/CapturePreviewScreen";
import { ImportDateScreen } from "./capture/ImportDateScreen";
import { getDb } from "../db/database";
import type { Project } from "../db/schema";
import type { Route as V1Route } from "../app/routes";

export function V2App() {
  return (
    <V2Splash>
      <V2Shell />
    </V2Splash>
  );
}

function V2Shell() {
  const { route, navigate, currentSubject } = useV2Router();

  // If the route points at a subject that no longer exists (e.g. it
  // was just deleted on the settings screen), bounce home.
  useEffect(() => {
    const needsSubjectId =
      route.name === "subject" ||
      route.name === "subject-settings" ||
      route.name === "export-config" ||
      route.name === "export-result" ||
      route.name === "capture-preview" ||
      route.name === "import-date";
    if (!needsSubjectId) return;
    const subject = currentSubject(route.subjectId);
    if (!subject) navigate({ name: "home" });
  }, [route, currentSubject, navigate]);

  // V2.5 hotfix — the capture/import/export screens all need a
  // V1 Project shape (the V1 components read project.id,
  // project.cadence, project.dateOfBirth, project.childName).
  // The V2 engine mirror-writes a V1 Project when a subject is
  // created or renamed, so we read it here on demand and pass
  // it down.
  const routeSubjectId =
    route.name === "subject" ||
    route.name === "subject-settings" ||
    route.name === "export-config" ||
    route.name === "export-result" ||
    route.name === "capture-preview" ||
    route.name === "import-date"
      ? route.subjectId
      : undefined;

  const [subjectProject, setSubjectProject] = useState<Project | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!routeSubjectId) {
      setSubjectProject(null);
      return;
    }
    void (async () => {
      const p = await getDb().projects.get(routeSubjectId);
      if (!cancelled) setSubjectProject(p ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [routeSubjectId]);

  // Map a V1 Route (used by the V1 TimelineScreen, CapturePreviewScreen,
  // ImportDateScreen) into the V2 router. This is the bridge that
  // makes the V1 components work under the V2 shell without
  // rewriting their navigation logic.
  const v1ToV2 = useMemo(
    () =>
      (r: V1Route): V2Route => {
        switch (r.name) {
          case "home":
            return { name: "home" };
          case "settings":
            return routeSubjectId
              ? { name: "subject-settings", subjectId: routeSubjectId }
              : { name: "settings" };
          case "export-config":
            return routeSubjectId
              ? { name: "export-config", subjectId: routeSubjectId }
              : { name: "home" };
          case "capture-preview":
            return {
              name: "capture-preview",
              subjectId: routeSubjectId ?? "",
              source: r.source,
              blob: r.blob,
              previewUrl: r.previewUrl,
              suggestedDate: r.suggestedDate,
              replaceEntryId: r.replaceEntryId,
            };
          case "import-date":
            return {
              name: "import-date",
              subjectId: routeSubjectId ?? "",
              previewUrl: r.previewUrl,
              suggestedDate: r.suggestedDate,
              blob: r.blob,
              replaceEntryId: r.replaceEntryId,
            };
          case "timeline":
            // V1's TimelineScreen used a stack-pushed timeline
            // screen. In V2 the subject IS the timeline; bounce
            // back to the subject.
            return routeSubjectId
              ? { name: "subject", subjectId: routeSubjectId }
              : { name: "home" };
          case "intro":
          case "setup":
          case "export-progress":
          case "export-complete":
          case "restore-preview":
          default:
            // V1-only screens we don't render under the V2 shell.
            // Bounce to home rather than rendering a stub.
            return { name: "home" };
        }
      },
    [routeSubjectId],
  );

  let body: React.ReactNode = null;
  let headerTitle = "Little Loop";
  let showBack = false;

  if (route.name === "home") {
    body = (
      <V2HomeScreen
        onOpenSubject={(id) => navigate({ name: "subject", subjectId: id })}
        onOpenSubjectSettings={(id) =>
          navigate({ name: "subject-settings", subjectId: id })
        }
        onRestore={() =>
          navigate({ name: "paywall", source: "home" } satisfies V2Route)
        }
        onOpenEntry={(subjectId) =>
          navigate({ name: "subject", subjectId } satisfies V2Route)
        }
        onAddPhoto={(subjectId) =>
          triggerFilePicker(
            subjectId,
            "library",
            navigate,
            currentSubject,
            subjectProject,
            setSubjectProject,
          )
        }
        onExport={(subjectId) =>
          navigate({
            name: "export-config",
            subjectId,
          } satisfies V2Route)
        }
      />
    );
    showBack = false;
  } else if (route.name === "subject") {
    const subject = currentSubject(route.subjectId);
    if (subject) {
      body = <V2SubjectScreen subject={subject} navigate={navigate} />;
      headerTitle = subject.name;
      showBack = true;
    }
    // The useEffect above redirects to home if subject is missing;
    // render nothing in the meantime.
  } else if (route.name === "subject-settings") {
    const subject = currentSubject(route.subjectId);
    if (subject) {
      body = (
        <V2SubjectSettingsScreen
          subject={subject}
          onBack={() =>
            navigate({ name: "subject", subjectId: subject.id } satisfies V2Route)
          }
          onDeleted={() => navigate({ name: "home" } satisfies V2Route)}
        />
      );
      headerTitle = subject.name;
      showBack = true;
    }
  } else if (route.name === "paywall") {
    body = (
      <PaywallScreen source={route.source} onClose={() => navigate({ name: "home" } satisfies V2Route)} />
    );
    headerTitle = "Unlock Little Loop";
    showBack = true;
  } else if (route.name === "export-config") {
    const subject = currentSubject(route.subjectId);
    const subjectName = subject?.name ?? "subject";
    // The home screen already shows the entry count on the tile;
    // the export sheet uses entryCount as a label ("N captured").
    // For Day 9 we pass 0 (informational); the sheet is still
    // functional — it exports whatever entries exist in the range.
    // Day 10 reads the actual count from the engine.
    const entryCount = 0;
    body = (
      <ExportSheet
        open={true}
        subjectId={route.subjectId}
        subjectName={subjectName}
        entryCount={entryCount}
        onCompleted={(result) =>
          navigate({
            name: "export-result",
            result,
            subjectName,
            subjectId: route.subjectId,
          } satisfies V2Route)
        }
        onClose={() => navigate({ name: "subject", subjectId: route.subjectId } satisfies V2Route)}
      />
    );
    headerTitle = subjectName;
    showBack = true;
  } else if (route.name === "export-result") {
    body = (
      <ExportResultScreen
        result={route.result}
        subjectName={route.subjectName}
        onBack={() => navigate({ name: "home" } satisfies V2Route)}
      />
    );
    headerTitle = "Export complete";
    showBack = true;
  } else if (route.name === "capture-preview" || route.name === "import-date") {
    // V2.5 hotfix — render the V1 capture / import screens,
    // passing the V1 Project + a v1→v2 navigation adapter.
    if (subjectProject) {
      if (route.name === "capture-preview") {
        body = (
          <CapturePreviewScreen
            project={subjectProject}
            source={route.source}
            blob={route.blob}
            previewUrl={route.previewUrl}
            navigate={(r) => navigate(v1ToV2(r))}
            replaceEntryId={route.replaceEntryId}
          />
        );
      } else {
        body = (
          <ImportDateScreen
            project={subjectProject}
            previewUrl={route.previewUrl}
            suggestedDate={route.suggestedDate}
            blob={route.blob}
            navigate={(r) => navigate(v1ToV2(r))}
            replaceEntryId={route.replaceEntryId}
          />
        );
      }
      headerTitle = subjectProject.childName;
      showBack = true;
    }
  } else if (route.name === "settings") {
    body = (
      <V2SettingsScreen
        onBack={() => navigate({ name: "home" } satisfies V2Route)}
        onRestore={() => navigate({ name: "paywall", source: "home" } satisfies V2Route)}
      />
    );
    headerTitle = "Settings";
    showBack = true;
  } else {
    // V2-only routes that aren't yet handled. Day 8 wires these through the
    // engine. For now, show a placeholder.
    body = (
      <div className="ll-content">
        <p>This screen is not yet available in V2. Coming soon.</p>
      </div>
    );
    showBack = true;
  }

  return (
    <div className="ll-app">
      <header className="ll-header">
        <h1>{headerTitle}</h1>
        {showBack ? (
          <Button
            variant="ghost"
            onClick={() => navigate({ name: "home" } satisfies V2Route)}
          >
            Home
          </Button>
        ) : null}
      </header>
      {body}
      {/* V2.5 hotfix — hidden file inputs that the V2 home tile
          (and the V2 subject screen) trigger via the
          `triggerFilePicker` helper. The V1 HomeScreen did this
          inline; we lift it here so the V2 subjects can share
          a single input. */}
      <input
        id="ll-camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo"
        style={{ display: "none" }}
      />
      <input
        id="ll-library-input"
        type="file"
        accept="image/*"
        aria-label="Choose photo from camera roll"
        style={{ display: "none" }}
      />
      <footer className="ll-footer">
        Photos stay on this device. No accounts. No uploads.
      </footer>
    </div>
  );
}

/**
 * V2.5 hotfix — trigger the hidden library file picker for a
 * subject, then navigate to the import-date screen. The picked
 * Blob is held in a closure-bound state slot so the onChange
 * handler can navigate with the right payload. The V1
 * HomeScreen did this inline; we lift it here so the V2 home
 * can call it from a tile button.
 */
function triggerFilePicker(
  subjectId: string,
  source: "camera" | "library",
  navigate: (r: V2Route) => void,
  currentSubject: (id?: string) => { id: string; name: string } | undefined,
  _subjectProject: Project | null,
  _setSubjectProject: (p: Project | null) => void,
): void {
  const input = document.getElementById(
    source === "camera" ? "ll-camera-input" : "ll-library-input",
  ) as HTMLInputElement | null;
  if (!input) {
    // The file input is rendered by V2App; if it's missing for any
    // reason, fall through to a no-op rather than crashing.
    return;
  }
  // The file input is a singleton on the document. Attach a
  // one-shot onChange that knows the subjectId, navigates with
  // the picked blob, and resets the input.
  const handler = (e: Event) => {
    input.removeEventListener("change", handler);
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) {
      (e.target as HTMLInputElement).value = "";
      return;
    }
    const subject = currentSubject(subjectId);
    if (!subject) {
      (e.target as HTMLInputElement).value = "";
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (source === "library") {
      navigate({
        name: "import-date",
        subjectId,
        previewUrl,
        suggestedDate: todayDateOnly(),
        blob: file,
      });
    } else {
      navigate({
        name: "capture-preview",
        subjectId,
        source,
        blob: file,
        previewUrl,
        suggestedDate: todayDateOnly(),
      });
    }
    (e.target as HTMLInputElement).value = "";
  };
  input.addEventListener("change", handler);
  input.click();
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}
