import { randomUUID } from 'node:crypto';
import { normalizeActorType } from './financeActorUtils.js';

export function createFinanceEventEnvelope({
  tenantId,
  eventType,
  aggregateType,
  aggregateId,
  actorId = null,
  actorType = 'human',
  source = 'finance',
  isTestData = false,
  requestId = null,
  braidTraceId = null,
  correlationId = null,
  causationId = null,
  payload = {},
  policyDecision = {},
} = {}) {
  // M-1: Bare UUID — no prefix. finance.audit_events.id is a uuid column in Postgres.
  // Causation chains: caller may pre-assign this id via createFinanceEventEnvelope and pass it
  // to financeEventStore.append() so downstream events can reference it as causation_id.
  return {
    id: randomUUID(),
    tenant_id: tenantId,
    event_type: eventType,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    actor_id: actorId,
    actor_type: normalizeActorType(actorType),
    source,
    // Test/Live data-mode partition (slice 6a): live (false) by default.
    is_test_data: isTestData,
    request_id: requestId,
    braid_trace_id: braidTraceId,
    correlation_id: correlationId || requestId || null,
    causation_id: causationId,
    payload,
    policy_decision: policyDecision,
    // R-5: created_at is always the moment of construction; callers cannot inject
    // arbitrary timestamps into audit records.
    created_at: new Date().toISOString(),
  };
}

export default createFinanceEventEnvelope;
