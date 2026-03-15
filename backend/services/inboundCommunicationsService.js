import logger from '../lib/logger.js';
import { resolveCanonicalTenant } from '../lib/tenantCanonicalResolver.js';
import { executeBraidTool, TOOL_ACCESS_TOKEN } from '../lib/braidIntegration-v2.js';
import {
  attachActivityToCommunicationsRecords,
  persistInboundThreadAndMessage,
  resolveInboundEntityLinks,
} from './communicationsPersistenceService.js';

let inboundToolExecutor = executeBraidTool;
let inboundTenantResolver = resolveCanonicalTenant;
let inboundThreadMessagePersister = persistInboundThreadAndMessage;
let inboundEntityLinkResolver = resolveInboundEntityLinks;
let inboundActivityAttacher = attachActivityToCommunicationsRecords;

export async function handleInboundCommunicationsEvent(request) {
  const traceId = request.traceId || request.meta?.trace_id || null;
  const resolvedTenant = await resolveInboundTenant(request);
  const persisted = await inboundThreadMessagePersister(request, resolvedTenant);
  const linkedEntities = await inboundEntityLinkResolver(request, resolvedTenant, persisted);
  const activity = await orchestrateInboundCommunication(
    request,
    resolvedTenant,
    persisted,
    linkedEntities,
  );
  const updatedActivity = await inboundActivityAttacher({
    tenantId: resolvedTenant.id,
    threadId: persisted.thread.id,
    messageId: persisted.message.id,
    activity,
    links: linkedEntities,
  });

  const result = {
    thread_id: persisted.thread.id,
    stored_message_id: persisted.message.id,
    provider_message_id: request.payload.message_id,
    message_id: request.payload.message_id,
    attachment_count: Array.isArray(persisted.message?.metadata?.attachments)
      ? persisted.message.metadata.attachments.length
      : 0,
    activity_id: updatedActivity?.id || activity?.id || null,
    link_status: updatedActivity?.metadata?.communications?.link_status || 'pending',
    linked_entities: linkedEntities.map((entry) => ({
      entity_type: entry.type,
      entity_id: entry.id,
      source: entry.source,
    })),
    lead_capture_status: linkedEntities.some((entry) => entry.type === 'lead')
      ? 'linked_existing_lead'
      : 'pending_evaluation',
    processing_status: 'accepted',
    accepted_at: new Date().toISOString(),
  };

  logger.info(
    {
      tenant_id: resolvedTenant.id,
      tenant_slug: resolvedTenant.slug,
      mailbox_id: request.mailbox_id || null,
      mailbox_address: request.mailbox_address || null,
      message_id: request.payload.message_id,
      trace_id: traceId,
      source_service: request.source_service,
    },
    '[communications] inbound event accepted for service processing',
  );

  return {
    ok: true,
    status: 'accepted',
    tenant_id: resolvedTenant.id,
    trace_id: traceId,
    result,
  };
}

async function resolveInboundTenant(request) {
  const explicitTenantId = request.tenant_id || null;

  if (!explicitTenantId) {
    const error = new Error(
      'Inbound communications processing currently requires an explicit tenant_id until mailbox-to-tenant lookup is implemented',
    );
    error.statusCode = 422;
    error.code = 'communications_tenant_unresolved';
    throw error;
  }

  const resolved = await inboundTenantResolver(explicitTenantId);
  if (resolved?.uuid) {
    return {
      id: resolved.uuid,
      slug: resolved.slug || explicitTenantId,
      source: resolved.source || 'canonical',
    };
  }

  return {
    id: explicitTenantId,
    slug: explicitTenantId,
    source: 'request',
  };
}

async function orchestrateInboundCommunication(request, resolvedTenant, persisted, linkedEntities) {
  const relatedEntity = selectPrimaryEntity(linkedEntities);
  const tenantRecord = {
    id: resolvedTenant.id,
    tenant_id: resolvedTenant.slug,
    name: resolvedTenant.slug,
  };
  const userId = request.user?.id || request.user?.email || request.source_service;
  const accessToken = {
    ...TOOL_ACCESS_TOKEN,
    user_email: request.user?.email || 'internal-service@system',
    user_name: request.user?.name || request.user?.email || 'internal communications service',
    user_role: request.user?.role || 'employee',
  };

  const toolArgs = {
    tenant_id: resolvedTenant.id,
    mailbox_id: request.mailbox_id || '',
    mailbox_address: request.mailbox_address || '',
    source_service: request.source_service,
    event_type: request.event_type,
    message_id: request.payload.message_id,
    subject: request.payload.subject,
    sender_email: request.payload.from?.email || '',
    sender_name: request.payload.from?.name || '',
    received_at: request.payload.received_at,
    text_body: request.payload.text_body || '',
    html_body: request.payload.html_body || '',
    thread_hint: request.payload.thread_hint || request.payload.in_reply_to || '',
    thread_id: persisted.thread.id,
    stored_message_id: persisted.message.id,
    link_summary: linkedEntities
      .map((entry) => `${entry.type}:${entry.id}:${entry.source}`)
      .join(','),
    entity_type: relatedEntity.type || '',
    entity_id: relatedEntity.id || '',
  };

  const toolResult = await inboundToolExecutor(
    'process_inbound_communication',
    toolArgs,
    tenantRecord,
    userId,
    accessToken,
  );

  if (toolResult?.tag === 'Err') {
    const error = new Error(
      toolResult.error?.message || 'Inbound communications orchestration failed',
    );
    error.statusCode = 502;
    error.code = 'communications_orchestration_failed';
    error.details = toolResult.error || null;
    throw error;
  }

  if (toolResult?.tag === 'Ok') {
    return toolResult.value;
  }

  return toolResult;
}

function selectPrimaryEntity(linkedEntities = []) {
  for (const candidate of linkedEntities) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      candidate.type &&
      candidate.id &&
      candidate.type !== 'activity'
    ) {
      return {
        type: String(candidate.type),
        id: String(candidate.id),
      };
    }
  }
  return { type: null, id: null };
}

export function setInboundCommunicationsToolExecutorForTests(executor) {
  inboundToolExecutor = executor || executeBraidTool;
}

export function setInboundCommunicationsDependenciesForTests(overrides = null) {
  inboundTenantResolver = overrides?.resolveCanonicalTenant || resolveCanonicalTenant;
  inboundThreadMessagePersister =
    overrides?.persistInboundThreadAndMessage || persistInboundThreadAndMessage;
  inboundEntityLinkResolver = overrides?.resolveInboundEntityLinks || resolveInboundEntityLinks;
  inboundActivityAttacher =
    overrides?.attachActivityToCommunicationsRecords || attachActivityToCommunicationsRecords;
}

export default {
  handleInboundCommunicationsEvent,
  setInboundCommunicationsToolExecutorForTests,
  setInboundCommunicationsDependenciesForTests,
};
