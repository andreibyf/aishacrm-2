/**
 * ERPNext Sandbox Adapter — Slice 2A (per slice-2-adapter-runtime-design.md §4.4).
 *
 * Sandbox-only, draft-only implementation of the `AccountingAdapter` interface
 * defined in `docs/architecture/finance/adapter-runtime-contract.md` §2.
 *
 * Hard constraints (per §4.4 + §7):
 *  - `base_url` MUST match a sandbox / local pattern, or the constructor
 *    throws. Production-looking URLs are rejected at construction time. The
 *    default explicit-FQDN allowlist is empty — operators must populate
 *    `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` (passed via `sandboxAllowlist`).
 *  - `pushDraft` always sets `docstatus: 0`. The adapter never calls the
 *    ERPNext submit endpoint (`/api/method/frappe.client.submit`).
 *  - `pushFinal` and `voidRecord` throw `AdapterCapabilityError` — ERPNext's
 *    cancel endpoint requires submission first, which Slice 2 never does.
 *  - All HTTP I/O goes through an injected `httpClient` so unit tests can run
 *    without network access.
 *
 * Two-layer safety (per §4.6): the constructor-level URL guard is one of the
 * two independent layers. The processor-level `FINANCE_PROVIDER_WRITES_ENABLED`
 * code gate is the other (lives in Slice 2B's processor, NOT here).
 */

import { buildProviderPayload } from './providerPayloadBuilder.js';

/**
 * Thrown when an adapter is asked to perform an operation it does not support
 * (e.g., ERPNext sandbox adapter being asked to `pushFinal` or `voidRecord`).
 * Per `adapter-runtime-contract.md` §2 "Required vs optional methods".
 */
export class AdapterCapabilityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AdapterCapabilityError';
    this.code = 'ADAPTER_CAPABILITY_UNSUPPORTED';
    this.details = details;
  }
}

/**
 * Thrown when adapter construction or configuration is invalid (e.g., a
 * non-sandbox base_url). Per the §4.4 hard requirement.
 */
export class AdapterConfigError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AdapterConfigError';
    this.code = 'ADAPTER_CONFIG_INVALID';
    this.status = 400;
    this.details = details;
  }
}

/**
 * Per-canonical-type ERPNext DocType mapping (per `adapter-runtime-contract.md`
 * §5). Slice 2A ships Account + JournalEntry; Invoice / Customer / Payment
 * follow in later packets.
 */
export const ERPNEXT_PROVIDER_OBJECT_MAP = Object.freeze({
  Account: Object.freeze({
    docType: 'Account',
    fields: Object.freeze({
      id: 'name',
      code: 'account_number',
      name: 'account_name',
      classification: 'root_type',
      account_type: 'account_type',
      active: 'disabled', // inverted at mapping time
      parent_account_id: 'parent_account',
    }),
  }),
  JournalEntry: Object.freeze({
    docType: 'Journal Entry',
    fields: Object.freeze({
      doc_number: 'name',
      txn_date: 'posting_date',
      private_note: 'user_remark',
      currency: 'multi_currency',
      lines: 'accounts',
    }),
  }),
});

/**
 * Built-in sandbox patterns accepted by the URL guard. Operators may extend
 * via the `sandboxAllowlist` array (sourced from
 * `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` in production wiring).
 */
const BUILTIN_SANDBOX_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^0\.0\.0\.0$/,
  /\.local$/i,
  /\.lan$/i,
  /\.internal$/i,
  /^sandbox\./i,
  /-sandbox\./i,
];

export function isSandboxBaseUrl(baseUrl, explicitAllowlist) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (err) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  const host = parsed.hostname;
  if (!host) return false;

  if (BUILTIN_SANDBOX_HOST_PATTERNS.some((rx) => rx.test(host))) {
    return true;
  }

  if (Array.isArray(explicitAllowlist) && explicitAllowlist.length > 0) {
    const normalized = host.toLowerCase();
    return explicitAllowlist.some((entry) => {
      if (typeof entry !== 'string') return false;
      return entry.toLowerCase() === normalized;
    });
  }

  return false;
}

/**
 * Construct an ERPNext sandbox adapter. The returned object implements the
 * `AccountingAdapter` interface from `adapter-runtime-contract.md` §2.
 *
 * @param {Object} config
 * @param {string} config.baseUrl — sandbox ERPNext base URL (validated)
 * @param {string} config.apiKey — ERPNext API key
 * @param {string} config.apiSecret — ERPNext API secret
 * @param {Object} config.httpClient — injected HTTP client with `post`, `get`, `put` methods
 * @param {string[]} [config.sandboxAllowlist=[]] — explicit FQDNs to accept;
 *                                                  default is empty (operator must populate
 *                                                  from `FINANCE_ERPNEXT_SANDBOX_BASE_URLS`)
 * @returns {Object} adapter conforming to `AccountingAdapter`
 */
