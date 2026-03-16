import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Inbox, RefreshCw, UserPlus2 } from 'lucide-react';
import {
  getLeadCaptureQueueItem,
  listLeadCaptureQueue,
  promoteLeadCaptureQueueItem,
  updateLeadCaptureQueueItemStatus,
} from '@/api/communications';
import { createPageUrl } from '@/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'duplicate', label: 'Duplicates' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'promoted', label: 'Promoted' },
];

function formatDateTime(value) {
  if (!value) return 'No timestamp';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function summarizeQueueReason(reason) {
  return String(reason || 'unknown_sender')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanString(value) {
  const normalized = String(value || '').trim();
  return normalized;
}

function deriveLeadNameFromQueueItem(queueItem) {
  const senderName = cleanString(queueItem?.sender_name);
  if (senderName) {
    const parts = senderName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: 'Unknown' };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  const localPart = cleanString(queueItem?.sender_email).split('@')[0] || 'Unknown';
  const segments = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return { firstName: segments[0] || 'Unknown', lastName: 'Unknown' };
  }

  return {
    firstName: segments[0],
    lastName: segments.slice(1).join(' '),
  };
}

function buildLeadDraft(queueItem) {
  const derivedName = deriveLeadNameFromQueueItem(queueItem);
  return {
    first_name: derivedName.firstName,
    last_name: derivedName.lastName,
    email: cleanString(queueItem?.sender_email),
    phone: '',
    company: cleanString(queueItem?.metadata?.proposed_company),
    job_title: '',
    source: 'email',
    status: 'new',
    note: '',
  };
}

export default function LeadCaptureQueueView({ tenantId, refreshToken = 0 }) {
  const [statusFilter, setStatusFilter] = useState('pending_review');
  const [queueItems, setQueueItems] = useState([]);
  const [selectedQueueItemId, setSelectedQueueItemId] = useState(null);
  const [selectedQueueItem, setSelectedQueueItem] = useState(null);
  const [leadDraft, setLeadDraft] = useState(buildLeadDraft(null));
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [queueError, setQueueError] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [localRefreshNonce, setLocalRefreshNonce] = useState(0);

  const queueFilterArgs = useMemo(
    () => ({
      tenantId,
      status: statusFilter,
      limit: 50,
      offset: 0,
    }),
    [tenantId, statusFilter, localRefreshNonce, refreshToken],
  );

  useEffect(() => {
    let isCancelled = false;
    async function loadQueueItems() {
      if (!tenantId) return;
      setLoadingQueue(true);
      setQueueError(null);
      try {
        const data = await listLeadCaptureQueue(queueFilterArgs);
        if (isCancelled) return;
        const nextQueueItems = Array.isArray(data?.queue_items) ? data.queue_items : [];
        setQueueItems(nextQueueItems);
        setSelectedQueueItemId((current) => {
          if (current && nextQueueItems.some((item) => item.id === current)) {
            return current;
          }
          return nextQueueItems[0]?.id || null;
        });
      } catch (error) {
        if (!isCancelled) {
          setQueueItems([]);
          setSelectedQueueItemId(null);
          setSelectedQueueItem(null);
          setQueueError(error.message || 'Failed to load lead capture queue');
        }
      } finally {
        if (!isCancelled) {
          setLoadingQueue(false);
        }
      }
    }

    loadQueueItems();
    return () => {
      isCancelled = true;
    };
  }, [queueFilterArgs, tenantId]);

  useEffect(() => {
    let isCancelled = false;
    async function loadQueueItemDetail() {
      if (!tenantId || !selectedQueueItemId) {
        setSelectedQueueItem(null);
        setLeadDraft(buildLeadDraft(null));
        setDetailError(null);
        return;
      }

      setLoadingDetail(true);
      setDetailError(null);
      setActionError(null);
      try {
        const data = await getLeadCaptureQueueItem({
          tenantId,
          queueItemId: selectedQueueItemId,
        });
        if (isCancelled) return;
        setSelectedQueueItem(data || null);
        setLeadDraft(buildLeadDraft(data));
      } catch (error) {
        if (!isCancelled) {
          setSelectedQueueItem(null);
          setLeadDraft(buildLeadDraft(null));
          setDetailError(error.message || 'Failed to load lead capture queue item');
        }
      } finally {
        if (!isCancelled) {
          setLoadingDetail(false);
        }
      }
    }

    loadQueueItemDetail();
    return () => {
      isCancelled = true;
    };
  }, [tenantId, selectedQueueItemId, localRefreshNonce]);

  const pendingCount = queueItems.filter((item) => item.status === 'pending_review').length;

  const handleLeadDraftChange = (field, value) => {
    setLeadDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleQueueStatusUpdate = async (status) => {
    if (!tenantId || !selectedQueueItem?.id || actionSubmitting) return;
    setActionSubmitting(true);
    setActionError(null);
    try {
      await updateLeadCaptureQueueItemStatus({
        tenantId,
        queueItemId: selectedQueueItem.id,
        status,
        note: cleanString(leadDraft.note) || undefined,
      });
      toast.success(
        status === 'duplicate' ? 'Queue item marked duplicate.' : 'Queue item dismissed.',
      );
      setLocalRefreshNonce((current) => current + 1);
    } catch (error) {
      setActionError(error.message || 'Failed to update queue item');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handlePromote = async () => {
    if (!tenantId || !selectedQueueItem?.id || actionSubmitting) return;
    if (!cleanString(leadDraft.first_name) || !cleanString(leadDraft.last_name)) {
      setActionError('First name and last name are required before promotion.');
      return;
    }

    setActionSubmitting(true);
    setActionError(null);
    try {
      const result = await promoteLeadCaptureQueueItem({
        tenantId,
        queueItemId: selectedQueueItem.id,
        lead: {
          first_name: cleanString(leadDraft.first_name),
          last_name: cleanString(leadDraft.last_name),
          email: cleanString(leadDraft.email) || undefined,
          phone: cleanString(leadDraft.phone) || undefined,
          company: cleanString(leadDraft.company) || undefined,
          job_title: cleanString(leadDraft.job_title) || undefined,
          source: cleanString(leadDraft.source) || undefined,
          status: cleanString(leadDraft.status) || undefined,
          note: cleanString(leadDraft.note) || undefined,
        },
      });

      toast.success(
        result?.already_promoted ? 'Lead already existed for this queue item.' : 'Lead promoted.',
      );
      setLocalRefreshNonce((current) => current + 1);
    } catch (error) {
      setActionError(error.message || 'Failed to promote queue item');
    } finally {
      setActionSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Lead Capture Queue</CardTitle>
            <p className="mt-1 text-xs text-slate-400">Unknown inbound senders awaiting review.</p>
          </div>
          <Badge variant="secondary" className="bg-slate-800 text-slate-200">
            {statusFilter === 'pending_review' ? pendingCount : queueItems.length}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lead-capture-status-filter">Queue Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                id="lead-capture-status-filter"
                className="border-slate-700 bg-slate-950"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingQueue ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800" />
                  <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-800" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-800" />
                </div>
              ))}
            </div>
          ) : queueError ? (
            <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{queueError}</span>
              </div>
            </div>
          ) : queueItems.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-slate-200">No queue items for this view.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {queueItems.map((item) => {
                const isSelected = item.id === selectedQueueItemId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedQueueItemId(item.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {item.sender_name || item.sender_email || 'Unknown sender'}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {item.subject || '(no subject)'}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`shrink-0 ${
                          item.status === 'promoted'
                            ? 'bg-emerald-500/15 text-emerald-200'
                            : item.status === 'duplicate'
                              ? 'bg-amber-500/15 text-amber-200'
                              : item.status === 'dismissed'
                                ? 'bg-slate-700 text-slate-200'
                                : 'bg-cyan-500/15 text-cyan-200'
                        }`}
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-slate-700 text-slate-300">
                        {summarizeQueueReason(item.reason)}
                      </Badge>
                      {item.sender_domain ? (
                        <Badge variant="outline" className="border-slate-700 text-slate-300">
                          {item.sender_domain}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Received {formatDateTime(item.created_at)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Queue Review</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Inspect inbound context and promote when the sender should become a lead.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocalRefreshNonce((current) => current + 1)}
            className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Queue
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadingDetail ? (
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-slate-800" />
                  <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-800" />
                  <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-800" />
                </div>
              ))}
            </div>
          ) : detailError ? (
            <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{detailError}</span>
              </div>
            </div>
          ) : !selectedQueueItem ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center">
              <Inbox className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-200">
                Select a queue item to inspect the inbound email.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {selectedQueueItem.sender_name ||
                        selectedQueueItem.sender_email ||
                        'Unknown sender'}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      {selectedQueueItem.sender_email || 'No sender email'}
                      {selectedQueueItem.sender_domain
                        ? ` · ${selectedQueueItem.sender_domain}`
                        : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-slate-800 text-slate-200">
                    {selectedQueueItem.status}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-cyan-500/30 text-cyan-200">
                    Reason: {summarizeQueueReason(selectedQueueItem.reason)}
                  </Badge>
                  {selectedQueueItem.metadata?.promotion?.entity_id ? (
                    <Link
                      to={createPageUrl(
                        `Leads?id=${selectedQueueItem.metadata.promotion.entity_id}`,
                      )}
                      className="inline-flex"
                    >
                      <Badge
                        variant="outline"
                        className="cursor-pointer border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10"
                      >
                        Promoted lead: {selectedQueueItem.metadata.promotion.entity_id.slice(0, 8)}
                      </Badge>
                    </Link>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Source Thread
                    </p>
                    <p className="mt-3 text-sm font-medium text-slate-100">
                      {selectedQueueItem.thread?.subject ||
                        selectedQueueItem.subject ||
                        '(no subject)'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Thread ID {selectedQueueItem.thread_id || 'Unavailable'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Source Message
                    </p>
                    <p className="mt-3 text-sm font-medium text-slate-100">
                      {selectedQueueItem.message?.subject ||
                        selectedQueueItem.subject ||
                        '(no subject)'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Message ID {selectedQueueItem.message_id || 'Unavailable'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Source Message Context
                </h3>
                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                  {selectedQueueItem.message?.text_body ||
                    selectedQueueItem.message?.html_body?.replace(/<[^>]+>/g, ' ') ||
                    selectedQueueItem.message?.subject ||
                    'No stored message content available.'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Lead Overrides
                </h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lead-capture-first-name">First Name</Label>
                    <Input
                      id="lead-capture-first-name"
                      value={leadDraft.first_name}
                      onChange={(event) => handleLeadDraftChange('first_name', event.target.value)}
                      className="border-slate-700 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-capture-last-name">Last Name</Label>
                    <Input
                      id="lead-capture-last-name"
                      value={leadDraft.last_name}
                      onChange={(event) => handleLeadDraftChange('last_name', event.target.value)}
                      className="border-slate-700 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-capture-email">Email</Label>
                    <Input
                      id="lead-capture-email"
                      type="email"
                      value={leadDraft.email}
                      onChange={(event) => handleLeadDraftChange('email', event.target.value)}
                      className="border-slate-700 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-capture-phone">Phone</Label>
                    <Input
                      id="lead-capture-phone"
                      value={leadDraft.phone}
                      onChange={(event) => handleLeadDraftChange('phone', event.target.value)}
                      className="border-slate-700 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-capture-company">Company</Label>
                    <Input
                      id="lead-capture-company"
                      value={leadDraft.company}
                      onChange={(event) => handleLeadDraftChange('company', event.target.value)}
                      className="border-slate-700 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-capture-job-title">Job Title</Label>
                    <Input
                      id="lead-capture-job-title"
                      value={leadDraft.job_title}
                      onChange={(event) => handleLeadDraftChange('job_title', event.target.value)}
                      className="border-slate-700 bg-slate-950 text-slate-100"
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[160px,1fr]">
                  <div className="space-y-2">
                    <Label htmlFor="lead-capture-status">Lead Status</Label>
                    <Select
                      value={leadDraft.status}
                      onValueChange={(value) => handleLeadDraftChange('status', value)}
                    >
                      <SelectTrigger
                        id="lead-capture-status"
                        className="border-slate-700 bg-slate-950"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="working">Working</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-capture-note">Review Note</Label>
                    <Textarea
                      id="lead-capture-note"
                      value={leadDraft.note}
                      onChange={(event) => handleLeadDraftChange('note', event.target.value)}
                      placeholder="Optional review note recorded on dismiss, duplicate, or promotion."
                      className="min-h-[96px] border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {actionError ? (
                <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                    <span>{actionError}</span>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleQueueStatusUpdate('dismissed')}
                  disabled={actionSubmitting}
                  className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
                >
                  {actionSubmitting ? 'Updating...' : 'Dismiss'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleQueueStatusUpdate('duplicate')}
                  disabled={actionSubmitting}
                  className="border-amber-500/30 bg-transparent text-amber-200 hover:bg-amber-500/10"
                >
                  {actionSubmitting ? 'Updating...' : 'Mark Duplicate'}
                </Button>
                <Button
                  type="button"
                  onClick={handlePromote}
                  disabled={actionSubmitting}
                  className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                >
                  <UserPlus2 className="mr-2 h-4 w-4" />
                  {actionSubmitting ? 'Promoting...' : 'Promote to Lead'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
