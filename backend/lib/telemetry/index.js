/**
 * Telemetry (best-effort) logger.
 *
 * Core principle: telemetry must never break or slow the core app.
 * The office-viz system reads these events from a sidecar (Option 2).
 *
 * Enable: TELEMETRY_ENABLED=true
 * Path:   TELEMETRY_LOG_PATH=/var/log/aisha/telemetry.ndjson
 * 
 * Event Contract v1.1: See addons/agent-office/contracts/telemetry-events.js
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const ENABLED = String(process.env.TELEMETRY_ENABLED || '').toLowerCase() === 'true';
const LOG_PATH = process.env.TELEMETRY_LOG_PATH || '/var/log/aisha/telemetry.ndjson';

/**
 * Canonical Event Types (frozen v1.1)
 * @see addons/agent-office/contracts/telemetry-events.js
 */
export const EventTypes = Object.freeze({
  // Run Lifecycle
  RUN_STARTED: 'run_started',
  RUN_FINISHED: 'run_finished',
  // Agent Lifecycle
  AGENT_REGISTERED: 'agent_registered',
  AGENT_SPAWNED: 'agent_spawned',
  AGENT_RETIRED: 'agent_retired',
  AGENT_STATUS: 'agent_status',
  // Task Lifecycle
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_STARTED: 'task_started',
  TASK_BLOCKED: 'task_blocked',
  TASK_COMPLETED: 'task_completed',
  TASK_FAILED: 'task_failed',
  // Interaction
  HANDOFF: 'handoff',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  // Tooling
  TOOL_CALL_STARTED: 'tool_call_started',
  TOOL_CALL_FINISHED: 'tool_call_finished',
  TOOL_CALL_FAILED: 'tool_call_failed',
  // Artifacts
  ARTIFACT_CREATED: 'artifact_created',
  ARTIFACT_UPDATED: 'artifact_updated',
});

/**
 * Agent Status Values
 */
export const AgentStatus = Object.freeze({
  IDLE: 'idle',
  BUSY: 'busy',
  BLOCKED: 'blocked',
});

/**
 * Handoff Types
 */
export const HandoffType = Object.freeze({
  DELEGATE: 'delegate',
  REVIEW: 'review',
  ESCALATE: 'escalate',
  COLLABORATE: 'collaborate',
  RETURN: 'return',
});

// ============================================================================
// Correlation ID Helpers
// ============================================================================

/**
 * Generate a new run_id (top-level office shift)
 */
export function generateRunId() {
  return randomUUID();
}

/**
 * Generate a new trace_id (groups all activity across services)
 */
export function generateTraceId() {
  return randomUUID();
}

/**
 * Generate a new span_id (discrete unit of work)
 */
export function generateSpanId() {
  return randomUUID();
}

/**
 * Create correlation context for a new run
 */
export function createCorrelationContext(overrides = {}) {
  const run_id = overrides.run_id || generateRunId();
  return {
    run_id,
    trace_id: overrides.trace_id || run_id, // Default trace_id matches run_id
    span_id: overrides.span_id || generateSpanId(),
    parent_span_id: overrides.parent_span_id || null,
  };
}

/**
 * Create a child span context (for nested operations)
 */
export function createChildSpan(parentContext) {
  return {
    run_id: parentContext.run_id,
    trace_id: parentContext.trace_id,
    span_id: generateSpanId(),
    parent_span_id: parentContext.span_id,
  };
}

// ============================================================================
// Reference Helpers (for PII redaction)
// ============================================================================

/**
 * Generate artifact reference
 */
export function makeArtifactRef(artifactId) {
  return `ref:artifact:${artifactId}`;
}

/**
 * Generate blob reference
 */
export function makeBlobRef(blobId) {
  return `ref:blob:${blobId}`;
}

// ============================================================================
// Core Logging
// ============================================================================

function ensureDir(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (_) {
    // ignore
  }
}

function capString(s, max = 2000) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function sanitize(obj) {
  const out = {};
  const keys = Object.keys(obj || {}).slice(0, 80);
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue; // Skip undefined values
    if (typeof v === 'string') out[k] = capString(v);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 50);
    else if (typeof v === 'object') out[k] = v; // should remain small (ids/refs)
    else out[k] = String(v);
  }
  return out;
}

/**
 * Core telemetry log function
 * @param {Object} event - Event with type, correlation IDs, and payload
 */
export function telemetryLog(event) {
  if (!ENABLED) return;
  try {
    ensureDir(LOG_PATH);
    const payload = sanitize({
      _telemetry: true,
      ts: new Date().toISOString(),
      ...event,
    });
    fs.appendFileSync(LOG_PATH, JSON.stringify(payload) + '\n', 'utf-8');
  } catch (_) {
    // ignore
  }
}

export function buildTelemetryEvent(fields) {
  return sanitize(fields || {});
}

// ============================================================================
// Typed Event Emitters (Canonical Contract v1.1)
// ============================================================================

// --- Run Lifecycle ---

/** Emit: run_started */
export function emitRunStarted({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, entrypoint, input_summary, force_role }) {
  telemetryLog({
    type: EventTypes.RUN_STARTED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    entrypoint, input_summary, force_role,
  });
}

/** Emit: run_finished */
export function emitRunFinished({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, status, duration_ms, output_summary, error }) {
  telemetryLog({
    type: EventTypes.RUN_FINISHED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    status, duration_ms, output_summary, error,
  });
}

