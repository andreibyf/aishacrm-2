import { getSupabaseClient } from '../lib/supabase-db.js';

const ALLOWED_THREAD_STATUSES = new Set(['unread', 'open', 'closed', 'archived']);

function buildStateError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function updateCommunicationsThreadStatus(
  { tenantId, threadId, status, user },
  { supabase = getSupabaseClient() } = {},
) {
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : null;
  if (!normalizedStatus || !ALLOWED_THREAD_STATUSES.has(normalizedStatus)) {
    throw buildStateError(
      400,
      'communications_invalid_thread_status',
      'status must be one of: unread, open, closed, archived',
    );
  }

  const existing = await supabase
    .from('communications_threads')
    .select(
      'id, tenant_id, mailbox_id, mailbox_address, subject, normalized_subject, participants, status, first_message_at, last_message_at, metadata, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', threadId)
    .maybeSingle();

  if (existing.error) {
    throw buildStateError(
      500,
      'communications_thread_status_lookup_failed',
      existing.error.message,
    );
  }

  if (!existing.data) {
    throw buildStateError(404, 'communications_thread_not_found', 'Communication thread not found');
  }

  const updatedAt = new Date().toISOString();
  const nextMetadata = {
    ...asObject(existing.data.metadata),
    status: {
      state: normalizedStatus,
      updated_at: updatedAt,
      updated_by: user?.email || user?.id || 'unknown',
    },
  };

  const updated = await supabase
    .from('communications_threads')
    .update({
      status: normalizedStatus,
      metadata: nextMetadata,
      updated_at: updatedAt,
    })
    .eq('tenant_id', tenantId)
    .eq('id', threadId)
    .select(
      'id, tenant_id, mailbox_id, mailbox_address, subject, normalized_subject, participants, status, first_message_at, last_message_at, metadata, created_at, updated_at',
    )
    .single();

  if (updated.error) {
    throw buildStateError(500, 'communications_thread_status_update_failed', updated.error.message);
  }

  return {
    thread: updated.data,
  };
}

export async function purgeCommunicationsThread(
  { tenantId, threadId, user },
  { supabase = getSupabaseClient() } = {},
) {
  const existing = await supabase
    .from('communications_threads')
    .select(
      'id, tenant_id, mailbox_id, mailbox_address, subject, normalized_subject, participants, status, first_message_at, last_message_at, metadata, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', threadId)
    .maybeSingle();

  if (existing.error) {
    throw buildStateError(500, 'communications_thread_purge_lookup_failed', existing.error.message);
  }

  if (!existing.data) {
    throw buildStateError(404, 'communications_thread_not_found', 'Communication thread not found');
  }

  const [linksDelete, messagesDelete, threadDelete] = await Promise.all([
    supabase
      .from('communications_entity_links')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('thread_id', threadId),
    supabase
      .from('communications_messages')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('thread_id', threadId),
    supabase.from('communications_threads').delete().eq('tenant_id', tenantId).eq('id', threadId),
  ]);

  if (linksDelete.error) {
    throw buildStateError(
      500,
      'communications_thread_purge_links_failed',
      linksDelete.error.message,
    );
  }

  if (messagesDelete.error) {
    throw buildStateError(
      500,
      'communications_thread_purge_messages_failed',
      messagesDelete.error.message,
    );
  }

  if (threadDelete.error) {
    throw buildStateError(500, 'communications_thread_purge_failed', threadDelete.error.message);
  }

  return {
    thread_id: threadId,
    tenant_id: tenantId,
    purged_at: new Date().toISOString(),
    purged_by: user?.email || user?.id || 'unknown',
  };
}

export default {
  updateCommunicationsThreadStatus,
  purgeCommunicationsThread,
};
