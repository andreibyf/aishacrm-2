import { randomUUID } from 'node:crypto';

function normalizeActorType(actorType) {
  if (actorType === 'ai_agent' || actorType === 'system') return actorType;
  return 'human';
}

export function createFinanceCommandEnvelope({
  tenantId,
  commandType,
  actorId = null,
  actorType = 'human',
  source = 'finance',
  requestId = null,
  correlationId = null,
  causationId = null,
  braidTraceId = null,
  payload = {},
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    id: `cmd_${randomUUID()}`,
    tenant_id: tenantId,
    command_type: commandType,
    actor_id: actorId,
    actor_type: normalizeActorType(actorType),
    source,
    request_id: requestId,
    correlation_id: correlationId || requestId || null,
    causation_id: causationId,
    braid_trace_id: braidTraceId,
    payload,
    created_at: createdAt,
  };
}

export default createFinanceCommandEnvelope;
