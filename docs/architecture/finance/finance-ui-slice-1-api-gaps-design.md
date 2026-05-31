# Finance UI Slice 1 — Read-only API gaps design freeze

**Status:** Design / documentation only. No backend routes implemented, no runtime code change, no client wrappers added.
**Branch:** `feat/finance-ops-read-api-gap-design` (cut from `main`).
**Companion to:** `finance-ui-slice-1-read-only-console-design.md` (Slice 1 UI design freeze; §8.2 inventoried these gaps) and `phase-4-1-persistent-events-projection-reads-design.md` (persistent-events route lift + projection-backed reads for the existing five GETs).
**Live-execution posture:** None across the board (see §2).

---

## 1. Purpose and scope

Finance UI Slice 1 (UI-1A through UI-1C) ships ten read-only screens. Five are backed by existing Finance v2 GET endpoints; eight are gap states because the matching read endpoint does not exist in the backend today (Slice 1 design freeze §8.2). The Slice 1 client (`src/api/finance.js`) deliberately surfaces those gaps via `FINANCE_API_GAPS` rather than inventing frontend data sources.

This packet is the design freeze for those eight missing read-only GETs. For each endpoint it specifies the path, source-of-truth, request shape, response shape, empty-state behaviour, tenant isolation contract, module gating contract, pagination expectation, degraded / honest-failure behaviour, and the relationship to the Phase 4-1 persistent-events route lift.

**Scope:**

- Design + contract specification only.
- Eight read-only GET endpoints under `/api/v2/finance/*`.
- A single, consistent error envelope and authorisation contract reused across all eight.
- An explicit mapping for each endpoint of the in-memory source-of-truth today and the projection-backed source-of-truth after Phase 4-1 lands, plus the bit-parity rule between the two.
- A no-split-brain rule consistent with the Phase 4-1 fail-closed posture.

**Scope-boundary — explicit non-goals:**

- No route is implemented in this packet. `src/api/finance.js` is not modified. `backend/routes/finance.v2.js` is not modified.
- No new client wrappers are introduced (mutating or otherwise). The six mutating Finance v2 endpoints listed in Slice 1 §8.3 remain explicitly out of scope.
- No `ENABLE_FINANCE_PERSISTENT_EVENTS` flip. No `FINANCE_PROVIDER_WRITES_ENABLED` flip. The persistent-events fail-closed guard at `backend/routes/finance.v2.js:48` is preserved end-to-end.
- No migration is authored or applied. No staging / Coolify / Doppler mutation. No provider writes. No production action.
- No mutation affordances of any kind: no approve / reject, no reverse, no replay, no adapter retry / cancel, no provider-sync trigger. These remain explicitly deferred per Slice 1 §13.
- No projection / cursor advance, no replay-from-cursor, no drop-and-rebuild. Diagnostic reads only.
- No fake projections, no inferred state, no fabricated rows for empty tenants.
- No push without Andrei's explicit authorisation.

---

## 2. Live-execution posture

| What                                                                | Status                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Backend semantic change                                             | None.                                                                          |
| New POST / PATCH / DELETE helper                                    | None.                                                                          |
| Approve / reject / reverse / replay / sync / retry / cancel control | None (not in scope; remain deferred per Slice 1 §13).                          |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flip                             | None — fail-closed guard at `backend/routes/finance.v2.js:48` preserved.       |
| `FINANCE_PROVIDER_WRITES_ENABLED` flip                              | None — default-closed kill switch preserved.                                   |
| `ENABLE_FINANCE_OPS` flip                                           | None — process-level mount gate unchanged.                                     |
| Migration application                                               | None.                                                                          |
| Staging / Coolify / Doppler mutation                                | None.                                                                          |
| Provider write (ERPNext / any tier)                                 | None — sandbox-only URL guard at `erpnextSandboxAdapter.js:89-128` unaffected. |
| Production / staging action                                         | None.                                                                          |
| `src/api/finance.js` change                                         | None (design-only; no new wrappers added in this packet).                      |
| `backend/routes/finance.v2.js` change                               | None (design-only; no new route handlers added in this packet).                |

All 16 Phase 3-13 §7 safety guardrails are preserved end-to-end by this packet. The persistent-events route lift remains a separate Phase 4-1 implementation packet.

---

## 3. Prerequisites

- Phase 3 closed; Slice 2 closed; Finance v2 read surface stable.
- The four backend gates are frozen and in their fail-closed / default-closed posture:
  - Process-level `ENABLE_FINANCE_OPS` (route mount).
  - Per-tenant `financeOps` module gate (`backend/routes/finance.v2.js:67-85` + `backend/lib/finance/financeModuleGate.js`).
  - `ENABLE_FINANCE_PERSISTENT_EVENTS` (route-level fail-closed at `finance.v2.js:48`).
  - `FINANCE_PROVIDER_WRITES_ENABLED` (default-closed at `adapterJobProcessor.js:332-345`).
- Slice 1 design freeze §8.2 gap inventory is the authoritative list of endpoints addressed here; this packet does not introduce additional endpoints beyond that list.
- Phase 4-1 design freeze (`phase-4-1-persistent-events-projection-reads-design.md`) is in place. Its persistent-mode read-source contract for the existing five GETs is the reference for how the new endpoints in this packet behave once persistent mode lands.
- The `FINANCE_API_GAPS` table in `src/api/finance.js` is the single source of truth for the eight gap descriptors (endpoint, designRef, naturalBackingSource, affectedScreen). This packet does not modify that table; an implementation packet that closes one of these gaps would remove or update the corresponding entry alongside landing the route + client wrapper.

---

## 4. Endpoint inventory

The eight read-only GETs this packet specifies, in `FINANCE_API_GAPS` order. Each cell references the Slice 1 design freeze section that surfaced the gap, the screen it unblocks, and the natural backing source on the backend.

