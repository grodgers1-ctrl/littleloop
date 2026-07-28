// V2 Export Result Screen. Shows the completed MP4 with an inline
// video player, plus Save to Photos / Share / Save backup buttons.
// The Save to Photos and Share buttons are wired on Day 10 (camera
// roll) and Day 11 (share intents); for Day 9 they are present but
// either delegate to platform stubs (which return false) or show a
// download fallback.

import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { useEngine } from "../../../engine/hooks";
import type { ExportResult } from "../../../engine/state";
import { ShareFallbackSheet } from "./ShareFallbackSheet";

interface Props {
  result: ExportResult;
  subjectName: string;
  onBack: () => void;
}

export function ExportResultScreen({
  result,
  subjectName,
  onBack,
}: Props) {
  const engine = useEngine();
  const videoUrl = useRef<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showShareFallback, setShowShareFallback] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(result.blob);
    videoUrl.current = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [result.blob]);

  async function handleSaveToCameraRoll() {
    setSaveError(null);
    setSaving(true);
    try {
      const ok = await engine.saveToCameraRoll(result.blob, result.filename);
      if (!ok) {
        // Fallback to download.
        const { downloadBlob } = await import("../../../lib/download");
        downloadBlob(result.blob, result.filename);
        setSaveError(
          "Saved as a download. On iPhone, open the share sheet and pick 'Save to Photos'.",
        );
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    setSaveError(null);
    try {
      const result2 = await engine.share(result.blob, result.filename, {
        title: `${subjectName} Little Loop`,
        text: `${subjectName} — a Little Loop timeline`,
      });
      if (!result2.shared && result2.reason === "unavailable") {
        setShowShareFallback(true);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not share.");
    }
  }

  return (
    <div className="ll-content ll-stack-lg">
      <h2>Export complete</h2>
      <p style={{ color: "var(--ll-text-soft)" }}>
        {result.filename} — {result.frameCount} photos,{" "}
        {(result.durationMs / 1000).toFixed(1)}s
      </p>

      <div className="ll-export-video">
        {videoUrl.current ? (
          <video
            src={videoUrl.current}
            controls
            autoPlay
            muted
            loop
            playsInline
            style={{
              width: "100%",
              maxHeight: "60vh",
              borderRadius: "var(--ll-radius)",
              background: "#000",
            }}
          />
        ) : (
          <p>Loading video…</p>
        )}
      </div>

      <div className="ll-stack">
        <Button
          variant="primary"
          block
          onClick={handleSaveToCameraRoll}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save to Photos"}
        </Button>
        <Button block onClick={handleShare}>
          Share
        </Button>
        <Button block onClick={onBack}>
          Back
        </Button>
      </div>

      {saveError ? (
        <div className="ll-status ll-status-info" role="status">
          {saveError}
        </div>
      ) : null}

      <ShareFallbackSheet
        open={showShareFallback}
        blob={result.blob}
        filename={result.filename}
        subjectName={subjectName}
        onClose={() => setShowShareFallback(false)}
      />

      <div
        className="ll-card ll-card-quiet"
        style={{ fontSize: 13, color: "var(--ll-text-soft)" }}
      >
        {result.frameCount} frames exported at {result.filename}.
      </div>
    </div>
  );
}