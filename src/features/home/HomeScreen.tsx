import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import type { Project } from "../../db/schema";
import {
  countEntries,
  findEntryForPeriod,
} from "../../db/repositories";
import {
  dailyPeriodKey,
  todayDateOnly,
  weeklyPeriodKey,
} from "../../lib/dates";
import { getStorageInfo, isLowStorage } from "../../lib/storage";
import type { Route } from "../../app/routes";

interface Props {
  project: Project;
  kind: "real" | "sandbox";
  navigate: (r: Route) => void;
  onProjectUpdated?: (p: Project) => void;
}

type CaptureSource = "camera" | "library";

export function HomeScreen({ project, kind, navigate, onProjectUpdated }: Props) {
  // `kind` is consumed in Phase 4 (sandbox badge + CTAs). For now we
  // destructure it so the App-level contract is in place.
  void kind;
  void onProjectUpdated;
  const [hasCurrentPeriod, setHasCurrentPeriod] = useState(false);
  const [count, setCount] = useState(0);
  const [lowSpace, setLowSpace] = useState(false);
  const [replacePrompt, setReplacePrompt] = useState<CaptureSource | null>(null);

  // Recompute period status whenever the project changes.
  useEffect(() => {
    const today = todayDateOnly();
    const pk =
      project.cadence === "weekly"
        ? weeklyPeriodKey(today)
        : dailyPeriodKey(today);
    void (async () => {
      setCount(await countEntries(project.id));
      const existing = await findEntryForPeriod(project.id, pk);
      setHasCurrentPeriod(Boolean(existing));
      const info = await getStorageInfo();
      setLowSpace(isLowStorage(info));
    })();
  }, [project.id, project.cadence]);

  const isWeekly = project.cadence === "weekly";
  const captureLabel = isWeekly
    ? "Capture this week's moment"
    : "Capture today's moment";

  function requestCapture(source: CaptureSource) {
    if (hasCurrentPeriod) {
      setReplacePrompt(source);
      return;
    }
    triggerFile(source);
  }

  function triggerFile(source: CaptureSource) {
    const input = document.getElementById(
      source === "camera" ? "ll-camera-input" : "ll-library-input",
    ) as HTMLInputElement | null;
    input?.click();
  }

  function handleCameraFile(file: File) {
    navigate({
      name: "capture-preview",
      source: "camera",
      blob: file,
      previewUrl: URL.createObjectURL(file),
      suggestedDate: todayDateOnly(),
    });
  }

  function handleLibraryFile(file: File) {
    navigate({
      name: "import-date",
      previewUrl: URL.createObjectURL(file),
      suggestedDate: todayDateOnly(),
      blob: file,
    });
  }

  return (
    <div className="ll-content ll-stack-lg">
      <div className="ll-card">
        <h1>{project.childName}</h1>
        <p style={{ color: "var(--ll-text-soft)" }}>
          {count === 0
            ? "No moments captured yet."
            : count === 1
            ? "1 moment captured"
            : `${count} moments captured`}
        </p>

        {hasCurrentPeriod ? (
          <p className="ll-status ll-status-success" role="status">
            This period is captured.
          </p>
        ) : (
          <p style={{ color: "var(--ll-text-soft)" }}>{captureLabel}</p>
        )}

        <div className="ll-stack">
          {hasCurrentPeriod ? (
            <>
              <Button
                variant="primary"
                block
                onClick={() => requestCapture("camera")}
              >
                Replace photo
              </Button>
              <Button block onClick={() => requestCapture("library")}>
                Add another photo
              </Button>
              <Button block onClick={() => navigate({ name: "timeline" })}>
                View timeline
              </Button>
              <Button block onClick={() => navigate({ name: "export-config" })}>
                Export flipbook
              </Button>
              <Button block onClick={() => navigate({ name: "settings" })}>
                Backup timeline
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                block
                onClick={() => requestCapture("camera")}
              >
                Take photo
              </Button>
              <Button block onClick={() => requestCapture("library")}>
                Choose from camera roll
              </Button>
              {count > 0 ? (
                <>
                  <Button block onClick={() => navigate({ name: "timeline" })}>
                    View timeline
                  </Button>
                  <Button
                    block
                    onClick={() => navigate({ name: "export-config" })}
                  >
                    Export flipbook
                  </Button>
                  <Button
                    block
                    onClick={() => navigate({ name: "settings" })}
                  >
                    Settings
                  </Button>
                </>
              ) : (
                <Button
                  block
                  onClick={() => navigate({ name: "settings" })}
                >
                  Settings
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {lowSpace ? (
        <div className="ll-status ll-status-warn" role="alert">
          Your device is running low on space for this timeline. Back it up
          before adding more photos.
        </div>
      ) : null}

      {/* Hidden file inputs. Both routes feed into capture-preview / import-date. */}
      <input
        id="ll-camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleCameraFile(file);
          e.target.value = "";
        }}
      />
      <input
        id="ll-library-input"
        type="file"
        accept="image/*"
        aria-label="Choose photo from camera roll"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleLibraryFile(file);
          e.target.value = "";
        }}
      />

      <Modal
        open={Boolean(replacePrompt)}
        title="This period already has a photo. Replace it?"
        onClose={() => setReplacePrompt(null)}
      >
        <p>
          Replacing will keep the same period and remove the previous photo
          from this device.
        </p>
        <div className="ll-stack">
          <Button
            variant="primary"
            block
            onClick={() => {
              const src = replacePrompt;
              setReplacePrompt(null);
              if (src) triggerFile(src);
            }}
          >
            Replace
          </Button>
          <Button block onClick={() => setReplacePrompt(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}