| #   | Endpoint                                 | `FINANCE_API_GAPS` key | Slice 1 § | Affected screen                | Natural backing source                                                                                                 |
| --- | ---------------------------------------- | ---------------------- | --------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `GET /api/v2/finance/draft-invoices`     | `draftInvoices`        | §8.2.1    | Draft invoices (§7.3)          | `financeDomainService.bucket.invoices` (in-memory today) → persistent invoices projection later                        |
| 2   | `GET /api/v2/finance/journal-drafts`     | `journalDrafts`        | §8.2.2    | Journal drafts (§7.4)          | Domain service journal-draft state (currently merged into `listJournalEntries`) → `journal_entries` projection filter  |
| 3   | `GET /api/v2/finance/approvals`          | `approvals`            | §8.2.3    | Approval queue (§7.6)          | `financeDomainService.listApprovals(tenantId)` → future `approval_queue` projection                                    |
| 4   | `GET /api/v2/finance/adapter-jobs`       | `adapterJobs`          | §8.2.4    | Adapter queue (§7.7)           | `adapterQueueProjection` per `projection-contracts.md` §7 → backed by `finance.adapter_jobs` once persistent           |
| 5   | `GET /api/v2/finance/audit-events`       | `auditEvents`          | §8.2.5    | Audit timeline (§7.8)          | `financeDomainService.listAuditEvents(tenantId)` → future `auditTimelineProjection`                                    |
| 6   | `GET /api/v2/finance/projection/cursors` | `projectionCursors`    | §8.2.6    | Projection / degraded (§7.9)   | `projectionStore.{memory,pg}.js` cursors per projection per tenant                                                     |
| 7   | `GET /api/v2/finance/adapters`           | `registeredAdapters`   | §8.2.7    | Sandbox adapter status (§7.10) | Adapter registry constructed inside `financeAdapterWorker.js` / `adapterJobProcessor.js`                               |
| 8   | `GET /api/v2/finance/evidence-packs`     | `evidencePacks`        | §8.2.8    | Evidence / audit pack (§7.11)  | `backend/lib/finance/auditEvidenceBuilder.js` `buildEvidencePack` (on-demand builder; **no persistent pack registry**) |

The ninth `FINANCE_API_GAPS` entry, `runtimeMode` (§8.2.9), is an accuracy concern on the existing `/runtime/status` payload (`runtime.mode` is a hard-coded placeholder at `backend/routes/finance.v2.js:110`), not a missing endpoint. It is out of scope for this packet and remains a domain-service publishing concern.

---

## 5. Common contract conventions

All eight endpoints share these conventions. Per-endpoint sections in §6 only call out deviations.

### 5.1 Mount path and method

- Mount path: `/api/v2/finance/<resource>`.
- HTTP method: `GET` only. Each endpoint is read-only. No POST / PATCH / DELETE companion is introduced in this packet.

### 5.2 Authorisation contract

Each endpoint reuses the existing Finance v2 authorisation stack in the order it already runs at `backend/routes/finance.v2.js:67-85`:

1. Process-level mount gate: route is only registered when `ENABLE_FINANCE_OPS === 'true'`. Outside that, the path returns the platform default 404 (Slice 1 design freeze §12.1).
2. `validateTenantAccess` middleware (`backend/middleware/validateTenant.js`): authenticated tenant + tenant match. Superadmin reads pass for any tenant by design. Non-matching tenants get 403 with the existing "Access denied: You do not have permission to access this tenant's data." message.
3. Per-tenant module gate via `checkFinanceOpsEnabled` (`backend/lib/finance/financeModuleGate.js`). Canonical-wins resolution between `financeOps` and the legacy `enterpriseFinance` alias is preserved. When the gate denies, returns 403 with the existing exact message `Finance Ops is not enabled for this tenant`.

No role gate is added at the route layer. Slice 1 §11.3 binds the rule: any future role gate for finance must land at the backend route layer first, then mirror to the frontend.

The persistent-events split-brain guard (`finance.v2.js:48`) remains the route-construction-time check that refuses to mount the entire Finance v2 router when `ENABLE_FINANCE_PERSISTENT_EVENTS === 'true'` and projection-backed reads have not landed. Implementation of the endpoints in this packet does not lift that guard.

### 5.3 Request shape

- HTTP method: `GET`.
- Tenant identification: `x-tenant-id: <UUID>` header (matches the Slice 1 client convention at `src/api/finance.js`). `tenant_id` body / query is server-resolved per `resolveTenantId` at `backend/routes/finance.v2.js:8-13` and is not accepted as authoritative.
- Pagination: when an endpoint is paginated, callers pass either `?limit=<int>&offset=<int>` or `?cursor=<opaque>`. The chosen scheme per endpoint is called out in §6. Defaults: `limit = 50`, `offset = 0`, max `limit = 200`. Implementations clamp values outside the allowed range rather than 400-ing.
- Optional filter parameters per endpoint are called out in §6. No filter parameter is required.
- Idempotent. No body. No mutation.

### 5.4 Response envelope

All eight endpoints reuse the existing Finance v2 success envelope `{ status: 'success', data: <payload> }` and the structured error envelope `{ status: 'error', message: <string>, code: <string|null>, details: <object|null> }`. The Slice 1 client at `src/api/finance.js` unwraps `data` on success and constructs `Error` objects with `status / code / message / details` on non-2xx; no change to that wrapper is required.

The shape of `<payload>` per endpoint is fixed in §6 and is the bit-parity boundary between the in-memory and projection-backed branches (see §7).

### 5.5 Empty-state behaviour

Empty results are 200, not 404. Per-endpoint payloads contain an explicit array (possibly empty) plus a stable `total` counter. The UI distinguishes between "the API returned no rows" and "the API is unavailable" by status code, never by absence of a payload field.

