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

export async function getCommunicationThreadMessages({ tenantId, threadId, limit = 100, offset = 0 }) {
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

export default {
  listCommunicationThreads,
  getCommunicationThreadMessages,
};
