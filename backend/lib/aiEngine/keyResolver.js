/**
 * Unified LLM API key resolver for OpenAI (future-proofed for Anthropic/local models).
 */

import { getSupabaseClient } from "../supabase-db.js";
const supa = getSupabaseClient();

export async function resolveLLMApiKey({
  explicitKey,
  headerKey,
  userKey,
  tenantSlugOrId,
  provider = "openai",
} = {}) {
  // Highest precedence: explicit overrides
  if (explicitKey) return explicitKey;
  if (headerKey) return headerKey;
  if (userKey) return userKey;

  // Tenant-specific integration (tenant_integrations.openai_llm)
  if (tenantSlugOrId) {
    try {
      const { data, error } = await supa
        .from("tenant_integrations")
        .select("api_credentials, integration_type, is_active")
        .eq("tenant_id", tenantSlugOrId)
        .eq("is_active", true)
        .in("integration_type", ["openai_llm"])
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

  // System-level OpenAI settings (system_settings.settings.system_openai_settings)
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
      const systemOpenAI = settings.system_openai_settings;
      if (systemOpenAI?.enabled && systemOpenAI?.openai_api_key) {
        return systemOpenAI.openai_api_key;
      }
    }
  } catch (e) {
    console.warn("[AIEngine][KeyResolver] system_settings lookup failed:", e?.message || e);
  }

  // Legacy admin/superadmin fallback (users.system_openai_settings)
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

  // Environment fallback
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  return null;
}
