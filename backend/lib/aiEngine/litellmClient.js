import fetch from 'node-fetch';

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
 * @param {Object} opts
 * @param {string} opts.model        - virtual alias (e.g. 'aisha-summary')
 * @param {Array}  opts.messages     - OpenAI-style messages
 * @param {number} [opts.temperature]
 * @param {string} [opts.tenantId]   - for LiteLLM spend metadata
 * @param {number} [opts.maxTokens]
 * @param {Array}  [opts.tools]      - OpenAI tool schemas (optional)
 */
export async function callLiteLLMVirtual({
  model,
  messages,
  temperature = 0.2,
  tenantId = null,
  maxTokens = null,
  tools = null,
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

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return { status: 'error', error: `LiteLLM HTTP ${resp.status}: ${text}` };
  }

  const json = await resp.json();
  return {
    status: 'success',
    content: String(json?.choices?.[0]?.message?.content || ''),
    raw: json,
  };
}

export async function callViaLiteLLM({
  provider,
  model,
  messages,
  temperature,
  tenantId,
  maxTokens = null,
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

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // 5 min — matches LOCAL_LLM_TIMEOUT_MS; LiteLLM router timeout is also 300s
    signal: AbortSignal.timeout(300_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return { status: 'error', error: `LiteLLM HTTP ${resp.status}: ${text}` };
  }

  const json = await resp.json();
  return {
    status: 'success',
    content: String(json?.choices?.[0]?.message?.content || ''),
    raw: json,
  };
}
