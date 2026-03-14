import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import logger from '../lib/logger.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { resolveCommunicationsProviderConnection } from '../lib/communications/providerConnectionResolver.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DEFAULT_INTERNAL_USER = Object.freeze({
  id: 'communications-worker',
  email: 'communications-worker@system',
  role: 'employee',
});

function getBackendUrl() {
  return process.env.CRM_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:4001';
}

function getStoredMailboxCursor(integration = {}) {
  return integration?.metadata?.communications?.sync?.cursor || null;
}

function buildInternalServiceToken(job = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error('JWT_SECRET is required to call internal communications routes');
    error.code = 'communications_internal_auth_unavailable';
    throw error;
  }

  return jwt.sign(
    {
      sub: job.user?.id || DEFAULT_INTERNAL_USER.id,
      email: job.user?.email || DEFAULT_INTERNAL_USER.email,
      tenant_id: job?.tenant_id || null,
      internal: true,
      user_role: job.user?.role || DEFAULT_INTERNAL_USER.role,
    },
    secret,
    { expiresIn: '5m' },
  );
}

export function buildInboundCommunicationsEvent(job, message) {
  const receivedAt = message?.received_at || new Date().toISOString();
  return {
    tenant_id: job?.tenant_id || null,
    mailbox_id: job?.mailbox_id || null,
    mailbox_address: job?.mailbox_address || null,
    source_service: 'communications_worker',
    event_type: 'email.inbound.received',
    occurred_at: receivedAt,
    payload: {
      message_id: message?.message_id || '',
      subject: message?.subject || '(no subject)',
      received_at: receivedAt,
      from: message?.from || { email: '' },
      to: Array.isArray(message?.to) ? message.to : [],
      cc: Array.isArray(message?.cc) ? message.cc : [],
      bcc: Array.isArray(message?.bcc) ? message.bcc : [],
      text_body: message?.text_body || '',
      html_body: message?.html_body || '',
      raw_source: message?.raw_source || '',
      thread_hint: message?.in_reply_to || message?.thread_hint || '',
      entity_refs: Array.isArray(message?.entity_refs) ? message.entity_refs : [],
      provider_cursor: message?.provider_cursor || null,
      provider_metadata: {
        uid: message?.uid || null,
        flags: Array.isArray(message?.flags) ? message.flags : [],
      },
    },
    meta: {
      trace_id: `communications-worker:${job?.tenant_id || 'unknown'}:${message?.message_id || 'unknown'}`,
      attempt: Number.isInteger(job?.attempt) ? job.attempt : 1,
    },
  };
}

