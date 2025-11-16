// Canonical tenant resolver
// Accepts any identifier (UUID, slug, special 'system') and returns
//   { uuid, slug, source, found }
// Rules:
//   • If identifier === 'system' and SYSTEM_TENANT_ID is set -> uuid from env, slug 'system'
//   • If UUID pattern -> look up tenant by id; if found use row.tenant_id as slug, else keep input slug form
//   • If not UUID -> treat as slug, look up tenant by tenant_id; if found attach uuid
//   • Fallback uuid: null (archival code will substitute sentinel or SYSTEM_TENANT_ID)
// Designed for Supabase PostgREST via getSupabaseClient().

import { getSupabaseClient } from './supabase-db.js';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export async function resolveCanonicalTenant(identifier) {
  const supa = getSupabaseClient();
  const input = (identifier || '').trim();
  if (!input) {
    return { uuid: null, slug: null, source: 'empty', found: false };
  }

  // System special-case
  if (input === 'system') {
    const envUuid = process.env.SYSTEM_TENANT_ID && isUuid(process.env.SYSTEM_TENANT_ID)
      ? process.env.SYSTEM_TENANT_ID.trim()
      : null;
    return { uuid: envUuid, slug: 'system', source: envUuid ? 'env' : 'system-slug', found: !!envUuid };
  }

  // UUID path
  if (isUuid(input)) {
    try {
      const { data, error } = await supa
        .from('tenant')
        .select('id, tenant_id')
        .eq('id', input)
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        return { uuid: data.id, slug: data.tenant_id || data.id, source: 'db-id', found: true };
      }
      // Unknown UUID; treat slug as UUID string itself
      return { uuid: input, slug: input, source: 'uuid-input', found: false };
    } catch {
      return { uuid: input, slug: input, source: 'uuid-error', found: false };
    }
  }

  // Slug path
  try {
    const { data, error } = await supa
      .from('tenant')
      .select('id, tenant_id')
      .eq('tenant_id', input)
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (data) {
      return { uuid: data.id, slug: data.tenant_id, source: 'db-slug', found: true };
    }
    return { uuid: null, slug: input, source: 'slug-input', found: false };
  } catch {
    return { uuid: null, slug: input, source: 'slug-error', found: false };
  }
}