The Slice 1 read-only console already renders the honest gap card for these screens. After an endpoint is implemented and the matching `FINANCE_API_GAPS` entry is removed in the same commit (per Slice 1 §8.2 retirement rule), the screen swaps to a live data view; an empty response renders the per-screen empty copy from the Track C operator copy guide.

### 5.6 Degraded / honest-failure behaviour

These endpoints do not silently substitute a stale or inferred answer when the backing source is unhealthy.

- If the in-memory branch is the source-of-truth and a panic / unhandled exception bubbles, the endpoint returns 500 with the structured error envelope. No partial data is fabricated.
- After Phase 4-1 lifts persistent-mode reads, if the projection store reports `degraded` or a cursor is behind by more than the projection-specific freshness budget, the endpoint returns 503 with `code: 'PROJECTION_DEGRADED'` and `details: { projection, cursor_lag_ms, freshness_budget_ms }`. This mirrors the Phase 4-1 no-silent-fallback contract: when persistent mode is active, the in-memory branch is not used as a fallback.
- If the per-tenant module gate denies, the response is 403 with the exact existing message (no inferred answer for an unenrolled tenant).

### 5.7 Provenance / freshness disclosure

Each successful payload carries a small `source` block so the UI can render an honest freshness indicator and the operator-facing copy guide can map it to plain language:

```json
"source": {
  "mode": "in_memory" | "projection",
  "served_at": "<ISO 8601>",
  "projection": "<projection name | null>",
  "cursor_lag_ms": <int | null>
}
```

`mode` is the canonical signal for whether the response came from the in-memory domain service or the projection-backed read. `projection` and `cursor_lag_ms` are populated only when `mode === 'projection'`. This block exists in both branches so the UI does not need to switch on the gate state.

### 5.8 No mutation, no helper exports

These endpoints are GET-only. Slice 1's structural rule that mutating wrappers must not appear in `src/api/finance.js` continues to apply when each endpoint's client wrapper is later authored: the implementation commit that closes a gap may introduce a single GET wrapper alongside the route, never a paired mutating wrapper. Any approve / reject / reverse / replay / retry / cancel / provider-sync affordance is deferred to its own slice.

---

## 6. Per-endpoint contracts

For each endpoint: path, source-of-truth today vs after Phase 4-1, request, response shape, empty-state, pagination, degraded behaviour, and the explicit blocked-on-Phase-4-1 marking.

### 6.1 `GET /api/v2/finance/draft-invoices`

- **Source today (in-memory):** `financeDomainService.bucket.invoices` filtered to `status === 'draft'`.
- **Source after Phase 4-1:** Persistent `invoices` projection keyed by `(tenant_id, invoice_id)`, snapshot driven by the `finance.invoice.*` event vocabulary. The projection is new; its event-source contract is owned by the Phase 4-1 implementation packet.
- **Blocked on Phase 4-1?** Not blocked. The in-memory branch is sufficient to ship a read-only list under the existing fail-closed posture. The persistent branch is required only when `ENABLE_FINANCE_PERSISTENT_EVENTS === 'true'` later.
- **Request:** `GET /api/v2/finance/draft-invoices?limit=50&offset=0`. Optional `?customer_id=<uuid>` filter.
- **Response shape:**

```json
{
  "status": "success",
  "data": {
    "invoices": [
      {
        "id": "<uuid>",
        "status": "draft",
        "customer_id": "<uuid|null>",
        "customer_name": "<string|null>",
        "currency": "<ISO 4217>",
        "amount_cents": <int>,
        "created_at": "<ISO 8601>",
        "updated_at": "<ISO 8601>"
      }
    ],
    "total": <int>,
    "source": { "mode": "in_memory|projection", "served_at": "<ISO 8601>", "projection": "invoices|null", "cursor_lag_ms": null }
  }
}
```

- **Pagination:** offset / limit. `total` is the unfiltered (post-`status='draft'`, post-customer-filter) count for the tenant.
- **Empty state:** `data.invoices: []`, `data.total: 0`. 200 OK. Operator copy "Draft invoices are not available for this tenant yet" is supplied by the UI from the Track C copy guide.
- **Degraded:** Per §5.6.

### 6.2 `GET /api/v2/finance/journal-drafts`

- **Source today (in-memory):** `financeDomainService.listJournalEntries(tenantId)` filtered to `status ∈ { 'draft', 'pending_approval' }`. Phase 4-1 corrected the design that the in-memory domain service surfaces every status; this endpoint is the narrow "drafts and pending approval" view of the journal-entries stream.
- **Source after Phase 4-1:** The new `journal_entries` projection introduced by Phase 4-1, filtered to the same two statuses. Bit-parity with the in-memory branch is owned by Phase 4-1's parity test (Phase 4-1 §9 row 8).
- **Blocked on Phase 4-1?** Not blocked for the in-memory branch. The persistent branch defers to Phase 4-1's `journal_entries` projection landing.
- **Request:** `GET /api/v2/finance/journal-drafts?limit=50&offset=0`. Optional `?aggregate_id=<id>` filter.
- **Response shape:**

```json
{
  "status": "success",
  "data": {
    "journal_drafts": [
      {
        "id": "<uuid>",
        "aggregate_id": "<id>",
        "status": "draft|pending_approval",
        "account_code": "<string|null>",
        "amount_cents": <int>,
        "currency": "<ISO 4217>",
        "created_at": "<ISO 8601>"
      }
    ],
    "total": <int>,
    "source": { "mode": "in_memory|projection", "served_at": "<ISO 8601>", "projection": "journal_entries|null", "cursor_lag_ms": null }
  }
}
```

- **Pagination:** offset / limit.
- **Empty state:** Per §5.5.
- **Cross-endpoint contract:** Rows visible via `/journal-drafts` must also be visible via `/journal-entries` (the full-status route) with the same `id` and `status` field. No row is unique to `/journal-drafts`. Phase 4-1's bit-parity assertion covers this for the projection branch.

