/**
 * Back-compat shim.
 * Canonical contracts live in: shared/contracts/telemetry-events.js
 */
// =============================================================================
// CANONICAL EVENT TYPES (FROZEN)
// =============================================================================

export const EventTypes = Object.freeze({
  // === Run Lifecycle ===
  RUN_STARTED: 'run_started',
  RUN_FINISHED: 'run_finished',

  // === Agent Lifecycle ===
  AGENT_REGISTERED: 'agent_registered',   // Emitted on startup or config change
  AGENT_SPAWNED: 'agent_spawned',         // New agent instance created for a run
  AGENT_RETIRED: 'agent_retired',         // Agent instance terminated
  AGENT_STATUS: 'agent_status',           // Status change: idle/busy/blocked

  // === Task Lifecycle ===
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_STARTED: 'task_started',
  TASK_BLOCKED: 'task_blocked',
  TASK_COMPLETED: 'task_completed',
  TASK_FAILED: 'task_failed',

  // === Interaction ===
  HANDOFF: 'handoff',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',

  // === Tooling ===
  TOOL_CALL_STARTED: 'tool_call_started',
  TOOL_CALL_FINISHED: 'tool_call_finished',
  TOOL_CALL_FAILED: 'tool_call_failed',

  // === Artifacts ===
  ARTIFACT_CREATED: 'artifact_created',
  ARTIFACT_UPDATED: 'artifact_updated',
});

// =============================================================================
// AGENT STATUS VALUES
// =============================================================================

export const AgentStatus = Object.freeze({
  IDLE: 'idle',
  BUSY: 'busy',
  BLOCKED: 'blocked',
});

// =============================================================================
// HANDOFF TYPES
// =============================================================================

export const HandoffType = Object.freeze({
  DELEGATE: 'delegate',       // Delegating work to another agent
  REVIEW: 'review',           // Requesting review/approval
  ESCALATE: 'escalate',       // Escalating to higher authority
  COLLABORATE: 'collaborate', // Co-working on a task
  RETURN: 'return',           // Returning completed work
});

// =============================================================================
// DATA PAYLOAD SCHEMAS (Locked - keep stable and small)
// =============================================================================

/**
 * REDACTION RULE (LOCKED):
 * - Anything that could be PII goes into *_ref (artifact/blob reference), NEVER inline
 * - input_summary, title, summary must be safe, short, and non-PII
 * - Use ref:artifact:art_... or ref:blob:... for sensitive data
 */

export const EventPayloads = Object.freeze({
  // run_started
  run_started: {
    entrypoint: 'string',        // e.g., "api:/api/agent-office/run"
    input_summary: 'string',     // Safe, short, non-PII summary
    force_role: 'string|null',   // Optional forced role
  },

  // run_finished
  run_finished: {
    status: 'string',            // success | failure | cancelled
    duration_ms: 'number',
    output_summary: 'string',    // Safe, short, non-PII summary
    error: 'string|null',        // Error message if failed
  },

  // agent_registered
  agent_registered: {
    agent_id: 'string',
    agent_name: 'string',
    role: 'string',
    model: 'string',
    tools: 'string[]',           // Tool allowlist
  },

  // agent_spawned
  agent_spawned: {
    agent_name: 'string',
    model: 'string',
    tools: 'string[]',           // Subset of tools for this run
  },

  // agent_retired
  agent_retired: {
    reason: 'string',            // completed | error | timeout | cancelled
    duration_ms: 'number',
  },

  // agent_status
  agent_status: {
    status: 'string',            // idle | busy | blocked
    task_id: 'string|null',      // Current task if busy
    blocked_reason: 'string|null', // Why blocked
  },

  // task_created
  task_created: {
    task_type: 'string',         // e.g., "draft_email", "research_lead"
    title: 'string',             // Safe, short, non-PII
    priority: 'string',          // low | normal | high | urgent
    payload_ref: 'string|null',  // ref:artifact:art_... for full payload
    due_ts: 'string|null',       // ISO 8601 deadline
  },

  // task_assigned
  task_assigned: {
    to_agent_id: 'string',
    queue: 'string',             // Agent's work queue
    reason: 'string',            // Why this agent
  },

  // task_started
  task_started: {
    // Minimal - just signals work began
  },

  // task_blocked
  task_blocked: {
    blocked_by: 'string',        // task_id, agent_id, or "external"
    reason: 'string',
    unblock_condition: 'string|null',
  },

  // task_completed
  task_completed: {
    result_ref: 'string|null',   // ref:artifact:art_... for full result
    summary: 'string',           // Safe, short, non-PII
    metrics: {
      duration_ms: 'number',
      tokens_est: 'number|null',
    },
  },

  // task_failed
  task_failed: {
    error: 'string',
    error_code: 'string|null',
    retryable: 'boolean',
    metrics: {
      duration_ms: 'number',
    },
  },

  // handoff
  handoff: {
    from_agent_id: 'string',
    to_agent_id: 'string',
    handoff_type: 'string',      // delegate | review | escalate | collaborate | return
    payload_ref: 'string|null',  // ref:artifact:art_...
    summary: 'string',           // Safe, short, non-PII
  },

  // message_sent
  message_sent: {
    to_agent_id: 'string',
    message_type: 'string',      // text | structured | command
    content_ref: 'string|null',  // ref:blob:... for actual content
    summary: 'string',           // Safe preview
  },

  // message_received
  message_received: {
    from_agent_id: 'string',
    message_type: 'string',
    content_ref: 'string|null',
    summary: 'string',
  },

  // tool_call_started
  tool_call_started: {
    tool_name: 'string',         // e.g., "supabase.query"
    tool_call_id: 'string',      // Unique call ID (tc_...)
    args_ref: 'string|null',     // ref:blob:... for arguments
    timeout_ms: 'number',
  },

  // tool_call_finished
  tool_call_finished: {
    tool_name: 'string',
    tool_call_id: 'string',
    result_ref: 'string|null',   // ref:blob:... for result
    summary: 'string',           // Safe, short summary
    metrics: {
      duration_ms: 'number',
      tokens_est: 'number|null',
    },
  },

  // tool_call_failed
  tool_call_failed: {
    tool_name: 'string',
    tool_call_id: 'string',
    error: 'string',
    error_code: 'string|null',
    retryable: 'boolean',
    duration_ms: 'number',
  },

  // artifact_created
  artifact_created: {
    artifact_id: 'string',       // art_...
    artifact_type: 'string',     // email_draft | report | analysis | etc.
    title: 'string',             // Safe, short, non-PII
    content_ref: 'string',       // ref:blob:... for actual content
    mime_type: 'string',
    size_bytes: 'number',
  },

  // artifact_updated
  artifact_updated: {
    artifact_id: 'string',
    version: 'number',
    changes_summary: 'string',   // Safe, short description
    content_ref: 'string',
  },
});

