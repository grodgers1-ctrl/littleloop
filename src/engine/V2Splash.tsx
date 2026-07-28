// V2 splash — renders a loading state until the engine is ready,
// then renders its children. Lives in a .tsx file so the JSX rule
// applies, and only exports a single component to keep the
// react-refresh rule happy.

import { useEngineReady } from "./router";

export function V2Splash({ children }: { children: React.ReactNode }) {
  const ready = useEngineReady();
  if (!ready) {
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
  return <>{children}</>;
}