### 6.3 `GET /api/v2/finance/approvals`

- **Source today (in-memory):** `financeDomainService.listApprovals(tenantId)`. The domain service returns approval records with subject linkage.
- **Source after Phase 4-1:** Future `approval_queue` projection keyed by `(tenant_id, approval_id)` driven by `finance.approval.requested / approved / rejected` events. Bit-parity with the in-memory branch is required.
- **Blocked on Phase 4-1?** Not blocked for the in-memory branch.
- **Request:** `GET /api/v2/finance/approvals?status=pending&limit=50&offset=0`. Optional `?status=<pending|approved|rejected|all>` filter; default is `pending`.
- **Response shape:**

```json
{
  "status": "success",
  "data": {
    "approvals": [
      {
        "id": "<uuid>",
        "status": "pending|approved|rejected",
        "subject_type": "journal_entry|draft_invoice|<other>",
        "subject_id": "<id>",
        "requested_by": "<user_id|null>",
        "requested_at": "<ISO 8601>",
        "decided_by": "<user_id|null>",
        "decided_at": "<ISO 8601|null>"
      }
    ],
    "total": <int>,
    "source": { "mode": "in_memory|projection", "served_at": "<ISO 8601>", "projection": "approval_queue|null", "cursor_lag_ms": null }
  }
}
```

- **Pagination:** offset / limit.
- **Empty state:** Per §5.5.
- **No approve / reject affordance.** No mutating wrapper is introduced in `src/api/finance.js`. Approve / reject remain explicitly deferred per Slice 1 §13.

### 6.4 `GET /api/v2/finance/adapter-jobs`

- **Source today (in-memory):** The in-memory adapter queue exposed by the adapter runtime (`backend/lib/finance/adapterJobProcessor.js`). The route reads the queue contents but does not mutate them.
- **Source after Phase 4-1:** Persistent `adapter_jobs` projection or direct read from `finance.adapter_jobs` (migration 172) once that path is wired. The persistent shape follows `projection-contracts.md` §7.
- **Blocked on Phase 4-1?** Partially. The in-memory list works today. The persistent shape is available only when both the persistent-events branch is live and the adapter-jobs persistent backing is wired; that pairing is owned by a Phase 4-1 follow-up implementation packet, not this design freeze.
- **Status vocabulary (canonical — does not drop pre-terminal states):** The row-level `status` is the canonical `finance.adapter_jobs` enum (migration 172): `draft | queued | running | succeeded | failed`. `draft` is the pre-approval lifecycle position created by `financeDomainService.simulateDealWon` (`backend/lib/finance/financeDomainService.js:504-517`, `status: 'draft'`) and is an explicitly canonical adapter-job status per `projection-contracts.md` §7 and its Design Decisions note ("Adapter jobs in `draft` status"). The `adapterQueueProjection` (`projection-contracts.md` §7) buckets jobs as `queued / running / failed / completed`, mapping `completed ← succeeded` and surfacing `running` for in-flight jobs. This endpoint exposes the row-level `status` rather than the bucket name, so neither `draft` nor `running` is dropped from the response.
- **Request:** `GET /api/v2/finance/adapter-jobs?status=all&limit=50&offset=0`. Optional `?status=<draft|queued|running|succeeded|failed|all>` filter; default is `all`. Optional `?operation=<op>` filter restricted to the migration-172 CHECK enum values (`pull`, `pull_status`, `push_draft`, `push_final`, `sync_status`, `void`, `void_record`, `reconcile`).
- **Response shape:**

```json
{
  "status": "success",
  "data": {
    "adapter_jobs": [
      {
        "id": "<uuid>",
        "operation": "pull|pull_status|push_draft|push_final|sync_status|void|void_record|reconcile",
        "status": "draft|queued|running|succeeded|failed",
        "attempts": <int>,
        "next_attempt_at": "<ISO 8601|null>",
        "last_error": "<string|null>",
        "created_at": "<ISO 8601>"
      }
    ],
    "total": <int>,
    "source": { "mode": "in_memory|projection", "served_at": "<ISO 8601>", "projection": "adapter_jobs|null", "cursor_lag_ms": null }
  }
}
```

- **Pagination:** offset / limit.
- **No retry / cancel affordance.** No mutating wrapper. Adapter retry / cancel remain explicitly deferred per Slice 1 §13.

### 6.5 `GET /api/v2/finance/audit-events`

- **Source today (in-memory):** `financeDomainService.listAuditEvents(tenantId)`. The domain service exposes the recent event stream for the tenant. The in-memory branch is bounded by process restart; that bound is honest.
- **Source after Phase 4-1:** Future `auditTimelineProjection` over `audit_events`. The persistent branch removes the process-restart bound and is paginated against the persistent store.
- **Blocked on Phase 4-1?** Not blocked for the in-memory branch.
- **Request:** `GET /api/v2/finance/audit-events?limit=100&cursor=<opaque>`. Cursor-paginated to support the timeline view; the cursor is opaque to the client and encodes `(occurred_at, id)`. Optional `?event_type=<prefix>` filter (e.g., `finance.journal.*`).
- **Response shape:**

```json
{
  "status": "success",
  "data": {
    "events": [
      {
        "id": "<uuid>",
        "event_type": "<string>",
        "aggregate_id": "<id>",
        "aggregate_type": "<string>",
        "occurred_at": "<ISO 8601>",
        "actor": "<user_id|service_id|null>",
        "payload": { "...": "opaque per event_type" }
      }
    ],
    "next_cursor": "<opaque|null>",
    "source": {
      "mode": "in_memory|projection",
      "served_at": "<ISO 8601>",
      "projection": "audit_events|null",
      "cursor_lag_ms": null
    }
  }
}
```

