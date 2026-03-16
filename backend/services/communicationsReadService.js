import { getSupabaseClient } from '../lib/supabase-db.js';

const ALLOWED_ENTITY_TYPES = new Set(['lead', 'contact', 'account', 'opportunity', 'activity']);
const VIEW_TO_STATUS = {
  unread: 'unread',
  open: 'open',
  closed: 'closed',
  archived: 'archived',
  all: null,
};
const ALLOWED_DELIVERY_STATES = new Set([
  'queued',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'opened',
  'clicked',
]);

function buildServiceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function firstByThread(rows) {
  const latestByThread = new Map();
  for (const row of rows || []) {
    if (!latestByThread.has(row.thread_id)) {
      latestByThread.set(row.thread_id, row);
    }
  }
  return latestByThread;
}

function groupLinksByThread(rows) {
  const linksByThread = new Map();
  for (const row of rows || []) {
    const existing = linksByThread.get(row.thread_id) || [];
    existing.push({
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      link_scope: row.link_scope,
      source: row.source,
      confidence: row.confidence,
    });
    linksByThread.set(row.thread_id, existing);
  }
  return linksByThread;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function summarizeThreadState(thread, latestMessage) {
  const threadMeta = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const messageMeta =
    latestMessage?.metadata && typeof latestMessage.metadata === 'object'
      ? latestMessage.metadata
      : {};

  return {
    delivery: messageMeta.delivery || threadMeta.delivery || null,
    replay: threadMeta.replay || null,
    meeting: messageMeta.meeting || threadMeta.meeting || null,
    events: Array.isArray(threadMeta.event_log) ? threadMeta.event_log.slice(-5).reverse() : [],
  };
}

function normalizeDeliveryState(value) {
  return normalizeOptionalString(value)?.toLowerCase() || null;
}

function extractAttachments(metadata) {
  return Array.isArray(metadata?.attachments) ? metadata.attachments : [];
}

function buildAppliedFilters({ mailboxId, status, view, entityType, entityId, deliveryState }) {
  return {
    mailbox_id: mailboxId,
    status,
    view,
    entity_type: entityType,
    entity_id: entityId,
    delivery_state: deliveryState,
  };
}

export async function listCommunicationsThreads(
  { tenantId, limit, offset, mailboxId, status, view, entityType, entityId, deliveryState },
  { supabase = getSupabaseClient() } = {},
) {
  const safeLimit = normalizePositiveInt(limit, 25, 100);
  const safeOffset = normalizeOffset(offset);
  const normalizedMailboxId = normalizeOptionalString(mailboxId);
  const normalizedStatus = normalizeOptionalString(status);
  const normalizedView = normalizeOptionalString(view)?.toLowerCase() || null;
  const normalizedEntityType = normalizeOptionalString(entityType)?.toLowerCase() || null;
  const normalizedEntityId = normalizeOptionalString(entityId);
  const normalizedDeliveryState = normalizeDeliveryState(deliveryState);

  let effectiveStatus = normalizedStatus;
  if (
    !effectiveStatus &&
    normalizedView &&
    Object.prototype.hasOwnProperty.call(VIEW_TO_STATUS, normalizedView)
  ) {
    effectiveStatus = VIEW_TO_STATUS[normalizedView];
  }

  if (normalizedEntityType && !ALLOWED_ENTITY_TYPES.has(normalizedEntityType)) {
    throw buildServiceError(
      400,
      'communications_invalid_entity_type',
      'Unsupported entity_type filter',
    );
  }

  if (
    (normalizedEntityType && !normalizedEntityId) ||
    (!normalizedEntityType && normalizedEntityId)
  ) {
    throw buildServiceError(
      400,
      'communications_invalid_entity_filter',
      'entity_type and entity_id must be provided together',
    );
  }

  if (normalizedDeliveryState && !ALLOWED_DELIVERY_STATES.has(normalizedDeliveryState)) {
    throw buildServiceError(
      400,
      'communications_invalid_delivery_state',
      'Unsupported delivery_state filter',
    );
  }

  let permittedThreadIds = null;
  const appliedFilters = buildAppliedFilters({
    mailboxId: normalizedMailboxId,
    status: effectiveStatus,
    view: normalizedView,
    entityType: normalizedEntityType,
    entityId: normalizedEntityId,
    deliveryState: normalizedDeliveryState,
  });

  if (normalizedEntityType && normalizedEntityId) {
    const linkResult = await supabase
      .from('communications_entity_links')
      .select('thread_id')
      .eq('tenant_id', tenantId)
      .eq('entity_type', normalizedEntityType)
      .eq('entity_id', normalizedEntityId);

    if (linkResult.error) {
      throw buildServiceError(500, 'communications_links_query_failed', linkResult.error.message);
    }

    permittedThreadIds = [
      ...new Set((linkResult.data || []).map((row) => row.thread_id).filter(Boolean)),
    ];
    if (permittedThreadIds.length === 0) {
      return {
        threads: [],
        total: 0,
        limit: safeLimit,
        offset: safeOffset,
        applied_filters: appliedFilters,
      };
    }
  }

  let threadsQuery = supabase
    .from('communications_threads')
    .select(
      'id, tenant_id, mailbox_id, mailbox_address, subject, normalized_subject, participants, status, first_message_at, last_message_at, metadata, created_at, updated_at',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId);

  if (normalizedMailboxId) {
    threadsQuery = threadsQuery.eq('mailbox_id', normalizedMailboxId);
  }

  if (effectiveStatus) {
    threadsQuery = threadsQuery.eq('status', effectiveStatus);
  }

  if (permittedThreadIds) {
    threadsQuery = threadsQuery.in('id', permittedThreadIds);
  }

  let orderedThreadsQuery = threadsQuery.order('last_message_at', {
    ascending: false,
    nullsFirst: false,
  });
  if (!normalizedDeliveryState) {
    orderedThreadsQuery = orderedThreadsQuery.range(safeOffset, safeOffset + safeLimit - 1);
  }

  const threadsResult = await orderedThreadsQuery;

  if (threadsResult.error) {
    throw buildServiceError(
      500,
      'communications_threads_query_failed',
      threadsResult.error.message,
    );
  }

  const threads = threadsResult.data || [];
  if (threads.length === 0) {
    return {
      threads: [],
      total: threadsResult.count || 0,
      limit: safeLimit,
      offset: safeOffset,
      applied_filters: appliedFilters,
    };
  }

  const threadIds = threads.map((thread) => thread.id);

  const messagesResult = await supabase
    .from('communications_messages')
    .select(
      'id, thread_id, internet_message_id, direction, subject, sender_email, sender_name, received_at, activity_id, metadata',
    )
    .eq('tenant_id', tenantId)
    .in('thread_id', threadIds)
    .order('received_at', { ascending: false, nullsFirst: false });

  if (messagesResult.error) {
    throw buildServiceError(
      500,
      'communications_messages_query_failed',
      messagesResult.error.message,
    );
  }

  const latestMessages = firstByThread(messagesResult.data || []);
  const threadsWithState = threads.map((thread) => {
    const latestMessage = latestMessages.get(thread.id) || null;
    return {
      ...thread,
      event_log: Array.isArray(thread.metadata?.event_log) ? thread.metadata.event_log : [],
      latest_message: latestMessage,
      latest_message_attachments: extractAttachments(latestMessage?.metadata),
      state: summarizeThreadState(thread, latestMessage),
    };
  });

  const filteredThreads = normalizedDeliveryState
    ? threadsWithState.filter((thread) => thread.state?.delivery?.state === normalizedDeliveryState)
    : threadsWithState;

  const pagedThreads = normalizedDeliveryState
    ? filteredThreads.slice(safeOffset, safeOffset + safeLimit)
    : filteredThreads;

  const pagedThreadIds = pagedThreads.map((thread) => thread.id);
  const linksResult =
    pagedThreadIds.length > 0
      ? await supabase
          .from('communications_entity_links')
          .select('thread_id, entity_type, entity_id, link_scope, source, confidence')
          .eq('tenant_id', tenantId)
          .in('thread_id', pagedThreadIds)
      : { data: [], error: null };

  if (linksResult.error) {
    throw buildServiceError(500, 'communications_links_query_failed', linksResult.error.message);
  }

  const linkedEntities = groupLinksByThread(linksResult.data || []);
  const hydratedThreads = pagedThreads.map((thread) => ({
    ...thread,
    linked_entities: linkedEntities.get(thread.id) || [],
  }));

  return {
    threads: hydratedThreads,
    total: normalizedDeliveryState ? filteredThreads.length : threadsResult.count || 0,
    limit: safeLimit,
    offset: safeOffset,
    applied_filters: appliedFilters,
  };
}

export async function getCommunicationsThreadMessages(
  { tenantId, threadId, limit, offset },
  { supabase = getSupabaseClient() } = {},
) {
  const safeLimit = normalizePositiveInt(limit, 50, 250);
  const safeOffset = normalizeOffset(offset);

  const threadResult = await supabase
    .from('communications_threads')
    .select(
      'id, tenant_id, mailbox_id, mailbox_address, subject, normalized_subject, participants, status, first_message_at, last_message_at, metadata, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', threadId)
    .maybeSingle();

  if (threadResult.error) {
    throw buildServiceError(500, 'communications_thread_query_failed', threadResult.error.message);
  }

  if (!threadResult.data) {
    return null;
  }

  const [messagesResult, linksResult, latestMessageResult] = await Promise.all([
    supabase
      .from('communications_messages')
      .select(
        'id, thread_id, internet_message_id, direction, provider_cursor, subject, sender_email, sender_name, recipients, cc, bcc, received_at, text_body, html_body, headers, activity_id, metadata, created_at, updated_at',
      )
      .eq('tenant_id', tenantId)
      .eq('thread_id', threadId)
      .order('received_at', { ascending: true, nullsFirst: true })
      .range(safeOffset, safeOffset + safeLimit - 1),
    supabase
      .from('communications_entity_links')
      .select('thread_id, message_id, entity_type, entity_id, link_scope, source, confidence')
      .eq('tenant_id', tenantId)
      .eq('thread_id', threadId),
    supabase
      .from('communications_messages')
      .select('id, thread_id, received_at, metadata')
      .eq('tenant_id', tenantId)
      .eq('thread_id', threadId)
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(1),
  ]);

  if (messagesResult.error) {
    throw buildServiceError(
      500,
      'communications_messages_query_failed',
      messagesResult.error.message,
    );
  }

  if (linksResult.error) {
    throw buildServiceError(500, 'communications_links_query_failed', linksResult.error.message);
  }

  if (latestMessageResult.error) {
    throw buildServiceError(
      500,
      'communications_messages_query_failed',
      latestMessageResult.error.message,
    );
  }

  const links = linksResult.data || [];
  const linksByMessage = new Map();
  const threadLevelLinks = [];

  for (const link of links) {
    const normalized = {
      entity_type: link.entity_type,
      entity_id: link.entity_id,
      link_scope: link.link_scope,
      source: link.source,
      confidence: link.confidence,
    };
    if (link.message_id) {
      const existing = linksByMessage.get(link.message_id) || [];
      existing.push(normalized);
      linksByMessage.set(link.message_id, existing);
    } else {
      threadLevelLinks.push(normalized);
    }
  }

  return {
    thread: {
      ...threadResult.data,
      event_log: Array.isArray(threadResult.data.metadata?.event_log)
        ? threadResult.data.metadata.event_log
        : [],
      linked_entities: threadLevelLinks,
      state: summarizeThreadState(threadResult.data, (latestMessageResult.data || [])[0] || null),
    },
    messages: (messagesResult.data || []).map((message) => ({
      ...message,
      event_log: Array.isArray(message.metadata?.event_log) ? message.metadata.event_log : [],
      attachments: extractAttachments(message.metadata),
      linked_entities: linksByMessage.get(message.id) || [],
      state: {
        delivery: message.metadata?.delivery || null,
        meeting: message.metadata?.meeting || null,
      },
    })),
    limit: safeLimit,
    offset: safeOffset,
  };
}

export default {
  listCommunicationsThreads,
  getCommunicationsThreadMessages,
};
