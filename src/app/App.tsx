import { useCallback, useEffect, useState } from "react";
import { getActiveProject } from "../db/repositories";
import { getSandboxProject, initSandbox } from "../db/sandbox-repositories";
import { SetupScreen } from "../features/setup/SetupScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { SandboxHomeScreen } from "../features/sandbox/SandboxHomeScreen";
import { CapturePreviewScreen } from "../features/capture/CapturePreviewScreen";
import { ImportDateScreen } from "../features/capture/ImportDateScreen";
import { TimelineScreen } from "../features/timeline/TimelineScreen";
import { SandboxTimelineScreen } from "../features/sandbox/SandboxTimelineScreen";
import { ExportScreen } from "../features/export/ExportScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { IntroScreen } from "../features/intro/IntroScreen";
import { Button } from "../components/Button";
import { initialRoute, type Route } from "./routes";
import type { Project } from "../db/schema";

// A project plus a flag indicating whether it's the real or sandbox
// project. The App shell tracks this so screens can branch on it
// (sandbox renders the badge, hides the cadence editor, etc.).
interface ProjectContext {
  project: Project;
  kind: "real" | "sandbox";
}

export default function App() {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [ctx, setCtx] = useState<ProjectContext | null>(null);
  const [loading, setLoading] = useState(true);

  const navigate = useCallback((r: Route) => setRoute(r), []);
  const navigateToHome = useCallback(() => setRoute({ name: "home" }), []);

  // Bootstrap: real project wins if it exists; otherwise fall back to
  // sandbox; otherwise stay on intro.
  useEffect(() => {
    void (async () => {
      const real = await getActiveProject();
      if (real) {
        setCtx({ project: real, kind: "real" });
        setRoute({ name: "home" });
        setLoading(false);
        return;
      }
      const sandbox = await getSandboxProject();
      if (sandbox) {
        setCtx({ project: sandbox, kind: "sandbox" });
        setRoute({ name: "home" });
        setLoading(false);
        return;
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

  // Top-level shell + header.
  const showBack =
    route.name !== "intro" &&
    route.name !== "setup" &&
    route.name !== "home" &&
    Boolean(ctx);
  const headerTitle =
    route.name === "intro" || route.name === "setup"
      ? "Little Loop"
      : ctx?.project.childName ?? "Little Loop";

  return (
    <div className="ll-app">
      <header className="ll-header">
        <h1>{headerTitle}</h1>
        {showBack ? (
          <Button variant="ghost" onClick={navigateToHome}>
            Home
          </Button>
        ) : null}
      </header>

      {route.name === "intro" ? (
        <IntroScreen navigate={navigate} />
      ) : route.name === "setup" ? (
        route.mode === "sandbox" ? (
          // Sandbox is meant to be one-tap; initialise the singleton
          // row and jump straight to home. We render an empty
          // fragment while the IDB write completes.
          <SandboxBootstrap onReady={(p) => {
            setCtx({ project: p, kind: "sandbox" });
            setRoute({ name: "home" });
          }} />
        ) : (
          <SetupScreen
            mode="real"
            onComplete={(p) => {
              setCtx({ project: p, kind: "real" });
              setRoute({ name: "home" });
            }}
          />
        )
      ) : ctx ? (
        renderRoute(route, ctx, navigate, setCtx)
      ) : (
        // No project anywhere — bounce to the intro so the user can
        // pick a path.
        <IntroScreen navigate={navigate} />
      )}

      {/* No persistent hidden inputs at this level. Each screen mounts
          its own file inputs as needed so they can react to local state. */}

      <footer className="ll-footer">
        Photos stay on this device. No accounts. No uploads.
      </footer>
    </div>
  );
}

function SandboxBootstrap({ onReady }: { onReady: (p: Project) => void }) {
  // Bootstrap the sandbox singleton project and immediately hand the
  // resulting project back to the App. The user never sees a setup
  // form for the sandbox — the IntroScreen choice is the commitment.
  useEffect(() => {
    let cancelled = false;
    void initSandbox().then((p) => {
      if (!cancelled) onReady(p);
    });
    return () => {
      cancelled = true;
    };
  }, [onReady]);
  return (
    <div className="ll-content">
      <p>Preparing your sandbox…</p>
    </div>
  );
}

function renderRoute(
  route: Route,
  ctx: ProjectContext,
  navigate: (r: Route) => void,
  setCtx: (c: ProjectContext) => void,
) {
  const { project, kind } = ctx;
  switch (route.name) {
    case "home":
      return kind === "sandbox" ? (
        <SandboxHomeScreen project={project} navigate={navigate} />
      ) : (
        <HomeScreen
          project={project}
          kind={kind}
          navigate={navigate}
          onProjectUpdated={(p) => setCtx({ project: p, kind })}
        />
      );
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
      return kind === "sandbox" ? (
        <SandboxTimelineScreen project={project} navigate={navigate} />
      ) : (
        <TimelineScreen
          project={project}
          kind={kind}
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
          kind={kind}
          navigate={navigate}
          onProjectUpdated={(p) => setCtx({ project: p, kind })}
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