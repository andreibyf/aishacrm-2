import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface BraidCredentials {
  api_key?: string;
  apiKey?: string;
}

interface SystemSettings {
  system_openai_settings?: {
    enabled: boolean;
    openai_api_key?: string;
  };
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY environment variables'
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

export async function resolveOpenAIKey(params: {
  explicitKey?: string | null;
  tenantId?: string | null;
}): Promise<string | null> {
  const { explicitKey, tenantId } = params;

  if (explicitKey) return explicitKey;

  const supa = getSupabaseClient();

  // Try tenant integration first (openai_llm)
  if (tenantId) {
    try {
      const { data: ti, error } = await supa
        .from('tenant_integrations')
        .select('api_credentials, integration_type')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .in('integration_type', ['openai_llm'])
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (ti?.length) {
        const creds = ti[0].api_credentials as BraidCredentials || {};
        const k = creds.api_key || creds.apiKey || null;
        if (k) return k;
      }
    } catch (e) {
      // non-fatal
      void e;
    }
  }

  // Fallback to system settings table
  try {
    const { data, error } = await supa
      .from('system_settings')
      .select('settings')
      .not('settings', 'is', null)
      .limit(1);

    if (error) throw error;

    if (data?.length) {
      const settings = data[0].settings;
      const systemOpenAI =
        typeof settings === 'object'
          ? (settings as SystemSettings).system_openai_settings
          : (JSON.parse((settings as string) || '{}') as SystemSettings).system_openai_settings;

      if (systemOpenAI?.enabled && systemOpenAI?.openai_api_key) {
        return systemOpenAI.openai_api_key;
      }
    }
  } catch (e) {
    void e;
  }

  // Final fallback to environment variable
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  return null;
}
