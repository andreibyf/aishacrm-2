import { useEffect, useRef } from "react";
import { BACKEND_URL } from '@/api/entities';

// Pings backend to update last_seen/live_status for current user
const DEFAULT_INTERVAL = parseInt(import.meta.env.VITE_USER_HEARTBEAT_INTERVAL_MS || '180000', 10);

export default function UserPresenceHeartbeat({ currentUser, intervalMs = DEFAULT_INTERVAL }) {
  const timerRef = useRef(null);

  useEffect(() => {
    const email = currentUser?.email;
    if (!email) return;

    const ping = async () => {
      // Pause when tab not visible to reduce load
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        await fetch(`${BACKEND_URL}/api/users/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
          credentials: 'include',
          keepalive: true,
        });
      } catch {
        // best-effort; ignore errors
      }
    };

    // immediate ping then interval
    ping();
    timerRef.current = setInterval(ping, Math.max(15000, intervalMs));

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [currentUser?.email, intervalMs]);

  return null;
}
