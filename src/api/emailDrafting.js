/**
 * Email Drafting API helpers — Task and Notes driven
 */
import { getBackendUrl } from '@/api/backendUrl';

async function getHeaders(explicitTenantId) {
  const headers = { 'Content-Type': 'application/json' };
  const tenantId =
    explicitTenantId ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('selected_tenant_id') || localStorage.getItem('tenant_id')
      : '');
  if (tenantId) headers['x-tenant-id'] = tenantId;

  const { getAuthorizationHeader } = await import('@/api/functions');
  const auth = await getAuthorizationHeader();
  if (auth) headers.Authorization = auth;
  return headers;
}

export async function draftFromTask({
  tenantId,
  activityId,
  prompt,
  subject,
  requireApproval = true,
  conversationId,
}) {
  const resp = await fetch(`${getBackendUrl()}/api/ai/draft-from-task`, {
    method: 'POST',
    headers: await getHeaders(tenantId),
    credentials: 'include',
    body: JSON.stringify({
      tenant_id: tenantId,
      activity_id: activityId,
      prompt,
      subject,
      require_approval: requireApproval,
      conversation_id: conversationId,
    }),
  });
  const json = await resp.json();
  return { status: resp.status, data: json };
}

export async function draftFromNotes({
  tenantId,
  noteIds,
  entityType,
  entityId,
  prompt,
  subject,
  requireApproval = true,
  conversationId,
}) {
  const resp = await fetch(`${getBackendUrl()}/api/ai/draft-from-notes`, {
    method: 'POST',
    headers: await getHeaders(tenantId),
    credentials: 'include',
    body: JSON.stringify({
      tenant_id: tenantId,
      note_ids: noteIds,
      entity_type: entityType,
      entity_id: entityId,
      prompt,
      subject,
      require_approval: requireApproval,
      conversation_id: conversationId,
    }),
  });
  const json = await resp.json();
  return { status: resp.status, data: json };
}