export function createErpnextSandboxAdapter({
  baseUrl,
  apiKey,
  apiSecret,
  httpClient,
  sandboxAllowlist = [],
} = {}) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new AdapterConfigError('ERPNext adapter requires a baseUrl string', { baseUrl });
  }
  if (!apiKey || typeof apiKey !== 'string') {
    throw new AdapterConfigError('ERPNext adapter requires an apiKey string');
  }
  if (!apiSecret || typeof apiSecret !== 'string') {
    throw new AdapterConfigError('ERPNext adapter requires an apiSecret string');
  }
  if (!httpClient || typeof httpClient !== 'object') {
    throw new AdapterConfigError('ERPNext adapter requires an injected httpClient');
  }

  if (!isSandboxBaseUrl(baseUrl, sandboxAllowlist)) {
    throw new AdapterConfigError(
      `ERPNext adapter base_url does not match a sandbox pattern: "${baseUrl}". ` +
        'Acceptable patterns: localhost, 127.0.0.1, *.local, *.lan, *.internal, ' +
        'sandbox.*, *-sandbox.*, or an FQDN explicitly listed in ' +
        'FINANCE_ERPNEXT_SANDBOX_BASE_URLS (via sandboxAllowlist).',
      { baseUrl, sandboxAllowlistSize: sandboxAllowlist.length },
    );
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const authHeader = `token ${apiKey}:${apiSecret}`;

  const adapter = {
    provider: 'erpnext',
    mode: 'draft_only',

    // ---- Connection ------------------------------------------------------
    async checkHealth() {
      const started = Date.now();
      try {
        const res = await httpClient.get(
          `${normalizedBase}/api/method/frappe.auth.get_logged_user`,
          { headers: { Authorization: authHeader } },
        );
        return {
          ok: true,
          latency_ms: Date.now() - started,
          provider: 'erpnext',
          provider_response: res?.data ?? null,
        };
      } catch (err) {
        return {
          ok: false,
          latency_ms: Date.now() - started,
          provider: 'erpnext',
          error: err?.message ?? String(err),
        };
      }
    },

    // ---- Reads -----------------------------------------------------------
    async fetchObject(objectType, providerId) {
      const docType = resolveDocType(objectType);
      const res = await httpClient.get(
        `${normalizedBase}/api/resource/${encodeURIComponent(docType)}/${encodeURIComponent(
          providerId,
        )}`,
        { headers: { Authorization: authHeader } },
      );
      return res?.data?.data ?? res?.data ?? null;
    },

    async listObjects(objectType, opts = {}) {
      const docType = resolveDocType(objectType);
      const params = {
        limit_page_length: opts.limit ?? 20,
      };
      if (opts.cursor) params.limit_start = opts.cursor;
      const res = await httpClient.get(
        `${normalizedBase}/api/resource/${encodeURIComponent(docType)}`,
        { headers: { Authorization: authHeader }, params },
      );
      const items = res?.data?.data ?? [];
      return {
        items,
        next_cursor:
          items.length === params.limit_page_length
            ? String(Number(opts.cursor ?? 0) + items.length)
            : null,
      };
    },

    // ---- Mapping ---------------------------------------------------------
    toCanonical(providerObject, objectType) {
      const map = ERPNEXT_PROVIDER_OBJECT_MAP[objectType];
      if (!map) {
        return { ok: false, error: `Unsupported objectType: ${objectType}` };
      }
      const data = {};
      const unmapped = [];
      for (const [canonicalField, providerField] of Object.entries(map.fields)) {
        if (providerField === null) continue;
        if (providerObject && providerField in providerObject) {
          let val = providerObject[providerField];
          // Invert ERPNext's `disabled` to canonical `active`
          if (objectType === 'Account' && canonicalField === 'active') {
            val = !val;
          }
          data[canonicalField] = val;
        }
      }
      if (providerObject) {
        const mappedProviderFields = new Set(Object.values(map.fields).filter((v) => v !== null));
        for (const k of Object.keys(providerObject)) {
          if (!mappedProviderFields.has(k)) unmapped.push(k);
        }
      }
      return { ok: true, data, unmapped_fields: unmapped };
    },

    fromCanonical(canonicalObject, objectType) {
      const map = ERPNEXT_PROVIDER_OBJECT_MAP[objectType];
      if (!map) {
        return { ok: false, error: `Unsupported objectType: ${objectType}` };
      }
      const data = {};
      for (const [canonicalField, providerField] of Object.entries(map.fields)) {
        if (providerField === null) continue;
        if (canonicalObject && canonicalField in canonicalObject) {
          let val = canonicalObject[canonicalField];
          if (objectType === 'Account' && canonicalField === 'active') {
            val = val ? 0 : 1; // ERPNext stores `disabled` as inverted int flag
          }
          data[providerField] = val;
        }
      }
      return { ok: true, data };
    },

    // ---- Writes ----------------------------------------------------------
    async pushDraft(canonicalObject, ctx = {}) {
      // ctx may be a string (objectType) for backwards compatibility, or an
      // object containing { objectType, runtimePolicy }. Slice 2B's processor
      // passes the richer ctx form.
      const objectType = typeof ctx === 'string' ? ctx : ctx.objectType;
      const runtimePolicy = typeof ctx === 'string' ? {} : (ctx.runtimePolicy ?? {});

      if (!objectType) {
        throw new AdapterConfigError('pushDraft requires an objectType', { ctx });
      }

      const map = ERPNEXT_PROVIDER_OBJECT_MAP[objectType];
      if (!map) {
        throw new AdapterConfigError(`Unsupported objectType: ${objectType}`, { objectType });
      }

      // 1. Project canonical → ERPNext shape via the field map.
      const mapped = adapter.fromCanonical(canonicalObject, objectType);
      if (!mapped.ok) {
        throw new AdapterConfigError(mapped.error, { objectType });
      }

      // 2. Strip internal AiSHA metadata at the provider boundary (per §4.5).
      //    Allow `docstatus` and `doctype` because they are ERPNext-native
      //    fields the payload builder might otherwise flag (they don't appear
      //    in the denylist today, but future contributors might add them).
      const stripped = buildProviderPayload(mapped.data, {
        allowlist: runtimePolicy.allowlist,
        ...runtimePolicy,
      });

      // 3. Always docstatus=0 — draft posture is the whole point of this adapter.
      const erpnextPayload = {
        ...stripped,
        doctype: map.docType,
        docstatus: 0,
      };

      // 4. POST to ERPNext.
      const res = await httpClient.post(
        `${normalizedBase}/api/resource/${encodeURIComponent(map.docType)}`,
        erpnextPayload,
        { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } },
      );

      const providerData = res?.data?.data ?? res?.data ?? {};
      return {
        ok: true,
        provider_id: providerData.name ?? null,
        provider_response: providerData,
      };
    },

    async pushFinal(_canonicalObject, _objectType, _approvalId) {
      throw new AdapterCapabilityError(
        'pushFinal is not supported by the ERPNext sandbox adapter — Slice 2 is draft-only',
        { provider: 'erpnext', operation: 'push_final' },
      );
    },

    async syncStatus(providerId, objectType) {
      const docType = resolveDocType(objectType);
      const res = await httpClient.get(
        `${normalizedBase}/api/resource/${encodeURIComponent(docType)}/${encodeURIComponent(
          providerId,
        )}`,
        { headers: { Authorization: authHeader } },
      );
      const data = res?.data?.data ?? res?.data ?? {};
      const erpnextStatus = data?.docstatus;
      let canonical_status = 'draft';
      if (erpnextStatus === 1) canonical_status = 'posted';
      else if (erpnextStatus === 2) canonical_status = 'void';
      return {
        ok: true,
        status: String(erpnextStatus ?? 'unknown'),
        canonical_status,
        provider_response: data,
      };
    },

    async voidRecord(_providerId, _objectType, _approvalId) {
      throw new AdapterCapabilityError(
        'voidRecord is not supported by the ERPNext sandbox adapter — requires submission first',
        { provider: 'erpnext', operation: 'void' },
      );
    },

    // `reconcile` is read-only and sandbox-OK per §4.4 and the §4.6 permission
    // matrix. Slice 2A keeps it as a minimal listObjects-based diff hook.
    async reconcile(objectType, since) {
      const listed = await adapter.listObjects(objectType, { limit: 100 });
      return {
        object_type: objectType,
        since: since ?? null,
        matched: listed.items.length,
        drifted: 0,
        missing_from_provider: 0,
        missing_from_canonical: 0,
        drift_items: [],
      };
    },
  };

  return adapter;
}

function resolveDocType(objectType) {
  const map = ERPNEXT_PROVIDER_OBJECT_MAP[objectType];
  if (!map) {
    throw new AdapterConfigError(`Unsupported objectType: ${objectType}`, { objectType });
  }
  return map.docType;
}

export default {
  createErpnextSandboxAdapter,
  AdapterCapabilityError,
  AdapterConfigError,
  ERPNEXT_PROVIDER_OBJECT_MAP,
};