export async function postInboundCommunicationsEvent(event, { fetchImpl = fetch, internalToken, backendUrl } = {}) {
  const response = await fetchImpl(`${backendUrl}/api/internal/communications/inbound`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${internalToken}`,
      'Content-Type': 'application/json',
      'X-AISHA-IDEMPOTENCY-KEY': event.payload.message_id,
      'X-AISHA-TRACE-ID': event.meta?.trace_id || '',
    },
    body: JSON.stringify(event),
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (_error) {
    responseBody = null;
  }

  if (!response.ok) {
    const error = new Error(
      responseBody?.error?.message || `Internal communications ingestion failed with status ${response.status}`,
    );
    error.code = responseBody?.error?.code || 'communications_internal_ingest_failed';
    error.statusCode = response.status;
    error.details = responseBody;
    throw error;
  }

  return responseBody;
}

export async function persistMailboxCursor(
  { tenantId, integrationId, metadata, cursor },
  { supabase = getSupabaseClient() } = {},
) {
  const nextMetadata = {
    ...(metadata || {}),
    communications: {
      ...(metadata?.communications || {}),
      sync: {
        ...(metadata?.communications?.sync || {}),
        cursor,
        updated_at: new Date().toISOString(),
      },
    },
  };

  const { error } = await supabase
    .from('tenant_integrations')
    .update({ metadata: nextMetadata })
    .eq('tenant_id', tenantId)
    .eq('id', integrationId);

  if (error) {
    const persistError = new Error(`Failed to persist communications mailbox cursor: ${error.message}`);
    persistError.code = 'communications_cursor_persist_failed';
    throw persistError;
  }

  return nextMetadata;
}

export async function resolveMailboxConnectionForInboundJob(
  job,
  deps = {},
) {
  const tenantId = job?.tenant_id || null;
  const mailboxId = job?.mailbox_id || null;
  const mailboxAddress = job?.mailbox_address || null;

  const resolver = deps.resolveCommunicationsProviderConnection || resolveCommunicationsProviderConnection;
  const resolved = await resolver(
    { tenantId, mailboxId, mailboxAddress },
    deps,
  );

  if (!resolved) {
    const error = new Error('No active communications provider connection matched the inbound mailbox');
    error.code = 'communications_provider_not_found';
    throw error;
  }

  logger.info(
    {
      tenant_id: tenantId,
      mailbox_id: mailboxId,
      mailbox_address: mailboxAddress,
      integration_id: resolved.integration?.id || null,
      provider_type: resolved.connection?.config?.provider_type || null,
      provider_name: resolved.connection?.config?.provider_name || null,
    },
    '[communications-worker] resolved mailbox connection from tenant_integrations',
  );

  return resolved;
}

export async function processInboundMailboxJob(job, deps = {}) {
  const resolved = await resolveMailboxConnectionForInboundJob(job, deps);
  const storedCursor = getStoredMailboxCursor(resolved.integration);
  const backendUrl = deps.backendUrl || getBackendUrl();
  const internalToken = deps.internalToken || buildInternalServiceToken(job);
  const fetchImpl = deps.fetchImpl || fetch;

  const fetchResult = await resolved.adapter.fetchInboundMessages({
    cursor: storedCursor,
    limit: job?.limit || null,
  });

  const messages = Array.isArray(fetchResult?.messages) ? fetchResult.messages : [];
  const nextCursor = fetchResult?.cursor || storedCursor;

  let processedCount = 0;
  for (const message of messages) {
    const event = buildInboundCommunicationsEvent(
      {
        ...job,
        mailbox_id: job?.mailbox_id || resolved.connection?.config?.mailbox_id,
        mailbox_address: job?.mailbox_address || resolved.connection?.config?.mailbox_address,
      },
      message,
    );

    await postInboundCommunicationsEvent(event, { fetchImpl, internalToken, backendUrl });
    processedCount += 1;
  }

  if (messages.length > 0 && nextCursor) {
    await resolved.adapter.acknowledgeCursor(nextCursor);
    await persistMailboxCursor(
      {
        tenantId: resolved.integration.tenant_id,
        integrationId: resolved.integration.id,
        metadata: resolved.integration.metadata || {},
        cursor: nextCursor,
      },
      deps,
    );
  }

  logger.info(
    {
      tenant_id: resolved.integration.tenant_id,
      integration_id: resolved.integration.id,
      mailbox_id: resolved.connection?.config?.mailbox_id || null,
      mailbox_address: resolved.connection?.config?.mailbox_address || null,
      processed_count: processedCount,
      next_cursor: nextCursor?.value || nextCursor || null,
    },
    '[communications-worker] inbound mailbox job processed',
  );

  return {
    ok: true,
    integration_id: resolved.integration.id,
    mailbox_id: resolved.connection?.config?.mailbox_id || null,
    processed_count: processedCount,
    next_cursor: nextCursor || null,
  };
}

let workerStarted = false;

export function startCommunicationsWorker() {
  if (workerStarted) {
    logger.warn('[communications-worker] worker already started');
    return {
      stop: () => {
        logger.debug('[communications-worker] stop called on already-running worker');
      },
    };
  }

  workerStarted = true;
  logger.info('[communications-worker] starting communications worker scaffold');

  return {
    stop: () => {
      logger.info('[communications-worker] stopping communications worker scaffold');
      workerStarted = false;
    },
  };
}

export default {
  resolveMailboxConnectionForInboundJob,
  processInboundMailboxJob,
  persistMailboxCursor,
  buildInboundCommunicationsEvent,
  postInboundCommunicationsEvent,
  startCommunicationsWorker,
};
