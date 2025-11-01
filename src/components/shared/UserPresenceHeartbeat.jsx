import { useEffect, useRef } from "react";

// Pings backend to update last_seen/live_status for current user
export default function UserPresenceHeartbeat({ currentUser, intervalMs = 60000 }) {
  const timerRef = useRef(null);

  useEffect(() => {
    const email = currentUser?.email;
    if (!email) return;

    const ping = async () => {
      try {
        await fetch("/api/users/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
          keepalive: true,
        });
      } catch {
        // best-effort; ignore errors
      }
    };

    // immediate ping then interval
    ping();
    timerRef.current = setInterval(ping, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [currentUser?.email, intervalMs]);

  return null;
}
