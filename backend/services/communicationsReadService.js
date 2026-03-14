import { getSupabaseClient } from '../lib/supabase-db.js';

const ALLOWED_ENTITY_TYPES = new Set(['lead', 'contact', 'account', 'opportunity', 'activity']);
const VIEW_TO_STATUS = {
  unread: 'unread',
  open: 'open',
  closed: 'closed',
  all: null,
};

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

export async function listCommunicationsThreads(
  { tenantId, limit, offset, mailboxId, status, view, entityType, entityId },
  { supabase = getSupabaseClient() } = {},
) {
  const safeLimit = normalizePositiveInt(limit, 25, 100);
  const safeOffset = normalizeOffset(offset);
  const normalizedMailboxId = normalizeOptionalString(mailboxId);
  const normalizedStatus = normalizeOptionalString(status);
  const normalizedView = normalizeOptionalString(view)?.toLowerCase() || null;
  const normalizedEntityType = normalizeOptionalString(entityType)?.toLowerCase() || null;
  const normalizedEntityId = normalizeOptionalString(entityId);

  let effectiveStatus = normalizedStatus;
  if (!effectiveStatus && normalizedView && Object.prototype.hasOwnProperty.call(VIEW_TO_STATUS, normalizedView)) {
    effectiveStatus = VIEW_TO_STATUS[normalizedView];
  }

  if (normalizedEntityType && !ALLOWED_ENTITY_TYPES.has(normalizedEntityType)) {
    throw buildServiceError(400, 'communications_invalid_entity_type', 'Unsupported entity_type filter');
  }

  if ((normalizedEntityType && !normalizedEntityId) || (!normalizedEntityType && normalizedEntityId)) {
    throw buildServiceError(
      400,
      'communications_invalid_entity_filter',
      'entity_type and entity_id must be provided together',
    );
  }

  let permittedThreadIds = null;
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

    permittedThreadIds = [...new Set((linkResult.data || []).map((row) => row.thread_id).filter(Boolean))];
    if (permittedThreadIds.length === 0) {
      return {
        threads: [],
        total: 0,
        limit: safeLimit,
        offset: safeOffset,
        applied_filters: {
          mailbox_id: normalizedMailboxId,
          status: effectiveStatus,
          view: normalizedView,
          entity_type: normalizedEntityType,
          entity_id: normalizedEntityId,
        },
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

  const threadsResult = await threadsQuery
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

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
      applied_filters: {
        mailbox_id: normalizedMailboxId,
        status: effectiveStatus,
        view: normalizedView,
        entity_type: normalizedEntityType,
        entity_id: normalizedEntityId,
      },
    };
  }

  const threadIds = threads.map((thread) => thread.id);

  const [messagesResult, linksResult] = await Promise.all([
    supabase
      .from('communications_messages')
      .select(
        'id, thread_id, internet_message_id, direction, subject, sender_email, sender_name, received_at, activity_id, metadata',
      )
      .eq('tenant_id', tenantId)
      .in('thread_id', threadIds)
      .order('received_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('communications_entity_links')
      .select('thread_id, entity_type, entity_id, link_scope, source, confidence')
      .eq('tenant_id', tenantId)
      .in('thread_id', threadIds),
  ]);

  if (messagesResult.error) {
    throw buildServiceError(
      500,
      'communications_messages_query_failed',
      messagesResult.error.message,
    );
  }

  if (linksResult.error) {
    throw buildServiceError(
      500,
      'communications_links_query_failed',
      linksResult.error.message,
    );
  }

  const latestMessages = firstByThread(messagesResult.data || []);
  const linkedEntities = groupLinksByThread(linksResult.data || []);

  return {
    threads: threads.map((thread) => ({
      ...thread,
      latest_message: latestMessages.get(thread.id) || null,
      linked_entities: linkedEntities.get(thread.id) || [],
    })),
    total: threadsResult.count || 0,
    limit: safeLimit,
    offset: safeOffset,
    applied_filters: {
      mailbox_id: normalizedMailboxId,
      status: effectiveStatus,
      view: normalizedView,
      entity_type: normalizedEntityType,
      entity_id: normalizedEntityId,
    },
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

  const [messagesResult, linksResult] = await Promise.all([
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
  ]);

  if (messagesResult.error) {
    throw buildServiceError(
      500,
      'communications_messages_query_failed',
      messagesResult.error.message,
    );
  }

  if (linksResult.error) {
    throw buildServiceError(
      500,
      'communications_links_query_failed',
      linksResult.error.message,
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
      linked_entities: threadLevelLinks,
    },
    messages: (messagesResult.data || []).map((message) => ({
      ...message,
      linked_entities: linksByMessage.get(message.id) || [],
    })),
    limit: safeLimit,
    offset: safeOffset,
  };
}

export default {
  listCommunicationsThreads,
  getCommunicationsThreadMessages,
};
