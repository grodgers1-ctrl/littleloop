import { Button } from "../../components/Button";
import type { Route } from "../../app/routes";

interface Props {
  navigate: (r: Route) => void;
}

export function IntroScreen({ navigate }: Props) {
  return (
    <div className="ll-content ll-stack-lg">
      <div className="ll-card">
        <h1>Little Loop</h1>
        <p>
          Capture one moment at a time. Watch your child grow.
          Photos stay on this device unless you choose to export them.
        </p>
      </div>

      <div className="ll-card">
        <h3>How would you like to start?</h3>
        <div className="ll-stack-lg" style={{ marginTop: 12 }}>
          <Button
            variant="primary"
            block
            onClick={() => navigate({ name: "setup", mode: "real" })}
          >
            Start a real timeline
          </Button>
          <p style={{ margin: "-4px 4px 0", fontSize: "0.88rem", color: "var(--ll-text-faint)" }}>
            Capture a real child's photo per day or week. Stored on this
            device, with backup.
          </p>

          <div
            style={{
              borderTop: "1px solid var(--ll-border)",
              margin: "4px 0",
            }}
          />

          <Button
            block
            onClick={() => navigate({ name: "setup", mode: "sandbox" })}
          >
            Try the app with sample photos
          </Button>
          <p style={{ margin: "-4px 4px 0", fontSize: "0.88rem", color: "var(--ll-text-faint)" }}>
            Pick a few photos from your camera roll, watch a flipbook render.
            Delete the sandbox anytime — it never touches a real timeline.
          </p>
        </div>
      </div>
    </div>
  );
}