// --- Agent Lifecycle ---

/** Emit: agent_registered */
export function emitAgentRegistered({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, agent_name, role, model, tools }) {
  telemetryLog({
    type: EventTypes.AGENT_REGISTERED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    agent_name, role, model, tools,
  });
}

/** Emit: agent_spawned */
export function emitAgentSpawned({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, agent_name, model, tools }) {
  telemetryLog({
    type: EventTypes.AGENT_SPAWNED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    agent_name, model, tools,
  });
}

/** Emit: agent_retired */
export function emitAgentRetired({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, reason, duration_ms }) {
  telemetryLog({
    type: EventTypes.AGENT_RETIRED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    reason, duration_ms,
  });
}

/** Emit: agent_status */
export function emitAgentStatus({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, status, task_id, blocked_reason }) {
  telemetryLog({
    type: EventTypes.AGENT_STATUS,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    status, task_id, blocked_reason,
  });
}

// --- Task Lifecycle ---

/** Emit: task_created */
export function emitTaskCreated({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id, task_type, title, priority, payload_ref, due_ts }) {
  telemetryLog({
    type: EventTypes.TASK_CREATED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id,
    task_type, title, priority, payload_ref, due_ts,
  });
}

/** Emit: task_enqueued (System level, no agent_id required) */
export function emitTaskEnqueued({ run_id, trace_id, span_id, parent_span_id, tenant_id, task_id, input_summary, agent_name }) {
  telemetryLog({
    type: 'task_enqueued', // Explicit string as it might not be in EventTypes enum yet
    run_id, trace_id, span_id, parent_span_id, tenant_id, task_id,
    input_summary, agent_name
  });
}

/** Emit: task_assigned */
export function emitTaskAssigned({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id, to_agent_id, queue, reason }) {
  telemetryLog({
    type: EventTypes.TASK_ASSIGNED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id,
    to_agent_id, queue, reason,
  });
}

/** Emit: task_started */
export function emitTaskStarted({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id }) {
  telemetryLog({
    type: EventTypes.TASK_STARTED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id,
  });
}

/** Emit: task_blocked */
export function emitTaskBlocked({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id, blocked_by, reason, unblock_condition }) {
  telemetryLog({
    type: EventTypes.TASK_BLOCKED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id,
    blocked_by, reason, unblock_condition,
  });
}

/** Emit: task_completed */
export function emitTaskCompleted({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id, result_ref, summary, metrics }) {
  telemetryLog({
    type: EventTypes.TASK_COMPLETED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id,
    result_ref, summary, metrics,
  });
}

/** Emit: task_failed */
export function emitTaskFailed({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id, error, error_code, retryable, metrics }) {
  telemetryLog({
    type: EventTypes.TASK_FAILED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, task_id,
    error, error_code, retryable, metrics,
  });
}

// --- Interaction ---

/** Emit: handoff */
export function emitHandoff({ run_id, trace_id, span_id, parent_span_id, tenant_id, from_agent_id, to_agent_id, handoff_type, payload_ref, summary }) {
  telemetryLog({
    type: EventTypes.HANDOFF,
    run_id, trace_id, span_id, parent_span_id, tenant_id,
    from_agent_id, to_agent_id, handoff_type, payload_ref, summary,
  });
}

/** Emit: message_sent */
export function emitMessageSent({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, to_agent_id, message_type, content_ref, summary }) {
  telemetryLog({
    type: EventTypes.MESSAGE_SENT,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    to_agent_id, message_type, content_ref, summary,
  });
}

/** Emit: message_received */
export function emitMessageReceived({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, from_agent_id, message_type, content_ref, summary }) {
  telemetryLog({
    type: EventTypes.MESSAGE_RECEIVED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    from_agent_id, message_type, content_ref, summary,
  });
}

// --- Tooling ---

/** Emit: tool_call_started */
export function emitToolCallStarted({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, tool_name, tool_call_id, args_ref, timeout_ms }) {
  telemetryLog({
    type: EventTypes.TOOL_CALL_STARTED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    tool_name, tool_call_id, args_ref, timeout_ms,
  });
}

/** Emit: tool_call_finished */
export function emitToolCallFinished({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, tool_name, tool_call_id, result_ref, summary, metrics }) {
  telemetryLog({
    type: EventTypes.TOOL_CALL_FINISHED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    tool_name, tool_call_id, result_ref, summary, metrics,
  });
}

/** Emit: tool_call_failed */
export function emitToolCallFailed({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, tool_name, tool_call_id, error, error_code, retryable, duration_ms }) {
  telemetryLog({
    type: EventTypes.TOOL_CALL_FAILED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    tool_name, tool_call_id, error, error_code, retryable, duration_ms,
  });
}

// --- Artifacts ---

/** Emit: artifact_created */
export function emitArtifactCreated({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, artifact_id, artifact_type, title, content_ref, mime_type, size_bytes }) {
  telemetryLog({
    type: EventTypes.ARTIFACT_CREATED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    artifact_id, artifact_type, title, content_ref, mime_type, size_bytes,
  });
}

/** Emit: artifact_updated */
export function emitArtifactUpdated({ run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, artifact_id, version, changes_summary, content_ref }) {
  telemetryLog({
    type: EventTypes.ARTIFACT_UPDATED,
    run_id, trace_id, span_id, parent_span_id, tenant_id, agent_id,
    artifact_id, version, changes_summary, content_ref,
  });
}
