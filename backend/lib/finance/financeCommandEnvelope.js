import { randomUUID } from 'node:crypto';
import { normalizeActorType } from './financeActorUtils.js';

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
} = {}) {
  // M-1: Bare UUID — no prefix. finance_commands.id is a uuid column in Postgres.
  return {
    id: randomUUID(),
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
    // R-5: created_at is always the moment of construction; callers cannot inject
    // arbitrary timestamps into audit records.
    created_at: new Date().toISOString(),
  };
}

export default createFinanceCommandEnvelope;
