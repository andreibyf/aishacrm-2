import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/components/shared/useUser';
import { useSessionReplay } from '@/hooks/useSessionReplay';
import { getRuntimeEnv } from '@/utils/runtimeEnv';

/**
 * RequestHelp
 *
 * On-demand live take-over button. Pairs with passive replay providers
 * (Clarity) that lack remote control. Generates a unique meeting room,
 * opens it for the user, and POSTs a notification so the support
 * operator can join the same room.
 *
 * Provider URL templates (env-driven):
 *   VITE_HELP_MEETING_PROVIDER  "jitsi" (default) | "whereby" | "meet"
 *   VITE_HELP_MEETING_BASE_URL  Override the meeting host (e.g. self-hosted Jitsi)
 *   VITE_HELP_NOTIFY_URL        Optional backend endpoint to ping when help requested
 *                                (POST { roomUrl, userId, tenantId, timestamp })
 *
 * Defaults to a public Jitsi room (https://meet.jit.si/<unique-id>) — zero
 * config, no signup, screen sharing built in. Switch to Whereby/Meet via env.
 */
export function RequestHelp({ label = 'Request live help', className = '' }) {
  const { user } = useUser();
  const { trackEvent } = useSessionReplay();
  const [pending, setPending] = useState(false);
  const [lastRoomUrl, setLastRoomUrl] = useState(null);

  const buildRoomUrl = useCallback(() => {
    const provider = (getRuntimeEnv('VITE_HELP_MEETING_PROVIDER') || 'jitsi').toLowerCase();
    const base = getRuntimeEnv('VITE_HELP_MEETING_BASE_URL');
    const tenant = (user?.tenant_id || 'anon').slice(0, 8);
    const uid = (user?.id || 'guest').slice(0, 8);
    const stamp = Date.now().toString(36);
    const room = `aishacrm-${tenant}-${uid}-${stamp}`;

    if (provider === 'whereby') {
      const host = base || 'https://whereby.com';
      return `${host}/${room}`;
    }
    if (provider === 'meet') {
      // Google Meet requires a workspace account to create rooms via URL;
      // we route to a "new meeting" landing page and let the support op create one.
      return base || 'https://meet.google.com/new';
    }
    // Jitsi default — fully URL-driven, no auth needed.
    const host = base || 'https://meet.jit.si';
    return `${host}/${room}`;
  }, [user]);

  const onClick = useCallback(async () => {
    if (pending) return;
    setPending(true);
    const roomUrl = buildRoomUrl();
    setLastRoomUrl(roomUrl);

    // Notify session replay so support can correlate.
    try {
      trackEvent?.('help_requested', {
        roomUrl,
        path: window.location.pathname,
      });
    } catch (err) {
      console.warn('[RequestHelp] trackEvent failed:', err);
    }

    // Optionally notify a backend hook (Slack, email, in-app alert, etc.).
    const notifyUrl = getRuntimeEnv('VITE_HELP_NOTIFY_URL');
    if (notifyUrl) {
      try {
        await fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomUrl,
            userId: user?.id || null,
            tenantId: user?.tenant_id || null,
            email: user?.email || null,
            path: window.location.pathname,
            timestamp: new Date().toISOString(),
          }),
          // Non-blocking: don't let a flaky notify URL block the UX.
          keepalive: true,
        });
      } catch (err) {
        console.warn('[RequestHelp] notify endpoint failed:', err);
      }
    }

    // Open the meeting for the user. Pop-up blockers may block this if the
    // click isn't user-initiated; this handler IS user-initiated so it's fine.
    window.open(roomUrl, '_blank', 'noopener,noreferrer');
    setPending(false);
  }, [pending, buildRoomUrl, trackEvent, user]);

  return (
    <div className={className}>
      <Button onClick={onClick} disabled={pending} variant="default">
        {pending ? 'Opening room…' : label}
      </Button>
      {lastRoomUrl && (
        <p className="text-xs text-muted-foreground mt-2 break-all">
          Share this link with support if they don't appear automatically:{' '}
          <a href={lastRoomUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {lastRoomUrl}
          </a>
        </p>
      )}
    </div>
  );
}

export default RequestHelp;
