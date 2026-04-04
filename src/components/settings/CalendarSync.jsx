/**
 * CalendarSync.jsx
 *
 * User/Tenant settings panel for Cal.com calendar sync configuration.
 * Location: Settings → Calendar Sync
 *
 * Features:
 *   - List connected external calendars (fetched from Cal.com API via backend proxy)
 *   - "Connect Calendar" button → OAuth redirect through Cal.com
 *   - Remove / disconnect calendar
 *   - Primary calendar selector
 *   - Two-way sync status indicator
 *   - Business hours / availability preferences (tenant-level)
 *
 * OAuth tokens live in Cal.com DB — AiSHA just stores the Cal.com integration
 * credentials (api_key, cal_link) in tenant_integrations and proxies calls.
 */

import { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CalendarCheck,
  CalendarX,
  RefreshCw,
  Loader2,
  ExternalLink,
  Trash2,
  Star,
  CheckCircle2,
  AlertCircle,
  Globe,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/utils/dateFormatting';

async function apiFetch(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`;
  return fetch(url, {
    ...options,
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

const CALENDAR_TYPE_LABELS = {
  google_calendar: 'Google Calendar',
  office365_calendar: 'Microsoft Outlook',
  caldav_calendar: 'CalDAV',
  apple_calendar: 'Apple Calendar',
  other: 'Other',
};

const CALENDAR_TYPE_COLORS = {
  google_calendar: 'bg-red-500/10 text-red-400 border-red-500/30',
  office365_calendar: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  caldav_calendar: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  apple_calendar: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

function SyncStatusBadge({ status }) {
  if (status === 'syncing') {
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1">
        <RefreshCw className="w-3 h-3 animate-spin" />
        Syncing
      </Badge>
    );
  }
  if (status === 'connected') {
    return (
      <Badge className="bg-green-500/10 text-green-400 border-green-500/30 gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Connected
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/10 text-red-400 border-red-500/30 gap-1">
      <AlertCircle className="w-3 h-3" />
      Error
    </Badge>
  );
}

export default function CalendarSync({ tenantId }) {
  const [calendars, setCalendars] = useState([]);
  const [primaryCalendarId, setPrimaryCalendarId] = useState(null);
  const [calcomIntegration, setCalcomIntegration] = useState(null);
  const [syncInfo, setSyncInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  const getTenantIntegrationRecord = (payload) => {
    if (Array.isArray(payload?.data?.tenantintegrations))
      return payload.data.tenantintegrations[0] || null;
    if (Array.isArray(payload?.data)) return payload.data[0] || null;
    if (Array.isArray(payload)) return payload[0] || null;
    return null;
  };

  const fetchCalendars = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // Check if tenant has Cal.com configured
      const res = await apiFetch(
        `/api/tenantintegrations?tenant_id=${tenantId}&integration_type=calcom`,
      );
      if (res.status === 304) return;
      const json = await res.json().catch(() => ({}));
      const integration = getTenantIntegrationRecord(json);
      setCalcomIntegration(integration);

      if (!integration) {
        setSyncInfo(null);
        setLoading(false);
        return;
      }

      const statusRes = await apiFetch(`/api/calcom-sync/status?tenant_id=${tenantId}`);
      const statusJson = await statusRes.json().catch(() => ({}));
      if (statusRes.ok && statusJson.status === 'success') {
        setSyncInfo(statusJson.data || null);
      } else {
        setSyncInfo(null);
      }

      // Fetch connected calendars via Cal.com API (proxied through backend)
      // Note: Cal.com proxy routes (/api/session-packages/calcom/*) are not yet
      // implemented — show placeholder until the backend endpoints are added.
      setCalendars([]);
      setPrimaryCalendarId(null);
    } catch {
      toast.error('Failed to load calendar connections');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchCalendars();
  }, [fetchCalendars]);

  async function handleConnectOAuth(provider) {
    if (!calcomIntegration) {
      toast.error(
        'Cal.com integration not configured. Add your Cal.com API key in Tenant Integrations first.',
      );
      return;
    }
    const base = calcomIntegration.config?.base_url || 'https://app.cal.com';
    // Cal.com OAuth flow — redirect user to Cal.com's calendar connection page
    const oauthUrl = `${base}/apps/${provider}?redirect_url=${encodeURIComponent(window.location.href)}`;
    window.open(oauthUrl, '_blank', 'noopener,noreferrer');
    toast.info('Complete the calendar connection in the Cal.com window, then refresh this page.');
  }

  async function handleSetPrimary(calendarId) {
    try {
      const res = await apiFetch(
        `/api/session-packages/calcom/calendars/primary?tenant_id=${tenantId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ calendar_id: calendarId }),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || `Server returned ${res.status}`);
      }
      setPrimaryCalendarId(calendarId);
      toast.success('Primary calendar updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update primary calendar');
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    try {
      const res = await apiFetch(
        `/api/session-packages/calcom/calendars/${removeTarget.id}?tenant_id=${tenantId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Delete failed');
      setCalendars((prev) => prev.filter((c) => c.id !== removeTarget.id));
      if (primaryCalendarId === removeTarget.id) setPrimaryCalendarId(null);
      toast.success('Calendar disconnected');
    } catch {
      toast.error('Failed to disconnect calendar');
    } finally {
      setRemoveTarget(null);
    }
  }

  async function handleRefreshSync() {
    setSyncing(true);
    try {
      // Trigger full bidirectional sync:
      //   1. Pull Cal.com bookings → CRM (reconcile missed webhooks)
      //   2. Push unsynced CRM timed activities → Cal.com (create blocker bookings)
      const res = await apiFetch(`/api/calcom-sync/trigger?tenant_id=${tenantId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || `Server returned ${res.status}`);
      }
      const json = await res.json();
      const { bookings_pulled = 0, activities_pushed = 0, errors = [] } = json.data || {};
      if (errors.length > 0) {
        toast.warning(
          `Sync completed with ${errors.length} error(s). Pulled ${bookings_pulled}, pushed ${activities_pushed}.`,
        );
      } else {
        toast.success(
          `Sync complete — ${bookings_pulled} booking(s) pulled, ${activities_pushed} activit${activities_pushed === 1 ? 'y' : 'ies'} pushed to Cal.com.`,
        );
      }
      await fetchCalendars();
    } catch (err) {
      toast.error(err.message || 'Failed to trigger sync');
    } finally {
      setSyncing(false);
    }
  }

  async function handleImportPersonalCalendar() {
    setImporting(true);
    try {
      const res = await apiFetch(`/api/calcom-sync/import-personal-calendar?tenant_id=${tenantId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || `Server returned ${res.status}`);
      }

      const totalImported = json.data?.total_imported || 0;
      const totalErrors = json.data?.total_errors || 0;
      if (totalErrors > 0) {
        toast.warning(
          `Calendar import completed with ${totalErrors} error(s). Imported ${totalImported} event(s).`,
        );
      } else {
        toast.success(`Imported ${totalImported} event(s) from connected personal calendars.`);
      }
      await fetchCalendars();
    } catch (err) {
      toast.error(err.message || 'Failed to import personal calendar events');
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!calcomIntegration) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CalendarX className="w-10 h-10 text-yellow-400" />
            <p className="font-medium">Booking Integration Not Configured</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Configure your booking integration in <strong>Settings → Tenant Integrations</strong>{' '}
              before connecting calendars.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Connected Calendars</h3>
          <p className="text-sm text-muted-foreground">
            Connected calendars. Busy times are automatically blocked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportPersonalCalendar}
            disabled={importing || syncing}
          >
            {importing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Import Personal Calendar
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefreshSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Now
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Sync Health</CardTitle>
          <CardDescription>
            Current Cal.com connectivity and the last known bidirectional sync state for this
            tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <SyncStatusBadge
              status={
                syncInfo?.sync_status === 'pending'
                  ? 'syncing'
                  : syncInfo?.sync_status === 'connected'
                    ? 'connected'
                    : 'error'
              }
            />
            {syncInfo?.bidirectional_sync_enabled ? (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                Bidirectional sync enabled
              </Badge>
            ) : (
              <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                Bidirectional sync incomplete
              </Badge>
            )}
            {syncInfo?.calcom_db_available === false && (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/30">
                Cal.com DB unavailable
              </Badge>
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-2 text-muted-foreground">
            <div>
              Booking link:{' '}
              <span className="text-foreground">
                {syncInfo?.cal_link || calcomIntegration?.config?.cal_link || 'Not set'}
              </span>
            </div>
            <div>
              Event type ID:{' '}
              <span className="text-foreground">{syncInfo?.event_type_id || 'Not set'}</span>
            </div>
            <div>
              Scheduler user ID:{' '}
              <span className="text-foreground">{syncInfo?.calcom_user_id || 'Not set'}</span>
            </div>
            <div>
              Last sync:{' '}
              <span className="text-foreground">
                {syncInfo?.last_sync ? formatDateTime(syncInfo.last_sync) : 'Never'}
              </span>
            </div>
          </div>

          {syncInfo?.error_message && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-red-300">
              {syncInfo.error_message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connected calendar list */}
      {calendars.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CalendarCheck className="w-10 h-10 text-muted-foreground" />
              <p className="font-medium text-muted-foreground">No calendars connected yet</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Connect an external calendar to automatically block your busy times and enable
                two-way sync.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {calendars.map((cal) => (
            <Card key={cal.id} className="border-border/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{cal.name || cal.email}</span>
                        {primaryCalendarId === cal.id && (
                          <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1 text-xs">
                            <Star className="w-3 h-3" />
                            Primary
                          </Badge>
                        )}
                        <Badge
                          className={`text-xs ${CALENDAR_TYPE_COLORS[cal.type] || 'bg-muted'}`}
                        >
                          {CALENDAR_TYPE_LABELS[cal.type] || cal.type}
                        </Badge>
                      </div>
                      {cal.email && cal.email !== cal.name && (
                        <p className="text-xs text-muted-foreground mt-0.5">{cal.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SyncStatusBadge status={cal.sync_status || 'connected'} />
                    {primaryCalendarId !== cal.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetPrimary(cal.id)}
                        title="Set as primary calendar"
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveTarget(cal)}
                      title="Disconnect calendar"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Connect buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Connect a Calendar</CardTitle>
          <CardDescription>
            Connecting a calendar enables two-way sync. Bookings create calendar events and your
            existing events block your availability.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleConnectOAuth('google-calendar')}
              className="gap-2"
            >
              <CalendarCheck className="w-4 h-4 text-red-400" />
              Google Calendar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleConnectOAuth('office365-calendar')}
              className="gap-2"
            >
              <CalendarCheck className="w-4 h-4 text-blue-400" />
              Microsoft Outlook
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleConnectOAuth('caldav-calendar')}
              className="gap-2"
            >
              <CalendarCheck className="w-4 h-4 text-purple-400" />
              CalDAV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleConnectOAuth('apple-calendar')}
              className="gap-2"
            >
              <CalendarCheck className="w-4 h-4 text-gray-400" />
              Apple Calendar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            OAuth authorization is handled by the scheduling service. Your calendar credentials are
            not stored in AiSHA CRM.
          </p>
        </CardContent>
      </Card>

      {/* Cal.com deep link */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ExternalLink className="w-4 h-4" />
        <span>Manage advanced availability settings in your</span>
        <a
          href={calcomIntegration?.config?.base_url || 'https://app.cal.com'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          Scheduling Dashboard
        </a>
      </div>

      {/* Confirm disconnect */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{removeTarget?.name || removeTarget?.email}</strong> from
              your availability calendar. Existing bookings will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-red-600 hover:bg-red-700">
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
