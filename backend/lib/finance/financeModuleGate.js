/**
 * Finance Module Gate
 *
 * Centralizes Finance Ops access rules so module logic stays out of route files
 * and is independently testable. Prepares for future package-tier entitlements.
 *
 * Canonical module key : 'financeOps'
 * Compatibility alias  : 'enterpriseFinance' (legacy — treated as equivalent)
 */

export const FINANCE_MODULE_KEYS = Object.freeze({
  CANONICAL: 'financeOps',
  ALIAS: 'enterpriseFinance',
});

const FINANCE_MODULE_KEY_SET = new Set([FINANCE_MODULE_KEYS.CANONICAL, FINANCE_MODULE_KEYS.ALIAS]);

/**
 * Pure evaluation from pre-fetched modulesettings rows.
 * No I/O — safe to call in unit tests with no mocking.
 *
 * @param {Object}  [opts]
 * @param {Array<{module_name: string, is_enabled: boolean}>} [opts.rows=[]]
 *   Rows already fetched from modulesettings for this tenant.
 * @param {Object}  [opts.featureFlags={}]
 *   Optional flag overrides. { financeOps: true } forces enable regardless of DB.
 * @returns {boolean}
 */
export function isFinanceOpsEnabled({ rows = [], featureFlags = {} } = {}) {
  // Explicit feature flag takes precedence over any DB row.
  if (featureFlags.financeOps === true) return true;
  if (featureFlags.financeOps === false) return false;

  const validRows = (Array.isArray(rows) ? rows : []).filter((row) =>
    FINANCE_MODULE_KEY_SET.has(row?.module_name),
  );

  if (validRows.length === 0) return false;

  // R-6: When both CANONICAL (financeOps) and ALIAS (enterpriseFinance) rows exist
  // with conflicting is_enabled values, CANONICAL wins. Array.find() on an unordered
  // Supabase result is non-deterministic — explicit resolution is required.
  const canonical = validRows.find((r) => r.module_name === FINANCE_MODULE_KEYS.CANONICAL);
  const match = canonical || validRows[0];

  // M-6: Permissive null fallback removed. A missing or null is_enabled field must
  // not silently expose finance routes. Only an explicit true enables the module.
  return match.is_enabled === true;
}

/**
 * Fetch modulesettings rows for a tenant (financeOps + enterpriseFinance keys).
 *
 * @param {Object}   opts
 * @param {string}   opts.tenantId
 * @param {Function} opts.getSupabaseClient  Factory returning a Supabase client.
 * @returns {Promise<Array>}
 */
export async function fetchFinanceModuleRows({ tenantId, getSupabaseClient }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('modulesettings')
    .select('module_name, is_enabled')
    .eq('tenant_id', tenantId)
    .in('module_name', [FINANCE_MODULE_KEYS.CANONICAL, FINANCE_MODULE_KEYS.ALIAS]);

  if (error) throw error;
  return data || [];
}

/**
 * Composed check: fetch rows then evaluate.
 * This is what route middleware should call.
 *
 * Feature flags short-circuit the DB call — no Supabase round-trip when the
 * flag is set, which matters for tests and emergency overrides.
 *
 * @param {Object}   opts
 * @param {string}   opts.tenantId
 * @param {Function} opts.getSupabaseClient
 * @param {Object}   [opts.featureFlags={}]
 * @returns {Promise<boolean>}
 */
export async function checkFinanceOpsEnabled({ tenantId, getSupabaseClient, featureFlags = {} }) {
  // Short-circuit before hitting DB when flag is explicit.
  if (featureFlags.financeOps === true) return true;
  if (featureFlags.financeOps === false) return false;

  const rows = await fetchFinanceModuleRows({ tenantId, getSupabaseClient });
  return isFinanceOpsEnabled({ rows, featureFlags });
}

export default checkFinanceOpsEnabled;
