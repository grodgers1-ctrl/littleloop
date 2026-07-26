import { useEffect, useRef } from "react";

interface Props {
  value: number; // 0..1
  label?: string;
}

export function ProgressBar({ value, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = Math.max(0, Math.min(1, value));
  useEffect(() => {
    if (ref.current) {
      ref.current.setAttribute("aria-valuenow", String(Math.round(pct * 100)));
    }
  }, [pct]);
  return (
    <div>
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label={label ?? "Progress"}
        className="ll-progress"
      >
        <div
          className="ll-progress-bar"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}