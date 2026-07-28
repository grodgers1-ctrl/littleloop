// V2App — the V2 surface (home, subject detail, subject settings).
// Wired to the engine via the React hooks layer. NOT yet mounted in
// main.tsx; this is a parallel component that Day 7 unifies with V1
// after the V1 regression suite is green.

import { useEffect } from "react";
import { Button } from "../components/Button";
import { V2HomeScreen } from "./home/V2HomeScreen";
import { V2SubjectScreen } from "./subject/V2SubjectScreen";
import { V2SubjectSettingsScreen } from "./subject/V2SubjectSettingsScreen";
import {
  useV2Router,
  type V2Route,
} from "../engine/router";
import { V2Splash } from "../engine/V2Splash";

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
      route.name === "subject" || route.name === "subject-settings";
    if (!needsSubjectId) return;
    const subject = currentSubject(route.subjectId);
    if (!subject) navigate({ name: "home" });
  }, [route, currentSubject, navigate]);

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
  } else {
    // V2-only routes that aren't yet handled (capture-preview,
    // import-date, export-config). Day 8 wires these through the
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
      <footer className="ll-footer">
        Photos stay on this device. No accounts. No uploads.
      </footer>
    </div>
  );
}
