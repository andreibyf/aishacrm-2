import { getSupabaseClient } from '../lib/supabase-db.js';

const ALLOWED_THREAD_STATUSES = new Set(['unread', 'open', 'closed', 'archived']);
const ALLOWED_LEAD_CAPTURE_STATUSES = new Set([
  'pending_review',
  'duplicate',
  'promoted',
  'dismissed',
]);

function buildStateError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanNullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function deriveLeadName({ senderName, senderEmail }) {
  const normalizedName = cleanNullableString(senderName);
  if (normalizedName) {
    const parts = normalizedName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: 'Unknown' };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  const localPart = cleanNullableString(senderEmail)?.split('@')[0] || 'Unknown';
  const sanitized = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sanitized.length === 0) {
    return { firstName: 'Unknown', lastName: 'Unknown' };
  }

  if (sanitized.length === 1) {
    return { firstName: sanitized[0], lastName: 'Unknown' };
  }

  return {
    firstName: sanitized[0],
    lastName: sanitized.slice(1).join(' '),
  };
}

function buildLeadCapturePromotionMetadata(queueItem, overrides, user) {
  const nowIso = new Date().toISOString();
  const providedMetadata = asObject(overrides.metadata);
  const provenance = {
    source: 'communications_lead_capture',
    queue_item_id: queueItem.id,
    thread_id: queueItem.thread_id || null,
    message_id: queueItem.message_id || null,
    mailbox_id: queueItem.mailbox_id || null,
    mailbox_address: queueItem.mailbox_address || null,
    sender_email: queueItem.sender_email || null,
    sender_name: queueItem.sender_name || null,
    promoted_by: user?.email || user?.id || 'unknown',
    promoted_at: nowIso,
  };

  return {
    ...providedMetadata,
    communications_lead_capture: {
      ...asObject(providedMetadata.communications_lead_capture),
      ...provenance,
    },
  };
}

function buildPromotedLeadPayload(queueItem, overrides, user) {
  const derivedName = deriveLeadName({
    senderName: overrides.sender_name ?? queueItem.sender_name,
    senderEmail: overrides.email ?? queueItem.sender_email,
  });

  return {
    first_name: cleanNullableString(overrides.first_name) || derivedName.firstName,
    last_name: cleanNullableString(overrides.last_name) || derivedName.lastName,
    email: cleanNullableString(overrides.email) || cleanNullableString(queueItem.sender_email),
    phone: cleanNullableString(overrides.phone),
    company:
      cleanNullableString(overrides.company) ||
      cleanNullableString(queueItem.metadata?.proposed_company) ||
      null,
    job_title: cleanNullableString(overrides.job_title),
    source: cleanNullableString(overrides.source) || 'email',
    status: cleanNullableString(overrides.status) || 'new',
    assigned_to:
      overrides.assigned_to !== undefined ? cleanNullableString(overrides.assigned_to) : null,
    assigned_to_name:
      overrides.assigned_to_name !== undefined
        ? cleanNullableString(overrides.assigned_to_name)
        : null,
    metadata: buildLeadCapturePromotionMetadata(queueItem, overrides, user),
  };
}

