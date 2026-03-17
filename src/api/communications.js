import { getBackendUrl } from '@/api/backendUrl';

const BACKEND_URL = getBackendUrl();

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  return query.toString();
}

async function handleResponse(response, fallbackMessage) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body?.message || fallbackMessage || 'Communications request failed';
    const error = new Error(message);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }

  return body?.data ?? null;
}

export async function listCommunicationThreads({
  tenantId,
  mailboxId,
  entityType,
  entityId,
  deliveryState,
  view,
  status,
  limit = 50,
  offset = 0,
} = {}) {
  const query = buildQuery({
    tenant_id: tenantId,
    mailbox_id: mailboxId,
    entity_type: entityType,
    entity_id: entityId,
    delivery_state: deliveryState,
    view,
    status,
    limit,
    offset,
  });

  const response = await fetch(`${BACKEND_URL}/api/v2/communications/threads?${query}`, {
    credentials: 'include',
  });

  return handleResponse(response, 'Failed to load communication threads');
}

export async function getCommunicationThreadMessages({
  tenantId,
  threadId,
  limit = 100,
  offset = 0,
}) {
  const query = buildQuery({
    tenant_id: tenantId,
    limit,
    offset,
  });

  const response = await fetch(
    `${BACKEND_URL}/api/v2/communications/threads/${threadId}/messages?${query}`,
    {
      credentials: 'include',
    },
  );

  return handleResponse(response, 'Failed to load communication thread');
}

export async function replayCommunicationThread({
  tenantId,
  threadId,
  replayReason = 'operator_requested',
  originalEventType = 'communications.inbound.received',
  mailboxId,
} = {}) {
  const response = await fetch(`${BACKEND_URL}/api/v2/communications/threads/${threadId}/replay`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      mailbox_id: mailboxId,
      replay_reason: replayReason,
      original_event_type: originalEventType,
    }),
  });

  return handleResponse(response, 'Failed to request thread replay');
}

export async function updateCommunicationThreadStatus({ tenantId, threadId, status } = {}) {
  const response = await fetch(`${BACKEND_URL}/api/v2/communications/threads/${threadId}/status`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      status,
    }),
  });

  return handleResponse(response, 'Failed to update communication thread status');
}

export async function generateThreadedAiReplyDraft({
  tenantId,
  threadId,
  prompt,
  subject,
  requireApproval = true,
} = {}) {
  const response = await fetch(
    `${BACKEND_URL}/api/v2/communications/threads/${threadId}/generate-ai-reply`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        prompt,
        subject,
        require_approval: requireApproval,
      }),
    },
  );

  return handleResponse(response, 'Failed to generate threaded AI reply');
}

export async function purgeCommunicationThread({ tenantId, threadId } = {}) {
  const query = buildQuery({
    tenant_id: tenantId,
  });

  const response = await fetch(
    `${BACKEND_URL}/api/v2/communications/threads/${threadId}?${query}`,
    {
      method: 'DELETE',
      credentials: 'include',
    },
  );

  return handleResponse(response, 'Failed to purge communication thread');
}

export async function listLeadCaptureQueue({
  tenantId,
  mailboxId,
  status = 'pending_review',
  limit = 50,
  offset = 0,
} = {}) {
  const query = buildQuery({
    tenant_id: tenantId,
    mailbox_id: mailboxId,
    status,
    limit,
    offset,
  });

  const response = await fetch(`${BACKEND_URL}/api/v2/communications/lead-capture-queue?${query}`, {
    credentials: 'include',
  });

  return handleResponse(response, 'Failed to load lead capture queue');
}

export async function getLeadCaptureQueueItem({ tenantId, queueItemId } = {}) {
  const query = buildQuery({
    tenant_id: tenantId,
  });

  const response = await fetch(
    `${BACKEND_URL}/api/v2/communications/lead-capture-queue/${queueItemId}?${query}`,
    {
      credentials: 'include',
    },
  );

  return handleResponse(response, 'Failed to load lead capture queue item');
}

export async function updateLeadCaptureQueueItemStatus({
  tenantId,
  queueItemId,
  status,
  note,
  promotedEntityType,
  promotedEntityId,
} = {}) {
  const response = await fetch(
    `${BACKEND_URL}/api/v2/communications/lead-capture-queue/${queueItemId}/status`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        status,
        note,
        promoted_entity_type: promotedEntityType,
        promoted_entity_id: promotedEntityId,
      }),
    },
  );

  return handleResponse(response, 'Failed to update lead capture queue item');
}

export async function promoteLeadCaptureQueueItem({ tenantId, queueItemId, lead } = {}) {
  const response = await fetch(
    `${BACKEND_URL}/api/v2/communications/lead-capture-queue/${queueItemId}/promote`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        ...(lead || {}),
      }),
    },
  );

  return handleResponse(response, 'Failed to promote lead capture queue item');
}

export default {
  listCommunicationThreads,
  getCommunicationThreadMessages,
  replayCommunicationThread,
  updateCommunicationThreadStatus,
  generateThreadedAiReplyDraft,
  purgeCommunicationThread,
  listLeadCaptureQueue,
  getLeadCaptureQueueItem,
  updateLeadCaptureQueueItemStatus,
  promoteLeadCaptureQueueItem,
};
