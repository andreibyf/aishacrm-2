# Finance Ops — Phase 4-2: Per-Tenant ERPNext Credential Router Design Freeze

**Phase 4-2 — Design freeze for the per-tenant ERPNext credential router (§7 slice #3 of the Phase 4-0 design freeze).**
**Branch:** `feat/finance-ops-phase4-planning`.
**Status:** Design freeze. **No code, no env-var changes, no migration application, no provider writes, no Coolify mutation, no production action by this task.** This packet defines the credential-routing contract; implementation is a separately-dispatched packet downstream of Codex clearing this design + Phase 4-3 (credential encryption) being at least design-frozen (per the §7 implementation cadence rule in Phase 4-0).
**Date:** 2026-05-26
**Related:**
[`phase-4-production-pilot-design-freeze.md`](./phase-4-production-pilot-design-freeze.md) §7 slice #3 (per-tenant ERPNext credential router) — this packet operationalises it ·
[`phase-4-3-credential-encryption-design.md`](./phase-4-3-credential-encryption-design.md) (paired packet — encryption-at-rest for the credentials this router reads) ·
[`phase-4-production-pilot-design-freeze.md`](./phase-4-production-pilot-design-freeze.md) §11.2 row 3 — the activation-gate verification this packet enables ·
[`phase-3-activation-evidence-pack.md`](./phase-3-activation-evidence-pack.md) §7 (16 safety guardrails — sandbox-only URL guard, controlled-tenant scope) ·
[`event-store-persistence.md`](./event-store-persistence.md) (decision E4 — plain-JSONB credential storage is the POC posture this packet helps replace) ·
[`erpnext-staging-sandbox-proof-results.md`](./erpnext-staging-sandbox-proof-results.md) §4 (the "process env credentials, one set per worker" gap this design addresses) ·
`backend/workers/financeAdapterWorker.js:471-516` (the current process-env credential read path the router replaces) ·
`backend/lib/finance/accountingAdapters/erpnextSandboxAdapter.js:89-128` (sandbox-only URL guard — preserved verbatim) ·
`backend/lib/finance/financeWorkerCommon.js:63` (`parseControlledTenantIds()` — the allow-list gate the router obeys) ·
`backend/migrations/004_tenant_integrations.sql` (the `tenant_integrations` table the router reads from)

---

## 1. Purpose and scope

The finance adapter worker today reads ERPNext credentials from process env (`FINANCE_ERPNEXT_BASE_URL`, `FINANCE_ERPNEXT_API_KEY`, `FINANCE_ERPNEXT_API_SECRET`) at boot (`backend/workers/financeAdapterWorker.js:471-516`). It constructs **one** ERPNext sandbox adapter and registers it for **all** tenants the worker processes. That is acceptable for the controlled-tenant single-tenant staging posture: one tenant, one set of credentials, one adapter — the controlled-tenant scope at `financeWorkerCommon.js:63` (`parseControlledTenantIds()`) already constrains the worker to a single allow-listed tenant ID.

The Phase 4 production pilot still operates on a single controlled pilot tenant (Phase 4-0 §5 criterion #1), so the immediate functional gap is small: per-tenant routing only matters once N>1 tenants are enrolled. But the **production posture gap** is large:

- The credentials live in process env, which means they live in Doppler `stg_stg` (or `prd_prd`). That is acceptable for staging but unacceptable for production-tenant scaling — every additional pilot tenant would require an additional pair of Doppler keys and a worker restart.
- The credentials are global to the worker process — there is no per-tenant lookup, no per-tenant isolation, and no per-tenant fallback. If two tenants ever shared a worker, they would share credentials. That is a multi-tenancy contract violation by construction.
- The plain-JSONB storage posture of `tenant_integrations.api_credentials` (decision E4) is itself not acceptable for production credentials. Phase 4-3 designs the encryption-at-rest replacement; Phase 4-2 is the per-tenant lookup that consumes the encrypted credentials Phase 4-3 produces.

Phase 4-2 freezes the design for the **per-tenant credential router**: a runtime component that, given a tenant ID, returns the ERPNext credentials for that tenant (and only that tenant), or signals "no credentials configured" cleanly. The adapter worker then constructs (or reuses) a per-tenant `erpnextSandboxAdapter` against those credentials when processing a job for that tenant.

**Inputs:**

- Phase 4-0 §7 slice #3 contract.
- The existing `tenant_integrations` table (`backend/migrations/004_tenant_integrations.sql`) — already has the `api_credentials JSONB` column, already has `tenant_id` (TEXT — see §3 below), `integration_type`, `is_active`, `config`.
- The existing `erpnextSandboxAdapter` constructor (`backend/lib/finance/accountingAdapters/erpnextSandboxAdapter.js:89-128`) with the sandbox-only URL guard. The router does not weaken this guard; the per-tenant sandbox URL still passes through `AdapterConfigError` rejection of production-looking URLs.
- The controlled-tenant scope at `financeWorkerCommon.js:63`. The router still obeys this — only allow-listed tenants are looked up.

**Outputs of this packet:**

- §3: Pre-existing table shape and the contract changes required.
- §4: Credential router interface contract.
- §5: Tenant isolation contract (the rule that prevents global-credential masquerade).
- §6: Sandbox/local-only routing rule for pilot planning.
- §7: Adapter worker integration — how `financeAdapterWorker.js` selects provider config per tenant after the router lands.
- §8: Fallback/stop behaviour when credentials are missing, invalid, or sandbox-disallowed.
- §9: Audit / logging posture (paired with Phase 4-3's audit logging).
- §10: Required test surface.
- §11: Hard constraints.
- §12: Acceptance checklist.

**Phase 4-2 does NOT:**

- Implement any code. Implementation is a separately-dispatched packet downstream of Codex clearing this design + Phase 4-3 design at minimum (per Phase 4-0 §7 implementation cadence).
- Apply any migration to the `tenant_integrations` table (the Phase 4-3 encryption migration is the only credential-related migration Phase 4 plans).
- Insert any credential rows.
- Flip any flag.
- Authorise live provider writes — `FINANCE_PROVIDER_WRITES_ENABLED=false` stays default-closed; any provider-write window is gated by the Phase 3-10 §6.6 controlled-flip pattern, not by this packet.

---

## 2. Live-execution posture

| What                                                            | Status this task                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| New runtime code                                                | None.                                                                        |
| Doppler `stg_stg` or `prd_prd` env var changed                  | None.                                                                        |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flipped anywhere             | None — stays `false` / unset.                                                |
| `FINANCE_PROVIDER_WRITES_ENABLED` flipped anywhere              | None — stays `false` / unset.                                                |
| Migration to `tenant_integrations` applied                      | None.                                                                        |
| `tenant_integrations` row inserted (staging or production)      | None.                                                                        |
| Backend / worker container restarted                            | None.                                                                        |
| ERPNext / QuickBooks / Xero / NetSuite endpoint contacted       | None.                                                                        |
| Coolify mutation                                                | None.                                                                        |
| Production action of any kind                                   | None.                                                                        |
| Re-read worker entry + adapter + table schema to compile design | **Executed.** Cite-confirmed against current code at the cited line numbers. |

---

## 3. Pre-existing table shape + contract changes

The `tenant_integrations` table already exists (migration 004, applied long ago):

```sql
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  integration_name TEXT,
  is_active BOOLEAN DEFAULT true,
  api_credentials JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ
);
```

**Phase 4-2 design notes on the existing shape:**

| Aspect                               | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant_id TEXT`                     | Existing table stores `tenant_id` as TEXT. CLAUDE.md mandates UUID-based tenant isolation. **Phase 4-2 design contract**: the credential router accepts a UUID-shaped tenant identifier as input. The router's internal SQL maps to the existing TEXT column at query time (the column already stores UUID values as text in practice — every populated row in production / staging stores a UUID-shaped string). The router does not require a column type change; Phase 4-2 implementation packet does not migrate the column. |
| `integration_type TEXT`              | Phase 4-2 reserves the value `'finance.erpnext.sandbox'` (or a similar namespaced string — the implementation packet decides the exact literal, but the design contract is that it is namespaced under `'finance.'` to avoid collision with non-finance integrations).                                                                                                                                                                                                                                                           |
| `is_active BOOLEAN`                  | The router only considers rows with `is_active = true`. Inactive rows are treated as if absent.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `api_credentials JSONB DEFAULT '{}'` | **The plain-JSONB shape is the decision-E4 POC posture.** Phase 4-3 designs the at-rest encryption replacement; Phase 4-2 implementation MUST chain on Phase 4-3 such that decrypted credentials are produced inside the router boundary and never logged. The router contract per §4 hands back already-decrypted credentials; the encryption is invisible above the router boundary.                                                                                                                                           |
| `config JSONB DEFAULT '{}'`          | Phase 4-2 stores the sandbox base URL inside `config` (so credentials and routing-config are separated — credentials get encrypted, config does not). `config.base_url` is the ERPNext sandbox URL; the §6 sandbox-only rule rejects non-sandbox URLs at router exit.                                                                                                                                                                                                                                                            |
| RLS                                  | Migration 011 already enables RLS on `tenant_integrations`. The router runs under the service-role backend client (no per-row RLS filtering at query time — the service role bypasses RLS), but the router itself enforces tenant filtering in the WHERE clause. RLS is a defence-in-depth boundary; the router's own filter is the primary boundary.                                                                                                                                                                            |

**No new column.** Phase 4-2 reuses every existing column. Phase 4-3 may add an encrypted-value column (`api_credentials_encrypted` or equivalent) — that decision belongs to Phase 4-3.

---

## 4. Credential router interface contract

The router is a single function (or small object) the adapter worker calls per tenant:

```
interface ErpnextCredentialRouter {
  /**
   * Look up ERPNext credentials for the given tenant.
   * Returns null if no credentials are configured (NOT thrown — missing-credentials
   * is a normal operating state for tenants not yet enrolled).
   * Throws if credentials are configured but malformed (invalid shape, base URL fails
   * sandbox-only guard, etc.).
   */
  lookup(tenantId: string): Promise<{
    baseUrl: string;
    apiKey: string;
    apiSecret: string;
    sandboxAllowlist: string[];
  } | null>
}
```

**Design rules:**

- **Single tenant per lookup.** No `lookupAll(tenantIds)` shape, no batch API. A batch API would invite the "share credentials across tenants" failure mode the router exists to prevent.
- **Async (Postgres-backed).** The router always returns a Promise — the implementation packet may add caching, but the contract is async.
- **No tenant-id fallback.** If no row matches `tenant_id = $tenantId`, return null. Do NOT match on `tenant_id IS NULL`, on `integration_type = 'finance.erpnext.sandbox'` alone, or on any global / default row. Either credentials exist for this tenant or they don't.
- **Implementation packet may add caching.** The implementation packet may add an in-process TTL cache (e.g., 60 seconds) to avoid hitting Postgres on every adapter job. Cache key must include tenant_id; cache must be invalidated on `is_active` flip or row update (implementation decides how — either short TTL or pg notify). Cache must NEVER persist beyond worker process restart.
- **Read-only.** The router only reads from `tenant_integrations`. Writes (inserting credentials, rotating credentials, deactivating credentials) are out of scope and operator-side actions during Phase 4 planning. A separate management UI or admin runbook handles writes, downstream of Phase 4-2.

---

## 5. Tenant isolation contract

The router's correctness contract is **per-tenant credentials, never shared**. This is the rule that prevents global-credential masquerade — the exact failure mode Codex Gate B forecloses.

| Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Query MUST include `WHERE tenant_id = $tenantId AND integration_type = 'finance.erpnext.sandbox' AND is_active = true`.**                                                                                                                                                                                                                                                                                                                                   | The router's SQL filter is the primary tenant isolation enforcement. Forgetting the `tenant_id` filter would return _all_ tenants' credential rows and route every job to whichever happened to be first.                                                                                                                                                                                                                                                                                  |
| **At most one row per (tenant_id, integration_type, is_active=true) is allowed.**                                                                                                                                                                                                                                                                                                                                                                             | If multiple active rows exist for the same tenant + type, the router throws (treats as a misconfiguration, not silently picks one). Multiple-row-pick is the second variant of global-credential masquerade — picking by "ORDER BY created_at DESC LIMIT 1" or similar would hide a duplicate-row mistake operator-side.                                                                                                                                                                   |
| **No process-env fallback.** If `tenant_integrations` has no active credentials row for the tenant, the router returns null — it does NOT consult `process.env.FINANCE_ERPNEXT_BASE_URL`.                                                                                                                                                                                                                                                                     | The whole point of the router is to retire the process-env credential read. Re-introducing it as a fallback would silently re-enable the current "one set per worker process, shared across all tenants" failure mode. Process env credential reads only remain in the codebase as a transitional path — Phase 4-2 implementation packet removes them entirely from the adapter worker entry (the `financeAdapterWorker.js:471-516` block becomes a router lookup, not a direct env read). |
| **The controlled-tenant allow-list (`parseControlledTenantIds()`) is checked BEFORE the router is invoked.** The router never sees a tenant ID outside the allow-list.                                                                                                                                                                                                                                                                                        | Defence-in-depth — even if a job for a non-allow-listed tenant somehow appeared in the queue, the worker would skip it before any credential lookup occurs. Existing worker behaviour; preserved.                                                                                                                                                                                                                                                                                          |
| **Credentials returned by the router MUST NOT be logged, exported in error messages, or surfaced in any HTTP response.** The router's tests assert this; the worker's logging of "registered erpnext sandbox adapter" (at `financeAdapterWorker.js:498-501`) becomes "registered erpnext sandbox adapter for tenant {tenant_id}" — never with credentials. Phase 4-3 designs the audit logging that records credential-lookup events without leaking secrets. | Credential leak prevention. A leaked credential in logs is as bad as a leaked credential in a database row; the boundary must hold at every exit point.                                                                                                                                                                                                                                                                                                                                    |

---

## 6. Sandbox/local-only routing for pilot planning

Phase 4 pilot scope is ERPNext-sandbox-or-local-first (Phase 4-0 §6). The router preserves the existing `erpnextSandboxAdapter.js:89-128` sandbox-only URL guard verbatim by passing the per-tenant `config.base_url` through the same `AdapterConfigError` rejection path.

**Routing rules:**

| Source of `config.base_url`                                                                                                      | Router behaviour                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built-in sandbox URL pattern (matches `*.frappe.cloud` or similar built-in sandbox-pattern at `erpnextSandboxAdapter.js:89-128`) | Router returns the credentials; adapter construction will succeed.                                                                                                                            |
| URL listed in `FINANCE_ERPNEXT_SANDBOX_BASE_URLS` env (the operator-extended allow-list)                                         | Router returns the credentials with `sandboxAllowlist` populated from the env; adapter construction will succeed.                                                                             |
| URL not in built-in pattern AND not in env allow-list (e.g., a production-looking ERPNext URL)                                   | Adapter construction throws `AdapterConfigError`. Router does NOT pre-filter — the adapter constructor is the authoritative gate. Router treats this as "credentials configured but invalid". |

**Hard rule:** the router does **not** maintain its own URL allow-list. The sandbox-only enforcement remains exactly where it lives today (`erpnextSandboxAdapter.js:89-128`), and Phase 4-2 cannot weaken or duplicate it. Per-tenant credential rows store whatever base URL the operator inserted; the adapter constructor rejects production-looking URLs at the existing guard.

**Operator-side hard constraint** (recorded here as design contract — enforced by the Phase 4-19 row 3 / row 10 gate verifications in Phase 4-0):

- **No `tenant_integrations` row may store a production-tier ERPNext URL until Phase 4-14 has executed its sandbox-first progression** and a sub-decision authorises the production-ERPNext flip. Phase 4-2 implementation packet does not insert any row; the row-insertion path is operator-side and gated by Phase 4-14.

---

## 7. Adapter worker integration

The current adapter worker code at `backend/workers/financeAdapterWorker.js:471-516` reads process-env credentials once at boot and constructs one shared adapter. Phase 4-2 implementation packet replaces this block with the per-tenant flow:

**New flow (frozen by this design):**

```
Worker boot:
  - Read FINANCE_ERPNEXT_SANDBOX_BASE_URLS from env (allow-list extension, NOT credentials).
  - Construct the credential router (router holds a pg pool reference + the allow-list).
  - Do NOT construct any adapter at boot. Adapter construction is per-tenant + per-job.

Worker processing a job:
  - Job has tenant_id.
  - Check controlled-tenant allow-list (existing behaviour; preserved).
  - router.lookup(tenant_id) → credentials or null.
  - If null:
    - Worker SKIPS the job (does NOT register an adapter, does NOT call provider) per §8.
    - Skip is logged as "no credentials configured for tenant {tenant_id} — adapter not registered, job skipped".
    - The job remains in queue and follows the existing dead-letter / retry policy (operator action — out of router scope).
  - If credentials returned:
    - Adapter construction: createErpnextSandboxAdapter({ baseUrl, apiKey, apiSecret, sandboxAllowlist }).
    - If AdapterConfigError thrown (URL not in sandbox allow-list, etc.):
      - Worker SKIPS the job per §8.
      - Skip is logged as "erpnext credentials invalid for tenant {tenant_id}: {error.message}".
      - No secret leaked because AdapterConfigError messages do not contain credential values
        (existing erpnextSandboxAdapter.js behaviour — preserved by §5 rule and §10 test).
    - Worker registers the adapter for this tenant + this job execution.
    - Worker may cache the adapter per (tenant_id, credential-row-id) for the lifetime of the worker process.
      Cache invalidated when the underlying tenant_integrations row updates (implementation decides
      invalidation mechanism — short TTL acceptable per §4).
```

**What this NOT do:**

- Does NOT call any provider write. `FINANCE_PROVIDER_WRITES_ENABLED=false` stays default-closed; the existing kill-switch at `adapterJobProcessor.js:332-345` is untouched and continues to reject `attemptPost` etc. unless the controlled-flip window is open.
- Does NOT register a "default" or "fallback" adapter. There is no global adapter after this lands.
- Does NOT change the controlled-tenant allow-list semantics.

---

## 8. Fallback / stop behaviour

The router and the worker together define a deterministic state machine for the "missing or invalid credentials" cases. There is no silent path that quietly fakes a working adapter.

| Scenario                                                                             | Router output                                                                                                                    | Worker behaviour                                                                                                                                                                                     | Operator-observable signal                                                                                                                               |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `tenant_integrations` row for the tenant + integration_type                       | Returns null.                                                                                                                    | Worker logs "no credentials configured for tenant {tenant_id} — adapter not registered, job skipped" and skips the job (job stays queued with the existing dead-letter / retry behaviour).           | Log entry on worker stdout + adapter_queue projection shows job in queued state with no recent activity. Operator action: insert the credentials row.    |
| Row exists but `is_active = false`                                                   | Returns null (treated as absent per §4).                                                                                         | Same as above.                                                                                                                                                                                       | Same. Operator action: flip `is_active = true` if the row should be active, or remove the row if it should not exist.                                    |
| Row exists, active, but credentials shape is malformed (missing apiKey or apiSecret) | Throws — router treats malformed credentials as a misconfiguration, not as "absent credentials".                                 | Worker catches the router throw, logs "erpnext credentials invalid for tenant {tenant_id}: {error.message}" (NO secret in message), and skips the job.                                               | Log entry + adapter_queue projection. Operator action: fix the credentials row.                                                                          |
| Row exists, active, credentials well-formed, but base URL fails sandbox-only guard   | Returns the credentials (router does not pre-filter URLs per §6). Adapter constructor throws `AdapterConfigError` at the worker. | Worker catches the AdapterConfigError, logs "erpnext credentials invalid for tenant {tenant_id}: {error.message}", and skips the job.                                                                | Log entry + adapter_queue projection. Operator action: fix the `config.base_url` value (sandbox URL or env-allow-listed URL only).                       |
| Multiple active rows for the same (tenant_id, integration_type)                      | Throws (duplicate-row failure per §5).                                                                                           | Worker catches the throw, logs the error, skips the job.                                                                                                                                             | Log entry. Operator action: deactivate one of the duplicate rows.                                                                                        |
| Postgres query fails (pg pool blip)                                                  | Throws (the underlying pg error, with credential fields scrubbed if the error includes the row).                                 | Worker catches and either retries the lookup once (implementation decision) or skips the job and lets retry policy handle it. Worker logs the pg error without credentials.                          | Log entry. Operator action: investigate pg / network.                                                                                                    |
| Credentials present but `FINANCE_PROVIDER_WRITES_ENABLED=false` (default)            | Returns the credentials (router does not consult this flag).                                                                     | Worker constructs the adapter, but the existing kill-switch at `adapterJobProcessor.js:332-345` rejects any `attemptPost` call. Job goes through dispatch-but-no-write semantics per Slice 2 design. | Existing behaviour preserved — no provider write occurs. Operator-observable via the adapter_queue projection's `sync_succeeded` / `sync_failed` events. |

**No silent fallback to a global / shared adapter, ever.** Skip-the-job is the only failure mode.

---

## 9. Audit / logging posture

Credential-lookup is a sensitive operation. Logging must capture enough for operator triage and security audit, without leaking secrets. Phase 4-2 freezes the logging contract; Phase 4-3 designs the audit-trail integration (e.g., should every credential lookup produce an `audit_events` entry, or only failure cases?).

**Frozen by Phase 4-2:**

- **No credential value (apiKey, apiSecret, decrypted plaintext) appears in any log line, error message, exception trace, or HTTP response.** Tests assert this (§10 row 8).
- **`tenant_id` is logged on every lookup** so operators can correlate router lookups with adapter_queue events.
- **`integration_type` is logged** so operators can distinguish ERPNext lookups from any future provider's lookups.
- **`base_url` IS logged on success** (it's not a secret — it's the sandbox URL the adapter will hit) per the existing `financeAdapterWorker.js:498-501` pattern. On AdapterConfigError, the base URL is logged because the rejection reason includes the URL pattern.
- **Failure type is logged** (`not_found`, `inactive`, `malformed`, `sandbox_guard_failed`, `duplicate_rows`, `pg_error`) so dashboards can categorise.

**Deferred to Phase 4-3:**

- Whether to emit a finance-domain audit event (`audit_events` row) on credential lookup. Phase 4-3 should decide — it owns the audit-trail design for credentials.
- Key access logging (which key version decrypted the row, if Phase 4-3 introduces key versioning).

---

## 10. Required test surface

The implementation packet must include the test rows below before Codex can clear it. This list is the contract for the implementation packet review.

| #   | Test                                                                                                                                                                                                                                                                                                                                    | Lives where                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | **Lookup returns credentials for matching active row.** Seed `tenant_integrations` with one active `finance.erpnext.sandbox` row for tenant T; `router.lookup(T)` returns the credentials shape with `baseUrl`, `apiKey`, `apiSecret`, `sandboxAllowlist`.                                                                              | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js` (new)                                              |
| 2   | **Lookup returns null when no row matches.** No row for tenant T; `router.lookup(T)` returns null. Does NOT throw.                                                                                                                                                                                                                      | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js`                                                    |
| 3   | **Lookup returns null when row exists but inactive.** Seed with `is_active = false`; `router.lookup(T)` returns null.                                                                                                                                                                                                                   | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js`                                                    |
| 4   | **Lookup is per-tenant.** Seed rows for tenants T1 and T2 with different credentials; `router.lookup(T1)` returns T1's credentials, never T2's. Verified by asserting the returned `baseUrl` matches the seeded value for the requested tenant.                                                                                         | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js`                                                    |
| 5   | **Multiple-active-rows for same (tenant, type) throws.** Seed two active `finance.erpnext.sandbox` rows for tenant T; `router.lookup(T)` throws with a distinct error class / message naming "duplicate active credentials".                                                                                                            | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js`                                                    |
| 6   | **No process-env fallback.** With no row for tenant T but `FINANCE_ERPNEXT_BASE_URL` / `FINANCE_ERPNEXT_API_KEY` / `FINANCE_ERPNEXT_API_SECRET` set in env, `router.lookup(T)` still returns null. The router never reads those env vars.                                                                                               | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js`                                                    |
| 7   | **Malformed credentials throw.** Row exists active with `api_credentials = {}` (no apiKey); `router.lookup(T)` throws with a distinct error class / message naming "malformed credentials".                                                                                                                                             | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js`                                                    |
| 8   | **Credentials never appear in error messages or logs.** Capture `console.log` / logger output during a lookup with credentials. Assert that `apiKey` and `apiSecret` values do NOT appear in any captured line. Repeated for the malformed-credentials throw + duplicate-rows throw — neither error message contains credential values. | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js`                                                    |
| 9   | **Adapter worker integration: missing credentials skips the job.** Seed no row for the controlled tenant; submit an erpnext adapter job; assert the worker logs the skip and does NOT call provider HTTP.                                                                                                                               | `backend/__tests__/workers/financeAdapterWorker.credentialRouter.test.js` (new)                                    |
| 10  | **Adapter worker integration: malformed credentials skips the job.** Seed row with empty api_credentials; submit an erpnext job; assert worker skips with the right log shape.                                                                                                                                                          | `backend/__tests__/workers/financeAdapterWorker.credentialRouter.test.js`                                          |
| 11  | **Adapter worker integration: sandbox-only guard rejection skips the job.** Seed row with a production-looking `config.base_url` (e.g., `https://example.com`); submit job; adapter constructor throws AdapterConfigError; worker skips.                                                                                                | `backend/__tests__/workers/financeAdapterWorker.credentialRouter.test.js`                                          |
| 12  | **Adapter worker integration: valid credentials register a per-tenant adapter.** Seed row with sandbox URL + valid credentials; submit job; worker registers the adapter, dispatches the job, observes the existing `FINANCE_PROVIDER_WRITES_ENABLED=false` kill-switch path (no provider write occurs but lifecycle invariants hold).  | `backend/__tests__/workers/financeAdapterWorker.credentialRouter.test.js` + existing Slice 2D lifecycle invariants |
| 13  | **No global adapter registered at boot.** Worker boot no longer reads `FINANCE_ERPNEXT_BASE_URL` / `FINANCE_ERPNEXT_API_KEY` / `FINANCE_ERPNEXT_API_SECRET`. Verified by setting these env vars and asserting the worker boots without registering any adapter; adapter registration only occurs on first job lookup.                   | `backend/__tests__/workers/financeAdapterWorker.credentialRouter.test.js`                                          |
| 14  | **Pg pool blip handling.** Mock pg pool to throw on the lookup query; assert router error propagation; assert worker skip behaviour; assert credentials do not appear in the propagated error.                                                                                                                                          | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js`                                                    |

**The implementation packet must run all of the above + all existing tests, and all must PASS, before Codex can clear it.**

---

## 11. Hard constraints (explicit restatement)

| Constraint                                                                                      | Source                               | Status this task                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Design per-tenant ERPNext credential lookup.**                                                | Slack directive                      | §4 + §5.                                                                                                                                                 |
| **Define tenant isolation requirements.**                                                       | Slack directive                      | §5.                                                                                                                                                      |
| **Define sandbox/local-only routing for pilot planning.**                                       | Slack directive                      | §6.                                                                                                                                                      |
| **Define adapter worker provider-config selection per tenant.**                                 | Slack directive                      | §7.                                                                                                                                                      |
| **Define fallback/stop behavior on missing/invalid credentials.**                               | Slack directive                      | §8.                                                                                                                                                      |
| **Explicitly defer live provider writes until Phase 4 activation gates.**                       | Slack directive                      | §1 + §7 + §8 — `FINANCE_PROVIDER_WRITES_ENABLED=false` posture preserved; activation is Phase 4-19/4-14 gated.                                           |
| **No code yet.**                                                                                | Slack directive                      | Confirmed.                                                                                                                                               |
| **No migrations applied; no row inserted.**                                                     | Slack directive + §3                 | Confirmed.                                                                                                                                               |
| **Credentials never logged or surfaced.**                                                       | Codex Gate B + §5 + §9 + §10 row 8   | Confirmed.                                                                                                                                               |
| **No process-env fallback that would re-enable shared credentials masquerading as per-tenant.** | Codex Gate B                         | §5 + §10 row 6.                                                                                                                                          |
| **Sandbox-only URL guard at `erpnextSandboxAdapter.js:89-128` not weakened or duplicated.**     | Phase 3-13 §7 (16 safety guardrails) | §6.                                                                                                                                                      |
| **Controlled-tenant scope at `financeWorkerCommon.js:63` not weakened.**                        | Phase 3-13 §7                        | §5.                                                                                                                                                      |
| **Pairs with Phase 4-3 — encrypted credentials at rest.**                                       | Phase 4-0 §7 implementation cadence  | §3 + §9 — encryption is Phase 4-3's design; router consumes decrypted credentials inside its boundary; implementation packet integration order enforced. |

---

## 12. Acceptance for Phase 4-2 (this task)

- [x] Per-tenant ERPNext credential lookup designed (§4 — interface contract).
- [x] Tenant isolation requirements defined (§5 — five rules including SQL filter, no fallback, single-active-row).
- [x] Sandbox/local-only routing rule defined for pilot planning (§6 — existing guard at `erpnextSandboxAdapter.js:89-128` is authoritative; router does not duplicate it).
- [x] Adapter worker provider-config-per-tenant selection defined (§7 — new flow replacing `financeAdapterWorker.js:471-516`).
- [x] Fallback/stop behaviour defined (§8 — seven-row state machine).
- [x] Live provider writes deferred to Phase 4 activation gates (§1 + §7 + §8 + §11).
- [x] Audit/logging posture defined without leaking secrets (§9).
- [x] Required test surface defined (§10 — 14 tests).
- [x] Hard constraints status-confirmed (§11).
- [x] CHANGELOG entry recording Phase 4-2 (separate change).

---

## 13. Next active item

After this packet lands and Codex reviews it (in parallel with Phase 4-3):

**Next active item:** Phase 4-2 implementation packet (separately dispatched after Codex clears this design AND Phase 4-3 design is at least frozen). Phase 4-3, 4-4, 4-5, 4-15 may be authored in parallel with this design.
