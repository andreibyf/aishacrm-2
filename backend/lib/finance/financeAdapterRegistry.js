/**
 * financeAdapterRegistry.js
 *
 * Read-only, declarative metadata describing the accounting adapters the
 * Finance Ops runtime knows about. This module is the honest source-of-truth
 * for `GET /api/v2/finance/adapters` (design freeze §6.7): it answers "which
 * adapters exist, are they sandbox-only, are provider writes disabled, what
 * capabilities are declared, are they available for read/status display?"
 *
 * HARD BOUNDARIES (Finance Read API Slice 1):
 *   - Metadata / status / capability discovery ONLY.
 *   - Does NOT instantiate an adapter, read or resolve credentials, open a
 *     network connection, or expose any provider-write / sync / retry path.
 *   - Pure function of its input flag — no I/O, no side effects.
 *
 * Capabilities reflect the real ERPNext sandbox adapter method set
 * (`backend/lib/finance/accountingAdapters/erpnextSandboxAdapter.js`):
 * `pushDraft` / `syncStatus` / `reconcile` are implemented; `pushFinal` throws
 * `AdapterCapabilityError` (`:336-340`) because Slice 2 is draft-only, so it is
 * surfaced under `unsupported`, never advertised as a capability.
 *
 * Registration status is NOT static. The adapter worker only registers the
 * ERPNext adapter when all three `FINANCE_ERPNEXT_*` credentials are present
 * AND `createErpnextSandboxAdapter(...)` succeeds; the constructor rejects a
 * non-sandbox / non-allowlisted base URL (`erpnextSandboxAdapter.js:162`),
 * leaving the worker registry empty (`financeAdapterWorker.js:484-516`). This
 * module mirrors BOTH halves of that gate via the shared `isSandboxBaseUrl`
 * validator so the UI never claims `registered` in the cases where the worker
 * would skip the adapter:
 *   - credentials absent            → `not_registered`
 *   - credentials present, bad URL  → `configuration_invalid`
 *   - credentials present, sandbox  → `registered`
 * It validates configuration, not a live connection — no network, no
 * credential values surfaced.
 */
import { isSandboxBaseUrl } from './accountingAdapters/erpnextSandboxAdapter.js';

/**
 * Resolve the ERPNext adapter's registration status from its configuration,
 * mirroring the worker's registration gate. Pure: no I/O, no network.
 */
function resolveErpnextStatus({ baseUrl, apiKey, apiSecret, sandboxAllowlist = [] } = {}) {
  const credentialsPresent = Boolean(baseUrl && apiKey && apiSecret);
  if (!credentialsPresent) {
    return { status: 'not_registered', credentials_resolved: false };
  }
  if (!isSandboxBaseUrl(baseUrl, sandboxAllowlist)) {
    return { status: 'configuration_invalid', credentials_resolved: true };
  }
  return { status: 'registered', credentials_resolved: true };
}

/**
 * The known adapters as static declarative descriptors. There is exactly one
 * today (the ERPNext sandbox adapter). New adapters are added here as plain
 * metadata; this registry never holds a runnable adapter instance.
 */
const KNOWN_ADAPTERS = Object.freeze([
  Object.freeze({
    name: 'erpnext_sandbox',
    kind: 'sandbox',
    mode: 'draft_only',
    capabilities: Object.freeze(['push_draft', 'sync_status', 'reconcile']),
    unsupported: Object.freeze(['push_final']),
    base_url_guarded_to: 'sandbox',
    production_allowed: false,
  }),
]);

/**
 * Return the declarative metadata for every known finance adapter.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.providerWritesEnabled=false] runtime value of the
 *   `FINANCE_PROVIDER_WRITES_ENABLED` kill switch. Reflected verbatim per
 *   adapter so the UI can honestly show provider writes are disabled; the
 *   registry never enables or triggers a write itself.
 * @param {object} [opts.erpnext] the ERPNext credential/config signal used to
 *   resolve registration status: `{ baseUrl, apiKey, apiSecret, sandboxAllowlist }`.
 *   Validated against the same sandbox gate the worker's adapter constructor uses.
 * @returns {Array<object>} one §6.7-shaped descriptor per adapter
 */
export function listFinanceAdapters({ providerWritesEnabled = false, erpnext = {} } = {}) {
  const { status, credentials_resolved } = resolveErpnextStatus(erpnext);
  return KNOWN_ADAPTERS.map((adapter) => ({
    name: adapter.name,
    kind: adapter.kind,
    mode: adapter.mode,
    capabilities: [...adapter.capabilities],
    unsupported: [...adapter.unsupported],
    provider_writes_enabled: providerWritesEnabled === true,
    base_url_guarded_to: adapter.base_url_guarded_to,
    // Honest registration signal mirroring the worker's gate (presence +
    // sandbox-URL validity): registered | configuration_invalid | not_registered.
    status,
    production_allowed: adapter.production_allowed,
    // Credential VALUES are never surfaced — only whether they are present.
    config_summary: { tier: adapter.kind, credentials_resolved },
  }));
}

export default listFinanceAdapters;
