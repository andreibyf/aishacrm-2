/**
 * Unified LLM API key resolver for multi-provider support.
 * 
 * Supports providers:
 * - openai: OpenAI API
 * - anthropic: Anthropic Claude API
 * - groq: Groq API
 * - local: Local OpenAI-compatible server
 */

import { getSupabaseClient } from "../supabase-db.js";
// Note: Do NOT call getSupabaseClient() at module load time - defer to function call

/**
 * Map provider name to integration_type values in tenant_integrations table.
 */
const PROVIDER_INTEGRATION_TYPES = {
  openai: ["openai_llm"],
  anthropic: ["anthropic_llm"],
  groq: ["groq_llm"],
  local: ["local_llm"],
};

/**
 * resolveLLMApiKey
 * 
 * Resolution order:
 * 1. explicitKey / headerKey / userKey (passed in)
 * 2. tenant_integrations row for this tenant + provider
 * 3. system_settings.settings.system_openai_settings (for OpenAI) or system_anthropic_settings
 * 4. Legacy users.system_openai_settings (admin fallback)
 * 5. Environment variable for provider (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
 * 
 * @param {Object} opts
 * @param {string} [opts.explicitKey] - Explicitly passed API key
 * @param {string} [opts.headerKey] - API key from request header
 * @param {string} [opts.userKey] - API key from user settings
 * @param {string} [opts.tenantSlugOrId] - Tenant identifier
 * @param {string} [opts.provider] - "openai" | "anthropic" | "groq" | "local"
 * @returns {Promise<string|null>} Resolved API key or null
 */
export async function resolveLLMApiKey({
  explicitKey,
  headerKey,
  userKey,
  tenantSlugOrId,
  provider = "openai",
} = {}) {
  // Get Supabase client at call time (after server initialization)
  const supa = getSupabaseClient();

  // Highest precedence: explicit overrides
  if (explicitKey) return explicitKey;
  if (headerKey) return headerKey;
  if (userKey) return userKey;

  // Tenant-specific integration lookup
  const integrationTypes = PROVIDER_INTEGRATION_TYPES[provider] || ["openai_llm"];

  if (tenantSlugOrId) {
    try {
      const { data, error } = await supa
        .from("tenant_integrations")
        .select("api_credentials, integration_type, is_active")
        .eq("tenant_id", tenantSlugOrId)
        .eq("is_active", true)
        .in("integration_type", integrationTypes)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length) {
        const rawCreds = data[0].api_credentials;
        const creds =
          typeof rawCreds === "object" ? rawCreds : JSON.parse(rawCreds || "{}");
        const k = creds.api_key || creds.apiKey || null;
        if (k) return k;
      }
    } catch (e) {
      console.warn("[AIEngine][KeyResolver] tenant_integrations lookup failed:", e?.message || e);
    }
  }

  // System-level settings (provider-aware)
  try {
    const { data, error } = await supa
      .from("system_settings")
      .select("settings")
      .not("settings", "is", null)
      .limit(1);

    if (error) throw error;

    if (data && data.length) {
      const rawSettings = data[0].settings;
      const settings =
        typeof rawSettings === "object"
          ? rawSettings
          : JSON.parse(rawSettings || "{}");

      // Check provider-specific system settings
      if (provider === "openai") {
        const systemOpenAI = settings.system_openai_settings;
        if (systemOpenAI?.enabled && systemOpenAI?.openai_api_key) {
          return systemOpenAI.openai_api_key;
        }
      }

      if (provider === "anthropic") {
        const systemAnthropic = settings.system_anthropic_settings;
        if (systemAnthropic?.enabled && systemAnthropic?.anthropic_api_key) {
          return systemAnthropic.anthropic_api_key;
        }
      }

      if (provider === "groq") {
        const systemGroq = settings.system_groq_settings;
        if (systemGroq?.enabled && systemGroq?.groq_api_key) {
          return systemGroq.groq_api_key;
        }
      }
    }
  } catch (e) {
    console.warn("[AIEngine][KeyResolver] system_settings lookup failed:", e?.message || e);
  }

  // Legacy admin/superadmin fallback (users.system_openai_settings) - OpenAI only
  if (provider === "openai") {
    try {
      const { data, error } = await supa
        .from("users")
        .select("system_openai_settings, role")
        .in("role", ["admin", "superadmin"])
        .not("system_openai_settings", "is", null)
        .order("role", { ascending: true })
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length) {
        const rawSys = data[0].system_openai_settings;
        const systemSettings =
          typeof rawSys === "object" ? rawSys : JSON.parse(rawSys || "{}");
        if (systemSettings.openai_api_key) {
          return systemSettings.openai_api_key;
        }
      }
    } catch (e) {
      console.warn("[AIEngine][KeyResolver] user system_openai_settings lookup failed:", e?.message || e);
    }
  }

  // Environment fallback (per-provider)
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  if (provider === "groq" && process.env.GROQ_API_KEY) {
    return process.env.GROQ_API_KEY;
  }

  if (provider === "local" && process.env.LOCAL_LLM_API_KEY) {
    return process.env.LOCAL_LLM_API_KEY;
  }

  return null;
}
