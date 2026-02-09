/**
 * Central LLM model selection logic.
 * Each "capability" maps to a model tier.
 *
 * Supports:
 * - Per-tenant provider/model overrides via env vars:
 *   LLM_PROVIDER__TENANT_<TENANT_KEY>=anthropic
 *   MODEL_<CAPABILITY>__TENANT_<TENANT_KEY>=claude-3-5-sonnet-20241022
 * - Global env fallbacks (MODEL_CHAT_TOOLS, DEFAULT_OPENAI_MODEL, etc.)
 * - Provider-specific defaults (OpenAI vs Anthropic model names)
 */

// DEBUG: Log LLM_PROVIDER at module load time
console.log('[ModelRouter] Module loaded - LLM_PROVIDER=' + process.env.LLM_PROVIDER);

/**
 * Convert tenant slug/id to env-safe key format.
 * e.g., "acme-inc" -> "ACME_INC", "a11dfb63-4b18-4eb8-872e-747af2e37c46" -> "A11DFB63_4B18_..."
 */
function toEnvKey(tenantSlugOrId) {
  if (!tenantSlugOrId) return null;
  return String(tenantSlugOrId)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Get provider-appropriate default model for a capability.
 * @param {string} capability 
 * @param {string} provider 
 * @returns {string} model name
 */
function getProviderDefaultModel(capability, provider) {
  // Anthropic model defaults (updated Jan 2026)
  if (provider === "anthropic") {
    switch (capability) {
      case "chat_light":
        return process.env.ANTHROPIC_MODEL_CHAT_LIGHT || "claude-3-5-haiku-20241022";
      case "chat_tools":
        return process.env.ANTHROPIC_MODEL_CHAT_TOOLS || "claude-sonnet-4-20250514";
      case "json_strict":
        return process.env.ANTHROPIC_MODEL_JSON_STRICT || "claude-3-5-haiku-20241022";
      case "brain_read_only":
        return process.env.ANTHROPIC_MODEL_BRAIN_READ_ONLY || "claude-sonnet-4-20250514";
      case "brain_plan_actions":
        return process.env.ANTHROPIC_MODEL_BRAIN_PLAN_ACTIONS || "claude-sonnet-4-20250514";
      case "realtime_voice":
        return "claude-sonnet-4-20250514"; // No realtime equivalent
      default:
        return "claude-sonnet-4-20250514";
    }
  }

  // Groq model defaults (uses OpenAI-compatible API but different model names)
  if (provider === "groq") {
    switch (capability) {
      case "chat_light":
        return process.env.GROQ_MODEL_CHAT_LIGHT || "llama-3.1-8b-instant";
      case "chat_tools":
        return process.env.GROQ_MODEL_CHAT_TOOLS || "llama-3.3-70b-versatile";
      case "json_strict":
        return process.env.GROQ_MODEL_JSON_STRICT || "llama-3.1-8b-instant";
      case "brain_read_only":
        return process.env.GROQ_MODEL_BRAIN_READ_ONLY || "llama-3.3-70b-versatile";
      case "brain_plan_actions":
        return process.env.GROQ_MODEL_BRAIN_PLAN_ACTIONS || "llama-3.3-70b-versatile";
      default:
        return "llama-3.3-70b-versatile";
    }
  }

  // OpenAI / Local defaults
  return pickModel({ capability });
}

/**
 * pickModel - Get model for capability using global env settings.
 * Used as fallback when no tenant-specific override exists.
 */
export function pickModel({ capability, override } = {}) {
  if (override) return override;

  switch (capability) {
    case "chat_light":
      return (
        process.env.MODEL_CHAT_LIGHT ||
        process.env.DEFAULT_OPENAI_MODEL ||
        "gpt-4o-mini"
      );

    case "chat_tools":
      return (
        process.env.MODEL_CHAT_TOOLS ||
        process.env.DEFAULT_OPENAI_MODEL ||
        "gpt-4o"
      );

    case "json_strict":
      return process.env.MODEL_JSON_STRICT || "gpt-4o-mini";

    case "realtime_voice":
      return (
        process.env.MODEL_REALTIME_VOICE ||
        process.env.OPENAI_REALTIME_MODEL ||
        "gpt-4o-realtime-preview-2024-12-17"
      );

    case "brain_read_only":
      return (
        process.env.MODEL_BRAIN_READ_ONLY ||
        "gpt-4o-mini"
      );

    case "brain_plan_actions":
      return (
        process.env.MODEL_BRAIN_PLAN_ACTIONS ||
        process.env.MODEL_CHAT_TOOLS ||
        process.env.DEFAULT_OPENAI_MODEL ||
        "gpt-4o"
      );

    default:
      return process.env.DEFAULT_OPENAI_MODEL || "gpt-4o";
  }
}

/**
 * selectLLMConfigForTenant
 * 
 * Central function for per-tenant model/provider selection.
 * 
 * Resolution order for provider:
 * 1. providerOverride (explicit param)
 * 2. LLM_PROVIDER__TENANT_<KEY> env var
 * 3. LLM_PROVIDER global env var
 * 4. "openai" default
 * 
 * Resolution order for model:
 * 1. overrideModel (explicit param)
 * 2. MODEL_<CAPABILITY>__TENANT_<KEY> env var
 * 3. Global capability env (MODEL_CHAT_TOOLS, etc.)
 * 4. Provider-appropriate default
 * 
 * @param {Object} opts
 * @param {string} opts.capability - "chat_tools" | "json_strict" | "brain_read_only" | etc.
 * @param {string} [opts.tenantSlugOrId] - tenant identifier for per-tenant lookup
 * @param {string} [opts.overrideModel] - explicit model override
 * @param {string} [opts.providerOverride] - explicit provider override
 * @returns {{ provider: string, model: string }}
 */
export function selectLLMConfigForTenant({
  capability = "chat_tools",
  tenantSlugOrId = null,
  overrideModel = null,
  providerOverride = null,
} = {}) {
  const tenantKey = toEnvKey(tenantSlugOrId);

  // --- Resolve provider ---
  let provider = providerOverride || null;

  // Per-tenant provider env override
  if (!provider && tenantKey) {
    provider = process.env[`LLM_PROVIDER__TENANT_${tenantKey}`] || null;
  }

  // Global provider env
  if (!provider) {
    provider = process.env.LLM_PROVIDER || "openai";
  }

  // --- Resolve model ---
  let model = overrideModel || null;

  // Per-tenant model env override for this capability
  if (!model && tenantKey) {
    const capKey = (capability || "").toUpperCase().replace(/-/g, "_");
    model = process.env[`MODEL_${capKey}__TENANT_${tenantKey}`] || null;
  }

  // Global capability env (pickModel handles this)
  if (!model) {
    // If provider is anthropic or groq, use provider-specific defaults
    if (provider === "anthropic" || provider === "groq") {
      model = getProviderDefaultModel(capability, provider);
    } else {
      model = pickModel({ capability });
    }
  }

  return { provider, model };
}