function buildLeadCaptureMetadata(
  existingMetadata,
  { status, user, note, promotedEntityType, promotedEntityId },
) {
  const updatedAt = new Date().toISOString();
  const nextMetadata = {
    ...asObject(existingMetadata),
    review: {
      ...(asObject(existingMetadata).review || {}),
      status,
      updated_at: updatedAt,
      updated_by: user?.email || user?.id || 'unknown',
    },
  };

  if (note) {
    nextMetadata.review.note = note;
  }

  if (status === 'promoted' && promotedEntityType && promotedEntityId) {
    nextMetadata.promotion = {
      entity_type: promotedEntityType,
      entity_id: promotedEntityId,
      promoted_at: updatedAt,
      promoted_by: user?.email || user?.id || 'unknown',
    };
  }

  return { nextMetadata, updatedAt };
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

export async function updateLeadCaptureQueueStatus(
  { tenantId, queueItemId, status, user, note, promotedEntityType, promotedEntityId },
  { supabase = getSupabaseClient() } = {},
) {
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : null;
  if (!normalizedStatus || !ALLOWED_LEAD_CAPTURE_STATUSES.has(normalizedStatus)) {
    throw buildStateError(
      400,
      'communications_invalid_lead_capture_status',
      'status must be one of: pending_review, duplicate, promoted, dismissed',
    );
  }

  const existing = await supabase
    .from('communications_lead_capture_queue')
    .select(
      'id, tenant_id, thread_id, message_id, mailbox_id, mailbox_address, sender_email, sender_name, sender_domain, subject, normalized_subject, status, reason, metadata, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', queueItemId)
    .maybeSingle();

  if (existing.error) {
    throw buildStateError(500, 'communications_lead_capture_lookup_failed', existing.error.message);
  }

  if (!existing.data) {
    throw buildStateError(
      404,
      'communications_lead_capture_not_found',
      'Lead capture queue item not found',
    );
  }

  const { nextMetadata, updatedAt } = buildLeadCaptureMetadata(existing.data.metadata, {
    status: normalizedStatus,
    user,
    note,
    promotedEntityType,
    promotedEntityId,
  });

  const updated = await supabase
    .from('communications_lead_capture_queue')
    .update({
      status: normalizedStatus,
      metadata: nextMetadata,
      updated_at: updatedAt,
    })
    .eq('tenant_id', tenantId)
    .eq('id', queueItemId)
    .select(
      'id, tenant_id, thread_id, message_id, mailbox_id, mailbox_address, sender_email, sender_name, sender_domain, subject, normalized_subject, status, reason, metadata, created_at, updated_at',
    )
    .single();

  if (updated.error) {
    throw buildStateError(500, 'communications_lead_capture_update_failed', updated.error.message);
  }

  return {
    queue_item: updated.data,
  };
}

export async function promoteLeadCaptureQueueItem(
  { tenantId, queueItemId, user, lead = {} },
  { supabase = getSupabaseClient() } = {},
) {
  const existing = await supabase
    .from('communications_lead_capture_queue')
    .select(
      'id, tenant_id, thread_id, message_id, mailbox_id, mailbox_address, sender_email, sender_name, sender_domain, subject, normalized_subject, status, reason, metadata, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', queueItemId)
    .maybeSingle();

  if (existing.error) {
    throw buildStateError(500, 'communications_lead_capture_lookup_failed', existing.error.message);
  }

  if (!existing.data) {
    throw buildStateError(
      404,
      'communications_lead_capture_not_found',
      'Lead capture queue item not found',
    );
  }

  const promotionMetadata = asObject(existing.data.metadata).promotion;
  if (
    existing.data.status === 'promoted' &&
    promotionMetadata?.entity_type === 'lead' &&
    promotionMetadata?.entity_id
  ) {
    const leadRecord = await supabase
      .from('leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', promotionMetadata.entity_id)
      .maybeSingle();

    if (leadRecord.error) {
      throw buildStateError(
        500,
        'communications_lead_capture_promoted_lookup_failed',
        leadRecord.error.message,
      );
    }

    return {
      queue_item: existing.data,
      lead: leadRecord.data,
      already_promoted: true,
    };
  }

  const leadPayload = buildPromotedLeadPayload(existing.data, lead, user);
  if (!leadPayload.first_name || !leadPayload.last_name) {
    throw buildStateError(
      400,
      'communications_lead_capture_invalid_name',
      'Lead promotion requires a resolvable first and last name',
    );
  }

  const createdLeadId = await supabase.rpc('leads_insert_definer', {
    p_tenant_id: tenantId,
    p_first_name: leadPayload.first_name,
    p_last_name: leadPayload.last_name,
    p_email: leadPayload.email || null,
    p_phone: leadPayload.phone || null,
    p_company: leadPayload.company || null,
    p_job_title: leadPayload.job_title || null,
    p_source: leadPayload.source || null,
    p_status: leadPayload.status || 'new',
    p_lead_type: 'b2b',
    p_assigned_to: leadPayload.assigned_to || null,
    p_person_id: null,
    p_score: null,
    p_score_reason: null,
    p_ai_action: 'none',
    p_qualification_status: 'unqualified',
    p_conversion_probability: null,
    p_next_action: null,
    p_address_1: null,
    p_address_2: null,
    p_city: null,
    p_state: null,
    p_zip: null,
    p_country: null,
    p_created_date: null,
    p_last_contacted: null,
    p_last_synced: null,
    p_metadata: leadPayload.metadata || {},
    p_activity_metadata: {},
    p_tags: [],
    p_is_test_data: false,
    p_do_not_call: false,
    p_do_not_text: false,
    p_estimated_value: null,
    p_unique_id: null,
    p_legacy_id: null,
    p_source_id: null,
  });

  if (createdLeadId.error) {
    throw buildStateError(
      500,
      'communications_lead_capture_promote_failed',
      createdLeadId.error.message,
    );
  }

  if (!createdLeadId.data) {
    throw buildStateError(
      500,
      'communications_lead_capture_promote_failed',
      'Lead promotion failed - no ID returned',
    );
  }

  const leadId = createdLeadId.data;

  const linkRows = [
    existing.data.thread_id
      ? {
          tenant_id: tenantId,
          thread_id: existing.data.thread_id,
          message_id: null,
          entity_type: 'lead',
          entity_id: leadId,
          link_scope: 'thread',
          source: 'communications_lead_capture',
          confidence: 1,
          metadata: {
            queue_item_id: existing.data.id,
            promoted_by: user?.email || user?.id || 'unknown',
          },
        }
      : null,
    existing.data.message_id
      ? {
          tenant_id: tenantId,
          thread_id: null,
          message_id: existing.data.message_id,
          entity_type: 'lead',
          entity_id: leadId,
          link_scope: 'message',
          source: 'communications_lead_capture',
          confidence: 1,
          metadata: {
            queue_item_id: existing.data.id,
            promoted_by: user?.email || user?.id || 'unknown',
          },
        }
      : null,
  ].filter(Boolean);

  if (linkRows.length > 0) {
    for (const row of linkRows) {
      const linkInsert = await supabase.from('communications_entity_links').insert(row);

      if (linkInsert.error && linkInsert.error.code !== '23505') {
        throw buildStateError(
          500,
          'communications_lead_capture_link_failed',
          linkInsert.error.message,
        );
      }
    }
  }

  const statusUpdate = await updateLeadCaptureQueueStatus(
    {
      tenantId,
      queueItemId,
      status: 'promoted',
      user,
      note: cleanNullableString(lead.note),
      promotedEntityType: 'lead',
      promotedEntityId: leadId,
    },
    { supabase },
  );

  const createdLead = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', leadId)
    .single();

  if (createdLead.error) {
    throw buildStateError(
      500,
      'communications_lead_capture_promoted_lookup_failed',
      createdLead.error.message,
    );
  }

  return {
    queue_item: statusUpdate.queue_item,
    lead: createdLead.data,
    already_promoted: false,
  };
}

export default {
  updateCommunicationsThreadStatus,
  purgeCommunicationsThread,
  updateLeadCaptureQueueStatus,
  promoteLeadCaptureQueueItem,
};
