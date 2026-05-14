import React, { useCallback, useMemo, useState } from 'react';
import { ExternalLink, Eye, Copy, Check, Info, Headphones } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { getRuntimeEnv } from '@/utils/runtimeEnv';

/**
 * SessionReplayControl
 *
 * Lets a superadmin (a) jump to the Clarity dashboard filtered to the
 * target user, and (b) launch a live take-over room via Jitsi.
 *
 * Provider is driven by VITE_SESSION_REPLAY_PROVIDER (clarity | none).
 * Renders null when no provider is configured.
 *
 * @param {Object} props
 * @param {Object} props.targetUser - User whose session to observe.
 *   Expected shape: { id, email, name, tenant_id }
 */
export function SessionReplayControl({ targetUser }) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [room, setRoom] = useState(null);

  const provider = useMemo(() => {
    const explicit = (getRuntimeEnv('VITE_SESSION_REPLAY_PROVIDER') || '').toLowerCase();
    if (explicit === 'clarity' || explicit === 'none') return explicit;
    if ((getRuntimeEnv('VITE_CLARITY_ENABLED') || '').toLowerCase() === 'true') return 'clarity';
    return 'none';
  }, []);

  const dashboardUrl = useMemo(() => {
    if (provider === 'clarity') {
      const base =
        getRuntimeEnv('VITE_CLARITY_DASHBOARD_URL') || 'https://clarity.microsoft.com';
      const projectId = getRuntimeEnv('VITE_CLARITY_PROJECT_ID');
      const tag = targetUser?.email
        ? `email:${encodeURIComponent(targetUser.email)}`
        : targetUser?.id
          ? `userId:${encodeURIComponent(targetUser.id)}`
          : null;
      const path = projectId ? `/projects/view/${projectId}/dashboard` : '';
      return tag ? `${base}${path}?customFilter=${tag}` : `${base}${path}`;
    }
    return null;
  }, [provider, targetUser]);

  const buildJitsiRoom = useCallback(() => {
    const baseUrl =
      getRuntimeEnv('VITE_HELP_MEETING_BASE_URL') || 'https://meet.jit.si';
    const proto = (getRuntimeEnv('VITE_HELP_MEETING_PROVIDER') || 'jitsi').toLowerCase();
    const tenant = (targetUser?.tenant_id || 'anon').slice(0, 8);
    const uid = (targetUser?.id || 'guest').slice(0, 8);
    const stamp = Date.now().toString(36);
    const slug = `aishacrm-assist-${tenant}-${uid}-${stamp}`;
    if (proto === 'whereby') return `${baseUrl}/${slug}`;
    if (proto === 'meet') return baseUrl || 'https://meet.google.com/new';
    return `${baseUrl}/${slug}`;
  }, [targetUser]);

  const handleCopyUrl = () => {
    if (!dashboardUrl) return;
    navigator.clipboard.writeText(dashboardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenDashboard = () => {
    if (!dashboardUrl) return;
    window.open(dashboardUrl, '_blank', 'noopener,noreferrer');
  };

  const handleStartAssist = () => {
    const url = buildJitsiRoom();
    setRoom(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyRoom = () => {
    if (!room) return;
    navigator.clipboard.writeText(room);
  };

  if (provider === 'none') return null;

  if (provider === 'clarity' && !getRuntimeEnv('VITE_CLARITY_PROJECT_ID')) {
    return null;
  }

  const providerLabel = 'Microsoft Clarity';
  const supportsNativeAssist = false;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          title={`Start support session (${providerLabel})`}
        >
          <Eye className="h-4 w-4" />
          Start Assist
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start Assist Session - {providerLabel}</DialogTitle>
          <DialogDescription>
            Start live support for {targetUser?.email || targetUser?.name || 'this user'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-2">How to start live assist:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Open the Clarity dashboard (button below) — sessions are filtered to this user</li>
                <li>Find their live or most recent session in the list</li>
                <li>For real-time control, click <strong>Start Live Take-Over</strong> below to open a Jitsi room</li>
                <li>Share the meeting link with the user (auto-copied) — they click → instant screenshare both ways</li>
              </ol>
            </AlertDescription>
          </Alert>

          <div className="rounded-md border p-4 space-y-3">
            <div>
              <h4 className="font-medium">{providerLabel} Dashboard</h4>
              <p className="text-sm text-muted-foreground">
                View sessions, heatmaps, recordings (live view has slight delay)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleOpenDashboard} className="gap-2 flex-1">
                <ExternalLink className="h-4 w-4" />
                Open Dashboard
              </Button>
              <Button onClick={handleCopyUrl} variant="outline" size="icon" title="Copy URL">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {dashboardUrl && (
              <code className="block text-xs bg-muted p-2 rounded break-all">
                {dashboardUrl}
              </code>
            )}
          </div>

          {!supportsNativeAssist && (
            <div className="rounded-md border p-4 space-y-3">
              <div>
                <h4 className="font-medium">Live Take-Over</h4>
                <p className="text-sm text-muted-foreground">
                  Clarity is passive. For real-time co-browse + control, open a meeting
                  room and have the user share their screen.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleStartAssist} className="gap-2 flex-1">
                  <Headphones className="h-4 w-4" />
                  Start Live Take-Over
                </Button>
                {room && (
                  <Button onClick={handleCopyRoom} variant="outline" size="icon" title="Copy room URL">
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {room && (
                <code className="block text-xs bg-muted p-2 rounded break-all">{room}</code>
              )}
            </div>
          )}

          <div className="rounded-md border p-4">
            <h4 className="font-medium mb-2">Search Filter</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">User ID:</span>
                <code className="bg-muted px-2 rounded text-xs">{targetUser?.id}</code>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Email:</span>
                <code className="bg-muted px-2 rounded text-xs">{targetUser?.email}</code>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Tenant:</span>
                <code className="bg-muted px-2 rounded text-xs">{targetUser?.tenant_id}</code>
              </div>
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              <strong>Security:</strong> Only superadmins can view sessions. Sessions are
              automatically recorded per {providerLabel} configuration.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SessionReplayControl;
