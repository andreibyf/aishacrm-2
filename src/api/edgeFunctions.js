// Minimal helpers to interact with Supabase Edge Functions for person-profile
import { supabase } from '@/lib/supabase';

function getRuntimeEnv(key) {
  if (typeof window !== 'undefined' && window._env_) return window._env_[key];
  return import.meta.env[key];
}

export async function getSupabaseAccessToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

export function getSupabaseFunctionsBase() {
  const supabaseUrl = getRuntimeEnv('VITE_SUPABASE_URL') || '';
  // Derive functions base: https://<ref>.functions.supabase.co
  if (supabaseUrl.includes('.supabase.co')) {
    return supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
  }
  return supabaseUrl; // fallback
}

// Returns a temporary, shareable URL minted by the Edge Function
export async function mintLeadLink({ id }) {
  const base = getSupabaseFunctionsBase();
  const token = await getSupabaseAccessToken();
  if (!base || !id) throw new Error('Missing base or id');
  if (!token) throw new Error('Not authenticated');

  const url = `${base}/mint-lead-link?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'omit',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Mint failed (${res.status})`);
  }
  const data = await res.json().catch(() => null);
  // Accept either { url } or plain string
  const finalUrl = (data && (data.url || data.link)) || null;
  if (!finalUrl) throw new Error('No URL in mint response');
  return finalUrl;
}

// Build direct person-profile URL (requires Authorization to access)
export function buildPersonProfileUrl(id) {
  const base = getSupabaseFunctionsBase();
  return `${base}/person-profile/${encodeURIComponent(id)}`;
}
