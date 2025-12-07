/**
 * Multi-provider LLM client for OpenAI-style chat completions.
 *
 * Supports:
 * - provider: "openai"  → https://api.openai.com/v1/chat/completions
 * - provider: "groq"    → https://api.groq.com/openai/v1/chat/completions
 * - provider: "local"   → LOCAL_LLM_BASE_URL (OpenAI-compatible)
 *
 * This is intentionally minimal and uses fetch + JSON only,
 * so it can be dropped into existing code that used a single-provider client.
 */

import fetch from "node-fetch";

function resolveBaseUrl(provider, explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/$/, "");

  switch (provider) {
    case "openai":
      return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    case "groq":
      return (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    case "local":
      return (process.env.LOCAL_LLM_BASE_URL || "http://localhost:1234/v1").replace(/\/$/, "");
    default:
      return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  }
}

function resolveAuthHeader(provider, explicitApiKey) {
  if (explicitApiKey) return `Bearer ${explicitApiKey}`;

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return `Bearer ${process.env.OPENAI_API_KEY}`;
  }

  if (provider === "groq" && process.env.GROQ_API_KEY) {
    return `Bearer ${process.env.GROQ_API_KEY}`;
  }

  if (provider === "local" && process.env.LOCAL_LLM_API_KEY) {
    return `Bearer ${process.env.LOCAL_LLM_API_KEY}`;
  }

  return null;
}

/**
 * generateChatCompletion
 *
 * @param {Object} opts
 * @param {string} opts.provider   - "openai" | "groq" | "local"
 * @param {string} opts.model      - model name
 * @param {Array}  opts.messages   - OpenAI-style messages
 * @param {number} [opts.temperature]
 * @param {string} [opts.apiKey]   - explicit API key override
 * @param {string} [opts.baseUrl]  - explicit base URL override
 *
 * @returns {Promise<{ status: "success"|"error", content?: string, raw?: any, error?: string }>}
 */
export async function generateChatCompletion({
  provider = "openai",
  model,
  messages,
  temperature = 0.2,
  apiKey,
  baseUrl,
}) {
  const finalBaseUrl = resolveBaseUrl(provider, baseUrl);
  const authHeader = resolveAuthHeader(provider, apiKey);

  if (!authHeader) {
    return {
      status: "error",
      error: `Missing API key for provider ${provider}`,
    };
  }

  const url = `${finalBaseUrl}/chat/completions`;

  const body = {
    model,
    messages,
    temperature,
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        status: "error",
        error: `HTTP ${resp.status}: ${text}`,
      };
    }

    const json = await resp.json();
    const content =
      json?.choices?.[0]?.message?.content ||
      json?.choices?.[0]?.delta?.content ||
      "";

    return {
      status: "success",
      content: Array.isArray(content)
        ? content.map((c) => (typeof c === "string" ? c : c.text || "")).join("")
        : String(content || ""),
      raw: json,
    };
  } catch (err) {
    return {
      status: "error",
      error: err?.message || String(err),
    };
  }
}
