# Finance Ops — Adapter Runtime Contract

**Branch:** `feat/finance-ops-runtime`  
**Status:** Phase 1 complete (schema + canonical model), Phase 2 (live writes) unstarted  
**Last updated:** 2026-05-19

---

## Table of Contents

1. [Overview](#1-overview)
2. [Adapter Plugin Interface](#2-adapter-plugin-interface)
3. [Job Lifecycle State Machine](#3-job-lifecycle-state-machine)
4. [Write Guard Contract](#4-write-guard-contract)
5. [Canonical Mapping Contract](#5-canonical-mapping-contract)
6. [Provider Connection Contract](#6-provider-connection-contract)
7. [Adapter Event Emission](#7-adapter-event-emission)
8. [Current State and Phase 2 Checklist](#8-current-state-and-phase-2-checklist)
9. [REST Endpoint Contract](#9-rest-endpoint-contract)
10. [Open Questions for Dre](#10-open-questions-for-dre)

---

## 1. Overview

AiSHA Finance Ops uses a provider-neutral accounting adapter layer. The canonical object model is defined by the QuickBooks shape; all other providers (ERPNext, Xero, NetSuite) map into and out of that shape. The adapter runtime enforces three layers of safety before any write reaches an external system:

```
Request
  └─ 1. Finance Runtime Gate   (ENABLE_FINANCE_OPS env flag)
       └─ 2. Module Gate        (per-tenant modulesettings.financeOps)
            └─ 3. Governance    (per-actor command authorization, finance.ai.no_money_movement)
                 └─ 4. Write Guard  (mode field on adapter job)
                      └─ Provider Adapter  (live HTTP call — Phase 2 only)
```

In Phase 1, live HTTP calls are never made. Jobs are queued and persisted but the provider call is a no-op placeholder. The write guard is still enforced so the contract is established before sandbox credentials exist.

---

## 2. Adapter Plugin Interface

Every provider adapter must satisfy this interface. The runtime loads adapters by `provider` key and calls these methods via the job processor.

```ts
interface AccountingAdapter {
  /**
   * Stable provider identifier. Must match the `provider` column in finance.adapter_jobs
   * and the ENABLE_<PROVIDER>_ADAPTER env flag.
   */
  readonly provider: 'quickbooks' | 'erpnext' | 'xero' | 'netsuite';

  /**
   * The write permission level this adapter was initialised with.
   * Derived from the tenant's provider_connection config, not hardcoded.
   */
  readonly mode: 'read_only' | 'draft_only' | 'approval_required_write';

  // ---- Connection --------------------------------------------------------

  /**
   * Verify the stored credentials are valid and the provider API is reachable.
   * Must resolve within 5 s. Returns { ok: boolean, latency_ms: number, error?: string }.
   * Called by GET /api/v2/finance/accounting-adapters before any job is queued.
   */
  checkHealth(): Promise<HealthCheckResult>;

  // ---- Reads (always permitted regardless of mode) -----------------------

  /**
   * Fetch a single object from the provider by its provider-native ID.
   * Returns the raw provider response; mapping to canonical happens in the caller.
   */
  fetchObject(objectType: CanonicalObjectType, providerId: string): Promise<ProviderObject>;

  /**
   * List objects of a given type from the provider.
   * Pagination handled via cursor returned in the result envelope.
   */
  listObjects(
    objectType: CanonicalObjectType,
    opts?: { limit?: number; cursor?: string; filters?: Record<string, unknown> }
  ): Promise<{ items: ProviderObject[]; next_cursor: string | null }>;

  // ---- Mapping -----------------------------------------------------------

  /**
   * Convert a provider-native object to the canonical shape.
   * Required. Must not throw — return { ok: false, error } on partial failure.
   */
  toCanonical(providerObject: ProviderObject, objectType: CanonicalObjectType): MappingResult;

  /**
   * Convert a canonical object to the provider-native shape ready for POST/PUT.
   * Required. Must not throw.
   */
  fromCanonical(canonicalObject: CanonicalObject, objectType: CanonicalObjectType): MappingResult;

  // ---- Writes (gated by mode) --------------------------------------------

  /**
   * Push a canonical object to the provider as a draft/estimate.
   * Only callable when mode !== 'read_only'.
   * The adapter must NOT post or finalise the object on the provider side.
   * Returns the provider-assigned draft ID.
   */
  pushDraft(
    canonicalObject: CanonicalObject,
    objectType: CanonicalObjectType
  ): Promise<PushResult>;

  /**
   * Push a canonical object as a finalised record.
   * Only callable when mode === 'approval_required_write' AND an approved
   * finance.approval record exists for the object.
   * The adapter must verify the approval_id before executing.
   */
  pushFinal(
    canonicalObject: CanonicalObject,
    objectType: CanonicalObjectType,
    approvalId: string
  ): Promise<PushResult>;

  /**
   * Fetch the current status of a previously pushed provider record.
   * Read-only — no side effects.
   */
  syncStatus(providerId: string, objectType: CanonicalObjectType): Promise<StatusResult>;

  /**
   * Void a provider-side record. Requires approval (same rules as pushFinal).
   * Optional — adapters that do not support voiding should throw AdapterCapabilityError.
   */
  voidRecord?(
    providerId: string,
    objectType: CanonicalObjectType,
    approvalId: string
  ): Promise<VoidResult>;

  /**
   * Reconcile internal records against the provider's current state.
   * Read-only — produces a diff report, does not apply changes.
   */
  reconcile?(
    objectType: CanonicalObjectType,
    since?: string
  ): Promise<ReconcileReport>;
}
```

### Supporting types

```ts
type CanonicalObjectType = 'Customer' | 'Account' | 'Invoice' | 'JournalEntry' | 'Payment';

interface HealthCheckResult {
  ok: boolean;
  latency_ms: number;
  provider: string;
  error?: string;
}

interface MappingResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  unmapped_fields?: string[];   // fields present in source but absent from target shape
}

interface PushResult {
  ok: boolean;
  provider_id: string;          // provider-assigned ID for the created/updated record
  provider_response: Record<string, unknown>;
  error?: string;
}

interface StatusResult {
  ok: boolean;
  status: string;               // provider-native status string
  canonical_status?: string;    // normalised: 'draft' | 'submitted' | 'posted' | 'void'
  provider_response: Record<string, unknown>;
}

interface VoidResult {
  ok: boolean;
  provider_response: Record<string, unknown>;
  error?: string;
}

interface ReconcileReport {
  object_type: CanonicalObjectType;
  since: string;
  matched: number;
  drifted: number;              // in provider but different from canonical
  missing_from_provider: number;
  missing_from_canonical: number;
  drift_items: DriftItem[];
}
```

### Required vs optional methods

| Method | Required | Notes |
|---|---|---|
| `checkHealth` | Yes | Checked before any job is queued |
| `fetchObject` | Yes | Used by `sync_status` jobs |
| `listObjects` | Yes | Used by `reconcile` jobs and admin console |
| `toCanonical` | Yes | Used on every pull job |
| `fromCanonical` | Yes | Used on every push job |
| `pushDraft` | Yes | Core write path (draft_only and above) |
| `pushFinal` | Yes | Core write path (approval_required_write only) |
| `syncStatus` | Yes | Required for job type `sync_status` |
| `voidRecord` | Optional | Adapters omitting this throw `AdapterCapabilityError` |
| `reconcile` | Optional | Can be added in a follow-up phase per provider |

---

## 3. Job Lifecycle State Machine

### Schema reference

The `finance.adapter_jobs` table drives all state:

```
status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
```

### State diagram

```
                     ┌─────────────────────────────────────────────────┐
                     │           adapter_jobs state machine             │
                     └─────────────────────────────────────────────────┘

  (create job)
       │
       ▼
  ┌─────────┐
  │ queued  │◄──────────────────────────────────────────────────────┐
  └─────────┘                                                        │ retry (backoff elapsed,
       │  job processor picks up                                      │  attempts < max_attempts)
       │  (polls or is triggered)                                     │
       ▼                                                              │
  ┌─────────┐    adapter throws               ┌──────────┐           │
  │ running │─────transient error────────────►│  failed  │───────────┘
  └─────────┘                                 └──────────┘
       │                                           │
       │  adapter returns ok                       │  attempts >= max_attempts
       ▼                                           ▼
  ┌───────────┐                            ┌──────────────────┐
  │ succeeded │                            │ failed (terminal)│
  └───────────┘                            └──────────────────┘

  (any state)
       │  human or system cancels
       ▼
  ┌───────────┐
  │ cancelled │
  └───────────┘
```

### Transition rules

| Transition | Trigger | Actor |
|---|---|---|
| `queued → running` | Job processor claims the job (sets `status = 'running'`, increments `attempts`) | System |
| `running → succeeded` | Adapter method returns `{ ok: true }` | System |
| `running → failed` | Adapter method throws or returns `{ ok: false }` | System |
| `failed → queued` | `next_attempt_at` has elapsed and `attempts < max_attempts` | System (retry scheduler) |
| `any → cancelled` | Human or governance layer explicitly cancels before or during execution | Human or system |

### Retry policy

| Parameter | Value | Notes |
|---|---|---|
| `max_attempts` | 5 | After 5 failures the job is permanently failed |
| Backoff strategy | Exponential with jitter | `delay = min(2^attempts × 15s, 30min) + rand(0..5s)` |
| Attempt 1 retry | 15 s | |
| Attempt 2 retry | 30 s | |
| Attempt 3 retry | 1 min | |
| Attempt 4 retry | 2 min | |
| Attempt 5 (final) | No retry | Job is terminal; `finance.adapter.sync_failed` with `permanent: true` |

### Permanent failure handling

When `attempts >= max_attempts`:
1. `status` remains `'failed'`.
2. `error_message` is set to the last adapter error.
3. `finance.adapter.sync_failed` event is emitted with `payload.permanent = true`.
4. An approval record is created in `finance.approvals` with `aggregate_type = 'adapter_job'` and `status = 'pending'` — a human must review and decide whether to re-queue, cancel, or escalate.
5. The job is never re-queued automatically after this point.

### Job processor invariants

- A job in `running` state must be claimed with an optimistic lock (UPDATE ... WHERE status = 'queued' RETURNING id). Concurrent processors must not double-claim.
- If a running job's process crashes, the processor must implement a stuck-job detector: any job in `running` for more than 5 minutes is reset to `queued` (attempt count unchanged) by a watchdog.

---

## 4. Write Guard Contract

The `mode` field on `finance.adapter_jobs` and the provider connection config determine what writes are permitted. The write guard is enforced at two points: (a) when a job is created, and (b) immediately before the adapter method is called.

### Mode definitions

| Mode | Meaning |
|---|---|
| `read_only` | No writes to the provider under any circumstances |
| `draft_only` | Writes allowed only via `pushDraft` — no finalisation |
| `approval_required_write` | Full writes allowed only after an `approved` finance.approval record exists |

### Operation permission matrix

| Operation (`adapter_jobs.operation`) | `read_only` | `draft_only` | `approval_required_write` |
|---|---|---|---|
| `pull` (fetchObject, listObjects) | Allowed | Allowed | Allowed |
| `sync_status` | Allowed | Allowed | Allowed |
| `reconcile` | Allowed | Allowed | Allowed |
| `push_draft` | Blocked | Allowed | Allowed |
| `void` | Blocked | Blocked | Allowed + approval check |

`push_draft` calls `adapter.pushDraft()`. The provider-side record created must remain in a non-finalised state (QuickBooks Estimate, ERPNext draft, Xero draft invoice, NetSuite Estimate). If the provider has no draft concept, the adapter must throw `AdapterCapabilityError` and the job must not be retried.

`void` and any operation that finalises, posts, or deletes a provider record is treated as a write requiring `approval_required_write`.

### Pre-condition guard function

The job processor must call this guard before dispatching to any adapter method:

```js
function assertWritePermitted(job, approvalRecord = null) {
  const { mode, operation } = job;

  if (operation === 'pull' || operation === 'sync_status' || operation === 'reconcile') {
    return; // reads are always permitted
  }

  if (mode === 'read_only') {
    throw new WriteGuardError(
      `Operation '${operation}' blocked: adapter mode is read_only`,
      { job_id: job.id, mode, operation }
    );
  }

  if (operation === 'void' && mode === 'draft_only') {
    throw new WriteGuardError(
      `Operation 'void' blocked: requires approval_required_write mode`,
      { job_id: job.id, mode, operation }
    );
  }

  if (mode === 'approval_required_write') {
    if (!approvalRecord || approvalRecord.status !== 'approved') {
      throw new WriteGuardError(
        `Operation '${operation}' blocked: no approved finance.approval record found`,
        { job_id: job.id, mode, operation, approval_id: approvalRecord?.id }
      );
    }
  }
}
```

### AI actor constraint

In addition to the mode guard, the governance layer (`financeGovernanceDecision.js`) independently blocks AI actors from approving or posting. The policy `finance.ai.no_money_movement` blocks `ApproveFinanceActionCommand`, `RejectFinanceActionCommand`, and `PostJournalEntryCommand` from any actor whose `type === 'ai_agent'`. The write guard and governance guard are independent layers — both must pass.

---

## 5. Canonical Mapping Contract

### Canonical object types

```js
const CANONICAL_OBJECT_TYPES = {
  CUSTOMER:      'Customer',
  ACCOUNT:       'Account',
  INVOICE:       'Invoice',
  JOURNAL_ENTRY: 'JournalEntry',
  PAYMENT:       'Payment',
};
```

### Canonical shapes

Each canonical shape is the QuickBooks-derived format already implemented in `quickbooksCanonicalAdapter.js`. The shapes below are the authoritative contract.

#### Account

```js
{
  id: string | null,          // internal UUID (null if not yet persisted)
  code: string | null,        // account code (e.g. '1000')
  name: string,               // human-readable name
  classification: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
  account_type: string,       // QB-style sub-type (e.g. 'Other Current Asset')
  active: boolean,
  parent_account_id: string | null,
}
```

#### JournalEntry

```js
{
  doc_number: string | null,  // provider reference or internal entry_number
  txn_date: string,           // ISO 8601 datetime
  private_note: string | null,
  currency: string,           // ISO 4217 uppercase (e.g. 'USD')
  draft_only: boolean,        // always true in Phase 1
  lines: Array<{
    description: string,
    amount_cents: number,
    posting_type: 'Debit' | 'Credit',
    account_ref: { id: string | null, name: string },
    classification: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
  }>,
}
```

Invoice and Payment canonical shapes are defined by the invoice model in `financeDomainService.js` and will be added here as each is promoted to a live adapter shape.

### Provider object maps (planned — Phase 2)

Each adapter must document its PROVIDER_OBJECT_MAP: the mapping from canonical fields to provider-native fields. The format:

```js
const PROVIDER_OBJECT_MAP = {
  // key: canonical object type
  // value: map of canonical field → provider field (null = not supported)
  Account: {
    id:                 'Id',
    code:               'AcctNum',
    name:               'Name',
    classification:     'Classification',
    account_type:       'AccountType',
    active:             'Active',
    parent_account_id:  'ParentRef.value',
  },
  JournalEntry: {
    doc_number:     'DocNumber',
    txn_date:       'TxnDate',
    private_note:   'PrivateNote',
    currency:       'CurrencyRef.value',
    draft_only:     null,               // no QB equivalent; enforced locally
    lines:          'Line',
  },
};
```

ERPNext, Xero, and NetSuite adapters must each ship their own `PROVIDER_OBJECT_MAP` following this structure.

### Unmapped field handling

| Scenario | Rule |
|---|---|
| Provider object has fields not in the canonical shape | Pass through in `metadata` key: `{ ...canonical, metadata: { provider_extras: { ... } } }` |
| Canonical shape has fields the provider does not support | Set the adapter's map value to `null`; omit from the provider payload; log at `debug` level |
| Provider returns a required canonical field as null | `toCanonical` returns `{ ok: false, error: 'missing required field: <name>' }` |
| Type mismatch (e.g. provider returns string for amount) | Adapter is responsible for coercion; must not pass raw provider types through |

The `metadata.provider_extras` pattern ensures no data is silently dropped during a round-trip, which matters for reconciliation.

---

## 6. Provider Connection Contract

### Required configuration fields

Each provider adapter is initialised with a connection config object. This config is always fetched from tenant-scoped storage, never hardcoded.

```ts
interface ProviderConnectionConfig {
  provider:        'quickbooks' | 'erpnext' | 'xero' | 'netsuite';
  mode:            'read_only' | 'draft_only' | 'approval_required_write';
  base_url:        string;         // provider API root (e.g. 'https://quickbooks.api.intuit.com')
  realm_id?:       string;         // QuickBooks: company/realm ID; NetSuite: account ID
  company_id?:     string;         // ERPNext: company name; Xero: tenant ID
  auth: {
    type:          'oauth2' | 'api_key' | 'basic';
    // oauth2:
    access_token?: string;
    refresh_token?: string;
    token_expiry?:  string;        // ISO 8601
    client_id?:    string;
    client_secret?: string;        // fetched from Doppler at runtime, never stored in DB
    // api_key:
    api_key?:      string;
    // basic:
    username?:     string;
    password?:     string;
  };
}
```

### Storage location — E4 resolved

**`tenant_integrations.api_credentials JSONB`** is the existing credential storage field. The column exists in production (`public.tenant_integrations`, already used by Cal.com and other integrations).

Current state: **plain JSONB — no column-level encryption**. For the ERPNext POC (`api_key` + `api_secret`), plain JSONB is acceptable in dev/staging. Before production OAuth tokens (QuickBooks, Xero) are stored, app-level encryption must be added: encrypt before write, decrypt after read, using a Doppler-managed key (`FINANCE_ADAPTER_ENCRYPTION_KEY`). The adapter layer receives already-decrypted values — it never handles the encryption itself.

```js
// How the job processor loads credentials
const row = await supabase
  .from('tenant_integrations')
  .select('api_credentials, config')
  .eq('tenant_id', tenantId)
  .eq('integration_type', `finance.${provider}`)
  .eq('is_active', true)
  .single();

const credentials = decryptCredentials(row.api_credentials); // no-op for ERPNext POC
```

No new migration needed for ERPNext POC — `api_credentials` JSONB is already there. A migration adding `encrypted_credentials BYTEA` may be needed before QuickBooks OAuth (Phase 3).

### Per-provider auth specifics

| Provider | Auth type | Notes |
|---|---|---|
| QuickBooks | OAuth2 (Authorization Code + PKCE) | `realm_id` required. Tokens expire in 1 h; `refresh_token` valid 100 days. Adapter must refresh automatically before expiry. |
| ERPNext | API Key + Secret | `api_key` + `api_secret` pair. Long-lived. Rotate per tenant security policy. |
| Xero | OAuth2 | `company_id` = Xero tenant ID. Must refresh before 30-min access token expiry. |
| NetSuite | OAuth1 or Token-Based Auth (TBA) | `realm_id` = NetSuite account ID. TBA preferred for server-to-server. |

### Health check

`adapter.checkHealth()` must:
1. Make a lightweight read request to the provider API (e.g. QuickBooks `GET /v3/company/{realmId}/companyinfo/{realmId}`).
2. Resolve within 5 000 ms.
3. Return `{ ok: true, latency_ms, provider }` on success.
4. Return `{ ok: false, latency_ms, provider, error: '<message>' }` — never throw — on failure.

The `/api/v2/finance/accounting-adapters` endpoint calls `checkHealth()` for each configured provider and returns the aggregate result.

---

## 7. Adapter Event Emission

Events use the standard `financeEventEnvelope.js` shape. Adapter events are emitted by the job processor, not the adapter itself. The adapter returns a result; the processor emits the event.

### Event envelope reference

```js
{
  id: `evt_${uuid}`,
  tenant_id: string,
  event_type: string,
  aggregate_type: 'adapter_job',
  aggregate_id: string,           // adapter_jobs.id
  actor_id: string | null,
  actor_type: 'human' | 'ai_agent' | 'system',
  source: 'finance_adapter',
  request_id: string | null,
  braid_trace_id: string | null,
  correlation_id: string | null,
  causation_id: string | null,    // the command or approval that triggered the job
  payload: { ... },
  policy_decision: { ... },
  created_at: string,
}
```

### `finance.adapter.sync_queued`

Emitted when a job is inserted into `finance.adapter_jobs` with `status = 'queued'`.

```js
payload: {
  job_id: string,
  provider: string,
  object_type: string,
  object_id: string | null,
  operation: 'pull' | 'push_draft' | 'sync_status' | 'void' | 'reconcile',
  mode: string,
  queued_at: string,             // ISO 8601
}
```

### `finance.adapter.sync_succeeded`

Emitted when a job transitions to `status = 'succeeded'`.

```js
payload: {
  job_id: string,
  provider: string,
  object_type: string,
  object_id: string | null,
  operation: string,
  attempts: number,
  duration_ms: number,
  provider_id: string | null,    // provider-assigned ID returned by the adapter (push ops)
  canonical_snapshot: object,    // the canonical object that was pushed/pulled
}
```

### `finance.adapter.sync_failed`

Emitted each time a job transitions to `status = 'failed'`, including retryable failures. The `permanent` flag distinguishes terminal failure.

```js
payload: {
  job_id: string,
  provider: string,
  object_type: string,
  object_id: string | null,
  operation: string,
  attempts: number,
  max_attempts: number,
  permanent: boolean,            // true only when attempts >= max_attempts
  error_message: string,
  error_code: string | null,     // provider-returned error code if available
  next_attempt_at: string | null, // null when permanent
}
```

---

## 8. Current State and Phase 2 Checklist

### Phase 1 — complete

| Item | Status |
|---|---|
| `finance.adapter_jobs` table DDL | Done |
| Finance runtime gate (`ENABLE_FINANCE_OPS` env flag) | Done — `financeRuntimeGate.js` |
| Per-tenant module gate (`modulesettings.financeOps`) | Done — `financeModuleGate.js` |
| Governance layer (AI actor blocks, command authorization) | Done — `financeGovernanceDecision.js` |
| QuickBooks canonical adapter (`mapAccountToQuickBooksCanonical`, `mapJournalEntryToQuickBooksCanonical`) | Done — `quickbooksCanonicalAdapter.js` |
| Adapter job creation in domain service (`simulateDealWon` creates stub job) | Done — `financeDomainService.js` |
| Finance event envelope standard | Done — `financeEventEnvelope.js` |
| Finance route surface (`/api/v2/finance/*`) | Done — `finance.v2.js` |
| Runtime status endpoint (`GET /api/v2/finance/runtime/status`) | Done — returns `mode: 'mock_read_only'` |
| ERPNext / Xero / NetSuite PROVIDER_OBJECT_MAP | Not started |
| Live HTTP calls to any provider | Not started |

### Phase 2 — live sandbox writes

The following must be completed before any Phase 2 adapter is activated:

1. **Persistent job store.** The current `financeDomainService` stores jobs in an in-memory Map. Phase 2 requires reading and writing `finance.adapter_jobs` from Supabase. The `getState()` method must pull from the DB.

2. **Job processor.** A durable worker must be implemented (suggested: a Node.js worker thread or a separate Coolify service) that polls `finance.adapter_jobs WHERE status = 'queued' AND next_attempt_at <= now()`, claims jobs with an optimistic lock, calls the adapter, and writes results back. The current implementation has no job processor.

3. **Provider credentials.** OAuth tokens and API keys for sandbox accounts (QuickBooks Sandbox, ERPNext test instance, Xero demo company, NetSuite sandbox) must be stored in `tenant_integrations` and retrievable at runtime. Doppler project `aishacrm-finance-adapters` should hold encryption keys.

4. **OAuth refresh loop.** QuickBooks and Xero adapters require automatic token refresh. The refresh must update the encrypted credential in `tenant_integrations` before expiry.

5. **ERPNext / Xero / NetSuite adapter implementations.** Each must implement the full `AccountingAdapter` interface and ship a `PROVIDER_OBJECT_MAP`.

6. **Write guard enforcement in job processor.** The `assertWritePermitted` guard must be called as the first step of every job execution, loading the approval record from DB if required.

7. **Event persistence.** The current `financeEventStore` is in-memory. Phase 2 requires writing events to a `finance_events` Supabase table for durable audit trails.

8. **`ENABLE_FINANCE_OPS` flag in Coolify.** This flag must be explicitly enabled per environment. It defaults to absent (off). A release decision is required before enabling on staging or production.

9. **Stuck-job watchdog.** Any job stuck in `running` for more than 5 minutes must be reset to `queued`. This can be a Supabase cron job or a watchdog timer in the job processor.

10. **End-to-end integration test.** At minimum one `push_draft` round-trip against a sandbox provider must pass before Phase 2 is declared ready.

---

## 9. REST Endpoint Contract

### Existing endpoints (Phase 1)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v2/finance/runtime/status` | Runtime health: mode, in-memory counts |
| `GET` | `/api/v2/finance/journal-entries` | List journal entries for tenant |
| `GET` | `/api/v2/finance/ledger` | Computed ledger |
| `GET` | `/api/v2/finance/profit-loss` | P&L report |
| `GET` | `/api/v2/finance/balance-sheet` | Balance sheet |
| `POST` | `/api/v2/finance/draft-invoices` | Create draft invoice |
| `PATCH` | `/api/v2/finance/draft-invoices/:id` | Update draft invoice |
| `POST` | `/api/v2/finance/journal-drafts` | Create journal draft |
| `POST` | `/api/v2/finance/simulate/deal-won` | Simulate deal-won journal + adapter job |
| `POST` | `/api/v2/finance/journal-entries/:id/reverse` | Request journal reversal |
| `POST` | `/api/v2/finance/approvals/:id/approve` | Approve a finance action |

Note: `GET /api/v2/finance/accounting-adapters` and `GET /api/v2/finance/external/:provider/schema` are referenced in the architecture plan but are not yet present in `finance.v2.js`. They are listed below as Phase 2 additions.

### Required Phase 2 additions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v2/finance/accounting-adapters` | List configured providers for tenant, with health check results |
| `GET` | `/api/v2/finance/external/:provider/schema` | Return PROVIDER_OBJECT_MAP for the given provider |
| `GET` | `/api/v2/finance/adapter-jobs` | List adapter jobs for tenant (paginated, filterable by status/provider) |
| `GET` | `/api/v2/finance/adapter-jobs/:id` | Get single adapter job with full payload and provider_response |
| `POST` | `/api/v2/finance/adapter-jobs` | Create and queue an adapter job (requires governance check) |
| `POST` | `/api/v2/finance/adapter-jobs/:id/cancel` | Cancel a queued or failed job |
| `POST` | `/api/v2/finance/adapter-jobs/:id/retry` | Re-queue a permanently failed job (human-only, clears attempts) |
| `GET` | `/api/v2/finance/adapter-jobs/:id/events` | Audit trail of events for a specific job |
| `POST` | `/api/v2/finance/providers/:provider/reconcile` | Trigger a reconcile job for an object type |
| `GET` | `/api/v2/finance/providers/:provider/health` | Per-provider health check (calls `adapter.checkHealth()`) |

### Authentication and tenant scoping

All finance routes are gated by:
1. `validateTenantAccess` middleware (JWT, tenant_id resolution)
2. The Finance module gate (`checkFinanceOpsEnabled`)
3. Route-level governance checks where writes are involved

Actor type (`human` vs `ai_agent`) is derived exclusively from `req.user.is_ai_agent` and `req.user.role`. Body-supplied actor type is never trusted.

---

## 10. Architecture Decisions — Resolved

| ID | Decision | Resolution |
|---|---|---|
| E1 | Finance event store schema | `finance` schema — `finance.events` table alongside `finance.adapter_jobs` |
| E2 | Job processor deployment | Separate Coolify worker service on VPS-2 (not in-process, not Supabase cron) |
| E3 | Approval record linkage | Per governed action/command — one approval per command dispatch, not per canonical object |
| E4 | Credential storage | `tenant_integrations.api_credentials JSONB` exists and is used. Plain JSONB is acceptable for ERPNext POC. App-level encryption required before QuickBooks/Xero OAuth tokens are stored. No new migration needed for ERPNext. |
| E5 | First live adapter target | **ERPNext first** (self-hosted, API key auth, no OAuth complexity). QuickBooks remains the canonical schema standard but is not the first OAuth implementation. |
| E6 | `draft_only: true` field | Internal AiSHA metadata only — must be stripped before any provider payload is dispatched. Strip in the job processor dispatch layer, not in the canonical mapper. |

### E2 implications — separate worker service

The job processor will be a standalone Node.js service deployed as a Coolify application on VPS-2. It:
- Polls `finance.adapter_jobs WHERE status = 'queued' AND next_attempt_at <= now()`
- Claims jobs with an optimistic lock (`UPDATE ... WHERE status = 'queued' RETURNING *`)
- Calls the appropriate adapter
- Writes results, emits finance events
- Runs independently of the main backend — a processor crash does not affect the API

This avoids VPS-1 CPU pressure and keeps the adapter runtime horizontally scalable.

### E5 implications — ERPNext POC first

Phase 2 implementation sequence:
1. ERPNext adapter (API key + secret, no OAuth) — proves the adapter interface end-to-end
2. Finance event persistence to `finance.events` (finance schema)
3. Job processor service (Coolify, VPS-2)
4. QuickBooks adapter (OAuth2) — builds on the proven interface
5. Xero adapter — same OAuth pattern as QuickBooks