- **Pagination:** cursor. The list is descending by `(occurred_at, id)` so the newest event is first. `next_cursor: null` indicates end-of-stream.
- **Empty state:** `data.events: []`, `next_cursor: null`.
- **Tenant isolation:** Events are pre-filtered to the tenant; the cursor encodes the tenant scope so cursor reuse across tenants is rejected at decode time.

### 6.6 `GET /api/v2/finance/projection/cursors`

- **Source today (in-memory):** `projectionStore.memory.js` per-projection cursors. The in-memory store carries per-projection state but is process-bounded.
- **Source after Phase 4-1:** `projectionStore.pg.js` per-tenant per-projection cursors. This endpoint is fundamentally a projection-store diagnostic; once Phase 4-1 lands the persistent projection store, this endpoint reads from it directly.
- **Blocked on Phase 4-1?** Partially. The memory branch is available today and is the only honest answer while persistent mode is fail-closed. The persistent shape requires the Phase 4-1 projection store landing.
- **Request:** `GET /api/v2/finance/projection/cursors`. No pagination (a tenant has at most O(projections) entries, well under 50).
- **Response shape:**

```json
{
  "status": "success",
  "data": {
    "projections": [
      {
        "name": "<projection_name>",
        "state": "idle|replaying|degraded",
        "store": "memory|postgres",
        "last_event_id": "<uuid|null>",
        "last_event_at": "<ISO 8601|null>",
        "lag_ms": <int|null>
      }
    ],
    "source": { "mode": "in_memory|projection", "served_at": "<ISO 8601>", "projection": "projection_store|null", "cursor_lag_ms": null }
  }
}
```

- **No replay / advance / drop affordance.** Read-only diagnostic. Replay, advance-cursor, and drop-and-rebuild affordances remain explicitly deferred per Slice 1 §13.
- **Degraded honesty:** When `state === 'degraded'` for any projection, the cell is still returned with the degraded state explicitly named so the projection / degraded screen can render the honest banner.

### 6.7 `GET /api/v2/finance/adapters`

- **Source today (in-memory):** Adapter registry constructed inside `financeAdapterWorker.js` / `adapterJobProcessor.js`. The registry today includes only the ERPNext sandbox adapter; the sandbox-only URL guard at `erpnextSandboxAdapter.js:89-128` is preserved.
- **Source after Phase 4-1:** Same in-process registry. Phase 4-1 does not change adapter registration; persistent-events mode is orthogonal to adapter routing.
- **Blocked on Phase 4-1?** Not blocked.
- **Request:** `GET /api/v2/finance/adapters`. No pagination.
- **Response shape:**

```json
{
  "status": "success",
  "data": {
    "adapters": [
      {
        "name": "erpnext_sandbox",
        "kind": "sandbox",
        "mode": "draft_only",
        "capabilities": ["push_draft", "sync_status", "reconcile"],
        "unsupported": ["push_final"],
        "provider_writes_enabled": false,
        "base_url_guarded_to": "sandbox",
        "config_summary": { "tier": "sandbox", "credentials_resolved": false }
      }
    ],
    "source": {
      "mode": "in_memory|projection",
      "served_at": "<ISO 8601>",
      "projection": null,
      "cursor_lag_ms": null
    }
  }
}
```

- **Honest capability disclosure (no overstated operations):** `capabilities` lists only the operations the ERPNext sandbox adapter actually implements — `pushDraft`, `syncStatus`, and `reconcile` (`erpnextSandboxAdapter.js:283,343,373`). `mode` reflects the adapter's `draft_only` posture (`erpnextSandboxAdapter.js:177`). `push_final` is surfaced under `unsupported`, not `capabilities`, because `pushFinal` throws `AdapterCapabilityError` ("pushFinal is not supported by the ERPNext sandbox adapter — Slice 2 is draft-only", `erpnextSandboxAdapter.js:336-340`). `pull_status` is not advertised because the adapter implements no `pull` / `pull_status` method. The endpoint must not advertise an operation the adapter would reject at call time.
- **Honest sandbox / provider-write disclosure:** `provider_writes_enabled` reflects the runtime value of `FINANCE_PROVIDER_WRITES_ENABLED` (default `false`). `base_url_guarded_to` reflects the structural guard. The endpoint does not surface credential material; `config_summary.credentials_resolved` is a boolean only.
- **No connection-test / credentials-write affordance.** No mutating companion. Provider-write enablement remains a backend env-var concern, not a UI action.

### 6.8 `GET /api/v2/finance/evidence-packs`

