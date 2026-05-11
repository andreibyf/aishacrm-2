// @ts-check
/**
 * DocumentSignaturesSection (4VD-43 day 4b).
 *
 * Shared section rendering signing_sessions for a single CRM entity.
 * Used by Contact / Lead / Account / Opportunity detail panels so the
 * status-badge palette + layout are consistent everywhere.
 *
 * Day 4b additions over day 2:
 *   - Archived rows (`archived_at != null`) render with strike-through
 *     + a muted subtitle showing the archive reason.
 *   - Per-row Delete (Trash2) button, visible only to admin/superadmin,
 *     opens a modal that requires a non-empty reason. POSTs to
 *     /api/submissions/:id/archive then calls onArchived() so the
 *     parent panel re-fetches the list.
 */

import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { FileText, Trash2, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@/components/shared/useUser.js';
import { getBackendUrl } from '@/api/backendUrl';
import { getAuthorizationHeader } from '@/api/functions';

const STATUS_BADGE_CLASS = {
  pending: 'bg-blue-100 text-blue-800 border border-blue-200',
  viewed: 'bg-amber-100 text-amber-800 border border-amber-200',
  signed: 'bg-green-100 text-green-800 border border-green-200',
  completed: 'bg-green-100 text-green-800 border border-green-200',
  declined: 'bg-red-100 text-red-800 border border-red-200',
  expired: 'bg-red-100 text-red-800 border border-red-200',
};

function getStatusClass(status) {
  return (
    STATUS_BADGE_CLASS[String(status || '').toLowerCase()] ||
    'bg-slate-100 text-slate-800 border border-slate-200'
  );
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function userCanArchive(user) {
  if (!user) return false;
  if (user.is_superadmin === true) return true;
  const role = String(user.role || '')
    .trim()
    .toLowerCase();
  return role === 'superadmin' || role === 'super_admin' || role === 'admin';
}

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const auth = await getAuthorizationHeader();
  if (auth) headers['Authorization'] = auth;
  if (typeof localStorage !== 'undefined') {
    const t = localStorage.getItem('selected_tenant_id') || localStorage.getItem('tenant_id') || '';
    if (t) headers['x-tenant-id'] = t;
  }
  return headers;
}

async function postArchive(id, reason) {
  const url = `${getBackendUrl()}/api/submissions/${encodeURIComponent(id)}/archive`;
  const headers = await authHeaders();
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ reason }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Archive failed (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * Fetch a short-lived (5 min) signed URL for the stamped + Certificate-of-
 * Completion PDF, then open it in a new tab. Backend route is
 * GET /api/submissions/:id/signed-pdf-url, returning { data: { url, expires_at } }.
 *
 * @param {string} id   signing_sessions.id
 * @returns {Promise<string>} the signed URL (also opened in a new tab)
 */
async function fetchSignedPdfUrl(id) {
  const url = `${getBackendUrl()}/api/submissions/${encodeURIComponent(id)}/signed-pdf-url`;
  const headers = await authHeaders();
  const resp = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(
      json?.message || json?.error || `Could not load signed PDF (${resp.status})`,
    );
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  const signedUrl = json?.data?.url;
  if (!signedUrl) {
    throw new Error('Backend returned no signed URL.');
  }
  return signedUrl;
}

/**
 * @param {Object} props
 * @param {Array} props.sessions
 * @param {boolean} props.loading
 * @param {string|null} [props.error]
 * @param {() => void} [props.onArchived] — caller refresh hook (fires
 *   after a successful archive so the parent re-fetches the list)
 * @param {() => void} [props.onRefresh] — manual refresh hook (fires
 *   when the user clicks the refresh button in the section header)
 */
export default function DocumentSignaturesSection({
  sessions,
  loading,
  error = null,
  onArchived,
  onRefresh,
}) {
  const { user } = useUser();
  const canArchive = userCanArchive(user);
  const [pendingArchive, setPendingArchive] = useState(null); // { id, label }
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);
  // Per-row "View signed PDF" loading state — keyed by signing_sessions.id
  // so multiple completed rows don't share a spinner.
  const [viewingId, setViewingId] = useState(null);

  const handleViewSignedPdf = useCallback(async (id) => {
    setViewingId(id);
    // Open the tab BEFORE the await so this stays a direct response to
    // the user's click — Safari/Chrome pop-up blockers will gate a
    // post-await window.open(). We navigate the opened tab once the
    // signed URL is in hand.
    const popup = typeof window !== 'undefined' ? window.open('', '_blank', 'noopener') : null;
    try {
      const url = await fetchSignedPdfUrl(id);
      if (popup && !popup.closed) {
        popup.location = url;
      } else if (typeof window !== 'undefined') {
        // Fallback if the browser stripped/blocked the pre-opened tab.
        window.open(url, '_blank', 'noopener');
      }
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      const msg = err.body?.message
        ? `${err.message}: ${err.body.message}`.slice(0, 400)
        : err.message;
      toast.error(msg);
    } finally {
      setViewingId(null);
    }
  }, []);

  const handleConfirmArchive = useCallback(async () => {
    if (!pendingArchive || archiveReason.trim().length === 0) return;
    setArchiving(true);
    try {
      await postArchive(pendingArchive.id, archiveReason.trim());
      toast.success(`Archived "${pendingArchive.label}"`);
      setPendingArchive(null);
      setArchiveReason('');
      onArchived?.();
    } catch (err) {
      const msg = err.body?.message
        ? `${err.message}: ${err.body.message}`.slice(0, 400)
        : err.message;
      toast.error(msg);
    } finally {
      setArchiving(false);
    }
  }, [pendingArchive, archiveReason, onArchived]);

  if (error) {
    return (
      <div className="rounded-md border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
        {/* Section header: status count + manual refresh button.
            The hook still polls every 5s on the parent — the refresh
            button is for impatient users who just submitted and want
            the panel to flip from 'viewed' → 'completed' immediately
            instead of waiting for the next poll cycle. */}
        {onRefresh ? (
          <div className="flex items-center justify-between mb-2 -mt-0.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {sessions.length === 0
                ? 'No documents'
                : `${sessions.length} document${sessions.length === 1 ? '' : 's'}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-7 px-2 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              title="Refresh"
              aria-label="Refresh document signatures list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        ) : null}
        {loading && sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading documents…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No documents sent yet.</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const status = String(s.status || 'pending').toLowerCase();
              const isArchived = !!s.archived_at;
              const label = s.template_name || `Document ${(s.template_id || '').slice(0, 8)}`;
              const recipient = s.recipient_name
                ? `${s.recipient_name} <${s.recipient_email}>`
                : s.recipient_email;
              const sentAt = s.created_at;
              const completedAt = s.completed_at || s.signed_at;
              // Only completed (finalized) submissions have a stamped PDF
              // in storage. Hide the View link for everything else — for
              // signed-but-not-finalized rows the backend would 404 on the
              // signed-pdf-url endpoint anyway.
              const hasSignedPdf = !!s.signed_pdf_storage_path && !isArchived;
              const isViewing = viewingId === s.id;
              return (
                <li
                  key={s.id}
                  className={
                    'flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between' +
                    (isArchived ? ' opacity-70' : '')
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span
                        className={
                          'text-sm font-medium truncate ' +
                          (isArchived
                            ? 'line-through text-slate-500 dark:text-slate-400'
                            : 'text-slate-800 dark:text-slate-200')
                        }
                      >
                        {label}
                      </span>
                    </div>
                    {recipient && (
                      <p
                        className={
                          'text-xs ml-6 truncate ' +
                          (isArchived
                            ? 'line-through text-slate-400'
                            : 'text-slate-500 dark:text-slate-400')
                        }
                      >
                        {recipient}
                      </p>
                    )}
                    {sentAt && (
                      <p
                        className={
                          'text-xs ml-6 ' +
                          (isArchived
                            ? 'line-through text-slate-400'
                            : 'text-slate-500 dark:text-slate-400')
                        }
                      >
                        Sent {formatDate(sentAt)}
                        {completedAt ? ` · Completed ${formatDate(completedAt)}` : ''}
                      </p>
                    )}
                    {isArchived ? (
                      <p className="text-xs ml-6 mt-1 italic text-amber-700 dark:text-amber-400">
                        Archived {formatDate(s.archived_at)} —{' '}
                        {s.archive_reason || '(no reason recorded)'}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 ml-6 sm:ml-0 mt-1 sm:mt-0">
                    {isArchived ? (
                      <Badge variant="outline">archived</Badge>
                    ) : (
                      <Badge className={getStatusClass(status)}>{status}</Badge>
                    )}
                    {hasSignedPdf ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="View signed PDF"
                        disabled={isViewing}
                        onClick={() => handleViewSignedPdf(s.id)}
                        className="h-7 px-2 text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                      >
                        {isViewing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ExternalLink className="w-4 h-4" />
                        )}
                      </Button>
                    ) : null}
                    {canArchive && !isArchived ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete"
                        onClick={() => setPendingArchive({ id: s.id, label })}
                        className="text-destructive hover:text-destructive h-7 px-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog
        open={!!pendingArchive}
        onOpenChange={(o) => {
          if (!o) {
            setPendingArchive(null);
            setArchiveReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this signing session?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingArchive?.label
                ? `"${pendingArchive.label}" will be soft-deleted and rendered with a line through it. The audit trail (legal record) is preserved.`
                : 'This signing session will be soft-deleted.'}{' '}
              A reason is required and visible to anyone reviewing the timeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="archive-reason">Reason (required)</Label>
            <Textarea
              id="archive-reason"
              rows={3}
              maxLength={1000}
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="e.g. wrong template attached, recipient asked to redo, etc."
            />
            <p className="text-xs text-muted-foreground">{archiveReason.length} / 1000</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmArchive}
              disabled={archiving || archiveReason.trim().length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
