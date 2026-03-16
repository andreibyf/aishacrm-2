import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  RefreshCw,
  Inbox,
  Search,
  Link2,
  AlertCircle,
  RotateCcw,
  CalendarCheck2,
  Truck,
  Send,
  SquarePen,
  Archive,
  Trash2,
} from 'lucide-react';
import { useTenant } from '@/components/shared/tenantContext';
import { useUser } from '@/components/shared/useUser.js';
import { Activity } from '@/api/entities';
import {
  listCommunicationThreads,
  getCommunicationThreadMessages,
  purgeCommunicationThread,
  replayCommunicationThread,
  updateCommunicationThreadStatus,
} from '@/api/communications';
import LeadCaptureQueueView from '@/components/communications/LeadCaptureQueueView';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const VIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];

const DELIVERY_OPTIONS = [
  { value: 'all', label: 'All delivery states' },
  { value: 'queued', label: 'Queued' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'opened', label: 'Opened' },
  { value: 'clicked', label: 'Clicked' },
];

const ENTITY_OPTIONS = [
  { value: 'all', label: 'All entities' },
  { value: 'lead', label: 'Lead' },
  { value: 'contact', label: 'Contact' },
  { value: 'account', label: 'Account' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'activity', label: 'Activity' },
];

const ENTITY_PAGE = {
  lead: 'Leads',
  contact: 'Contacts',
  account: 'Accounts',
  opportunity: 'Opportunities',
  activity: 'Activities',
};

const COMPOSE_ENTITY_OPTIONS = [
  { value: 'none', label: 'No linked entity' },
  { value: 'lead', label: 'Lead' },
  { value: 'contact', label: 'Contact' },
  { value: 'account', label: 'Account' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'activity', label: 'Activity' },
];

const DEFAULT_MAILBOX_ID = 'owner-primary';

