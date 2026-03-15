import { getSupabaseClient } from '../lib/supabase-db.js';

let eventSupabaseFactory = () => getSupabaseClient();

function buildEventError(code, message, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeMetadata(current, patch) {
  return {
    ...asObject(current),
    ...patch,
  };
}

function applyNestedMetadata(current, key, patch) {
  return {
    ...asObject(current),
    [key]: {
      ...asObject(asObject(current)[key]),
      ...patch,
    },
  };
}

function appendEventLog(current, entry, limit = 20) {
  if (!entry || typeof entry !== 'object') {
    return Array.isArray(current) ? current : [];
  }

  const existing = Array.isArray(current) ? current.filter(Boolean) : [];
  const next = [...existing, entry];
  return next.slice(-limit);
}

function mapDeliveryStateToActivityStatus(state, currentStatus) {
  const normalized = String(state || '').toLowerCase();
  if (['failed', 'bounced', 'rejected'].includes(normalized)) return 'failed';
  if (['delivered', 'sent', 'opened', 'clicked'].includes(normalized)) return 'sent';
  return currentStatus || 'queued';
}

function upsertMeetingReplyEntry(existingReplies, attendeeEmail, replyEntry) {
  const normalizedAttendee = String(attendeeEmail || '')
    .trim()
    .toLowerCase();
  const replies = Array.isArray(existingReplies) ? [...existingReplies] : [];
  const nextEntry = {
    attendee_email: normalizedAttendee || null,
    ...replyEntry,
  };

  const existingIndex = replies.findIndex((entry) => {
    const email = String(entry?.attendee_email || '')
      .trim()
      .toLowerCase();
    if (normalizedAttendee && email) {
      return email === normalizedAttendee;
    }
    return entry?.invite_id && replyEntry.invite_id && entry.invite_id === replyEntry.invite_id;
  });

  if (existingIndex >= 0) {
    replies[existingIndex] = {
      ...asObject(replies[existingIndex]),
      ...nextEntry,
    };
  } else {
    replies.push(nextEntry);
  }

  return replies;
}

async function resolveActivityForOutboundReconcile(supabase, tenantId, payload) {
  if (payload.activity_id) {
    const result = await supabase
      .from('activities')
      .select('id, tenant_id, status, metadata')
      .eq('tenant_id', tenantId)
      .eq('id', payload.activity_id)
      .maybeSingle();
    if (result.error) {
      throw buildEventError('communications_reconcile_lookup_failed', result.error.message);
    }
    return result.data;
  }

  const result = await supabase
    .from('activities')
    .select('id, tenant_id, status, metadata')
    .eq('tenant_id', tenantId)
    .eq('type', 'email')
    .eq('metadata->delivery->>messageId', payload.outbound_message_id)
    .maybeSingle();

  if (result.error) {
    throw buildEventError('communications_reconcile_lookup_failed', result.error.message);
  }

  return result.data;
}

async function updateThreadMetadata(supabase, tenantId, threadId, patch, eventEntry = null) {
  if (!threadId) return null;

  const existing = await supabase
    .from('communications_threads')
    .select('id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', threadId)
    .maybeSingle();

  if (existing.error) {
    throw buildEventError('communications_thread_update_failed', existing.error.message);
  }
  if (!existing.data) return null;

  const nextMetadata = mergeMetadata(existing.data.metadata, patch);
  if (eventEntry) {
    nextMetadata.event_log = appendEventLog(nextMetadata.event_log, eventEntry);
  }
  const updated = await supabase
    .from('communications_threads')
    .update({
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', threadId)
    .select('id, metadata')
    .single();

  if (updated.error) {
    throw buildEventError('communications_thread_update_failed', updated.error.message);
  }

  return updated.data;
}

async function updateMessageMetadataById(supabase, tenantId, messageId, patch, eventEntry = null) {
  if (!messageId) return null;

  const existing = await supabase
    .from('communications_messages')
    .select('id, thread_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', messageId)
    .maybeSingle();

  if (existing.error) {
    throw buildEventError('communications_message_update_failed', existing.error.message);
  }
  if (!existing.data) return null;

  const nextMetadata = mergeMetadata(existing.data.metadata, patch);
  if (eventEntry) {
    nextMetadata.event_log = appendEventLog(nextMetadata.event_log, eventEntry);
  }
  const updated = await supabase
    .from('communications_messages')
    .update({
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', messageId)
    .select('id, thread_id, metadata')
    .single();

  if (updated.error) {
    throw buildEventError('communications_message_update_failed', updated.error.message);
  }

  return updated.data;
}

async function resolveActivityForMeetingReply(supabase, tenantId, payload) {
  if (payload.activity_id) {
    const result = await supabase
      .from('activities')
      .select('id, tenant_id, type, status, metadata')
      .eq('tenant_id', tenantId)
      .eq('id', payload.activity_id)
      .eq('type', 'meeting')
      .maybeSingle();

    if (result.error) {
      throw buildEventError('communications_meeting_activity_lookup_failed', result.error.message);
    }

    return result.data;
  }

  if (payload.invite_id) {
    const result = await supabase
      .from('activities')
      .select('id, tenant_id, type, status, metadata')
      .eq('tenant_id', tenantId)
      .eq('type', 'meeting')
      .eq('metadata->meeting->>invite_id', payload.invite_id)
      .maybeSingle();

    if (result.error) {
      throw buildEventError('communications_meeting_activity_lookup_failed', result.error.message);
    }

    if (result.data) {
      return result.data;
    }
  }

  if (payload.thread_id) {
    const result = await supabase
      .from('activities')
      .select('id, tenant_id, type, status, metadata')
      .eq('tenant_id', tenantId)
      .eq('type', 'meeting')
      .eq('metadata->communications->>thread_id', payload.thread_id)
      .maybeSingle();

    if (result.error) {
      throw buildEventError('communications_meeting_activity_lookup_failed', result.error.message);
    }

    return result.data;
  }

  return null;
}

async function updateMeetingActivityReplyState(
  supabase,
  tenantId,
  activity,
  meetingPatch,
  payload,
  now,
) {
  if (!activity?.id) return null;

  const currentMetadata = asObject(activity.metadata);
  const currentMeeting = asObject(currentMetadata.meeting);
  const nextReplies = upsertMeetingReplyEntry(currentMeeting.replies, payload.attendee_email, {
    invite_id: payload.invite_id || currentMeeting.invite_id || null,
    reply_state: meetingPatch.reply_state,
    reply_message: meetingPatch.reply_message,
    processed_at: now,
  });

  const nextMetadata = {
    ...currentMetadata,
    meeting: {
      ...currentMeeting,
      invite_id: payload.invite_id || currentMeeting.invite_id || null,
      attendee_email: payload.attendee_email || currentMeeting.attendee_email || null,
      reply_state: meetingPatch.reply_state,
      reply_message: meetingPatch.reply_message,
      processed_at: now,
      replies: nextReplies,
    },
    communications: {
      ...asObject(currentMetadata.communications),
      thread_id: payload.thread_id || currentMetadata.communications?.thread_id || null,
    },
  };

  const updated = await supabase
    .from('activities')
    .update({
      metadata: nextMetadata,
      updated_at: now,
    })
    .eq('tenant_id', tenantId)
    .eq('id', activity.id)
    .select('id, tenant_id, type, status, metadata')
    .single();

  if (updated.error) {
    throw buildEventError('communications_meeting_activity_update_failed', updated.error.message);
  }

  return updated.data;
}

export async function reconcileOutboundDeliveryEvent(
  request,
  { supabase = eventSupabaseFactory() } = {},
) {
  const tenantId = request.tenant_id;
  const payload = request.payload || {};
  const now = new Date().toISOString();
  const activity = await resolveActivityForOutboundReconcile(supabase, tenantId, payload);

  if (!activity) {
    return {
      ok: true,
      status: 'accepted',
      tenant_id: tenantId,
      trace_id: request.traceId || null,
      result: {
        outbound_message_id: payload.outbound_message_id,
        delivery_state: payload.delivery_state,
        processing_status: 'ignored',
        reason: 'activity_not_found',
        reconciled_at: now,
      },
    };
  }

  const communicationsMeta = asObject(activity.metadata?.communications);
  const deliveryPatch = {
    provider_event_id: payload.provider_event_id || null,
    state: payload.delivery_state,
    reason: payload.delivery_reason || null,
    reconciled_at: now,
    last_event_at: payload.event_occurred_at || request.occurred_at,
  };
  const eventEntry = {
    type: 'delivery_reconciled',
    occurred_at: now,
    actor: request.source_service || 'communications-service',
    delivery_state: payload.delivery_state,
    provider_event_id: payload.provider_event_id || null,
    reason: payload.delivery_reason || null,
  };

  const nextActivityMetadata = applyNestedMetadata(activity.metadata, 'delivery', deliveryPatch);
  const updatedActivity = await supabase
    .from('activities')
    .update({
      status: mapDeliveryStateToActivityStatus(payload.delivery_state, activity.status),
      metadata: nextActivityMetadata,
      updated_at: now,
    })
    .eq('tenant_id', tenantId)
    .eq('id', activity.id)
    .select('id, status, metadata')
    .single();

  if (updatedActivity.error) {
    throw buildEventError('communications_reconcile_update_failed', updatedActivity.error.message);
  }

  const threadId = payload.thread_id || communicationsMeta.thread_id || null;
  const messageId = payload.message_id || communicationsMeta.stored_message_id || null;

  await updateThreadMetadata(
    supabase,
    tenantId,
    threadId,
    {
      delivery: {
        state: payload.delivery_state,
        reconciled_at: now,
        provider_event_id: payload.provider_event_id || null,
      },
    },
    eventEntry,
  );

  await updateMessageMetadataById(
    supabase,
    tenantId,
    messageId,
    {
      delivery: {
        state: payload.delivery_state,
        reconciled_at: now,
        provider_event_id: payload.provider_event_id || null,
      },
    },
    eventEntry,
  );

  return {
    ok: true,
    status: 'accepted',
    tenant_id: tenantId,
    trace_id: request.traceId || null,
    result: {
      activity_id: activity.id,
      thread_id: threadId,
      message_id: messageId,
      outbound_message_id: payload.outbound_message_id,
      delivery_state: payload.delivery_state,
      processing_status: 'reconciled',
      reconciled_at: now,
    },
  };
}

export async function replayCommunicationsThread(
  request,
  { supabase = eventSupabaseFactory() } = {},
) {
  const tenantId = request.tenant_id;
  const payload = request.payload || {};
  const now = new Date().toISOString();

  const updatedThread = await updateThreadMetadata(
    supabase,
    tenantId,
    payload.thread_id,
    {
      replay: {
        replay_job_id: payload.replay_job_id,
        replay_reason: payload.replay_reason,
        original_event_type: payload.original_event_type,
        requested_at: now,
        requested_by: request.user?.email || request.source_service || 'internal-service',
      },
    },
    {
      type: 'thread_replay_requested',
      occurred_at: now,
      actor: request.user?.email || request.source_service || 'internal-service',
      replay_job_id: payload.replay_job_id,
      replay_reason: payload.replay_reason,
      original_event_type: payload.original_event_type,
    },
  );

  if (!updatedThread) {
    throw buildEventError('communications_thread_not_found', 'Communication thread not found', 404);
  }

  return {
    ok: true,
    status: 'accepted',
    tenant_id: tenantId,
    trace_id: request.traceId || null,
    result: {
      thread_id: payload.thread_id,
      replay_job_id: payload.replay_job_id,
      replay_reason: payload.replay_reason,
      processing_status: 'replay_requested',
      requested_at: now,
    },
  };
}

export async function processSchedulingReplyEvent(
  request,
  { supabase = eventSupabaseFactory() } = {},
) {
  const tenantId = request.tenant_id;
  const payload = request.payload || {};
  const now = new Date().toISOString();

  const replyState = payload.reply_state_hint || (payload.reply_message ? 'replied' : 'unknown');
  const meetingPatch = {
    invite_id: payload.invite_id,
    attendee_email: payload.attendee_email,
    reply_state: replyState,
    reply_message: payload.reply_message || null,
    processed_at: now,
  };
  const eventEntry = {
    type: 'meeting_reply_processed',
    occurred_at: now,
    actor: request.source_service || 'communications-service',
    invite_id: payload.invite_id || null,
    attendee_email: payload.attendee_email || null,
    reply_state: replyState,
    review_required: false,
  };
  const activity = await resolveActivityForMeetingReply(supabase, tenantId, payload);
  const updatedActivity = await updateMeetingActivityReplyState(
    supabase,
    tenantId,
    activity,
    meetingPatch,
    payload,
    now,
  );

  const updatedThread = await updateThreadMetadata(
    supabase,
    tenantId,
    payload.thread_id,
    {
      meeting: {
        ...meetingPatch,
        activity_id: updatedActivity?.id || activity?.id || null,
        review_required: !updatedActivity,
      },
    },
    {
      ...eventEntry,
      review_required: !updatedActivity,
      activity_id: updatedActivity?.id || activity?.id || null,
    },
  );

  if (!updatedThread) {
    throw buildEventError('communications_thread_not_found', 'Communication thread not found', 404);
  }

  const threadLinks = await supabase
    .from('communications_messages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('thread_id', payload.thread_id)
    .order('received_at', { ascending: false })
    .limit(1);

  if (threadLinks.error) {
    throw buildEventError('communications_message_lookup_failed', threadLinks.error.message);
  }

  const latestMessageId = threadLinks.data?.[0]?.id || null;
  await updateMessageMetadataById(
    supabase,
    tenantId,
    latestMessageId,
    {
      meeting: {
        ...meetingPatch,
        activity_id: updatedActivity?.id || activity?.id || null,
        review_required: !updatedActivity,
      },
    },
    {
      ...eventEntry,
      review_required: !updatedActivity,
      activity_id: updatedActivity?.id || activity?.id || null,
    },
  );

  return {
    ok: true,
    status: 'accepted',
    tenant_id: tenantId,
    trace_id: request.traceId || null,
    result: {
      thread_id: payload.thread_id,
      activity_id: updatedActivity?.id || activity?.id || null,
      invite_id: payload.invite_id,
      attendee_email: payload.attendee_email,
      reply_state: replyState,
      processing_status: updatedActivity
        ? 'meeting_reply_processed'
        : 'meeting_reply_review_required',
      processed_at: now,
    },
  };
}

export function setCommunicationsEventDependenciesForTests(overrides = null) {
  if (overrides === null) {
    eventSupabaseFactory = () => getSupabaseClient();
    return;
  }

  if (typeof overrides.getSupabaseClient === 'function') {
    eventSupabaseFactory = overrides.getSupabaseClient;
  }
}

export default {
  reconcileOutboundDeliveryEvent,
  replayCommunicationsThread,
  processSchedulingReplyEvent,
  setCommunicationsEventDependenciesForTests,
};
