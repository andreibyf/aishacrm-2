/**
 * Telemetry (best-effort) logger.
 *
 * Core principle: telemetry must never break or slow the core app.
 * The office-viz system reads these events from a sidecar (Option 2).
 *
 * Enable: TELEMETRY_ENABLED=true
 * Path:   TELEMETRY_LOG_PATH=/var/log/aisha/telemetry.ndjson
 * 
 * Event Contract: See addons/agent-office/contracts/telemetry-events.js
 */

import fs from 'fs';
import path from 'path';

const ENABLED = String(process.env.TELEMETRY_ENABLED || '').toLowerCase() === 'true';
const LOG_PATH = process.env.TELEMETRY_LOG_PATH || '/var/log/aisha/telemetry.ndjson';

/**
 * Canonical Event Types (frozen v1.0)
 * @see addons/agent-office/contracts/telemetry-events.js
 */
export const EventTypes = Object.freeze({
  // Execution Lifecycle
  RUN_STARTED: 'run_started',
  RUN_FINISHED: 'run_finished',
  // Agent Lifecycle
  AGENT_SPAWNED: 'agent_spawned',
  // Task Lifecycle
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_STARTED: 'task_started',
  TASK_BLOCKED: 'task_blocked',
  TASK_COMPLETED: 'task_completed',
  TASK_FAILED: 'task_failed',
  // Coordination
  HANDOFF: 'handoff',
  // Tool Execution
  TOOL_CALL_STARTED: 'tool_call_started',
  TOOL_CALL_FINISHED: 'tool_call_finished',
});

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
    if (typeof v === 'string') out[k] = capString(v);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 50);
    else if (typeof v === 'object') out[k] = v; // should remain small (ids/refs)
    else out[k] = String(v);
  }
  return out;
}

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
// Typed Event Emitters (Canonical Contract v1.0)
// ============================================================================

/** Emit: run_started */
export function emitRunStarted({ execution_id, agent_id, role, tenant_id, user_id, input_summary, data }) {
  telemetryLog({ type: EventTypes.RUN_STARTED, execution_id, agent_id, role, tenant_id, user_id, input_summary, data });
}

/** Emit: run_finished */
export function emitRunFinished({ execution_id, status, tenant_id, duration_ms, output_summary, error, data }) {
  telemetryLog({ type: EventTypes.RUN_FINISHED, execution_id, status, tenant_id, duration_ms, output_summary, error, data });
}

/** Emit: agent_spawned */
export function emitAgentSpawned({ execution_id, agent_id, role, tenant_id, parent_agent_id, model, config, data }) {
  telemetryLog({ type: EventTypes.AGENT_SPAWNED, execution_id, agent_id, role, tenant_id, parent_agent_id, model, config, data });
}

/** Emit: task_created */
export function emitTaskCreated({ execution_id, task_id, tenant_id, parent_task_id, description, priority, data }) {
  telemetryLog({ type: EventTypes.TASK_CREATED, execution_id, task_id, tenant_id, parent_task_id, description, priority, data });
}

/** Emit: task_assigned */
export function emitTaskAssigned({ execution_id, task_id, agent_id, role, tenant_id, summary, data }) {
  telemetryLog({ type: EventTypes.TASK_ASSIGNED, execution_id, task_id, agent_id, role, tenant_id, summary, data });
}

/** Emit: task_started */
export function emitTaskStarted({ execution_id, task_id, agent_id, tenant_id, data }) {
  telemetryLog({ type: EventTypes.TASK_STARTED, execution_id, task_id, agent_id, tenant_id, data });
}

/** Emit: task_blocked */
export function emitTaskBlocked({ execution_id, task_id, reason, tenant_id, blocked_by, data }) {
  telemetryLog({ type: EventTypes.TASK_BLOCKED, execution_id, task_id, reason, tenant_id, blocked_by, data });
}

/** Emit: task_completed */
export function emitTaskCompleted({ execution_id, task_id, tenant_id, agent_id, duration_ms, output_summary, data }) {
  telemetryLog({ type: EventTypes.TASK_COMPLETED, execution_id, task_id, tenant_id, agent_id, duration_ms, output_summary, data });
}

/** Emit: task_failed */
export function emitTaskFailed({ execution_id, task_id, error, tenant_id, agent_id, duration_ms, retryable, data }) {
  telemetryLog({ type: EventTypes.TASK_FAILED, execution_id, task_id, error, tenant_id, agent_id, duration_ms, retryable, data });
}

/** Emit: handoff */
export function emitHandoff({ execution_id, from_agent_id, to_agent_id, tenant_id, from_role, to_role, task_id, reason, data }) {
  telemetryLog({ type: EventTypes.HANDOFF, execution_id, from_agent_id, to_agent_id, tenant_id, from_role, to_role, task_id, reason, data });
}

/** Emit: tool_call_started */
export function emitToolCallStarted({ execution_id, tool_call_id, tool_name, agent_id, tenant_id, task_id, input_summary, data }) {
  telemetryLog({ type: EventTypes.TOOL_CALL_STARTED, execution_id, tool_call_id, tool_name, agent_id, tenant_id, task_id, input_summary, data });
}

/** Emit: tool_call_finished */
export function emitToolCallFinished({ execution_id, tool_call_id, tool_name, status, tenant_id, agent_id, task_id, duration_ms, output_summary, error, data }) {
  telemetryLog({ type: EventTypes.TOOL_CALL_FINISHED, execution_id, tool_call_id, tool_name, status, tenant_id, agent_id, task_id, duration_ms, output_summary, error, data });
}
