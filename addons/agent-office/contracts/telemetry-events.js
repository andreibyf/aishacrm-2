/**
 * Canonical Telemetry Event Contract v1.0
 * 
 * This file defines the FROZEN event schema for agent-office observability.
 * All agents, roles, tools, and automations MUST emit events conforming to these types.
 * 
 * DO NOT modify existing event structures without a migration plan.
 * New event types may be added, but existing ones are immutable.
 * 
 * @version 1.0.0
 * @frozen 2026-01-15
 */

/**
 * Base fields present on ALL telemetry events
 * @typedef {Object} TelemetryEventBase
 * @property {true} _telemetry - Marker for telemetry events (always true)
 * @property {string} ts - ISO 8601 timestamp
 * @property {string} type - Event type (one of the canonical types below)
 * @property {string} execution_id - Unique run/execution identifier (UUID)
 * @property {string} [tenant_id] - Tenant UUID (optional for system events)
 */

/**
 * Canonical Event Types
 * These are FROZEN and must not be changed.
 */
export const EventTypes = Object.freeze({
  // === Execution Lifecycle ===
  RUN_STARTED: 'run_started',
  RUN_FINISHED: 'run_finished',

  // === Agent Lifecycle ===
  AGENT_SPAWNED: 'agent_spawned',

  // === Task Lifecycle ===
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_STARTED: 'task_started',
  TASK_BLOCKED: 'task_blocked',
  TASK_COMPLETED: 'task_completed',
  TASK_FAILED: 'task_failed',

  // === Coordination ===
  HANDOFF: 'handoff',

  // === Tool Execution ===
  TOOL_CALL_STARTED: 'tool_call_started',
  TOOL_CALL_FINISHED: 'tool_call_finished',
});

/**
 * Event Schema Definitions
 * Each event type has required and optional fields.
 */
export const EventSchemas = Object.freeze({
  /**
   * RUN_STARTED
   * Emitted when a new agent execution begins.
   */
  [EventTypes.RUN_STARTED]: {
    required: ['execution_id', 'agent_id', 'role'],
    optional: ['tenant_id', 'user_id', 'input_summary', 'data'],
    description: 'A new agent run has started',
  },

  /**
   * RUN_FINISHED
   * Emitted when an agent execution completes (success or failure).
   */
  [EventTypes.RUN_FINISHED]: {
    required: ['execution_id', 'status'], // status: 'success' | 'failure' | 'cancelled'
    optional: ['tenant_id', 'duration_ms', 'output_summary', 'error', 'data'],
    description: 'An agent run has completed',
  },

  /**
   * AGENT_SPAWNED
   * Emitted when a new agent instance is created within a run.
   */
  [EventTypes.AGENT_SPAWNED]: {
    required: ['execution_id', 'agent_id', 'role'],
    optional: ['tenant_id', 'parent_agent_id', 'model', 'config', 'data'],
    description: 'A new agent has been spawned',
  },

  /**
   * TASK_CREATED
   * Emitted when a new task is created (before assignment).
   */
  [EventTypes.TASK_CREATED]: {
    required: ['execution_id', 'task_id'],
    optional: ['tenant_id', 'parent_task_id', 'description', 'priority', 'data'],
    description: 'A new task has been created',
  },

  /**
   * TASK_ASSIGNED
   * Emitted when a task is assigned to an agent/role.
   */
  [EventTypes.TASK_ASSIGNED]: {
    required: ['execution_id', 'task_id', 'agent_id', 'role'],
    optional: ['tenant_id', 'summary', 'data'],
    description: 'A task has been assigned to an agent',
  },

  /**
   * TASK_STARTED
   * Emitted when an agent begins working on a task.
   */
  [EventTypes.TASK_STARTED]: {
    required: ['execution_id', 'task_id', 'agent_id'],
    optional: ['tenant_id', 'data'],
    description: 'An agent has started working on a task',
  },

  /**
   * TASK_BLOCKED
   * Emitted when a task is blocked waiting for something.
   */
  [EventTypes.TASK_BLOCKED]: {
    required: ['execution_id', 'task_id', 'reason'],
    optional: ['tenant_id', 'blocked_by', 'data'],
    description: 'A task is blocked and waiting',
  },

  /**
   * TASK_COMPLETED
   * Emitted when a task finishes successfully.
   */
  [EventTypes.TASK_COMPLETED]: {
    required: ['execution_id', 'task_id'],
    optional: ['tenant_id', 'agent_id', 'duration_ms', 'output_summary', 'data'],
    description: 'A task has completed successfully',
  },

  /**
   * TASK_FAILED
   * Emitted when a task fails.
   */
  [EventTypes.TASK_FAILED]: {
    required: ['execution_id', 'task_id', 'error'],
    optional: ['tenant_id', 'agent_id', 'duration_ms', 'retryable', 'data'],
    description: 'A task has failed',
  },

  /**
   * HANDOFF
   * Emitted when work is transferred between agents/roles.
   */
  [EventTypes.HANDOFF]: {
    required: ['execution_id', 'from_agent_id', 'to_agent_id'],
    optional: ['tenant_id', 'from_role', 'to_role', 'task_id', 'reason', 'data'],
    description: 'Work is being handed off between agents',
  },

  /**
   * TOOL_CALL_STARTED
   * Emitted when an agent begins a tool invocation.
   */
  [EventTypes.TOOL_CALL_STARTED]: {
    required: ['execution_id', 'tool_call_id', 'tool_name', 'agent_id'],
    optional: ['tenant_id', 'task_id', 'input_summary', 'data'],
    description: 'A tool call has started',
  },

  /**
   * TOOL_CALL_FINISHED
   * Emitted when a tool invocation completes.
   */
  [EventTypes.TOOL_CALL_FINISHED]: {
    required: ['execution_id', 'tool_call_id', 'tool_name', 'status'], // status: 'success' | 'error'
    optional: ['tenant_id', 'agent_id', 'task_id', 'duration_ms', 'output_summary', 'error', 'data'],
    description: 'A tool call has finished',
  },
});

/**
 * Helper to validate an event against the schema.
 * @param {Object} event - The telemetry event to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEvent(event) {
  const errors = [];

  // Check base fields
  if (event._telemetry !== true) {
    errors.push('Missing _telemetry marker');
  }
  if (!event.ts) {
    errors.push('Missing timestamp (ts)');
  }
  if (!event.type) {
    errors.push('Missing event type');
  }
  if (!event.execution_id) {
    errors.push('Missing execution_id');
  }

  // Check type-specific fields
  const schema = EventSchemas[event.type];
  if (!schema) {
    errors.push(`Unknown event type: ${event.type}`);
  } else {
    for (const field of schema.required) {
      if (event[field] === undefined || event[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * List of all canonical event types (for iteration/display)
 */
export const ALL_EVENT_TYPES = Object.values(EventTypes);

export default {
  EventTypes,
  EventSchemas,
  validateEvent,
  ALL_EVENT_TYPES,
};
