import dotenv from 'dotenv';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import logger from '../lib/logger.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { resolveCommunicationsProviderConnection } from '../lib/communications/providerConnectionResolver.js';
import { buildCommunicationsProviderConnection } from '../lib/communicationsConfig.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DEFAULT_INTERNAL_USER = Object.freeze({
  id: 'communications-worker',
  email: 'communications-worker@system',
  // Agent-level role is required for Braid write operations invoked by inbound orchestration.
  role: 'agent',
});

const HEARTBEAT_PATH =
  process.env.COMMUNICATIONS_WORKER_HEARTBEAT_PATH || '/tmp/communications-worker-heartbeat.json';

function getBackendUrl() {
  return process.env.CRM_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:4001';
}

function getStoredMailboxCursor(integration = {}) {
  return integration?.metadata?.communications?.sync?.cursor || null;
}

function getWorkerPollIntervalMs() {
  const configured = Number.parseInt(process.env.COMMUNICATIONS_WORKER_POLL_INTERVAL_MS, 10);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return 60000;
}

function writeWorkerHeartbeat(extra = {}) {
  const heartbeat = {
    status: 'ok',
    updated_at: new Date().toISOString(),
    pid: process.pid,
    ...extra,
  };

  try {
    fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(heartbeat));
  } catch (error) {
    logger.warn(
      {
        path: HEARTBEAT_PATH,
        error: error?.message || String(error),
      },
      '[communications-worker] failed to write heartbeat',
    );
  }
}

function getMailboxPollIntervalMs(integration = {}) {
  const configured = integration?.config?.inbound?.poll_interval_ms;
  return Number.isInteger(configured) && configured > 0 ? configured : getWorkerPollIntervalMs();
}

function shouldPollMailbox(integration = {}, now = Date.now()) {
  const inboundEnabled = integration?.config?.features?.inbound_enabled !== false;
  if (!inboundEnabled) {
    return false;
  }

  const lastPolledAt = integration?.metadata?.communications?.sync?.last_polled_at;
  if (!lastPolledAt) {
    return true;
  }

  const lastPolledAtMs = Date.parse(lastPolledAt);
  if (Number.isNaN(lastPolledAtMs)) {
    return true;
  }

  return now - lastPolledAtMs >= getMailboxPollIntervalMs(integration);
}

function normalizeCommunicationsIntegration(record = {}) {
  return {
    ...record,
    config: record.config || record.configuration || {},
    api_credentials: record.api_credentials || record.credentials || {},
    metadata: record.metadata || {},
  };
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

export async function postInboundCommunicationsEvent(
  event,
  { fetchImpl = fetch, internalToken, backendUrl } = {},
) {
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
      responseBody?.error?.message ||
        `Internal communications ingestion failed with status ${response.status}`,
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
    const persistError = new Error(
      `Failed to persist communications mailbox cursor: ${error.message}`,
    );
    persistError.code = 'communications_cursor_persist_failed';
    throw persistError;
  }

  return nextMetadata;
}

export async function persistMailboxPollMetadata(
  { tenantId, integrationId, metadata, syncPatch },
  { supabase = getSupabaseClient() } = {},
) {
  const nextMetadata = {
    ...(metadata || {}),
    communications: {
      ...(metadata?.communications || {}),
      sync: {
        ...(metadata?.communications?.sync || {}),
        ...(syncPatch || {}),
      },
    },
  };

  const { error } = await supabase
    .from('tenant_integrations')
    .update({ metadata: nextMetadata })
    .eq('tenant_id', tenantId)
    .eq('id', integrationId);

  if (error) {
    const persistError = new Error(
      `Failed to persist communications mailbox metadata: ${error.message}`,
    );
    persistError.code = 'communications_metadata_persist_failed';
    throw persistError;
  }

  return nextMetadata;
}

export async function listActiveInboundMailboxIntegrations(
  { now = Date.now() } = {},
  { supabase = getSupabaseClient() } = {},
) {
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select(
      'id, tenant_id, integration_type, integration_name, api_credentials, config, is_active, metadata',
    )
    .eq('integration_type', 'communications_provider')
    .eq('is_active', true);

  if (error) {
    const lookupError = new Error(
      `Failed to load active communications mailbox integrations: ${error.message}`,
    );
    lookupError.code = 'communications_provider_lookup_failed';
    throw lookupError;
  }

  return (data || []).map(normalizeCommunicationsIntegration).filter((integration) => {
    try {
      buildCommunicationsProviderConnection(integration);
      return shouldPollMailbox(integration, now);
    } catch (error) {
      logger.warn(
        {
          integration_id: integration?.id || null,
          tenant_id: integration?.tenant_id || null,
          error: error?.message || String(error),
        },
        '[communications-worker] skipping invalid communications provider integration',
      );
      return false;
    }
  });
}

