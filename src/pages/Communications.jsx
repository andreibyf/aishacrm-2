import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, RefreshCw, Inbox, Search, Link2, AlertCircle } from 'lucide-react';
import { useTenant } from '@/components/shared/tenantContext';
import { useUser } from '@/components/shared/useUser.js';
import { listCommunicationThreads, getCommunicationThreadMessages } from '@/api/communications';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const VIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
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

export default function CommunicationsPage() {
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  const [view, setView] = useState('all');
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
  const [refreshNonce, setRefreshNonce] = useState(0);

  const effectiveTenantId = selectedTenantId || user?.tenant_id || null;

  const threadFilterArgs = useMemo(
    () => ({
      tenantId: effectiveTenantId,
      mailboxId: mailboxId === 'all' ? undefined : mailboxId,
      entityType: entityType === 'all' ? undefined : entityType,
      entityId: entityType === 'all' ? undefined : entityId.trim() || undefined,
      view,
      limit: 50,
      offset: 0,
    }),
    [effectiveTenantId, mailboxId, entityType, entityId, view, refreshNonce],
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
        const nextMailboxOptions = [...new Set(nextThreads.map((thread) => thread.mailbox_id).filter(Boolean))];
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
  }, [effectiveTenantId, selectedThreadId]);

  const handleRefresh = () => {
    setThreadsError(null);
    setMessagesError(null);
    setRefreshNonce((current) => current + 1);
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Review tenant email threads, filter by mailbox or linked CRM entity, and work through unread, open, and closed views.
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
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
            <Label htmlFor="communications-mailbox">Mailbox</Label>
            <Select value={mailboxId} onValueChange={setMailboxId}>
              <SelectTrigger id="communications-mailbox" className="border-slate-700 bg-slate-950">
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
              <SelectTrigger id="communications-entity-type" className="border-slate-700 bg-slate-950">
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
                  <div key={item} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
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
                <p className="text-sm font-medium text-slate-200">No threads matched these filters.</p>
                <p className="mt-2 text-sm text-slate-500">Try a different mailbox, entity, or view.</p>
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
                  <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
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
                <p className="text-sm font-medium text-slate-200">Select a thread to inspect the conversation.</p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{selectedThread.subject || '(no subject)'}</h2>
                      <p className="mt-2 text-sm text-slate-400">
                        Mailbox {selectedThread.mailbox_id}
                        {selectedThread.mailbox_address ? ` · ${selectedThread.mailbox_address}` : ''}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-slate-800 text-slate-200">
                      {selectedThread.status || 'open'}
                    </Badge>
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
                </div>

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
                              : message.sender_name || message.sender_email || 'Inbound message'}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">{formatDateTime(message.received_at)}</p>
                        </div>
                        <Badge variant="outline" className="border-slate-700 text-slate-300">
                          {message.direction}
                        </Badge>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                        {summarizeMessage(message)}
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
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
