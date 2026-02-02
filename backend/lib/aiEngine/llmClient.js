// TESTED AND WORKING - DO NOT MODIFY WITHOUT EXPRESS APPROVAL
// This file has been thoroughly tested and is core to LLM client functionality
// Last verified: 2026-01-31

/**
 * Multi-provider LLM client for chat completions.
 *
 * Supports:
 * - provider: "openai"     -> https://api.openai.com/v1/chat/completions
 * - provider: "groq"       -> https://api.groq.com/openai/v1/chat/completions
 * - provider: "local"      -> LOCAL_LLM_BASE_URL (OpenAI-compatible)
 * - provider: "anthropic"  -> https://api.anthropic.com/v1/messages
 *
 * Returns normalized shape: { status: "success"|"error", content?, raw?, error? }
 */

import fetch from "node-fetch";

// ============================================================================
// OpenAI-compatible providers (openai, groq, local)
// ============================================================================

function resolveOpenAIBaseUrl(provider, explicitBaseUrl) {
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

function resolveOpenAIAuthHeader(provider, explicitApiKey) {
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

async function callOpenAICompatible({ provider, model, messages, temperature, apiKey, baseUrl }) {
  const finalBaseUrl = resolveOpenAIBaseUrl(provider, baseUrl);
  const authHeader = resolveOpenAIAuthHeader(provider, apiKey);

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

// ============================================================================
// Anthropic provider
// ============================================================================

function resolveAnthropicBaseUrl(explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/$/, "");
  return (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
}

/**
 * Convert OpenAI-style messages to Anthropic format.
 * Anthropic uses separate system param and messages array.
 */
function convertToAnthropicFormat(messages) {
  let systemPrompt = "";
  const anthropicMessages = [];

  for (const msg of messages || []) {
    if (msg.role === "system") {
      // Concatenate all system messages into one
      systemPrompt += (systemPrompt ? "\n\n" : "") + (msg.content || "");
    } else if (msg.role === "user" || msg.role === "assistant") {
      anthropicMessages.push({
        role: msg.role,
        content: msg.content || "",
      });
    }
  }

  return { systemPrompt, anthropicMessages };
}

async function callAnthropic({ model, messages, temperature, apiKey, baseUrl }) {
  const finalBaseUrl = resolveAnthropicBaseUrl(baseUrl);

  if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
    return {
      status: "error",
      error: "Missing API key for provider anthropic",
    };
  }

  const finalApiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  const anthropicVersion = process.env.ANTHROPIC_VERSION || "2023-06-01";
  const url = `${finalBaseUrl}/v1/messages`;

  const { systemPrompt, anthropicMessages } = convertToAnthropicFormat(messages);

  // Anthropic requires at least one user message
  if (anthropicMessages.length === 0) {
    anthropicMessages.push({ role: "user", content: "Hello" });
  }

  const body = {
    model,
    max_tokens: 4096,
    messages: anthropicMessages,
    temperature,
  };

  // Only add system if non-empty
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": finalApiKey,
        "anthropic-version": anthropicVersion,
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

    // Anthropic returns content as array of blocks
    let content = "";
    if (json?.content && Array.isArray(json.content)) {
      content = json.content
        .filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join("");
    }

    // Normalize usage to OpenAI-like format
    const usage = json?.usage
      ? {
        prompt_tokens: json.usage.input_tokens || 0,
        completion_tokens: json.usage.output_tokens || 0,
        total_tokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
      }
      : null;

    return {
      status: "success",
      content,
      raw: {
        ...json,
        model: json.model,
        usage,
      },
    };
  } catch (err) {
    return {
      status: "error",
      error: err?.message || String(err),
    };
  }
}

// ============================================================================
// Main export: generateChatCompletion
// ============================================================================

/**
 * generateChatCompletion
 *
 * @param {Object} opts
 * @param {string} opts.provider   - "openai" | "groq" | "local" | "anthropic"
 * @param {string} opts.model      - model name
 * @param {Array}  opts.messages   - OpenAI-style messages [{ role, content }]
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
  // Route to appropriate provider handler
  if (provider === "anthropic") {
    return callAnthropic({ model, messages, temperature, apiKey, baseUrl });
  }

  // OpenAI-compatible providers: openai, groq, local
  return callOpenAICompatible({ provider, model, messages, temperature, apiKey, baseUrl });
}