export async function resolveMailboxConnectionForInboundJob(job, deps = {}) {
  const tenantId = job?.tenant_id || null;
  const mailboxId = job?.mailbox_id || null;
  const mailboxAddress = job?.mailbox_address || null;

  const resolver =
    deps.resolveCommunicationsProviderConnection || resolveCommunicationsProviderConnection;
  const resolved = await resolver({ tenantId, mailboxId, mailboxAddress }, deps);

  if (!resolved) {
    const error = new Error(
      'No active communications provider connection matched the inbound mailbox',
    );
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

export async function processCommunicationsPollCycle(deps = {}) {
  const now = deps.now || Date.now();
  const integrations = await listActiveInboundMailboxIntegrations({ now }, deps);
  const results = [];

  for (const integration of integrations) {
    const mailboxId = integration?.config?.mailbox_id || null;
    const mailboxAddress = integration?.config?.mailbox_address || null;
    const tenantId = integration?.tenant_id || null;

    try {
      const result = await processInboundMailboxJob(
        {
          tenant_id: tenantId,
          mailbox_id: mailboxId,
          mailbox_address: mailboxAddress,
        },
        deps,
      );

      const polledAt = new Date(now).toISOString();
      await persistMailboxPollMetadata(
        {
          tenantId,
          integrationId: integration.id,
          metadata: integration.metadata || {},
          syncPatch: {
            last_polled_at: polledAt,
            last_result: 'success',
            last_error: null,
          },
        },
        deps,
      );

      results.push({
        ok: true,
        integration_id: integration.id,
        tenant_id: tenantId,
        mailbox_id: mailboxId,
        processed_count: result.processed_count || 0,
      });
    } catch (error) {
      logger.error(
        {
          tenant_id: tenantId,
          integration_id: integration.id,
          mailbox_id: mailboxId,
          mailbox_address: mailboxAddress,
          error: error?.message || String(error),
          code: error?.code || null,
        },
        '[communications-worker] inbound mailbox poll failed',
      );

      const polledAt = new Date(now).toISOString();
      try {
        await persistMailboxPollMetadata(
          {
            tenantId,
            integrationId: integration.id,
            metadata: integration.metadata || {},
            syncPatch: {
              last_polled_at: polledAt,
              last_result: 'error',
              last_error: error?.message || String(error),
            },
          },
          deps,
        );
      } catch (persistError) {
        logger.error(
          {
            tenant_id: tenantId,
            integration_id: integration.id,
            error: persistError?.message || String(persistError),
            code: persistError?.code || null,
          },
          '[communications-worker] failed to persist mailbox poll error metadata',
        );
      }

      results.push({
        ok: false,
        integration_id: integration.id,
        tenant_id: tenantId,
        mailbox_id: mailboxId,
        error: error?.message || String(error),
        code: error?.code || null,
      });
    }
  }

  logger.info(
    {
      mailbox_count: integrations.length,
      success_count: results.filter((entry) => entry.ok).length,
      failure_count: results.filter((entry) => !entry.ok).length,
    },
    '[communications-worker] communications poll cycle complete',
  );

  writeWorkerHeartbeat({
    mailbox_count: integrations.length,
    success_count: results.filter((entry) => entry.ok).length,
    failure_count: results.filter((entry) => !entry.ok).length,
  });

  return results;
}

let workerStarted = false;
let workerTimer = null;

function clearWorkerTimer() {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}

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
  const pollIntervalMs = getWorkerPollIntervalMs();
  logger.info(
    { poll_interval_ms: pollIntervalMs },
    '[communications-worker] starting communications worker',
  );
  writeWorkerHeartbeat({ status: 'starting', poll_interval_ms: pollIntervalMs });

  const runCycle = async () => {
    if (!workerStarted) {
      return;
    }

    try {
      await processCommunicationsPollCycle();
    } catch (error) {
      logger.error(
        {
          error: error?.message || String(error),
          code: error?.code || null,
        },
        '[communications-worker] poll cycle crashed',
      );
    } finally {
      if (workerStarted) {
        workerTimer = setTimeout(runCycle, pollIntervalMs);
      }
    }
  };

  setImmediate(runCycle);

  return {
    stop: () => {
      logger.info('[communications-worker] stopping communications worker');
      workerStarted = false;
      clearWorkerTimer();
      writeWorkerHeartbeat({ status: 'stopping' });
    },
  };
}

export default {
  listActiveInboundMailboxIntegrations,
  resolveMailboxConnectionForInboundJob,
  processInboundMailboxJob,
  processCommunicationsPollCycle,
  persistMailboxCursor,
  persistMailboxPollMetadata,
  buildInboundCommunicationsEvent,
  postInboundCommunicationsEvent,
  startCommunicationsWorker,
};

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
) {
  const worker = startCommunicationsWorker();

  const shutdown = () => {
    worker.stop();
    setTimeout(() => process.exit(0), 50);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