// =============================================================================
// TOPIC CONTRACT (Redpanda/Kafka)
// =============================================================================

export const TopicContract = Object.freeze({
  // Primary topic for all tenants
  PRIMARY_TOPIC: 'aisha.events.v1',
  
  // Optional per-tenant topic (for high-volume isolation)
  // Format: aisha.events.v1.<tenant_id>
  getTenantTopic: (tenant_id) => `aisha.events.v1.${tenant_id}`,
  
  // Partition key: tenant_id (keeps tenant ordering together)
  // Include run_id inside message for office replay
  PARTITION_KEY: 'tenant_id',
});

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that an event has required correlation IDs
 * @param {Object} event - Event to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCorrelationIds(event) {
  const errors = [];
  
  if (!event.run_id) errors.push('run_id is required');
  if (!event.trace_id) errors.push('trace_id is required');
  if (!event.span_id) errors.push('span_id is required');
  // parent_span_id is optional
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an event against the schema
 * @param {Object} event - Event to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEvent(event) {
  const errors = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Event must be an object'] };
  }

  // Check base fields
  if (event._telemetry !== true) {
    errors.push('_telemetry must be true');
  }

  if (!event.ts || typeof event.ts !== 'string') {
    errors.push('ts (timestamp) is required and must be a string');
  }

  if (!event.type || !Object.values(EventTypes).includes(event.type)) {
    errors.push(`type must be one of: ${Object.values(EventTypes).join(', ')}`);
  }

  // Check correlation IDs
  const correlationResult = validateCorrelationIds(event);
  errors.push(...correlationResult.errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Generate a reference ID for artifacts/blobs
 * @param {string} type - 'artifact' or 'blob'
 * @param {string} id - Unique identifier
 * @returns {string} Reference in format ref:type:id
 */
export function makeRef(type, id) {
  return `ref:${type}:${id}`;
}

/**
 * Parse a reference ID
 * @param {string} ref - Reference string
 * @returns {{ type: string, id: string } | null}
 */
export function parseRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const match = ref.match(/^ref:(artifact|blob):(.+)$/);
  if (!match) return null;
  return { type: match[1], id: match[2] };
}

/**
 * List of all canonical event types (for iteration/display)
 */
export const ALL_EVENT_TYPES = Object.values(EventTypes);

export default {
  EventTypes,
  EventPayloads,
  TopicContract,
  AgentStatus,
  HandoffType,
  validateEvent,
  validateCorrelationIds,
  makeRef,
  parseRef,
  ALL_EVENT_TYPES,
};
