import React, { useState } from 'react';
import { ExternalLink, Eye, Copy, Check, Info } from 'lucide-react';
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

/**
 * OpenReplay Control Component
 * 
 * Allows superadmins to access user sessions for support.
 * Displays session URL and instructions for co-browsing.
 * 
 * @param {Object} props
 * @param {Object} props.targetUser - User whose session to observe
 */
export function OpenReplayControl({ targetUser }) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // OpenReplay dashboard URL (configured via environment)
  const dashboardUrl = import.meta.env.VITE_OPENREPLAY_DASHBOARD_URL || 'https://replay.aishacrm.com';

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(dashboardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenDashboard = () => {
    window.open(dashboardUrl, '_blank', 'noopener,noreferrer');
  };

  if (!import.meta.env.VITE_OPENREPLAY_PROJECT_KEY) {
    return null; // Don't render if OpenReplay not configured
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          title="Start live assist session (OpenReplay)"
        >
          <Eye className="h-4 w-4" />
          Start Assist
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Start Assist Session - OpenReplay</DialogTitle>
          <DialogDescription>
            Start live support for {targetUser?.name || targetUser?.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Instructions */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>How to start live assist:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                <li>Open the OpenReplay dashboard</li>
                <li>Search for user: <code className="bg-muted px-1 rounded">{targetUser?.email}</code></li>
                <li>Select their live or most recent session</li>
                <li>Click Assist and request control for real-time guidance</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Dashboard Access */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">OpenReplay Dashboard</h4>
                <p className="text-sm text-muted-foreground">
                  View sessions, replay recordings, and use Assist mode
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleOpenDashboard}
                className="gap-2 flex-1"
              >
                <ExternalLink className="h-4 w-4" />
                Open Dashboard
              </Button>

              <Button
                onClick={handleCopyUrl}
                variant="outline"
                size="icon"
                title="Copy dashboard URL"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded break-all">
              {dashboardUrl}
            </div>
          </div>

          {/* User Filter Info */}
          <div className="border rounded-lg p-4 space-y-2 bg-muted/50">
            <h4 className="font-medium text-sm">Search Filter</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">User ID:</span>
                <code className="bg-background px-2 py-0.5 rounded">{targetUser?.id}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <code className="bg-background px-2 py-0.5 rounded">{targetUser?.email}</code>
              </div>
              {targetUser?.tenant_id && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tenant:</span>
                  <code className="bg-background px-2 py-0.5 rounded text-xs">{targetUser.tenant_id}</code>
                </div>
              )}
            </div>
          </div>

          {/* Features */}
          <div className="text-sm space-y-2">
            <h4 className="font-medium">Available Features:</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>✅ Session Replay - Watch full user journey with context</li>
              <li>✅ Assist Mode - Live co-browsing with remote control</li>
              <li>✅ DevTools - Network activity, console logs, errors</li>
              <li>✅ Performance Metrics - Page speed, CPU, memory usage</li>
              <li>✅ Privacy Controls - Sensitive data masking</li>
            </ul>
          </div>

          {/* Security Note */}
          <Alert>
            <AlertDescription className="text-xs">
              <strong>🔒 Security:</strong> Only superadmins can view sessions. Sessions are
              automatically recorded per OpenReplay configuration.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}
