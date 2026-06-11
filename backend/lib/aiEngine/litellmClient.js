import _defaultFetch from 'node-fetch';
import { logLLMActivity } from './activityLogger.js';
import { appendAuditEntry } from './llmAuditLog.js';

/**
 * callLiteLLMVirtual
 *
 * Call LiteLLM with a semantic virtual model alias (e.g. 'aisha-summary').
 * The model name is sent as-is — no provider/ prefix. LiteLLM routes it
 * based on model_list aliases in litellm_config.yaml.
 *
 * Use this for non-AiSHA callers so routing decisions live in config,
 * not in backend code. Supports optional tool-calling (tools array).
 *
 * Telemetry: automatically calls logLLMActivity + appendAuditEntry on every
 * call. Pass skipActivityLog=true if the caller handles logLLMActivity itself
 * (e.g. marketInsights/synthesize.js) to avoid double-counting.
 *
 * @param {Object} opts
 * @param {string} opts.model          - virtual alias (e.g. 'aisha-summary')
 * @param {Array}  opts.messages       - OpenAI-style messages
 * @param {number} [opts.temperature]
 * @param {string} [opts.tenantId]     - for LiteLLM spend metadata
 * @param {number} [opts.maxTokens]
 * @param {Array}  [opts.tools]        - OpenAI tool schemas (optional)
 * @param {boolean} [opts.skipActivityLog=false] - skip logLLMActivity (caller logs it)
 * @param {string}  [opts.nodeId]      - override node identifier in telemetry
 * @param {string}  [opts.requestId]   - correlation ID propagated to telemetry
 */
export async function callLiteLLMVirtual({
  model,
  messages,
  temperature = 0.2,
  tenantId = null,
  maxTokens = null,
  tools = null,
  skipActivityLog = false,
  nodeId = null,
  requestId = null,
  _fetch = _defaultFetch,
}) {
  const baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000';
  const masterKey = process.env.LITELLM_MASTER_KEY;

  const body = {
    model,
    messages,
    temperature,
    metadata: { user_id: tenantId || 'system' },
  };
  if (maxTokens != null) body.max_tokens = maxTokens;
  if (tools && tools.length > 0) body.tools = tools;

  const headers = { 'Content-Type': 'application/json' };
  if (masterKey) headers.Authorization = `Bearer ${masterKey}`;

  const t0 = Date.now();
  let resp;
  try {
    resp = await _fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
  } catch (err) {
    const durationMs = Date.now() - t0;
    const result = { status: 'error', error: `LiteLLM transport error: ${err.message}` };
    _emit({
      model,
      messages,
      tools,
      tenantId,
      nodeId,
      requestId,
      durationMs,
      result,
      skipActivityLog,
    });
    return result;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '(unreadable body)');
    const durationMs = Date.now() - t0;
    const result = { status: 'error', error: `LiteLLM HTTP ${resp.status}: ${text}` };
    _emit({
      model,
      messages,
      tools,
      tenantId,
      nodeId,
      requestId,
      durationMs,
      result,
      skipActivityLog,
    });
    return result;
  }

  let json;
  try {
    json = await resp.json();
  } catch {
    const durationMs = Date.now() - t0;
    const result = { status: 'error', error: 'LiteLLM response was not valid JSON' };
    _emit({
      model,
      messages,
      tools,
      tenantId,
      nodeId,
      requestId,
      durationMs,
      result,
      skipActivityLog,
    });
    return result;
  }

  const durationMs = Date.now() - t0;
  const content = String(json?.choices?.[0]?.message?.content || '');
  const result = { status: 'success', content, raw: json };
  _emit({
    model,
    messages,
    tools,
    tenantId,
    nodeId,
    requestId,
    durationMs,
    result,
    usage: json?.usage,
    skipActivityLog,
  });
  return result;
}

/**
 * callViaLiteLLM
 *
 * Call LiteLLM with explicit provider/model (e.g. provider='anthropic', model='claude-3-5-sonnet-…').
 * Writes to audit log only — activity log is handled by the higher-level llmClient.js / aiBrain.js
 * callers that already call logLLMActivity with richer context (capability, attempt, failover info).
 *
 * Pass skipAuditLog=true in unit tests that don't want file-system side effects.
 */
export async function callViaLiteLLM({
  provider,
  model,
  messages,
  temperature,
  tenantId,
  maxTokens = null,
  nodeId = null,
  requestId = null,
  skipAuditLog = false,
  _fetch = _defaultFetch,
}) {
  // Pass provider/model directly — litellm_config.yaml has local/*, anthropic/*,
  // openai/*, and groq/* wildcard routes so no prefix translation is needed here.
  const litellmModel = `${provider}/${model}`;
  const baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000';
  const masterKey = process.env.LITELLM_MASTER_KEY;

  const body = {
    model: litellmModel,
    messages,
    temperature,
    metadata: { user_id: tenantId || 'system' },
  };
  if (maxTokens != null) body.max_tokens = maxTokens;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (masterKey) headers.Authorization = `Bearer ${masterKey}`;

  const t0 = Date.now();
  let resp;
  try {
    resp = await _fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // 5 min — matches LOCAL_LLM_TIMEOUT_MS; LiteLLM router timeout is also 300s
      signal: AbortSignal.timeout(300_000),
    });
  } catch (err) {
    const durationMs = Date.now() - t0;
    if (!skipAuditLog) {
      appendAuditEntry({
        model: litellmModel,
        provider,
        tenantId,
        messages,
        nodeId,
        requestId,
        durationMs,
        status: 'error',
        error: err.message,
      });
    }
    return { status: 'error', error: `LiteLLM transport error: ${err.message}` };
  }

  if (!resp.ok) {
    const text = await resp.text();
    const durationMs = Date.now() - t0;
    if (!skipAuditLog) {
      appendAuditEntry({
        model: litellmModel,
        provider,
        tenantId,
        messages,
        nodeId,
        requestId,
        durationMs,
        status: 'error',
        error: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
      });
    }
    return { status: 'error', error: `LiteLLM HTTP ${resp.status}: ${text}` };
  }

  const json = await resp.json();
  const durationMs = Date.now() - t0;
  const content = String(json?.choices?.[0]?.message?.content || '');
  if (!skipAuditLog) {
    appendAuditEntry({
      model: litellmModel,
      provider,
      tenantId,
      messages,
      nodeId,
      requestId,
      usage: json?.usage,
      respContent: content,
      durationMs,
      status: 'success',
    });
  }
  return {
    status: 'success',
    content,
    raw: json,
  };
}

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Fire-and-forget telemetry for callLiteLLMVirtual.
 * Errors are swallowed — telemetry must never affect the caller.
 */
function _emit({
  model,
  messages,
  tools,
  tenantId,
  nodeId,
  requestId,
  durationMs,
  result,
  usage,
  skipActivityLog,
}) {
  try {
    const status = result.status;
    const error = result.error || null;
    const u = usage || result.raw?.usage || null;

    appendAuditEntry({
      model,
      provider: 'litellm-virtual',
      tenantId,
      messages,
      tools,
      nodeId,
      requestId,
      usage: u,
      respContent: result.content || null,
      durationMs,
      status,
      error,
    });

    if (!skipActivityLog) {
      logLLMActivity({
        tenantId: tenantId || 'unknown',
        capability: 'virtual',
        provider: 'litellm-virtual',
        model,
        nodeId: nodeId || `litellm:${model}`,
        status,
        durationMs,
        error,
        usage: u,
        requestId,
      });
    }
  } catch (_) {
    // swallow
  }
}
