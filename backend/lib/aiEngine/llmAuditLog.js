/**
 * LLM Audit Log — Kafka-style request/response capture.
 *
 * Every outbound LLM call (via litellmClient or taskWorkers) appends a
 * structured entry here. Think of it as a topic with a single consumer group:
 * the monitoring UI can replay/filter recent calls and ops can ship the NDJSON
 * file to any log aggregator (Loki, S3, etc.) for long-term retention.
 *
 * Design principles (same as telemetry/index.js):
 *   - Never blocks or throws — errors are silently counted.
 *   - In-memory ring buffer for real-time UI access (no DB round-trip).
 *   - Optional NDJSON file append for replay/audit trail.
 *   - Truncates message content — audit log is metadata, not a prompt store.
 *
 * Enable file append: LLM_AUDIT_ENABLED=true
 * Log path:           LLM_AUDIT_LOG_PATH=/var/log/aisha/llm-requests.ndjson
 * Max body chars:     LLM_AUDIT_BODY_CHARS=300  (per message, default 300)
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const ENABLED = String(process.env.LLM_AUDIT_ENABLED || '').toLowerCase() === 'true';
const LOG_PATH = process.env.LLM_AUDIT_LOG_PATH || '/var/log/aisha/llm-requests.ndjson';
const BODY_CHARS = parseInt(process.env.LLM_AUDIT_BODY_CHARS || '300', 10);
const RING_CAP = 1000;

/** In-memory ring buffer (newest first). */
const auditRing = [];

// Error counter — surfaced by getAuditStats().
let _fileErrors = 0;
let _lastFileError = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureDir(p) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (_) {
    // ignore
  }
}

function truncate(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * Summarise an array of chat messages into compact audit metadata.
 * Does NOT store full content — only char counts + truncated snippets.
 */
function summariseMessages(messages) {
  if (!Array.isArray(messages)) return { count: 0, chars: 0, snippet: null };
  let chars = 0;
  let firstUserSnippet = null;
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    chars += content.length;
    if (!firstUserSnippet && m.role === 'user') {
      firstUserSnippet = truncate(content, BODY_CHARS);
    }
  }
  return { count: messages.length, chars, snippet: firstUserSnippet };
}

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Append one audit entry.
 *
 * @param {Object} opts
 * @param {string}   opts.model        - Virtual alias or provider/model string
 * @param {string}   [opts.provider]   - 'local'|'openai'|'anthropic'|'groq'
 * @param {string}   [opts.tenantId]
 * @param {Array}    [opts.messages]   - Request messages (summarised, not stored raw)
 * @param {Array}    [opts.tools]      - Tool schemas sent with the request
 * @param {Object}   [opts.usage]      - {prompt_tokens, completion_tokens, total_tokens}
 * @param {string}   [opts.respContent]- Response content (truncated to BODY_CHARS)
 * @param {number}   [opts.durationMs]
 * @param {string}   [opts.status]     - 'success'|'error'|'failover'
 * @param {string}   [opts.error]
 * @param {string}   [opts.nodeId]     - Process/container identifier
 * @param {string}   [opts.env]        - APP_ENV (dev|staging|prd)
 * @param {string}   [opts.requestId]  - Correlation ID
 */
export function appendAuditEntry(opts = {}) {
  try {
    const msgSummary = summariseMessages(opts.messages);
    const entry = {
      id: `audit-${Date.now()}-${randomUUID().slice(0, 8)}`,
      ts: new Date().toISOString(),
      env: opts.env || process.env.APP_ENV || 'unknown',
      node_id: opts.nodeId || process.env.MCP_NODE_ID || process.env.HOSTNAME || 'backend',
      model: opts.model || 'unknown',
      provider: opts.provider || 'unknown',
      tenant_id: opts.tenantId || null,
      request_id: opts.requestId || null,
      // Request metadata
      req_msg_count: msgSummary.count,
      req_chars: msgSummary.chars,
      req_snippet: msgSummary.snippet,
      req_tool_count: Array.isArray(opts.tools) ? opts.tools.length : 0,
      // Response metadata
      resp_snippet: opts.respContent ? truncate(String(opts.respContent), BODY_CHARS) : null,
      resp_chars: opts.respContent ? String(opts.respContent).length : 0,
      usage: opts.usage || null,
      // Execution
      duration_ms: opts.durationMs ?? null,
      status: opts.status || 'success',
      error: opts.error || null,
    };

    // Ring buffer (newest first)
    auditRing.unshift(entry);
    if (auditRing.length > RING_CAP) auditRing.length = RING_CAP;

    // NDJSON file append (best-effort)
    if (ENABLED) {
      ensureDir(LOG_PATH);
      fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
    }
  } catch (err) {
    _fileErrors += 1;
    _lastFileError = err.message;
    // Swallow — audit log must never break the LLM call path
  }
}

/**
 * Query the in-memory audit ring.
 *
 * @param {Object} [opts]
 * @param {number}  [opts.limit=100]
 * @param {string}  [opts.model]    — exact model string filter
 * @param {string}  [opts.env]      — dev|staging|prd filter
 * @param {string}  [opts.status]   — success|error|failover filter
 * @param {string}  [opts.since]    — ISO timestamp (exclusive)
 * @param {string}  [opts.tenantId]
 * @returns {Array}
 */
export function getAuditLog(opts = {}) {
  const { limit = 100, model, env, status, since, tenantId } = opts;
  let results = auditRing;

  if (model) results = results.filter((e) => e.model === model);
  if (env) results = results.filter((e) => e.env === env);
  if (status) results = results.filter((e) => e.status === status);
  if (tenantId) results = results.filter((e) => e.tenant_id === tenantId);
  if (since) {
    const sinceMs = new Date(since).getTime();
    results = results.filter((e) => new Date(e.ts).getTime() > sinceMs);
  }

  return results.slice(0, Math.min(limit, RING_CAP));
}

/**
 * Distinct model aliases seen in the ring buffer.
 */
export function getAuditModels() {
  return [...new Set(auditRing.map((e) => e.model))].sort();
}

/**
 * Stats for ops health checks.
 */
export function getAuditStats() {
  return {
    ringSize: auditRing.length,
    ringCap: RING_CAP,
    fileEnabled: ENABLED,
    filePath: ENABLED ? LOG_PATH : null,
    fileErrors: _fileErrors,
    lastFileError: _lastFileError,
  };
}

/**
 * Clear the ring buffer (tests + admin endpoint).
 */
export function clearAuditLog() {
  auditRing.length = 0;
}

export default {
  appendAuditEntry,
  getAuditLog,
  getAuditModels,
  getAuditStats,
  clearAuditLog,
};
