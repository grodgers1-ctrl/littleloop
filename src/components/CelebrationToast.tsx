import { useEffect } from "react";

// A small, celebratory toast that auto-dismisses after `autoCloseMs`.
// Designed to fire on the user's first successful export. Distinct
// from the existing Modal component: it's non-blocking, anchored to
// the top, and exits on its own.

interface Props {
  open: boolean;
  message: string;
  detail?: string;
  autoCloseMs?: number;
  onClose: () => void;
}

export function CelebrationToast({
  open,
  message,
  detail,
  autoCloseMs = 6000,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(id);
  }, [open, autoCloseMs, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="ll-celebration-toast"
      role="status"
      aria-live="polite"
      onClick={onClose}
    >
      <div className="ll-celebration-toast-inner">
        <strong>{message}</strong>
        {detail ? <div className="ll-celebration-toast-detail">{detail}</div> : null}
        <div className="ll-celebration-toast-dismiss">Tap to dismiss</div>
      </div>
    </div>
  );
}