/**
 * Safe Supabase count helper for report queries.
 */

import { getSupabaseClient } from '../supabase-db.js';
import logger from '../logger.js';

/**
 * Safe count helper — returns 0 on any error instead of throwing.
 *
 * @param {*}        _         Unused (kept for call-site compat with v1 signature)
 * @param {string}   table     Supabase table name
 * @param {string}   tenant_id Tenant UUID filter (optional)
 * @param {Function} filterFn  Additional query filter (optional)
 * @param {object}   opts      Options: includeTestData, countMode
 */
export async function safeCount(_, table, tenant_id, filterFn, opts = {}) {
  try {
    const supabase = getSupabaseClient();
    const { includeTestData = true, countMode = 'exact' } = opts;
    let q = supabase.from(table).select('*', { count: countMode, head: true });
    if (tenant_id) q = q.eq('tenant_id', tenant_id);
    if (filterFn) q = filterFn(q);
    if (!includeTestData) {
      try {
        q = q.or('is_test_data.is.false,is_test_data.is.null');
      } catch {
        /* ignore */ void 0;
      }
    }
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    logger.error(`[reports.v2] safeCount error for ${table}:`, err.message);
    return 0;
  }
}
