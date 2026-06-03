/**
 * financeDataMode.js
 *
 * Per-tenant Finance data mode: `test` (sandbox) vs `live` (real). Superadmin
 * controls it from Finance → Settings. It is stored in the tenant's `financeOps`
 * (or alias) `modulesettings` row under `settings.data_mode`.
 *
 * Mode meaning:
 *   - `test`: finance writes are sandbox/throwaway data — auto-flagged
 *     `is_test_data` (persistent engine) or kept in the ephemeral in-memory
 *     bucket (no persistent infra), and clearable via the per-tenant QA
 *     "Clear Test Data" button.
 *   - `live`: real finance data.
 *
 * Default is `test` (M-6 posture: a tenant must be explicitly promoted to `live`
 * by a superadmin — never default to writing real data).
 *
 * Pure resolution (`resolveFinanceDataMode`) has no I/O and is unit-testable
 * without mocking; `fetchFinanceDataMode` does the Supabase read. Mirrors
 * financeModuleGate.js.
 */

import { FINANCE_MODULE_KEYS } from './financeModuleGate.js';

export const FINANCE_DATA_MODES = Object.freeze({
  TEST: 'test',
  LIVE: 'live',
});

const VALID_MODES = new Set([FINANCE_DATA_MODES.TEST, FINANCE_DATA_MODES.LIVE]);

/**
 * Resolve the mode from a tenant's finance modulesettings rows.
 * Default-closed: anything other than an explicit `live` resolves to `test`.
 *
 * @param {Object} [opts]
 * @param {Array<{module_name: string, settings: Object|null}>} [opts.rows=[]]
 *   modulesettings rows for this tenant (financeOps + enterpriseFinance keys).
 * @param {Object} [opts.featureFlags={}]
 *   { financeDataMode: 'test'|'live' } forces the mode regardless of DB.
 * @returns {'test'|'live'}
 */
export function resolveFinanceDataMode({ rows = [], featureFlags = {} } = {}) {
  // Explicit flag override takes precedence over any DB row.
  if (VALID_MODES.has(featureFlags.financeDataMode)) {
    return featureFlags.financeDataMode;
  }

  const validRows = (Array.isArray(rows) ? rows : []).filter(
    (row) =>
      row?.module_name === FINANCE_MODULE_KEYS.CANONICAL ||
      row?.module_name === FINANCE_MODULE_KEYS.ALIAS,
  );

  // CANONICAL (financeOps) wins over the ALIAS when both exist — a Supabase
  // result is unordered, so resolve explicitly (cf. financeModuleGate R-6).
  const canonical = validRows.find((r) => r.module_name === FINANCE_MODULE_KEYS.CANONICAL);
  const match = canonical || validRows[0];

  const mode = match?.settings?.data_mode;
  // Only an explicit 'live' promotes the tenant; everything else is 'test'.
  return mode === FINANCE_DATA_MODES.LIVE ? FINANCE_DATA_MODES.LIVE : FINANCE_DATA_MODES.TEST;
}

/**
 * Fetch the tenant's finance modulesettings rows (with `settings`) and resolve
 * the data mode. This is what route code calls per request.
 *
 * @param {Object}   opts
 * @param {string}   opts.tenantId
 * @param {Function} opts.getSupabaseClient
 * @param {Object}   [opts.featureFlags={}]
 * @returns {Promise<'test'|'live'>}
 */
export async function fetchFinanceDataMode({ tenantId, getSupabaseClient, featureFlags = {} }) {
  if (VALID_MODES.has(featureFlags.financeDataMode)) {
    return featureFlags.financeDataMode;
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('modulesettings')
    .select('module_name, settings')
    .eq('tenant_id', tenantId)
    .in('module_name', [FINANCE_MODULE_KEYS.CANONICAL, FINANCE_MODULE_KEYS.ALIAS]);

  if (error) throw error;
  return resolveFinanceDataMode({ rows: data || [], featureFlags });
}

export default fetchFinanceDataMode;
