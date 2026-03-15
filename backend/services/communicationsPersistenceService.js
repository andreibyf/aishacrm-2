import { getSupabaseClient } from '../lib/supabase-db.js';

const LINKABLE_ENTITY_TYPES = new Set(['lead', 'contact', 'account', 'opportunity', 'activity']);

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeSubject(subject) {
  if (typeof subject !== 'string') return '';
  return subject
    .trim()
    .toLowerCase()
    .replace(/^(re|fw|fwd):\s*/gi, '')
    .trim();
}

function coerceArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeAttachments(value) {
  return coerceArray(value)
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const filename =
        typeof entry.filename === 'string' && entry.filename.trim().length > 0
          ? entry.filename.trim()
          : `attachment-${index + 1}`;
      return {
        filename,
        content_type:
          typeof entry.content_type === 'string' && entry.content_type.trim().length > 0
            ? entry.content_type.trim()
            : 'application/octet-stream',
        size:
          Number.isFinite(entry.size) && entry.size >= 0
            ? entry.size
            : Number.isFinite(Number(entry.size)) && Number(entry.size) >= 0
              ? Number(entry.size)
              : null,
        content_id:
          typeof entry.content_id === 'string' && entry.content_id.trim().length > 0
            ? entry.content_id.trim()
            : null,
        disposition:
          typeof entry.disposition === 'string' && entry.disposition.trim().length > 0
            ? entry.disposition.trim().toLowerCase()
            : 'attachment',
      };
    })
    .filter(Boolean);
}

function extractThreadHints(payload = {}) {
  const hints = new Set();
  if (payload.thread_hint) hints.add(String(payload.thread_hint));
  if (payload.in_reply_to) hints.add(String(payload.in_reply_to));
  if (payload.headers?.in_reply_to) hints.add(String(payload.headers.in_reply_to));
  for (const ref of coerceArray(payload.headers?.references)) {
    hints.add(String(ref));
  }
  return [...hints].filter(Boolean);
}

function collectParticipants(payload = {}, mailboxAddress = null) {
  const seen = new Map();
  const add = (entry, role) => {
    const email = normalizeEmail(entry?.email || entry);
    if (!email) return;
    if (!seen.has(email)) {
      seen.set(email, {
        email,
        name: entry?.name || null,
        role,
      });
    }
  };

  add(payload.from, 'sender');
  coerceArray(payload.to).forEach((entry) => add(entry, 'to'));
  coerceArray(payload.cc).forEach((entry) => add(entry, 'cc'));
  coerceArray(payload.bcc).forEach((entry) => add(entry, 'bcc'));
  if (mailboxAddress) {
    add({ email: mailboxAddress }, 'mailbox');
  }

  return [...seen.values()];
}

async function findExistingThread(tenantId, payload, supabase) {
  const hints = extractThreadHints(payload);
  if (hints.length > 0) {
    const { data, error } = await supabase
      .from('communications_messages')
      .select('thread_id, received_at')
      .eq('tenant_id', tenantId)
      .in('internet_message_id', hints)
      .order('received_at', { ascending: false })
      .limit(1);

    if (error) {
      throw buildPersistenceError('communications_thread_lookup_failed', error.message);
    }

    if (data?.[0]?.thread_id) {
      return data[0].thread_id;
    }
  }

  const normalizedSubject = normalizeSubject(payload.subject);
  if (!normalizedSubject) {
    return null;
  }

  const { data, error } = await supabase
    .from('communications_threads')
    .select('id, normalized_subject, last_message_at')
    .eq('tenant_id', tenantId)
    .eq('normalized_subject', normalizedSubject)
    .order('last_message_at', { ascending: false })
    .limit(1);

  if (error) {
    throw buildPersistenceError('communications_thread_lookup_failed', error.message);
  }

  if (data?.[0]?.id) {
    return data[0].id;
  }

  const participantFallbackId = await findThreadByParticipantFallback(tenantId, payload, supabase);
  return participantFallbackId;
}

function collectParticipantEmails(payload = {}) {
  return new Set(
    collectParticipants(payload)
      .map((participant) => normalizeEmail(participant.email))
      .filter(Boolean),
  );
}

async function findThreadByParticipantFallback(tenantId, payload, supabase) {
  const participantEmails = collectParticipantEmails(payload);
  if (participantEmails.size === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from('communications_threads')
    .select('id, participants, last_message_at')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false })
    .limit(25);

  if (error) {
    throw buildPersistenceError('communications_thread_lookup_failed', error.message);
  }

  for (const row of data || []) {
    const rowParticipants = Array.isArray(row.participants) ? row.participants : [];
    const overlap = rowParticipants.some((participant) =>
      participantEmails.has(normalizeEmail(participant?.email)),
    );
    if (overlap) {
      return row.id;
    }
  }

  return null;
}

function buildPersistenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 500;
  return error;
}

async function ensureThreadRecord(
  { tenantId, mailboxId, mailboxAddress, payload, occurredAt },
  { supabase },
) {
  const existingThreadId = await findExistingThread(tenantId, payload, supabase);
  const threadPayload = {
    tenant_id: tenantId,
    mailbox_id: mailboxId || 'unknown-mailbox',
    mailbox_address: mailboxAddress || null,
    subject: payload.subject || '(no subject)',
    normalized_subject: normalizeSubject(payload.subject),
    participants: collectParticipants(payload, mailboxAddress),
    first_message_at: payload.received_at || occurredAt,
    last_message_at: payload.received_at || occurredAt,
    metadata: {
      latest_message_id: payload.message_id,
      latest_thread_hint: payload.thread_hint || payload.headers?.in_reply_to || null,
      source_service: 'communications-worker',
    },
  };

  if (existingThreadId) {
    const { data, error } = await supabase
      .from('communications_threads')
      .update({
        ...threadPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', existingThreadId)
      .select('*')
      .single();

    if (error) {
      throw buildPersistenceError('communications_thread_update_failed', error.message);
    }

    return data;
  }

  const { data, error } = await supabase
    .from('communications_threads')
    .insert([threadPayload])
    .select('*')
    .single();

  if (error) {
    throw buildPersistenceError('communications_thread_create_failed', error.message);
  }

  return data;
}

async function upsertInboundMessage({ tenantId, thread, payload, occurredAt }, { supabase }) {
  const existing = await supabase
    .from('communications_messages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('internet_message_id', payload.message_id)
    .maybeSingle();

  if (existing.error && existing.error.code !== 'PGRST116') {
    throw buildPersistenceError('communications_message_lookup_failed', existing.error.message);
  }

  if (existing.data) {
    return existing.data;
  }

  const attachments = normalizeAttachments(payload.attachments);
  const messagePayload = {
    tenant_id: tenantId,
    thread_id: thread.id,
    internet_message_id: payload.message_id,
    direction: 'inbound',
    provider_cursor:
      payload.provider_cursor !== undefined && payload.provider_cursor !== null
        ? String(payload.provider_cursor)
        : null,
    subject: payload.subject || '(no subject)',
    sender_email: payload.from?.email || null,
    sender_name: payload.from?.name || null,
    recipients: coerceArray(payload.to),
    cc: coerceArray(payload.cc),
    bcc: coerceArray(payload.bcc),
    received_at: payload.received_at || occurredAt,
    text_body: payload.text_body || '',
    html_body: payload.html_body || '',
    raw_source: payload.raw_source || null,
    headers: payload.headers || {},
    metadata: {
      thread_hint: payload.thread_hint || payload.headers?.in_reply_to || null,
      provider_metadata: payload.provider_metadata || {},
      attachments,
      attachment_count: attachments.length,
    },
  };

  const { data, error } = await supabase
    .from('communications_messages')
    .insert([messagePayload])
    .select('*')
    .single();

  if (error) {
    throw buildPersistenceError('communications_message_create_failed', error.message);
  }

  return data;
}

export async function persistInboundThreadAndMessage(
  request,
  resolvedTenant,
  { supabase = getSupabaseClient() } = {},
) {
  const tenantId = resolvedTenant.id;
  const thread = await ensureThreadRecord(
    {
      tenantId,
      mailboxId: request.mailbox_id,
      mailboxAddress: request.mailbox_address,
      payload: request.payload,
      occurredAt: request.occurred_at,
    },
    { supabase },
  );

  const message = await upsertInboundMessage(
    {
      tenantId,
      thread,
      payload: request.payload,
      occurredAt: request.occurred_at,
    },
    { supabase },
  );

  return { thread, message };
}

function normalizeExplicitEntityRefs(payload = {}) {
  const refs = Array.isArray(payload.entity_refs)
    ? payload.entity_refs
    : Array.isArray(payload.related_entities)
      ? payload.related_entities
      : [];

  return refs
    .filter(
      (entry) =>
        entry && LINKABLE_ENTITY_TYPES.has(String(entry.type || '').toLowerCase()) && entry.id,
    )
    .map((entry) => ({
      type: String(entry.type).toLowerCase(),
      id: String(entry.id),
      source: 'explicit',
      confidence: 1,
    }));
}

async function inferEntitiesBySenderEmail(tenantId, payload, { supabase }) {
  const senderEmail = normalizeEmail(payload.from?.email);
  if (!senderEmail) return [];

  const lookups = [
    { type: 'lead', table: 'leads' },
    { type: 'contact', table: 'contacts' },
    { type: 'account', table: 'accounts' },
  ];

  const matches = [];
  for (const lookup of lookups) {
    const { data, error } = await supabase
      .from(lookup.table)
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', senderEmail)
      .limit(5);

    if (error) {
      throw buildPersistenceError('communications_entity_lookup_failed', error.message);
    }

    for (const row of data || []) {
      matches.push({
        type: lookup.type,
        id: String(row.id),
        source: 'sender_email',
        confidence: 0.8,
      });
    }
  }

  return matches;
}

async function hydrateThreadLinks(tenantId, threadId, { supabase }) {
  const { data, error } = await supabase
    .from('communications_entity_links')
    .select('entity_type, entity_id')
    .eq('tenant_id', tenantId)
    .eq('thread_id', threadId);

  if (error) {
    throw buildPersistenceError('communications_entity_lookup_failed', error.message);
  }

  return (data || []).map((row) => ({
    type: row.entity_type,
    id: String(row.entity_id),
    source: 'thread_history',
    confidence: 0.7,
  }));
}

function dedupeEntityLinks(links) {
  const seen = new Set();
  const deduped = [];
  for (const link of links) {
    const key = `${link.type}:${link.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(link);
    }
  }
  return deduped;
}

async function persistEntityLinks(tenantId, threadId, messageId, links, { supabase }) {
  if (links.length === 0) return [];

  const rows = [];
  for (const link of links) {
    rows.push({
      tenant_id: tenantId,
      thread_id: threadId,
      message_id: messageId,
      entity_type: link.type,
      entity_id: link.id,
      link_scope: 'message',
      source: link.source,
      confidence: link.confidence,
      metadata: {
        detected_by: link.source,
      },
    });
  }

  const { error } = await supabase.from('communications_entity_links').insert(rows);

  if (error && error.code !== '23505') {
    throw buildPersistenceError('communications_entity_link_persist_failed', error.message);
  }

  return links;
}

export async function resolveInboundEntityLinks(
  request,
  resolvedTenant,
  persisted,
  { supabase = getSupabaseClient() } = {},
) {
  const explicit = normalizeExplicitEntityRefs(request.payload);
  const inferred = await inferEntitiesBySenderEmail(resolvedTenant.id, request.payload, {
    supabase,
  });
  const historical = await hydrateThreadLinks(resolvedTenant.id, persisted.thread.id, { supabase });
  const links = dedupeEntityLinks([...explicit, ...historical, ...inferred]);
  await persistEntityLinks(resolvedTenant.id, persisted.thread.id, persisted.message.id, links, {
    supabase,
  });
  return links;
}

export async function attachActivityToCommunicationsRecords(
  { tenantId, threadId, messageId, activity, links },
  { supabase = getSupabaseClient() } = {},
) {
  if (!activity?.id) {
    return null;
  }

  const { error: messageError } = await supabase
    .from('communications_messages')
    .update({
      activity_id: activity.id,
      metadata: {
        ...(activity.metadata?.communications || {}),
        activity_id: activity.id,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', messageId);

  if (messageError) {
    throw buildPersistenceError('communications_message_update_failed', messageError.message);
  }

  const activityLinkRows = dedupeEntityLinks(
    links.map((link) => ({
      ...link,
      type: 'activity',
      id: activity.id,
      source: 'activity_attachment',
      confidence: 1,
    })),
  );

  if (activityLinkRows.length > 0) {
    const rows = activityLinkRows.map((link) => ({
      tenant_id: tenantId,
      thread_id: threadId,
      message_id: messageId,
      entity_type: link.type,
      entity_id: link.id,
      link_scope: 'activity',
      source: link.source,
      confidence: link.confidence,
      metadata: {
        activity_id: activity.id,
      },
    }));

    const { error } = await supabase.from('communications_entity_links').insert(rows);
    if (error && error.code !== '23505') {
      throw buildPersistenceError('communications_activity_link_failed', error.message);
    }
  }

  const mergedMetadata = {
    ...(activity.metadata || {}),
    communications: {
      ...(activity.metadata?.communications || {}),
      thread_id: threadId,
      stored_message_id: messageId,
      link_status: links.length > 0 ? 'linked' : 'unlinked',
      linked_entities: links.map((link) => ({
        entity_type: link.type,
        entity_id: link.id,
        source: link.source,
      })),
    },
  };

  const { data, error } = await supabase
    .from('activities')
    .update({ metadata: mergedMetadata, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', activity.id)
    .select('*')
    .single();

  if (error) {
    throw buildPersistenceError('communications_activity_update_failed', error.message);
  }

  return data;
}

export default {
  persistInboundThreadAndMessage,
  resolveInboundEntityLinks,
  attachActivityToCommunicationsRecords,
};
