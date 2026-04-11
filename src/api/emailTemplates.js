/**
 * Email Template API helpers
 */
import { getBackendUrl } from '@/api/backendUrl';

function resolveTenantId(tenantIdOverride) {
  if (tenantIdOverride) return String(tenantIdOverride);
  if (typeof window !== 'undefined') {
    try {
      const urlTenant = new URL(window.location.href).searchParams.get('tenant');
      if (urlTenant) return urlTenant;
    } catch {
      // ignore URL parse errors in non-browser contexts
    }
  }

  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('selected_tenant_id') || localStorage.getItem('tenant_id') || '';
  }

  return '';
}

async function getHeaders(tenantIdOverride) {
  const headers = { 'Content-Type': 'application/json' };
  const tenantId = resolveTenantId(tenantIdOverride);
  if (tenantId) headers['x-tenant-id'] = tenantId;

  // Dynamic import to avoid circular dependency
  const { getAuthorizationHeader } = await import('@/api/functions');
  const auth = await getAuthorizationHeader();
  if (auth) headers.Authorization = auth;
  return headers;
}

export async function fetchEmailTemplates({ category, entityType, tenantId } = {}) {
  const url = new URL(`${getBackendUrl()}/api/v2/email-templates`);
  if (category) url.searchParams.set('category', category);
  if (entityType) url.searchParams.set('entity_type', entityType);

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: await getHeaders(tenantId),
    credentials: 'include',
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to fetch templates');
  return json.data || [];
}

export async function fetchEmailTemplate(id) {
  const resp = await fetch(`${getBackendUrl()}/api/v2/email-templates/${id}`, {
    method: 'GET',
    headers: await getHeaders(),
    credentials: 'include',
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to fetch template');
  return json.data;
}

export async function createEmailTemplate(payload) {
  const resp = await fetch(`${getBackendUrl()}/api/v2/email-templates`, {
    method: 'POST',
    headers: await getHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to create template');
  return json.data;
}

export async function updateEmailTemplate(id, payload) {
  const resp = await fetch(`${getBackendUrl()}/api/v2/email-templates/${id}`, {
    method: 'PUT',
    headers: await getHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to update template');
  return json.data;
}

export async function deleteEmailTemplate(id) {
  const resp = await fetch(`${getBackendUrl()}/api/v2/email-templates/${id}`, {
    method: 'DELETE',
    headers: await getHeaders(),
    credentials: 'include',
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to delete template');
  return json;
}

export async function draftFromTemplate({
  tenantId,
  templateId,
  entityType,
  entityId,
  variables,
  additionalPrompt,
  requireApproval = true,
  conversationId,
}) {
  const resp = await fetch(`${getBackendUrl()}/api/ai/draft-from-template`, {
    method: 'POST',
    headers: await getHeaders(tenantId),
    credentials: 'include',
    body: JSON.stringify({
      tenant_id: tenantId,
      template_id: templateId,
      entity_type: entityType,
      entity_id: entityId,
      variables: variables || {},
      additional_prompt: additionalPrompt,
      require_approval: requireApproval,
      conversation_id: conversationId,
    }),
  });
  const json = await resp.json();
  return { status: resp.status, data: json };
}
