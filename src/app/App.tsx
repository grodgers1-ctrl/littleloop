import { useCallback, useEffect, useState } from "react";
import { getActiveProject } from "../db/repositories";
import { SetupScreen } from "../features/setup/SetupScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { CapturePreviewScreen } from "../features/capture/CapturePreviewScreen";
import { ImportDateScreen } from "../features/capture/ImportDateScreen";
import { TimelineScreen } from "../features/timeline/TimelineScreen";
import { ExportScreen } from "../features/export/ExportScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { Button } from "../components/Button";
import { initialRoute, type Route } from "./routes";
import type { Project } from "../db/schema";

export default function App() {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const navigate = useCallback((r: Route) => setRoute(r), []);
  const navigateToHome = useCallback(() => setRoute({ name: "home" }), []);

  // Bootstrap: load the project, route to setup or home.
  useEffect(() => {
    void (async () => {
      const p = await getActiveProject();
      if (p) {
        setProject(p);
        setRoute({ name: "home" });
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="ll-app">
        <div className="ll-header">
          <h1>Little Loop</h1>
        </div>
        <div className="ll-content">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  // Top-level shell + header. Setup and Home show the brand. Other
  // screens get a back button.
  const showBack =
    route.name !== "setup" &&
    route.name !== "home" &&
    Boolean(project);

  return (
    <div className="ll-app">
      <header className="ll-header">
        <h1>
          {route.name === "setup"
            ? "Little Loop"
            : project?.childName ?? "Little Loop"}
        </h1>
        {showBack ? (
          <Button variant="ghost" onClick={navigateToHome}>
            Home
          </Button>
        ) : null}
      </header>

      {route.name === "setup" ? (
        <SetupScreen
          onComplete={(p) => {
            setProject(p);
            setRoute({ name: "home" });
          }}
        />
      ) : project ? (
        renderRoute(route, project, navigate, setProject)
      ) : (
        <SetupScreen
          onComplete={(p) => {
            setProject(p);
            setRoute({ name: "home" });
          }}
        />
      )}

      {/* No persistent hidden inputs at this level. Each screen mounts its
          own file inputs as needed so they can react to local state. */}

      <footer className="ll-footer">
        Photos stay on this device. No accounts. No uploads.
      </footer>
    </div>
  );
}

function renderRoute(
  route: Route,
  project: Project,
  navigate: (r: Route) => void,
  setProject: (p: Project) => void,
) {
  switch (route.name) {
    case "home":
      return <HomeScreen project={project} navigate={navigate} />;
    case "capture-preview":
      return (
        <CapturePreviewScreen
          project={project}
          source={route.source}
          blob={route.blob}
          previewUrl={route.previewUrl}
          navigate={navigate}
          replaceEntryId={route.replaceEntryId}
        />
      );
    case "import-date":
      return (
        <ImportDateScreen
          project={project}
          previewUrl={route.previewUrl}
          suggestedDate={route.suggestedDate}
          blob={route.blob}
          navigate={navigate}
          replaceEntryId={route.replaceEntryId}
        />
      );
    case "timeline":
      return (
        <TimelineScreen
          project={project}
          navigate={navigate}
        />
      );
    case "export-config":
    case "export-progress":
    case "export-complete":
      return <ExportScreen project={project} navigate={navigate} />;
    case "settings":
      return (
        <SettingsScreen
          project={project}
          navigate={navigate}
          onProjectUpdated={(p) => setProject(p)}
        />
      );
    case "restore-preview":
      return (
        <div className="ll-content">
          <h2>Restore</h2>
          <p>
            Restore {route.projectName} ({route.cadence}, {route.count}{" "}
            photos).
          </p>
        </div>
      );
  }
}