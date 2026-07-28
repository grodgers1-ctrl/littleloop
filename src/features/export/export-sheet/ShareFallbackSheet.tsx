// V2 Share Fallback Sheet. Shown when the Web Share API is
// unavailable. The sheet offers four buttons:
//
//   - WhatsApp (wa.me deep link with message text)
//   - Instagram (no public deep link for media; show instructions)
//   - Email (mailto: with subject and body)
//   - Save to Files (download the MP4)
//
// The sheet is a modal. The user can close it and try another
// route.

import { useState } from "react";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { downloadBlob } from "../../../lib/download";

interface Props {
  open: boolean;
  blob: Blob;
  filename: string;
  subjectName: string;
  onClose: () => void;
}

export function ShareFallbackSheet({
  open,
  blob,
  filename,
  subjectName,
  onClose,
}: Props) {
  const [saved, setSaved] = useState(false);

  const message = encodeURIComponent(
    `${subjectName} — a Little Loop timeline\n\nMade with little-loop. One photo at a time.`,
  );
  const subject = encodeURIComponent(`${subjectName} — Little Loop timeline`);

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener");
  }

  function handleEmail() {
    window.open(
      `mailto:?subject=${subject}&body=${message}`,
      "_blank",
      "noopener",
    );
  }

  function handleSaveToFiles() {
    downloadBlob(blob, filename);
    setSaved(true);
  }

  return (
    <Modal open={open} title="Share" onClose={onClose}>
      <div className="ll-stack">
        <p style={{ color: "var(--ll-text-soft)" }}>
          Your browser doesn't support sharing directly. Use one of the
          options below.
        </p>

        <Button block onClick={handleWhatsApp}>
          Share on WhatsApp
        </Button>
        <Button block onClick={handleEmail}>
          Email to self
        </Button>
        <Button block onClick={handleSaveToFiles}>
          {saved ? "Saved" : "Save to Files"}
        </Button>

        <div className="ll-card ll-card-quiet">
          <p style={{ fontWeight: 600, margin: 0 }}>Instagram</p>
          <p style={{ color: "var(--ll-text-soft)", marginTop: 4 }}>
            Instagram doesn't support direct sharing from a browser. Save
            the video to your Files, then upload it from the Instagram
            app.
          </p>
        </div>

        <Button block onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}