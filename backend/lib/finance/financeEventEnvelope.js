import { randomUUID } from 'node:crypto';

function normalizeActorType(actorType) {
  if (actorType === 'ai_agent' || actorType === 'system') return actorType;
  return 'human';
}

export function createFinanceEventEnvelope({
  tenantId,
  eventType,
  aggregateType,
  aggregateId,
  actorId = null,
  actorType = 'human',
  source = 'finance',
  requestId = null,
  braidTraceId = null,
  correlationId = null,
  causationId = null,
  payload = {},
  policyDecision = {},
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    id: `evt_${randomUUID()}`,
    tenant_id: tenantId,
    event_type: eventType,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    actor_id: actorId,
    actor_type: normalizeActorType(actorType),
    source,
    request_id: requestId,
    braid_trace_id: braidTraceId,
    correlation_id: correlationId || requestId || null,
    causation_id: causationId,
    payload,
    policy_decision: policyDecision,
    created_at: createdAt,
  };
}

export default createFinanceEventEnvelope;