function formatDateTime(value) {
  if (!value) return 'No timestamp';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function summarizeMessage(message) {
  return (
    message?.text_body ||
    message?.html_body?.replace(/<[^>]+>/g, ' ') ||
    message?.subject ||
    'No preview available'
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function formatMessageBody(message) {
  const textBody =
    typeof message?.text_body === 'string' ? message.text_body.replace(/\r\n/g, '\n').trim() : '';
  if (textBody) {
    return textBody;
  }

  const htmlFallback =
    typeof message?.html_body === 'string'
      ? message.html_body
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';

  return htmlFallback || message?.subject || 'No message body available.';
}

function stateValue(state, key) {
  return state && typeof state === 'object' ? state[key] || null : null;
}

function formatEventLabel(type) {
  return String(type || 'event')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatReplySubject(subject) {
  const normalized = String(subject || '').trim();
  if (!normalized) return 'Re:';
  return /^re:\s*/i.test(normalized) ? normalized : `Re: ${normalized}`;
}

function extractReplySourceBody(message) {
  const raw = String(message?.text_body || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!raw) return '';

  const lines = raw.split('\n');
  const cleaned = [];

  for (const line of lines) {
    if (/^On .+ wrote:$/i.test(line.trim())) {
      break;
    }
    if (/^>/.test(line.trim())) {
      break;
    }
    cleaned.push(line);
  }

  return cleaned.join('\n').trim() || raw;
}

function buildReplyQuote(message) {
  if (!message) return '';

  const sender =
    message?.sender_name ||
    message?.sender_email ||
    (message?.direction === 'outbound' ? 'You' : 'Unknown sender');
  const timestamp = formatDateTime(message?.received_at);
  const sourceBody = extractReplySourceBody(message);
  const quotedBody = sourceBody
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  return [`On ${timestamp}, ${sender} wrote:`, quotedBody].join('\n').trim();
}

function renderActivityLabel(activity) {
  const subject = String(activity?.subject || '').trim();
  const status = String(activity?.status || '').trim();
  if (subject && status) return `${subject} (${status})`;
  return subject || status || 'Linked activity';
}

export default function CommunicationsPage() {
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  const [workspaceView, setWorkspaceView] = useState('inbox');
  const [view, setView] = useState('all');
  const [deliveryState, setDeliveryState] = useState('all');
  const [mailboxId, setMailboxId] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [entityId, setEntityId] = useState('');
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [mailboxOptions, setMailboxOptions] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [threadsError, setThreadsError] = useState(null);
  const [messagesError, setMessagesError] = useState(null);
  const [replaySubmitting, setReplaySubmitting] = useState(false);
  const [replayError, setReplayError] = useState(null);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState(null);
  const [purgeSubmitting, setPurgeSubmitting] = useState(false);
  const [purgeError, setPurgeError] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeError, setComposeError] = useState(null);
  const [composeForm, setComposeForm] = useState({
    mode: 'compose',
    mailboxId: DEFAULT_MAILBOX_ID,
    to: '',
    subject: '',
    body: '',
    relatedTo: 'none',
    relatedId: '',
    threadId: '',
    inReplyTo: '',
    references: [],
  });

  const effectiveTenantId = selectedTenantId || user?.tenant_id || null;

  const threadFilterArgs = useMemo(
    () => ({
      tenantId: effectiveTenantId,
      mailboxId: mailboxId === 'all' ? undefined : mailboxId,
      entityType: entityType === 'all' ? undefined : entityType,
      entityId: entityType === 'all' ? undefined : entityId.trim() || undefined,
      deliveryState: deliveryState === 'all' ? undefined : deliveryState,
      view,
      limit: 50,
      offset: 0,
    }),
    [effectiveTenantId, mailboxId, entityType, entityId, deliveryState, view, refreshNonce],
  );

  useEffect(() => {
    let isCancelled = false;
    async function loadThreads() {
      if (!effectiveTenantId) return;
      setLoadingThreads(true);
      setThreadsError(null);
      try {
        const data = await listCommunicationThreads(threadFilterArgs);
        if (isCancelled) return;
        const nextThreads = Array.isArray(data?.threads) ? data.threads : [];
        setThreads(nextThreads);
        const nextMailboxOptions = [
          ...new Set(nextThreads.map((thread) => thread.mailbox_id).filter(Boolean)),
        ];
        setMailboxOptions(nextMailboxOptions);
        setSelectedThreadId((current) => {
          if (current && nextThreads.some((thread) => thread.id === current)) {
            return current;
          }
          return nextThreads[0]?.id || null;
        });
      } catch (error) {
        if (!isCancelled) {
          setThreads([]);
          setSelectedThreadId(null);
          setThreadsError(error.message || 'Failed to load communication threads');
        }
      } finally {
        if (!isCancelled) {
          setLoadingThreads(false);
        }
      }
    }
    loadThreads();
    return () => {
      isCancelled = true;
    };
  }, [threadFilterArgs, effectiveTenantId]);

  useEffect(() => {
    let isCancelled = false;
    async function loadMessages() {
      if (!effectiveTenantId || !selectedThreadId) {
        setSelectedThread(null);
        setMessages([]);
        setMessagesError(null);
        return;
      }
      setLoadingMessages(true);
      setMessagesError(null);
      try {
        const data = await getCommunicationThreadMessages({
          tenantId: effectiveTenantId,
          threadId: selectedThreadId,
        });
        if (isCancelled) return;
        setSelectedThread(data?.thread || null);
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
      } catch (error) {
        if (!isCancelled) {
          setSelectedThread(null);
          setMessages([]);
          setMessagesError(error.message || 'Failed to load communication thread');
        }
      } finally {
        if (!isCancelled) {
          setLoadingMessages(false);
        }
      }
    }
    loadMessages();
    return () => {
      isCancelled = true;
    };
  }, [effectiveTenantId, selectedThreadId, refreshNonce]);

  useEffect(() => {
    setComposeForm((current) => ({
      ...current,
      mailboxId:
        current.mailboxId ||
        (mailboxId !== 'all' ? mailboxId : '') ||
        selectedThread?.mailbox_id ||
        DEFAULT_MAILBOX_ID,
      relatedTo:
        current.relatedTo !== 'none'
          ? current.relatedTo
          : entityType !== 'all'
            ? entityType
            : 'none',
      relatedId: current.relatedId || (entityType !== 'all' ? entityId.trim() : '') || '',
    }));
  }, [entityId, entityType, mailboxId, selectedThread]);

  const handleRefresh = () => {
    setThreadsError(null);
    setMessagesError(null);
    setReplayError(null);
    setStatusError(null);
    setPurgeError(null);
    setRefreshNonce((current) => current + 1);
  };

  const handleComposeChange = (field, value) => {
    setComposeForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleReplyToThread = () => {
    if (!selectedThread) return;

    const latestInbound = [...messages]
      .reverse()
      .find((message) => message?.direction === 'inbound' && message?.sender_email);
    const latestMessage = [...messages].reverse().find(Boolean);
    const referenceIds = messages.map((message) => message?.internet_message_id).filter(Boolean);
    const quotedBody = buildReplyQuote(latestMessage);

    setComposerOpen(true);
    setComposeError(null);
    setComposeForm({
      mode: 'reply',
      mailboxId: selectedThread.mailbox_id || DEFAULT_MAILBOX_ID,
      to: latestInbound?.sender_email || '',
      subject: formatReplySubject(selectedThread.subject),
      body: quotedBody ? `\n\n${quotedBody}` : '',
      relatedTo:
        selectedThread.linked_entities?.[0]?.entity_type ||
        (entityType !== 'all' ? entityType : 'none'),
      relatedId:
        selectedThread.linked_entities?.[0]?.entity_id ||
        (entityType !== 'all' ? entityId.trim() : ''),
      threadId: selectedThread.id,
      inReplyTo: latestMessage?.internet_message_id || '',
      references: referenceIds,
    });
  };

  const handleQueueOutboundEmail = async () => {
    const mailboxIdValue = composeForm.mailboxId.trim();
    const toValue = composeForm.to.trim();
    const subjectValue = composeForm.subject.trim();
    const bodyValue = composeForm.body.trim();
    const relatedToValue = composeForm.relatedTo === 'none' ? null : composeForm.relatedTo;
    const relatedIdValue = composeForm.relatedId.trim() || null;

    if (!effectiveTenantId) {
      setComposeError('Select a tenant before sending outbound email.');
      return;
    }
    if (!mailboxIdValue) {
      setComposeError('Mailbox ID is required.');
      return;
    }
    if (!toValue) {
      setComposeError('Recipient email is required.');
      return;
    }
    if (!subjectValue) {
      setComposeError('Subject is required.');
      return;
    }
    if (!bodyValue) {
      setComposeError('Body is required.');
      return;
    }
    if (relatedToValue && !relatedIdValue) {
      setComposeError('Linked entity ID is required when a linked entity type is selected.');
      return;
    }

    setComposeSubmitting(true);
    setComposeError(null);
    try {
      await Activity.create({
        tenant_id: effectiveTenantId,
        type: 'email',
        status: 'queued',
        subject: subjectValue,
        body: bodyValue,
        related_to: relatedToValue,
        related_id: relatedIdValue,
        related_email: toValue,
        metadata: {
          email: {
            to: toValue,
            subject: subjectValue,
            body: bodyValue,
            ...(composeForm.inReplyTo
              ? {
                  in_reply_to: composeForm.inReplyTo,
                  references: composeForm.references,
                }
              : {}),
          },
          communications: {
            mailbox_id: mailboxIdValue,
            ...(composeForm.threadId ? { thread_id: composeForm.threadId } : {}),
          },
        },
      });

      toast.success('Outbound email queued for delivery.');
      setComposerOpen(false);
      setComposeForm({
        mode: 'compose',
        mailboxId: mailboxIdValue,
        to: '',
        subject: '',
        body: '',
        relatedTo: entityType !== 'all' ? entityType : 'none',
        relatedId: entityType !== 'all' ? entityId.trim() : '',
        threadId: '',
        inReplyTo: '',
        references: [],
      });
      handleRefresh();
    } catch (error) {
      setComposeError(error.message || 'Failed to queue outbound email');
    } finally {
      setComposeSubmitting(false);
    }
  };

  const handleReplayThread = async () => {
    if (!effectiveTenantId || !selectedThread?.id || replaySubmitting) return;
    setReplaySubmitting(true);
    setReplayError(null);
    try {
      await replayCommunicationThread({
        tenantId: effectiveTenantId,
        threadId: selectedThread.id,
        mailboxId: selectedThread.mailbox_id,
      });
      setRefreshNonce((current) => current + 1);
    } catch (error) {
      setReplayError(error.message || 'Failed to request thread replay');
    } finally {
      setReplaySubmitting(false);
    }
  };

  const handleThreadStatusUpdate = async (nextStatus) => {
    if (!effectiveTenantId || !selectedThread?.id || statusSubmitting) return;
    setStatusSubmitting(true);
    setStatusError(null);
    try {
      await updateCommunicationThreadStatus({
        tenantId: effectiveTenantId,
        threadId: selectedThread.id,
        status: nextStatus,
      });
      setRefreshNonce((current) => current + 1);
    } catch (error) {
      setStatusError(error.message || 'Failed to update communication thread status');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleThreadPurge = async () => {
    if (!effectiveTenantId || !selectedThread?.id || purgeSubmitting) return;
    const confirmed = window.confirm(
      'Permanently purge this communication thread and its stored messages from AiSHA CRM?',
    );
    if (!confirmed) return;

    setPurgeSubmitting(true);
    setPurgeError(null);
    try {
      await purgeCommunicationThread({
        tenantId: effectiveTenantId,
        threadId: selectedThread.id,
      });
      setSelectedThreadId(null);
      setSelectedThread(null);
      setMessages([]);
      setRefreshNonce((current) => current + 1);
      toast.success('Communication thread purged.');
    } catch (error) {
      setPurgeError(error.message || 'Failed to purge communication thread');
    } finally {
      setPurgeSubmitting(false);
    }
  };

  if (!effectiveTenantId) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardContent className="p-8 text-center">
            <Inbox className="mx-auto mb-4 h-10 w-10 text-slate-500" />
            <h2 className="text-xl font-semibold">Select a tenant to view communications</h2>
            <p className="mt-2 text-sm text-slate-400">
              The communications inbox is tenant-scoped and needs an active tenant context.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-100">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <Mail className="h-3.5 w-3.5" />
            Communications
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {workspaceView === 'queue' ? 'Lead Capture Queue' : 'Inbox'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            {workspaceView === 'queue'
              ? 'Review unknown inbound senders, inspect source message context, and promote only when the CRM entity should be created.'
              : 'Review tenant email threads, filter by mailbox or linked CRM entity, and work through unread, open, and closed views.'}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setWorkspaceView('inbox')}
              className={`h-9 px-3 text-sm ${
                workspaceView === 'inbox'
                  ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Inbox
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setWorkspaceView('queue')}
              className={`h-9 px-3 text-sm ${
                workspaceView === 'queue'
                  ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Lead Capture Queue
            </Button>
          </div>
          {workspaceView === 'inbox' ? (
            <Button
              onClick={() => setComposerOpen((current) => !current)}
              variant="outline"
              className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
            >
              <SquarePen className="mr-2 h-4 w-4" />
              {composerOpen ? 'Hide Composer' : 'Compose'}
            </Button>
          ) : null}
          <Button
            onClick={handleRefresh}
            variant="outline"
            className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {workspaceView === 'inbox' && composerOpen && (
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Compose Outbound Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="communications-compose-mailbox">Mailbox ID</Label>
                <Input
                  id="communications-compose-mailbox"
                  value={composeForm.mailboxId}
                  onChange={(event) => handleComposeChange('mailboxId', event.target.value)}
                  placeholder={DEFAULT_MAILBOX_ID}
                  className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="communications-compose-to">To</Label>
                <Input
                  id="communications-compose-to"
                  type="email"
                  value={composeForm.to}
                  onChange={(event) => handleComposeChange('to', event.target.value)}
                  placeholder="recipient@example.com"
                  className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="communications-compose-subject">Subject</Label>
                <Input
                  id="communications-compose-subject"
                  value={composeForm.subject}
                  onChange={(event) => handleComposeChange('subject', event.target.value)}
                  placeholder="Intro from AiSHA CRM"
                  className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="communications-compose-related-to">Linked Entity</Label>
                <Select
                  value={composeForm.relatedTo}
                  onValueChange={(value) => handleComposeChange('relatedTo', value)}
                >
                  <SelectTrigger
                    id="communications-compose-related-to"
                    className="border-slate-700 bg-slate-950"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                    {COMPOSE_ENTITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="communications-compose-body">Body</Label>
                <Textarea
                  id="communications-compose-body"
                  value={composeForm.body}
                  onChange={(event) => handleComposeChange('body', event.target.value)}
                  placeholder="Write the email body here."
                  className="min-h-[160px] border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="communications-compose-related-id">Linked Entity ID</Label>
                <Input
                  id="communications-compose-related-id"
                  value={composeForm.relatedId}
                  onChange={(event) => handleComposeChange('relatedId', event.target.value)}
                  disabled={composeForm.relatedTo === 'none'}
                  placeholder="Optional UUID"
                  className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-500">
                  Queueing uses the existing activity email worker. Link a CRM entity when you want
                  the email tracked directly against it.
                </p>
              </div>
            </div>

            {composeError ? (
              <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span>{composeError}</span>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleQueueOutboundEmail}
                disabled={composeSubmitting}
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                <Send className="mr-2 h-4 w-4" />
                {composeSubmitting
                  ? 'Queueing...'
                  : composeForm.mode === 'reply'
                    ? 'Queue Reply'
                    : 'Queue Email'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {workspaceView === 'inbox' ? (
        <>
          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="communications-view">View</Label>
                <Select value={view} onValueChange={setView}>
                  <SelectTrigger id="communications-view" className="border-slate-700 bg-slate-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                    {VIEW_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="communications-delivery-state">Delivery State</Label>
                <Select value={deliveryState} onValueChange={setDeliveryState}>
                  <SelectTrigger
                    id="communications-delivery-state"
                    className="border-slate-700 bg-slate-950"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                    {DELIVERY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="communications-mailbox">Mailbox</Label>
                <Select value={mailboxId} onValueChange={setMailboxId}>
                  <SelectTrigger
                    id="communications-mailbox"
                    className="border-slate-700 bg-slate-950"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                    <SelectItem value="all">All mailboxes</SelectItem>
                    {mailboxOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="communications-entity-type">Linked Entity</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger
                    id="communications-entity-type"
                    className="border-slate-700 bg-slate-950"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                    {ENTITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="communications-entity-id">Entity ID</Label>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="communications-entity-id"
                    value={entityId}
                    onChange={(event) => setEntityId(event.target.value)}
                    placeholder="Optional UUID"
                    disabled={entityType === 'all'}
                    className="border-slate-700 bg-slate-950 pl-9 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
            <Card className="border-slate-800 bg-slate-900 text-slate-100">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">Threads</CardTitle>
                <Badge variant="secondary" className="bg-slate-800 text-slate-200">
                  {threads.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingThreads ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                      >
                        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800" />
                        <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-800" />
                        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-800" />
                      </div>
                    ))}
                  </div>
                ) : threadsError ? (
                  <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4" />
                      <span>{threadsError}</span>
                    </div>
                  </div>
                ) : threads.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center">
                    <Search className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                    <p className="text-sm font-medium text-slate-200">
                      No threads matched these filters.
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Try a different mailbox, entity, or view.
                    </p>
                  </div>
                ) : (
                  threads.map((thread) => {
                    const isSelected = selectedThreadId === thread.id;
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => setSelectedThreadId(thread.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? 'border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]'
                            : 'border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">
                              {thread.subject || '(no subject)'}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">{thread.mailbox_id}</p>
                          </div>
                          <Badge
                            variant="secondary"
                            className={`shrink-0 ${
                              thread.status === 'unread'
                                ? 'bg-amber-500/15 text-amber-200'
                                : thread.status === 'archived'
                                  ? 'bg-violet-500/15 text-violet-200'
                                  : thread.status === 'closed'
                                    ? 'bg-slate-700 text-slate-200'
                                    : 'bg-emerald-500/15 text-emerald-200'
                            }`}
                          >
                            {thread.status || 'open'}
                          </Badge>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm text-slate-400">
                          {summarizeMessage(thread.latest_message)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(thread.linked_entities || []).slice(0, 3).map((link) => (
                            <Badge
                              key={`${thread.id}-${link.entity_type}-${link.entity_id}`}
                              variant="outline"
                              className="border-slate-700 text-slate-300"
                            >
                              {link.entity_type}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                          Last message {formatDateTime(thread.last_message_at)}
                        </p>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900 text-slate-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Conversation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingMessages ? (
                  <div className="space-y-4">
                    {[1, 2].map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-slate-800 bg-slate-950 p-5"
                      >
                        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-800" />
                        <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-800" />
                        <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-800" />
                      </div>
                    ))}
                  </div>
                ) : messagesError ? (
                  <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4" />
                      <span>{messagesError}</span>
                    </div>
                  </div>
                ) : !selectedThread ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center">
                    <Inbox className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                    <p className="text-sm font-medium text-slate-200">
                      Select a thread to inspect the conversation.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-semibold">
                            {selectedThread.subject || '(no subject)'}
                          </h2>
                          <p className="mt-2 text-sm text-slate-400">
                            Mailbox {selectedThread.mailbox_id}
                            {selectedThread.mailbox_address
                              ? ` · ${selectedThread.mailbox_address}`
                              : ''}
                          </p>
                        </div>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-200">
                          {selectedThread.status || 'open'}
                        </Badge>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {stateValue(selectedThread.state, 'delivery')?.state && (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-200"
                          >
                            <Truck className="mr-1 h-3 w-3" />
                            Delivery: {stateValue(selectedThread.state, 'delivery').state}
                          </Badge>
                        )}
                        {stateValue(selectedThread.state, 'replay')?.replay_job_id && (
                          <Badge variant="outline" className="border-amber-500/30 text-amber-200">
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Replay queued
                          </Badge>
                        )}
                        {stateValue(selectedThread.state, 'meeting')?.reply_state && (
                          <Badge variant="outline" className="border-cyan-500/30 text-cyan-200">
                            <CalendarCheck2 className="mr-1 h-3 w-3" />
                            Meeting reply: {stateValue(selectedThread.state, 'meeting').reply_state}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleReplyToThread}
                          className="border-cyan-500/30 bg-transparent text-cyan-200 hover:bg-cyan-500/10"
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Reply
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleReplayThread}
                          disabled={replaySubmitting}
                          className="border-amber-500/30 bg-transparent text-amber-200 hover:bg-amber-500/10"
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          {replaySubmitting ? 'Queueing Replay...' : 'Replay Thread'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            handleThreadStatusUpdate(
                              selectedThread.status === 'unread' ? 'open' : 'unread',
                            )
                          }
                          disabled={statusSubmitting}
                          className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
                        >
                          {statusSubmitting && selectedThread.status === 'unread'
                            ? 'Marking Read...'
                            : statusSubmitting
                              ? 'Marking Unread...'
                              : selectedThread.status === 'unread'
                                ? 'Mark Read'
                                : 'Mark Unread'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            handleThreadStatusUpdate(
                              selectedThread.status === 'closed' ? 'open' : 'closed',
                            )
                          }
                          disabled={statusSubmitting}
                          className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
                        >
                          {statusSubmitting && selectedThread.status === 'closed'
                            ? 'Reopening...'
                            : statusSubmitting
                              ? 'Closing...'
                              : selectedThread.status === 'closed'
                                ? 'Reopen Thread'
                                : 'Close Thread'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            handleThreadStatusUpdate(
                              selectedThread.status === 'archived' ? 'open' : 'archived',
                            )
                          }
                          disabled={statusSubmitting}
                          className="border-violet-500/30 bg-transparent text-violet-200 hover:bg-violet-500/10"
                        >
                          <Archive className="mr-2 h-4 w-4" />
                          {statusSubmitting && selectedThread.status === 'archived'
                            ? 'Restoring...'
                            : statusSubmitting
                              ? 'Archiving...'
                              : selectedThread.status === 'archived'
                                ? 'Restore Thread'
                                : 'Archive Thread'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleThreadPurge}
                          disabled={purgeSubmitting}
                          className="border-red-500/30 bg-transparent text-red-200 hover:bg-red-500/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {purgeSubmitting ? 'Purging...' : 'Purge Thread'}
                        </Button>
                        {replayError ? (
                          <span className="text-sm text-red-300">{replayError}</span>
                        ) : stateValue(selectedThread.state, 'replay')?.replay_job_id ? (
                          <span className="text-sm text-slate-400">
                            Latest replay job{' '}
                            {stateValue(selectedThread.state, 'replay').replay_job_id}
                          </span>
                        ) : null}
                        {statusError ? (
                          <span className="text-sm text-red-300">{statusError}</span>
                        ) : null}
                        {purgeError ? (
                          <span className="text-sm text-red-300">{purgeError}</span>
                        ) : null}
                      </div>

                      {(selectedThread.linked_entities || []).length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedThread.linked_entities.map((link) => {
                            const page = ENTITY_PAGE[link.entity_type];
                            return page ? (
                              <Link
                                key={`${link.entity_type}-${link.entity_id}`}
                                to={createPageUrl(`${page}?id=${link.entity_id}`)}
                                className="inline-flex"
                              >
                                <Badge
                                  variant="outline"
                                  className="cursor-pointer border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10"
                                >
                                  {link.entity_type}: {link.entity_id.slice(0, 8)}
                                </Badge>
                              </Link>
                            ) : (
                              <Badge
                                key={`${link.entity_type}-${link.entity_id}`}
                                variant="outline"
                                className="border-slate-700 text-slate-300"
                              >
                                {link.entity_type}: {link.entity_id.slice(0, 8)}
                              </Badge>
                            );
                          })}
                        </div>
                      )}

                      {(selectedThread.linked_activities || []).length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedThread.linked_activities.map((activity) => (
                            <Link
                              key={`thread-activity-${activity.id}`}
                              to={createPageUrl(`Activities?id=${activity.id}`)}
                              className="inline-flex"
                            >
                              <Badge
                                variant="outline"
                                className="cursor-pointer border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
                              >
                                Activity: {renderActivityLabel(activity)}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>

                    {(stateValue(selectedThread.state, 'events') || []).length > 0 && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Recent Activity
                        </h3>
                        <div className="mt-4 space-y-3">
                          {stateValue(selectedThread.state, 'events').map((event, index) => (
                            <div
                              key={`${event.type || 'event'}-${event.occurred_at || index}-${index}`}
                              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium text-slate-100">
                                  {formatEventLabel(event.type)}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {formatDateTime(event.occurred_at)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                                {event.delivery_state ? (
                                  <span>Delivery: {event.delivery_state}</span>
                                ) : null}
                                {event.reply_state ? <span>Reply: {event.reply_state}</span> : null}
                                {event.replay_job_id ? (
                                  <span>Replay Job: {event.replay_job_id}</span>
                                ) : null}
                                {event.actor ? <span>By: {event.actor}</span> : null}
                                {event.review_required ? <span>Review required</span> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-2xl border p-5 ${
                            message.direction === 'outbound'
                              ? 'border-cyan-500/30 bg-cyan-500/10'
                              : 'border-slate-800 bg-slate-950'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-100">
                                {message.direction === 'outbound'
                                  ? 'Outbound message'
                                  : message.sender_name ||
                                    message.sender_email ||
                                    'Inbound message'}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDateTime(message.received_at)}
                              </p>
                            </div>
                            <Badge variant="outline" className="border-slate-700 text-slate-300">
                              {message.direction}
                            </Badge>
                          </div>
                          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                            {formatMessageBody(message)}
                          </p>
                          {(message.linked_entities || []).length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {message.linked_entities.map((link) => (
                                <Badge
                                  key={`${message.id}-${link.entity_type}-${link.entity_id}`}
                                  variant="outline"
                                  className="border-slate-700 text-slate-300"
                                >
                                  {link.entity_type}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {(message.linked_activities || []).length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {message.linked_activities.map((activity) => (
                                <Link
                                  key={`${message.id}-activity-${activity.id}`}
                                  to={createPageUrl(`Activities?id=${activity.id}`)}
                                  className="inline-flex"
                                >
                                  <Badge
                                    variant="outline"
                                    className="cursor-pointer border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
                                  >
                                    Activity: {renderActivityLabel(activity)}
                                  </Badge>
                                </Link>
                              ))}
                            </div>
                          )}
                          <div className="mt-4 flex flex-wrap gap-2">
                            {stateValue(message.state, 'delivery')?.state && (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/30 text-emerald-200"
                              >
                                Delivery: {stateValue(message.state, 'delivery').state}
                              </Badge>
                            )}
                            {stateValue(message.state, 'meeting')?.reply_state && (
                              <Badge variant="outline" className="border-cyan-500/30 text-cyan-200">
                                Meeting: {stateValue(message.state, 'meeting').reply_state}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <LeadCaptureQueueView tenantId={effectiveTenantId} refreshToken={refreshNonce} />
      )}
    </div>
  );
}
