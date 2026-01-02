/**
 * Centralized Supabase Client Factory
 * Single source of truth for all Supabase client creation
 * 
 * Provides two clients:
 * 1. getSupabaseAdmin() - Service role client for admin operations
 * 2. getSupabaseDB() - DB client with performance tracking (reusing existing timed fetch wrapper)
 */

import { createClient } from '@supabase/supabase-js';
import { addDbTime } from './requestContext.js';

let adminClient = null;
let dbClient = null;

/**
 * Get Supabase Admin Client (service role key)
 * Use for: Auth operations, RLS bypass, admin tasks
 * @param {Object} options - Configuration options
 * @param {boolean} options.throwOnMissing - Whether to throw error if credentials missing (default: true)
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function getSupabaseAdmin({ throwOnMissing = true } = {}) {
  if (adminClient) return adminClient;
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    if (throwOnMissing) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    return null;
  }
  
  adminClient = createClient(url, key, {
    auth: { 
      autoRefreshToken: false, 
      persistSession: false 
    },
  });
  
  console.log('✓ Supabase Admin client initialized');
  return adminClient;
}

/**
 * Get Supabase DB Client (with performance tracking)
 * Use for: Regular DB queries with timed fetch wrapper
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseDB() {
  if (dbClient) return dbClient;
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  // Wrap fetch to time all Supabase HTTP calls
  const baseFetch = globalThis.fetch?.bind(globalThis);
  const timedFetch = async (input, init) => {
    const t0 = Number(process.hrtime.bigint()) / 1e6;
    try {
      return await (baseFetch ? baseFetch(input, init) : fetch(input, init));
    } finally {
      const t1 = Number(process.hrtime.bigint()) / 1e6;
      addDbTime(Math.max(0, t1 - t0));
    }
  };

  dbClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      fetch: timedFetch
    }
  });
  
  console.log('✓ Supabase DB client initialized with performance tracking');
  return dbClient;
}

/**
 * Get storage bucket name from environment
 * @returns {string} Bucket name
 */
export function getBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || 'tenant-assets';
}

/**
 * Reset clients (useful for testing)
 * @internal
 */
export function _resetClients() {
  adminClient = null;
  dbClient = null;
}
