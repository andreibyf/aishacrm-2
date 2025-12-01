// Canonical tenant resolver
// Accepts any identifier (UUID, slug, special 'system') and returns
//   { uuid, slug, source, found }
// Rules:
//   • If identifier === 'system' and SYSTEM_TENANT_ID is set -> uuid from env, slug 'system'
//   • If UUID pattern -> look up tenant by id; if found use row.tenant_id as slug, else keep input slug form
//   • If not UUID -> treat as slug, look up tenant by tenant_id; if found attach uuid
//   • Fallback uuid: null (archival code will substitute sentinel or SYSTEM_TENANT_ID)
// Designed for Supabase PostgREST via getSupabaseClient().
// Instrumentation added: cache hit/miss counters and stats export.

import { getSupabaseClient } from './supabase-db.js';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

// Simple in-memory cache (non-persistent) to reduce Supabase lookups
// Key: identifier string, Value: { result, expires }
const _tenantCache = new Map();
const DEFAULT_TTL_MS = parseInt(process.env.TENANT_RESOLVE_CACHE_TTL_MS || '60000', 10); // 60s default
let _cacheHits = 0;
let _cacheMisses = 0;

function getCached(identifier) {
  const entry = _tenantCache.get(identifier);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    _tenantCache.delete(identifier);
    return null;
  }
  _cacheHits++;
  return entry.result;
}

function setCached(identifier, result) {
  _tenantCache.set(identifier, { result, expires: Date.now() + DEFAULT_TTL_MS });
}

export function getTenantResolveCacheStats() {
  return {
    ttlMs: DEFAULT_TTL_MS,
    size: _tenantCache.size,
    hits: _cacheHits,
    misses: _cacheMisses,
    hitRatio: _cacheHits + _cacheMisses === 0 ? 0 : _cacheHits / (_cacheHits + _cacheMisses),
  };
}

export function clearTenantResolveCache() {
  _tenantCache.clear();
  _cacheHits = 0;
  _cacheMisses = 0;
}

export async function resolveCanonicalTenant(identifier) {
  const supa = getSupabaseClient();
  const input = (identifier || '').trim();
  if (!input) {
    return { uuid: null, slug: null, source: 'empty', found: false };
  }

  // Cache hit
  const cached = getCached(input);
  if (cached) return { ...cached, source: cached.source + '-cache' };

  _cacheMisses++; // Not cached; will attempt resolution

  // System special-case
  if (input === 'system') {
    const envUuid = process.env.SYSTEM_TENANT_ID && isUuid(process.env.SYSTEM_TENANT_ID)
      ? process.env.SYSTEM_TENANT_ID.trim()
      : null;
    const result = { uuid: envUuid, slug: 'system', source: envUuid ? 'env' : 'system-slug', found: !!envUuid };
    setCached(input, result);
    return result;
  }

  // UUID path
  if (isUuid(input)) {
    try {
      // Primary lookup against canonical table name 'tenants' (schema uses plural elsewhere)
      let { data, error } = await supa
        .from('tenants')
        .select('id, tenant_id')
        .eq('id', input)
        .limit(1)
        .single();

      // Fallback for legacy singular table name if plural not found
      // PGRST116 = no rows found, PGRST205 = table not found in schema
      if ((error && (error.code === 'PGRST116' || error.code === 'PGRST205')) || (!data && !error)) {
        const legacy = await supa
          .from('tenant')
          .select('id, tenant_id')
          .eq('id', input)
          .limit(1)
          .single();
        data = legacy.data;
        error = legacy.error;
      }
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        const result = { uuid: data.id, slug: data.tenant_id || null, source: 'db-id', found: true };
        setCached(input, result);
        return result;
      }
      const result = { uuid: input, slug: input, source: 'uuid-input', found: false };
      setCached(input, result);
      return result;
    } catch (err) {
      const result = { uuid: input, slug: input, source: 'uuid-error', found: false };
      setCached(input, result);
      return result;
    }
  }

  // Slug path
  try {
    let { data, error } = await supa
      .from('tenants')
      .select('id, tenant_id')
      .eq('tenant_id', input)
      .limit(1)
      .single();
    // PGRST116 = no rows found, PGRST205 = table not found in schema
    if ((error && (error.code === 'PGRST116' || error.code === 'PGRST205')) || (!data && !error)) {
      const legacy = await supa
        .from('tenant')
        .select('id, tenant_id')
        .eq('tenant_id', input)
        .limit(1)
        .single();
      data = legacy.data;
      error = legacy.error;
    }
    if (error && error.code !== 'PGRST116') throw error;
    if (data) {
      const result = { uuid: data.id, slug: data.tenant_id, source: 'db-slug', found: true };
      setCached(input, result);
      return result;
    }
    const result = { uuid: null, slug: input, source: 'slug-input', found: false };
    setCached(input, result);
    return result;
  } catch {
    const result = { uuid: null, slug: input, source: 'slug-error', found: false };
    setCached(input, result);
    return result;
  }
}
