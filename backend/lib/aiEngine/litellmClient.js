import fetch from 'node-fetch';

export async function callViaLiteLLM({
  provider,
  model,
  messages,
  temperature,
  tenantId,
  maxTokens = null,
}) {
  // Map "local" provider to ollama prefix so LiteLLM routes to aishacrm-ollama.
  const litellmModel = provider === 'local' ? `ollama/${model}` : `${provider}/${model}`;
  const baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000';
  const masterKey = process.env.LITELLM_MASTER_KEY;

  const body = {
    model: litellmModel,
    messages,
    temperature,
    metadata: { user_id: tenantId || 'system' },
  };
  if (maxTokens != null) body.max_tokens = maxTokens;

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json',
    },
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
