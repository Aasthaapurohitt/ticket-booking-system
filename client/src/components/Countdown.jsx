import { useEffect, useState } from "react";

function formatRemaining(ms) {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Purely cosmetic countdown -- the backend scheduler is the actual source
 * of truth for expiry (see server/src/services/scheduler.js). If this
 * timer hits zero, we call onExpire so the UI can re-check with the API
 * rather than assuming the seat is gone.
 */
export default function Countdown({ expiresAt, onExpire }) {
  const [remaining, setRemaining] = useState(() => new Date(expiresAt) - new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      const left = new Date(expiresAt) - new Date();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  return <span className="countdown">{formatRemaining(remaining)}</span>;
}