- **Source today (in-memory):** `backend/lib/finance/auditEvidenceBuilder.js` exports `buildEvidencePack(events, options)` — a pure, read-only, side-effect-free builder that reconstructs a single tamper-evident evidence pack from the tenant's finance event stream for an explicit scope (`fromDate` / `toDate`, or a `targetId` widened to its full `correlation_id` span). **There is no persistent pack registry.** No table, projection, or store holds a history of previously generated packs, and no `pack_type` / `title` / `generated_at` / `summary` / `artifact_count` row is persisted anywhere. The module's only exports are `queryAuditTimeline`, `getReversalChain`, and `buildEvidencePack` — a "list previously generated packs" contract therefore has no honest source of truth and is **not** specified here.
- **Source after Phase 4-1:** Same on-demand builder, optionally re-driven by the persistent `audit_events` store once it lands so a pack reflects events that survived process restart. Phase 4-1 does not add a pack registry; the builder remains on-demand and the HTTP shape below is unchanged.
- **Blocked on Phase 4-1?** Not blocked. `buildEvidencePack` runs against the in-memory event stream today.
- **Contract — on-demand build, not a historical list.** This endpoint builds one pack on demand for an explicit scope and returns its metadata. It does **not** paginate a stored collection (none exists) and carries no `total`. A persistent evidence-pack registry (stored titles, generation history, retention, per-id retrieval) is a backend gap that requires a new migration + store and is its own future slice (see §14); until it lands, the honest answer is an on-demand build, never a fabricated history row.
- **Request:** `GET /api/v2/finance/evidence-packs?from=<ISO 8601>&to=<ISO 8601>` (both optional; default scope is the tenant's full retained event stream). Optional `?target_id=<id>` widens the pack to a single aggregate's full `correlation_id` span (maps to `buildEvidencePack`'s `targetId`). There is no `pack_type` filter — "pack type" is not a stored or canonical attribute.
- **Response shape:**

```json
{
  "status": "success",
  "data": {
    "pack": {
      "pack_id": "<string>",
      "generated_at": "<ISO 8601>",
      "scope": { "from": "<ISO 8601|null>", "to": "<ISO 8601|null>", "target_id": "<id|null>" },
      "summary": { "...": "the builder's §6 summary section (event / approval / adapter / reversal counts)" },
      "artifact_count": <int>,
      "integrity": {
        "pack_hash": "<sha256>",
        "events_hash": "<sha256>",
        "approvals_hash": "<sha256>"
      }
    },
    "source": { "mode": "in_memory|projection", "served_at": "<ISO 8601>", "projection": null, "cursor_lag_ms": null }
  }
}
```

- **`generated_at` is this request's build time, not a stored history timestamp.** It maps to `buildEvidencePack`'s injectable `generatedAt` and reflects when this pack was built on demand. `pack_id`, `summary`, `artifact_count`, and the integrity hashes are all derived from the freshly built pack — nothing is read from a registry.
- **No `total`, no pagination.** A single pack is built per request. The empty case (no events in scope) returns 200 with an honest empty pack (`artifact_count: 0`, summary reflecting zero events), never a fabricated history row.
- **No pack-content blob beyond summary + integrity in this response.** A future `GET /api/v2/finance/evidence-packs/:id` is not meaningful while packs are not persisted; full pack-content retrieval is deferred to the slice that introduces a persistent registry (§14).
- **No generate-pack mutation.** `buildEvidencePack` writes nothing, mutates no record, and contacts no provider, so building a pack on read is a pure read — not a mutation affordance — and persists nothing.

---

## 7. In-memory vs persistent read-source mapping

Each endpoint exposes the same response shape regardless of which branch served the read, with `data.source.mode` as the canonical disclosure. The bit-parity rule mirrors Phase 4-1's contract for the existing five GETs:

- The in-memory branch and the projection branch MUST return identical rows in identical order for the same event sequence.
- The projection branch is allowed to be more durable (survives restart) and more authoritative (canonical replay source), but never produces a row the in-memory branch would not have produced.
- When the two branches would disagree for the same event sequence, the implementation packet treats that as a bug in the projection, not a routing decision. The persistent-events route does not fall back to in-memory under disagreement; it returns `503 PROJECTION_DEGRADED` per §5.6.

Per-endpoint blocked-on-Phase-4-1 status, restated for the implementation sequencing:

| #   | Endpoint              | In-memory branch can ship now | Persistent branch blocked on Phase 4-1                                                                                                                             |
| --- | --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `/draft-invoices`     | Yes                           | Yes — needs `invoices` projection                                                                                                                                  |
| 2   | `/journal-drafts`     | Yes                           | Yes — needs Phase 4-1 `journal_entries` projection                                                                                                                 |
| 3   | `/approvals`          | Yes                           | Yes — needs `approval_queue` projection                                                                                                                            |
| 4   | `/adapter-jobs`       | Yes                           | Yes — needs persistent backing per `projection-contracts.md` §7                                                                                                    |
| 5   | `/audit-events`       | Yes                           | Yes — needs `auditTimelineProjection` over `audit_events`                                                                                                          |
| 6   | `/projection/cursors` | Yes                           | Yes — needs persistent `projectionStore.pg.js` to be honest                                                                                                        |
| 7   | `/adapters`           | Yes                           | No — adapter registry is process-local, no persistence required                                                                                                    |
| 8   | `/evidence-packs`     | Yes (on-demand build)         | No — `auditEvidenceBuilder.js` is an on-demand builder; no persistent registry. A stored pack history is a separate future slice (§14), not a Phase 4-1 dependency |

The implementation sequencing rule that follows from this table: an implementation packet that closes a gap may ship the in-memory branch immediately, but its persistent-mode branch (when applicable) cannot land before Phase 4-1's persistent-events route lift has cleared Codex review and its staging proof has been captured.

---

## 8. No-silent-fallback contract

Carry-forward of Phase 4-1 §6, restated here to bind these eight endpoints:

- When `ENABLE_FINANCE_PERSISTENT_EVENTS !== 'true'`, the in-memory branch serves the response. `data.source.mode === 'in_memory'`.
- When `ENABLE_FINANCE_PERSISTENT_EVENTS === 'true'` and Phase 4-1's route lift has landed, the projection branch serves the response. `data.source.mode === 'projection'`. The in-memory branch is not consulted, even as a fallback.
- The route-construction-time guard at `finance.v2.js:48` continues to prevent the Finance v2 router from mounting at all when persistent mode is asked for but projection-backed reads have not landed. That guard is the structural enforcement of this rule; nothing in this packet weakens it.

If the projection branch reports degraded (cursor lag beyond the freshness budget, `state === 'degraded'`, or any irrecoverable read error), the response is `503 PROJECTION_DEGRADED` per §5.6. The UI renders the degraded banner; no inferred data is returned.

---

## 9. Tenant isolation + module gating rules

The three orthogonal gates that protect each endpoint are stated together here so the implementation packet has a single reference to mirror:

1. **Process-level mount gate (`ENABLE_FINANCE_OPS`).** Route is not registered unless the gate is `true`. Without the gate, the entire `/api/v2/finance/*` path returns the platform default 404. Slice 1 design freeze §12.1 ("Route disabled" state) covers the UI response.
2. **Authenticated tenant + tenant match (`validateTenantAccess`).** Cross-tenant reads are rejected with 403 and the existing "Access denied" message. Superadmin reads pass for any tenant per the existing middleware (`backend/middleware/validateTenant.js`).
3. **Per-tenant module gate (`checkFinanceOpsEnabled`).** The tenant must have an enabled `financeOps` or `enterpriseFinance` row in `modulesettings`. Canonical-wins resolution (`financeModuleGate.js:40-48`) is preserved. The gate denial returns 403 with the exact message `Finance Ops is not enabled for this tenant` so the UI can branch to its "Tenant not enrolled" state (Slice 1 §12.2).

These three gates run in the order listed; an early-out at any layer skips the subsequent gates. The endpoint handler runs only after all three pass.

No role gate is added. Slice 1 §11.3 binds the rule: any future role-based finance gate must land at the backend route layer before any frontend mirror.

---

## 10. Required test surface before any of these routes can mount

For each endpoint, the implementation packet that lands the route MUST ship the following tests in `backend/__tests__/routes/`. Test count is illustrative; the binding contract is the coverage list.

1. **Authorisation matrix:**
   - 404 when `ENABLE_FINANCE_OPS !== 'true'`.
   - 401 when no authenticated tenant context.
   - 403 with the existing "Access denied" message when the user's tenant does not match the requested tenant (non-superadmin path).
   - 403 with the exact "Finance Ops is not enabled for this tenant" message when the module gate denies (no row, disabled canonical row, alias-only disabled).
   - 200 when the canonical `financeOps` row is enabled.
   - 200 when only the `enterpriseFinance` alias row is enabled (canonical-wins, alias path).
   - 403 when the canonical `financeOps: false` row exists alongside an `enterpriseFinance: true` row (canonical-wins denial).
2. **Tenant isolation:** rows from another tenant never appear in the response, including when pagination cursors are reused across tenants (cursor decode rejects cross-tenant reuse).
3. **Response shape parity:** the JSON shape matches §6 exactly. No extra fields, no missing required fields.
4. **In-memory branch correctness:** a seeded event sequence produces the expected row set in the documented order.
5. **Pagination correctness:** offset / limit clamping at `>200`, `<0`, non-integer; cursor decode failure returns 400 with `code: 'PAGINATION_INVALID'`.
6. **Empty-state correctness:** unenrolled-but-passing tenant returns 200 with empty array and `total: 0` (not 404). (`/evidence-packs` is the documented exception per §6.8: it builds a single pack on demand, so its empty case is a 200 with an honest empty pack — `artifact_count: 0` — not an empty array with `total: 0`.)
7. **No mutation surface:** the implementation packet's frontend client wrapper (if added) exports only the GET, with no POST / PATCH / DELETE companion. Existing Slice 1 anti-mutation tests in `src/api/__tests__/finance.test.js` continue to assert this for the wrapper module.

After Phase 4-1 lands, each endpoint's implementation packet ALSO ships:

8. **Persistent-mode bit-parity:** for the same seeded event sequence, the persistent branch returns the same rows in the same order as the in-memory branch. Mirrors Phase 4-1 §9 row 8.
9. **No-silent-fallback:** when persistent mode is configured and the projection is degraded, the route returns `503 PROJECTION_DEGRADED` rather than serving stale in-memory data.

These tests are not authored in this packet; they are the binding contract for the implementation packet that closes each gap.

---

## 11. Required staging proof before any production consideration

Per the Phase 4 production-pilot design freeze §11 binding rule, an endpoint may be considered for production activation only after its staging proof file lands. The minimum staging proof per endpoint is:

- A captured `curl` transcript (or `httpie` equivalent) against the staging deployment showing authorised 200 and unauthorised 403 / 404 paths.
- Bit-parity assertion captured against the same seeded event sequence under both branches (in-memory and projection).
- A pagination round-trip across at least two pages, including the empty trailing page.
- An honest demonstration of `data.source.mode` flipping between branches as the env var is toggled in the staging environment under the §8 no-silent-fallback contract.
- A degraded-projection demonstration: the projection is forced into `degraded` state in staging and the endpoint returns `503 PROJECTION_DEGRADED` (not a stale 200).

No staging action is taken by this packet. The staging proof is a deliverable of the implementation packet that closes each gap.

---

## 12. Hard constraints (explicit restatement)

- No backend route is implemented in this packet.
- No client wrapper is added to `src/api/finance.js`.
- No POST / PATCH / DELETE companion is introduced for any endpoint.
- No approve / reject / reverse / replay / retry / cancel / provider-sync affordance.
- No persistent-events route lift. `ENABLE_FINANCE_PERSISTENT_EVENTS` remains fail-closed at `finance.v2.js:48`.
- No provider-writes enablement. `FINANCE_PROVIDER_WRITES_ENABLED` remains default-closed.
- No process-level mount-gate change. `ENABLE_FINANCE_OPS` is unchanged.
- No migration application.
- No staging / Coolify / Doppler mutation.
- No production action.
- No push without Andrei's explicit authorisation.
- The 16 Phase 3-13 §7 safety guardrails are preserved end-to-end.
- The six mutating Finance v2 endpoints remain absent from `src/api/finance.js`.
- The canonical-wins module-gate resolution is preserved; the alias-aware seed rule from `feat/finance-ops-ux-preview` (`MODULESETTINGS_ALIASES`, `selectMissingDefaultRows`, frontend `computeMissingModules`) continues to apply once that branch is merged.

---

## 13. Acceptance for this packet

- The eight endpoints in §4 are each given a full contract in §6: path, request, response, empty state, pagination, source-of-truth today vs after Phase 4-1, blocked-on-Phase-4-1 marking, degraded behaviour.
- The common contract conventions (§5) are stated once and reused. No per-endpoint section re-introduces a divergent auth model, error envelope, or pagination scheme.
- The bit-parity rule (§7) is explicit and consistent with Phase 4-1.
- The no-silent-fallback contract (§8) is restated so this packet does not weaken Phase 4-1.
- The tenant isolation + module gating contract (§9) is stated once and bound to the existing middleware + gate stack; no new gate is invented.
- Tests required before any route may mount (§10) and staging proof required before any production consideration (§11) are enumerated.
- Hard constraints (§12) re-state every guardrail.
- No backend code, no frontend code, no migration, no env-var change is included in this packet.

---

## 14. Out of scope / future slices

The following are deliberately deferred and may not be assumed by this packet:

- Mutating Finance v2 endpoints (the six listed in Slice 1 §8.3) and any of their client wrappers.
- Approve / reject / reverse / replay / retry / cancel / provider-sync UI affordances.
- A persistent evidence-pack registry (a store of previously generated packs with stored titles, generation history, and retention) and its per-id content retrieval (`GET /api/v2/finance/evidence-packs/:id`). Out of scope; §6.8 specifies only the on-demand build endpoint backed by `auditEvidenceBuilder.js`. A registry requires a new migration + store and is its own future slice.
- Cursor-advance / replay-from-cursor / drop-and-rebuild admin affordances for projections.
- A dedicated finance-admin vs finance-viewer role split. Per Slice 1 §11.3, any future role gate must land at the backend route layer first; the present packet does not invent one.
- Activation of `ENABLE_FINANCE_PERSISTENT_EVENTS` or `FINANCE_PROVIDER_WRITES_ENABLED`. Both remain fail-closed / default-closed.

Each future slice that picks up one of these will start with its own design freeze.

---

## 15. Implementation status (Finance Read API Slice 1)

This section is a non-normative status note appended when the endpoints were implemented on `feat/finance-ops-read-api-implementation-slice1`. The §6 contracts above remain the authoritative reference; this note records what landed, the per-endpoint deviations forced by the in-memory source, and what stayed deferred.

**Implemented (7 — in-memory branch):** `/draft-invoices` (§6.1), `/journal-drafts` (§6.2), `/approvals` (§6.3), `/adapter-jobs` (§6.4), `/audit-events` (§6.5), `/adapters` (§6.7), `/evidence-packs` (§6.8). Each serves from the in-memory domain service; the persistent/projection branch remains deferred to Phase 4-1 per §7. Routes live in `backend/routes/finance.v2.js` inside the existing three-gate stack (§9); the common conventions (§5) — envelopes, `data.source`, pagination clamping, cursor rejection — are implemented as shared route helpers.

**Deferred (1):** `/projection/cursors` (§6.6) — depends on the persistent projection store; it stays an honest `FINANCE_API_GAPS` gap card in the UI (no fabricated cursor data).

**`/adapters` source-of-truth correction:** §6.7's "registry constructed inside `financeAdapterWorker.js`" is empty at the route layer today (the worker is injected an empty adapter Map; Slice 2A has not landed). The endpoint is therefore backed by a new read-only **declarative** metadata module, `backend/lib/finance/financeAdapterRegistry.js` — capability/status/posture discovery only, with no adapter instantiation, credentials, network, or write/sync path. The response adds two honesty fields beyond §6.7: `production_allowed: false` and a config-derived `status` that mirrors the worker's full registration gate (`backend/workers/financeAdapterWorker.js:484-516`): `not_registered` when the `FINANCE_ERPNEXT_*` credentials are absent; `configuration_invalid` when they are present but the base URL fails the sandbox guard (the shared `isSandboxBaseUrl` validator — the same check the adapter constructor applies at `erpnextSandboxAdapter.js:162`, which leaves the worker registry empty on a production-looking URL); `registered` only when credentials are present AND the base URL is sandbox-valid. `config_summary.credentials_resolved` mirrors credential presence (never the credential values). This prevents the UI claiming the adapter is registered in exactly the cases where the worker would skip every ERPNext job. `provider_writes_enabled` mirrors `FINANCE_PROVIDER_WRITES_ENABLED` (default false).

**Field-mapping deviations (deviate-and-document; the in-memory record shapes differ from the §6 field names, and §5.7 `data.source` is the honesty signal):**

| Endpoint          | §6 field                                                    | In-memory mapping                                                                             |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/draft-invoices` | `amount_cents` / `customer_name` / `updated_at`             | `total_cents` / `null` (not stored) / `updated_at \|\| created_at`                            |
| `/journal-drafts` | `aggregate_id` / `account_code` / `amount_cents`            | `id` / `null` (entries hold `lines[].account_name`, no single code) / `Σ lines[].debit_cents` |
| `/approvals`      | `subject_type` / `subject_id` / `decided_by` / `decided_at` | `target_type` / `target_id` / `approved_by ?? null` / `approved_at ?? null`                   |
| `/adapter-jobs`   | `attempts` / `next_attempt_at` / `last_error`               | `0` / `null` / `null` (not tracked in-memory; row `status` is the full canonical enum)        |
| `/audit-events`   | `occurred_at` / `actor`                                     | `created_at` / `actor_id ?? null`                                                             |
| `/evidence-packs` | `artifact_count`                                            | `event_count` from the built pack                                                             |

**Tests satisfying §10:** `backend/__tests__/routes/finance.v2.read-routes.test.js` (authorisation matrix, tenant isolation, response-shape parity, pagination clamping, cursor cross-tenant rejection + round-trip, empty-state, no-mutation, `/adapters` no-credential/no-write-surface). Frontend: `src/api/__tests__/finance.test.js` (wrapper + 2-gap registry) and `src/components/finance/__tests__/LiveDataPanels.test.jsx` (live panels, read-only safety). §10's persistent-mode bit-parity + no-silent-fallback tests remain deferred with the Phase 4-1 branch. §11 staging proof is unchanged and not produced by this slice.
