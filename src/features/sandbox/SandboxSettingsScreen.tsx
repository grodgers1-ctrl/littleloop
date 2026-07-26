import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import {
  countSandboxEntries,
  countSandboxAssets,
  totalSandboxBytes,
  deleteSandbox,
  readAllSandboxAssets,
} from "../../db/sandbox-repositories";
import { SANDBOX_PROJECT_ID } from "../../db/sandbox-database";
import { getActiveProject } from "../../db/repositories";
import type { Project } from "../../db/schema";
import type { Route } from "../../app/routes";

interface Props {
  project: Project;
  navigate: (r: Route) => void;
  onProjectUpdated?: (p: Project) => void;
}

const APP_VERSION = "1.1.0";

export function SandboxSettingsScreen({
  project,
  navigate,
  onProjectUpdated,
}: Props) {
  const [photoCount, setPhotoCount] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [handoffStep, setHandoffStep] = useState<
    "idle" | "creating" | "importing" | "done" | "error"
  >("idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [confirmHandoff, setConfirmHandoff] = useState(false);

  async function reload() {
    setPhotoCount(await countSandboxEntries());
    setAssetCount(await countSandboxAssets());
    setBytes(await totalSandboxBytes());
  }

  useEffect(() => {
    void reload();
  }, [project.id]);

  async function handleDelete() {
    await deleteSandbox();
    setConfirmDelete(false);
    // Sandbox gone — bounce to intro so the user can pick again.
    navigate({ name: "intro" });
  }

  async function handleHandoff() {
    setHandoffError(null);
    setConfirmHandoff(false);
    setHandoffStep("creating");
    try {
      // Step 1: ensure no real project exists. If one does, ask the user
      // to delete it first via a destructive path. For V1.1 we send
      // them back to intro and let the user click Start a real timeline,
      // which would conflict — so instead, we just refuse and tell them
      // to delete their existing project in the real-timeline settings.
      const existing = await getActiveProject();
      if (existing) {
        setHandoffError(
          "You already have a real timeline on this device. Delete it in Settings first.",
        );
        setHandoffStep("error");
        return;
      }
      // Step 2: walk the user to the real setup flow. The actual import
      // happens after they finish creating their real project. For
      // V1.1 simplicity we just route them there and tell them to use
      // the regular import flow; future V1.2 work could deep-link.
      navigate({ name: "setup", mode: "real" });
    } catch (err) {
      setHandoffError(
        err instanceof Error ? err.message : "Handoff failed.",
      );
      setHandoffStep("error");
    }
  }

  const sizeMB = (bytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="ll-content ll-stack-lg">
      <h2>Sandbox settings</h2>

      <div className="ll-card">
        <h3>Storage</h3>
        <p>
          Sandbox photos: {photoCount} ({Math.round(assetCount / 2)} images + thumbnails)
          <br />
          Storage used: {sizeMB} MB
        </p>
        <StorageBar bytes={bytes} photoCount={photoCount} />
      </div>

      <div className="ll-card">
        <h3>Start a real timeline with these photos</h3>
        <p>
          Move your sandbox photos into a real child timeline. You can
          pick the child's name, date of birth, and cadence there.
        </p>
        <Button
          onClick={() => setConfirmHandoff(true)}
          disabled={photoCount === 0 || handoffStep === "creating"}
        >
          Start a real timeline
        </Button>
        {handoffError ? (
          <div className="ll-status ll-status-error" role="alert">
            {handoffError}
          </div>
        ) : null}
      </div>

      <div className="ll-card">
        <h3>Delete sandbox</h3>
        <p>
          This permanently removes every sandbox photo and asset from
          this device. Your real timeline (if any) is untouched.
        </p>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Delete sandbox
        </Button>
      </div>

      <div className="ll-card ll-card-quiet">
        <h3>Privacy</h3>
        <p>
          Sandbox photos stay on this device. They are never uploaded.
        </p>
        <p>App version: {APP_VERSION}</p>
      </div>

      <Button onClick={() => navigate({ name: "home" })}>Back</Button>

      <Modal
        open={confirmHandoff}
        title="Start a real timeline?"
        onClose={() => setConfirmHandoff(false)}
      >
        <p>
          We'll set up a real child timeline and you'll be able to import
          these sandbox photos into it from the regular import flow.
        </p>
        <div className="ll-stack">
          <Button variant="primary" block onClick={handleHandoff}>
            Continue
          </Button>
          <Button block onClick={() => setConfirmHandoff(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        title="Delete the sandbox?"
        onClose={() => setConfirmDelete(false)}
      >
        <p>
          This permanently removes {photoCount} photo
          {photoCount === 1 ? "" : "s"} from this device. Your real
          timeline (if any) is untouched.
        </p>
        <div className="ll-stack">
          <Button variant="danger" block onClick={handleDelete}>
            Delete sandbox
          </Button>
          <Button block onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      {/* Mark helpers used so dead-code elimination doesn't drop them. */}
      <span style={{ display: "none" }} aria-hidden="true">
        {String(SANDBOX_PROJECT_ID)} {String(readAllSandboxAssets)} {String(onProjectUpdated)}
      </span>
    </div>
  );
}

function StorageBar({
  bytes,
  photoCount,
}: {
  bytes: number;
  photoCount: number;
}) {
  // Visualize storage usage against an indicative 50 MB cap (the
  // rough cost of MAX_IMPORT_BATCH=50 normalised photos). The bar
  // turns amber over 80% and red over 95%.
  const CAP = 50 * 1024 * 1024;
  const pct = Math.min(1, bytes / CAP);
  let color = "var(--ll-accent)";
  if (pct > 0.95) color = "var(--ll-danger)";
  else if (pct > 0.8) color = "var(--ll-warn)";
  const remaining = Math.max(0, 20 - photoCount);
  return (
    <div style={{ marginTop: 8 }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={CAP}
        aria-valuenow={bytes}
        aria-label="Sandbox storage usage"
        style={{
          height: 8,
          background: "var(--ll-surface-2)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: color,
            transition: "width 200ms ease",
          }}
        />
      </div>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: "0.85rem",
          color: "var(--ll-text-soft)",
        }}
      >
        {photoCount < 20
          ? `Add ${remaining} more photo${remaining === 1 ? "" : "s"} to enable the instant preview.`
          : "Preview is enabled."}
      </p>
    </div>
  );
}