# Finance Ops — Phase 3-8: Route / Runtime Smoke-Test Plan (Dry Run)

**Phase 3-8 — Controlled Staging Activation, Finance v2 route/runtime smoke tests against the existing safe runtime.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Smoke-test plan / results template. **No live smoke tests were executed by this task.** No HTTP request issued against staging, no Doppler / env var change, no Coolify mutation, no migration applied, no worker change, no `ENABLE_FINANCE_PERSISTENT_EVENTS` flip, no provider HTTP write, production untouched. This document is the exact 11-step smoke-test sequence an authorized operator runs against the activated route; it does not execute any of them.
**Date:** 2026-05-24
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`staging-migration-application-log.md`](./staging-migration-application-log.md) (3-2) ·
[`staging-rls-verification-results.md`](./staging-rls-verification-results.md) (3-3) ·
[`staging-worker-deployment-log.md`](./staging-worker-deployment-log.md) (3-4) ·
[`staging-worker-activation-log.md`](./staging-worker-activation-log.md) (3-5) ·
[`staging-replay-drill-results.md`](./staging-replay-drill-results.md) (3-6) ·
[`staging-route-activation-log.md`](./staging-route-activation-log.md) (3-7, the route this doc smoke-tests) ·
[`staging-observability-verification.md`](./staging-observability-verification.md) (3-11) ·
[`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md) (2C-13, §5 8-check smoke matrix — extended here) ·
[`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8, **deferred to Phase 3-9 — NOT in 3-8 scope**) ·
[`erpnext-sandbox-proof.md`](./erpnext-sandbox-proof.md) (2C-9, **deferred to Phase 3-10 — NOT in 3-8 scope**) ·
`backend/routes/finance.v2.js` (the route handlers being smoke-tested)

---

## 1. Purpose and scope

Phase 3-8 smoke-tests the **existing Finance v2 route behavior** against the controlled staging tenant after Phase 3-7 mounts the route. The 11-check sequence covers route-mount sanity, read-side endpoints, draft creation (invoice + journal), governance enforcement (balanced/unbalanced validation, AI approval block), the simulate-deal-won orchestration, journal reversal flow, and tenant-isolation negative cases (disabled tenant + wrong tenant).

**Scope boundary — what 3-8 tests:**

- The mounted `/api/v2/finance/*` route surface (Phase 3-7 deliverable).
- Behavior against the **in-memory event store** inside `financeDomainService` (because `ENABLE_FINANCE_PERSISTENT_EVENTS` is structurally fail-closed at `backend/routes/finance.v2.js:48` until Slice 2).
- Per-tenant module gate enforcement (`backend/routes/finance.v2.js:69-90`).
- Auth + `validateTenantAccess` middleware (`backend/middleware/validateTenant.js`).
- Governance decision enforcement (the AI-blocks-approval contract from `financeGovernanceDecision.js` + `buildActor()` session-derived actor identity from commit `04a76bae`).

**Scope boundary — what 3-8 does NOT test:**

- **No adapter worker execution.** `finance-adapter-worker` doesn't exist (Phase 3-4 §4); the simulate-deal-won endpoint produces an `adapter_job` record with `status: 'draft'` in the in-memory bucket but no worker drains it. Adapter execution is **Phase 3-9** territory.
- **No ERPNext / QuickBooks / Xero connectivity.** Provider integrations are **Phase 3-10** territory.
- **No provider HTTP writes of any kind.** `FINANCE_PROVIDER_WRITES_ENABLED` does not appear anywhere in the route runtime; no provider call path exists in this code.
- **No persistent-events writes.** The fail-closed guard at `backend/routes/finance.v2.js:48` throws if `ENABLE_FINANCE_PERSISTENT_EVENTS=true`; backend startup would fail loud. All route writes go to the in-memory bucket; nothing reaches `finance.audit_events` from this route.
- **No projection worker behavior.** The worker (Phase 3-5) reads `finance.audit_events`; the route writes to the in-memory bucket; they don't communicate in the current Slice 1 contract. 3-8 doesn't test their interaction.
- **No replay / rebuild.** That's Phase 3-6.

**This document is a plan and a results template.** No HTTP request was issued by this task; the "Evidence pack" in §10 is empty until an authorized operator runs the smoke sequence.

---

## 2. Live-execution posture

**Default for this task: no smoke test was executed.**

| What                                                                              | Status this task                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `curl` / HTTP request against `https://staging-api.aishacrm.com/api/v2/finance/*` | None.                                                                       |
| Authenticated session JWT obtained for the controlled-tenant test user            | None.                                                                       |
| Authenticated session JWT obtained for a non-controlled-tenant test user          | None.                                                                       |
| SSH session to VPS-1 (`andreibyf@147.189.173.237`) or container `docker exec`     | None.                                                                       |
| Staging Doppler (`stg_stg`) env var changed                                       | None.                                                                       |
| `ENABLE_FINANCE_OPS` flipped on `staging-backend-heavy`                           | None — Phase 3-7 covers that; 3-8 assumes it has been done by the operator. |
| `financeOps` module flag flipped for any tenant                                   | None — Phase 3-7 covers that; 3-8 assumes the controlled tenant has it set. |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flipped anywhere                               | None — remains unset (structurally fail-closed at route mount).             |
| Worker app (`staging-finance-projection-worker`) configuration changed            | None — Phase 3-5 is independent and unaffected.                             |
| Staging Supabase migration applied                                                | None.                                                                       |
| Provider HTTP write (QuickBooks / Xero / ERPNext)                                 | None — no provider call path exists in the route runtime.                   |
| Production environment touched in any way                                         | None.                                                                       |

A live execution requires the deploy owner's explicit authorization. When authorized, the §5 sequence is run **in order** and outputs are captured per §10.

---

## 3. Prerequisites — what must be true before 3-8 runs

- [ ] **Phase 3-1 baseline.** Branch `feat/finance-ops-runtime` at a descendant of `3c60d9ff`; 278/278 finance + projection + worker + route tests passing.
- [ ] **Phase 3-2 migrations applied to staging.** At minimum 168 + 169 + 170 + 171.
- [ ] **Phase 3-3 RLS verification PASS** in staging.
- [ ] **Phase 3-7 route activation complete.** `ENABLE_FINANCE_OPS=true` on `staging-backend-heavy` and the route surface is mounted (verified by Phase 3-7 §5.4 returning `200` for the controlled tenant). `modulesettings.financeOps.is_enabled = true` for `a11dfb63-4b18-4eb8-872e-747af2e37c46` only.
- [ ] **A staging test user belonging to the controlled tenant** is available with a valid Supabase auth JWT. At minimum one `human` actor; ideally also one `ai_agent` actor (for check #8 AI approval block). If only `human` test users exist, check #8 must be DEFERRED with reason.
- [ ] **A staging test user belonging to a DIFFERENT staging tenant** is available with a valid JWT (for checks #10 disabled-tenant and #11 wrong-tenant). If unavailable, those two checks must be DEFERRED.
- [ ] **`ENABLE_FINANCE_PERSISTENT_EVENTS` unset on `staging-backend-heavy`.** The Slice 1 fail-closed guard at `backend/routes/finance.v2.js:48` remains structurally enforced. If this flag is ever set, backend startup throws and 3-8 cannot proceed.
- [ ] **No production action.** `prd_prd` Doppler config is not opened; Hetzner is not touched; no production tenant's session JWT is used.

If any prerequisite fails or is deferred, the corresponding check(s) in §5 are marked DEFERRED in §10 with the reason. The overall smoke test fails if any prerequisite blocks the _route-mount sanity_ checks (#1–#3); the AI-block and tenant-isolation checks (#8, #10, #11) can be conditionally deferred if their required test users aren't available, but the deploy owner must record that as a known gap.

---

## 4. Current-runtime boundary — explicit restatement

This section makes the "what's actually being tested" boundary explicit so the smoke-test evidence isn't misread as covering things it doesn't.

| Layer                                                   | Behavior under 3-8 conditions                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event store (route side)                                | **In-memory `financeEventStore`** inside `financeDomainService`. Per-process, per-restart bucket. Route writes (invoice draft, journal draft, simulate-deal-won, reverse, approve) append to this bucket. `ENABLE_FINANCE_PERSISTENT_EVENTS` is unset → the persistent Postgres event store (`financeEventStore.pg.js`) is **not** wired into the route. Backend startup throws at `backend/routes/finance.v2.js:48` if anyone flips the flag. |
| `finance.audit_events` Postgres table                   | **Not written by the route under 3-8 conditions.** Empty for the controlled tenant unless pre-existing dev/seed data; Phase 3-2 applied the migrations but the route doesn't append.                                                                                                                                                                                                                                                           |
| Projection worker (`staging-finance-projection-worker`) | **Unaffected by 3-8 smoke tests.** The worker reads `finance.audit_events` (which the route doesn't write to under 3-8 conditions), so the worker's poll cycles report `event_count: 0` throughout 3-8. The route writes never reach the worker; there's no current path between them until Slice 2 lifts the fail-closed guard AND the persistent path is enabled.                                                                            |
| `finance.projection_state` Postgres table               | **Not written by the route under 3-8 conditions.** Only `runner.dispatch()` and `runner.replay()` write to it (Phase 3-5 §6.2, Phase 3-6 §5.4). Without persistent events the runner never sees new events; without operator-triggered replay no `replay()` runs either.                                                                                                                                                                       |
| Adapter worker                                          | **Does not exist.** The simulate-deal-won endpoint produces an `adapter_job` record in the in-memory bucket with `status: 'draft'`, but no worker drains it. Adapter execution is Phase 3-9 territory.                                                                                                                                                                                                                                         |
| Provider HTTP                                           | **No call path.** ERPNext / QuickBooks / Xero clients are not constructed by the route runtime. `tenant_integrations.api_credentials` is not loaded. `FINANCE_PROVIDER_WRITES_ENABLED` is not even read.                                                                                                                                                                                                                                       |
| Approval lifecycle                                      | **In-memory.** Approvals created by the route live in the in-memory bucket; `/approvals/:id/approve` mutates them in place; idempotency check (one pending per tenant + target_type + target_id) is enforced by `financeDomainService.appendApproval()` at `financeDomainService.js:87` (rejects duplicate with `409 FINANCE_APPROVAL_DUPLICATE`).                                                                                             |
| Journal posting                                         | **In-memory.** Approving a journal-draft approval moves the journal through the lifecycle (draft → pending_approval → approved → posted) inside the in-memory bucket. Posting is a state transition on the in-memory record; nothing reaches Postgres `finance.journal_entries`.                                                                                                                                                               |
| Reversal                                                | **In-memory.** `/journal-entries/:id/reverse` constructs a new balanced journal entry with debit/credit inverted (`accountingEngine.createReversalDraft`), appends it as a new draft journal, requires a fresh approval. The original journal stays posted; nothing is hard-deleted.                                                                                                                                                           |

**Operational consequence:** 3-8 smoke tests are **complete** for the route surface and the route-side governance contract. They are **not** a test of: persistent-event end-to-end flow (Slice 2), worker-side processing (Phase 3-5 + 3-6 cover that), adapter execution (Phase 3-9), or ERPNext (Phase 3-10).

---

## 5. Smoke-test sequence (NOT executed by this task)

11 checks, run in order. Each is a single HTTP request (or pair) with expected status code, expected response shape, and the safety property it verifies. The operator captures the verbatim response (status, body) in §10 evidence pack.

The base URL is `https://staging-api.aishacrm.com` (per `DEPLOY_TOPOLOGY.md` — `staging-api.aishacrm.com` is the staging backend FQDN, not `staging-backend.aishacrm.com` which doesn't resolve).

### 5.1 Check #1 — Route-mount sanity (`GET /runtime/status`, controlled tenant)

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  https://staging-api.aishacrm.com/api/v2/finance/runtime/status
```

**Pass:** `HTTP 200`. Body is `{ status: 'success', data: { tenant_id: 'a11dfb63-...', runtime: { mode: 'mock_read_only', persistence: 'in_memory', provider_sync: 'disabled', governance: 'enabled' }, counts: { journal_entries, invoices, approvals, audit_events, adapter_jobs } } }` per the runtime status handler at `backend/routes/finance.v2.js:92-128`. The runtime fields are **nested under `data.runtime.*`** (not top-level `data.mode` / `data.persistence`). `data.runtime.persistence === 'in_memory'` confirms the fail-closed guard is holding (no persistent-events path).

**Fail:** `404` (route not mounted → Phase 3-7 didn't run or rolled back), `401` (auth issue), `403` (module flag not set for controlled tenant → Phase 3-7 §5.3 didn't run), `500` (backend error — investigate via logs per Phase 3-11 §8.8).

**Safety property:** the route is mounted; the controlled tenant passes the auth + tenant + module-gate chain; persistent-events stays in-memory.

### 5.2 Check #2 — Read-side empty fresh state (`GET /ledger`, controlled tenant)

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  https://staging-api.aishacrm.com/api/v2/finance/ledger
```

**Pass:** `HTTP 200`. Body is `{ status: 'success', data: { accounts: [], totals: { debit_cents: 0, credit_cents: 0 } } }` per `backend/routes/finance.v2.js:140-148` calling `buildLedger()` at `backend/lib/finance/accountingEngine.js:97-120`. `accounts` is empty because `buildLedger()` only includes **posted** journal entries (`getPostedEntries(entries)` at `accountingEngine.js:100`) — and under 3-8 conditions no journal ever reaches `posted` state (see §5.7 + §5.9 below for why). `totals` is a flat `{ debit_cents, credit_cents }` pair, **NOT** broken out by five classifications. The response does **NOT** include `tenant_id`.

**Fail:** non-empty `accounts` array (means a posted journal somehow exists in the in-memory bucket — investigate, may indicate `seedJournalEntry` was called via direct service access or pre-existing process state).

**Safety property:** the read-side returns the raw `buildLedger()` shape from posted journals only; under 3-8 conditions (no auto-post path) this is always empty.

### 5.3 Check #3 — Draft invoice creation (`POST /draft-invoices`, controlled tenant, human actor)

```bash
# NOTE: the service stores payload.line_items (not payload.lines) — see
# financeDomainService.js:207. A `lines` field in the body is silently ignored.
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"test-customer-001","currency":"usd","subtotal_cents":10000,"tax_cents":0,"total_cents":10000,"line_items":[{"description":"smoke test line","quantity":1,"unit_price_cents":10000,"amount_cents":10000}]}' \
  https://staging-api.aishacrm.com/api/v2/finance/draft-invoices
```

**Pass:** `HTTP 201`. Body is `{ status: 'success', data: { invoice: {...}, governance_decision: {...}, approval_required: <bool> } }` per `backend/lib/finance/financeDomainService.js:231-235` (the route at `backend/routes/finance.v2.js:170-184` returns the service result directly). The `invoice.status` is `'draft'`, `invoice.tenant_id` is `a11dfb63-...`, `invoice.line_items` matches the body's `line_items`. `governance_decision.allowed` is `true`; `governance_decision.risk_level` is `'low'` for draft creation. `approval_required` is `false` (draft creation does not require approval; only posting does).

**Fail:** any non-201, OR `invoice.line_items` is empty when the body provided populated `line_items` (would indicate a field-mapping regression), OR `governance_decision.allowed` is `false` (would mean governance rejected a routine draft create — investigate).

**Safety property:** draft creation works; no provider write occurs (no provider client in route runtime per §4); governance decision was low-risk-allowed for a human actor.

### 5.4 Check #4 — Balanced journal draft (`POST /journal-drafts`, controlled tenant, human actor)

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"memo":"smoke test balanced","lines":[{"account_name":"Cash","classification":"Asset","debit_cents":5000,"credit_cents":0,"description":"debit cash"},{"account_name":"Revenue","classification":"Revenue","debit_cents":0,"credit_cents":5000,"description":"credit revenue"}]}' \
  https://staging-api.aishacrm.com/api/v2/finance/journal-drafts
```

**Pass:** `HTTP 201`. Body contains the created journal entry with `status: 'draft'`, balanced debits/credits. No provider write.

**Fail:** non-201 with `code: 'FINANCE_UNBALANCED_JOURNAL'` (would indicate the balanced fixture above is somehow not balanced — verify the payload).

**Safety property:** the accounting engine accepts balanced journal drafts and persists them to the in-memory bucket.

### 5.5 Check #5 — Unbalanced journal rejection (`POST /journal-drafts`, controlled tenant, human actor, unbalanced lines)

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"memo":"smoke test UNBALANCED — should fail","lines":[{"account_name":"Cash","classification":"Asset","debit_cents":5000,"credit_cents":0,"description":"debit cash"},{"account_name":"Revenue","classification":"Revenue","debit_cents":0,"credit_cents":3000,"description":"credit too low"}]}' \
  https://staging-api.aishacrm.com/api/v2/finance/journal-drafts
```

**Pass:** `HTTP 400`. Body is `{ status: 'error', code: 'FINANCE_UNBALANCED_JOURNAL', message: ... }` per `backend/lib/finance/accountingEngine.js:64-72` (`assertBalancedJournal` throws with `statusCode: 400` and `code: 'FINANCE_UNBALANCED_JOURNAL'`). No partial write occurs — the in-memory bucket should NOT have a new journal entry from this attempt. A `finance.journal.validation_failed` event IS appended to the in-memory event bucket (per `financeDomainService.js:326-346`), but no journal entry record is created.

**Fail:** `HTTP 201` (the engine accepted an unbalanced journal — critical defect), or any non-400.

**Safety property:** unbalanced journals are rejected by `assertBalancedJournal` before any state mutation; the validation-failed event is appended for auditability without creating a phantom journal record.

### 5.6 Check #6 — Simulate deal won (`POST /simulate/deal-won`, controlled tenant, human actor)

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"deal":{"id":"test-deal-001","customer_id":"test-customer-001","amount_cents":250000,"currency":"usd","won_at":"2026-05-24T00:00:00Z"}}' \
  https://staging-api.aishacrm.com/api/v2/finance/simulate/deal-won
```

**Pass:** `HTTP 201`. Body is `{ status: 'success', data: { journal_entry: {...}, approval: {...}, adapter_job: {...}, governance_decision: {...}, approval_required: true } }` per `backend/lib/finance/financeDomainService.js:501-507`. Specifically: `journal_entry.status: 'pending_approval'` (not yet posted — needs approval; **also will not be auto-posted by check #7's approval call — see §5.7**), `journal_entry.tenant_id: 'a11dfb63-...'`, `approval.status: 'pending'`, `approval.target_type: 'journal_entry'` (or whatever `aggregateType` is passed in by the simulate path — verify against actual response), `adapter_job.status: 'draft'`, `adapter_job.mode: 'draft_only'`, `approval_required: true`. The response does NOT include an `events` field; the events are appended to the in-memory bucket but not returned in the response body. Capture `approval.id` for check #7 and `journal_entry.id` for check #9b.

**Fail:** `journal_entry.status` is `'posted'` directly (would mean approval-required gate was bypassed — critical defect), `approval` missing or `approved`, `adapter_job.status` anything other than `'draft'` (would mean adapter execution path engaged).

**Safety property:** the simulate orchestration creates the journal + approval + adapter-job preview in the right order; the journal does NOT go straight to `posted` (approval-required gate enforced); the adapter_job stays `draft` (no execution path).

### 5.7 Check #7 — Human approval succeeds (`POST /approvals/:id/approve`, controlled tenant, human actor)

```bash
# Replace <approval-id-from-check-6> with the approval.id from check #6's response body.
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://staging-api.aishacrm.com/api/v2/finance/approvals/<approval-id-from-check-6>/approve
```

**Pass:** `HTTP 200`. Body is `{ status: 'success', data: { approval: {...}, governance_decision: {...} } }` per `backend/lib/finance/financeDomainService.js:641-644`. `approval.status` is `'approved'`, `approval.approved_by` matches the test human user's id, `approval.approved_at` is a fresh ISO timestamp. `governance_decision.allowed` is `true`. The response does NOT include an `event` field; the `finance.approval.approved` event is appended to the in-memory bucket but not returned in the response body.

**Important — what `approveFinanceAction()` does NOT do**: per `backend/lib/finance/financeDomainService.js:596-644`, the approval call ONLY mutates the approval row (`status`, `approved_by`, `approved_at`) and appends a `finance.approval.approved` event. It does **NOT** transition the target journal entry from `pending_approval` to `posted`. There is **no auto-execution / auto-post path** in the current in-memory runtime — the journal stays at `pending_approval` indefinitely. This is the upstream cause of check #9's DEFERRED status: there's no HTTP path from `pending_approval` to `posted`. The route tests at `backend/__tests__/routes/finance.v2.routes.test.js:101-123` work around this by calling `service.seedJournalEntry({ ..., status: 'posted' })` directly via the service handle — there is no HTTP equivalent of that.

**Fail:** `HTTP 403` (governance decision rejected — check actor identity; the test user must be a session-derived `human`, not `ai_agent`), `404` (approval id not found — re-check check-6 response), `409 FINANCE_APPROVAL_DUPLICATE` (someone else already approved or attempted — investigate per `financeDomainService.js:87-92`).

**Safety property:** human approval works through the governance chain; `approval.approved_by` is session-derived (not body-spoofed); approval is idempotent at the `(tenant + target_type + target_id)` level (a duplicate `pending` approval attempt would return `409 FINANCE_APPROVAL_DUPLICATE`).

### 5.8 Check #8 — AI approval blocked (`POST /approvals/:id/approve`, controlled tenant, ai_agent actor)

Setup: create a second simulate-deal-won (re-run check #6's curl) to get a fresh pending approval, since check #7 consumed the prior one. Capture the new approval id. **If no `ai_agent` test user exists for the controlled tenant**, this check is DEFERRED with reason — record in §10.

```bash
# Replace <new-approval-id> with the approval.id from the re-run of check #6.
# CRITICAL: <controlled-tenant-ai-agent-jwt> must be a session JWT for an ai_agent actor,
# NOT a human JWT with body-spoofed actor_type. The buildActor() function at
# backend/routes/finance.v2.js derives actor_type from session only (commit 04a76bae).
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer <controlled-tenant-ai-agent-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"actor_type":"human"}' \
  https://staging-api.aishacrm.com/api/v2/finance/approvals/<new-approval-id>/approve
```

(The `"actor_type":"human"` in the body is a deliberate spoofing attempt — `buildActor()` ignores it and derives the actor type from session, so the request still presents as `ai_agent`.)

**Pass:** `HTTP 403`. Body is `{ status: 'error', message: <governance explanation>, governance_decision: {...} }` per the `sendError()` shape at `backend/routes/finance.v2.js:26-33` (which spreads `governance_decision` from `error.decision` when present) + the governance reject path at `financeDomainService.js:611-616` (`error.statusCode = 403`, `error.decision = decision`). The `governance_decision` in the response shows `allowed: false`, `risk_level: 'high'` or `'critical'`, with a reason like `"AI actor cannot execute money movement"` or `"AI actors cannot approve finance actions"`. The approval row in the in-memory bucket is UNCHANGED — still `pending`, no `approved_by`, no `approved_at` (the throw at line 615 happens BEFORE the approval mutation at lines 621-623).

**Fail:** `HTTP 200` (AI was allowed to approve — **critical defect**, the governance + actor-identity contract is broken), `HTTP 403` but with the in-memory approval row mutated (would mean partial write before the throw — would be a critical contract violation).

**Safety property:** AI actors are blocked from approval regardless of body-spoofing; the actor-identity check is session-derived; no partial state mutation on the rejected request. This is the long-standing actor-spoofing-prevention contract from commit `04a76bae` with regression coverage in `backend/__tests__/routes/finance.v2.routes.test.js`.

### 5.9 Check #9 — Journal reversal endpoint behavior

This check is split into two sub-checks because the current in-memory runtime does **not** provide an HTTP path from `pending_approval` to `posted` (see §5.7 — `approveFinanceAction()` only mutates the approval row, not the journal status). Check **#9a** verifies the route-side error handling for reversing a non-posted journal (the actually-testable case via HTTP). Check **#9b** documents the successful-reverse behavior but is marked **DEFERRED** under current-runtime constraints.

#### 5.9.a Check #9a — Reverse a non-posted journal returns 409 (TESTABLE today)

Use the `journal_entry.id` from check #6's response (the simulate-deal-won journal, which is in `pending_approval` after check #6 and stays there even after check #7's approval call):

```bash
# Replace <pending-journal-id> with the journal_entry.id from check #6.
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"smoke test reversal — should be rejected (journal not posted)"}' \
  https://staging-api.aishacrm.com/api/v2/finance/journal-entries/<pending-journal-id>/reverse
```

**Pass:** `HTTP 409`. Body is `{ status: 'error', message: 'Only posted journal entries can be reversed' }` per `backend/lib/finance/financeDomainService.js:523-526` (the explicit `error.statusCode = 409` guard). The original journal is **unchanged** — still at `status: 'pending_approval'`; no reversal entry is created in the in-memory bucket.

**Fail:** `HTTP 201` (the engine accepted a reverse of a non-posted journal — critical defect; the posted-only invariant is broken), any non-409, or the original journal's `status` mutated.

**Safety property:** the reverse endpoint refuses to operate on non-posted journals; the original journal is preserved; the append-only / posted-as-source-of-truth posture is enforced at the service layer.

**Reject-is-pass:** the 409 here is the expected outcome and the safety property; this sub-check is a positive verification of the gate, not a "we got an error" deferral.

#### 5.9.b Check #9b — Reverse a posted journal returns 201 with NEW reversal entry (DEFERRED — no HTTP path to posted state in current runtime)

**This sub-check is DEFERRED under 3-8 conditions and recorded as DEFERRED in §10.**

Reason: the route tests at `backend/__tests__/routes/finance.v2.routes.test.js:101-123` exercise this path by calling `service.seedJournalEntry({ id: 'posted-1', tenant_id: TENANT_ID, status: 'posted', lines: [...] })` directly on the service handle — there is **no HTTP equivalent** of `seedJournalEntry`. The simulate-deal-won → approve chain (checks #6 → #7) leaves the journal at `pending_approval` because `approveFinanceAction()` only mutates the approval row, not the journal status (see §5.7's "Important — what `approveFinanceAction()` does NOT do" block). So under 3-8 HTTP-only conditions, no posted journal exists for the reverse endpoint to act on.

**Documented expected behavior** (for when an HTTP path to posted state lands — likely a Slice 2 deliverable or a separate admin endpoint):

```bash
# Hypothetical — requires a posted journal that the current HTTP runtime can't produce:
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"memo":"smoke test reversal"}' \
  https://staging-api.aishacrm.com/api/v2/finance/journal-entries/<posted-journal-id>/reverse
```

Expected `HTTP 201`. Body shape per `backend/lib/finance/financeDomainService.js:587-593`: `{ status: 'success', data: { original_entry_id: <posted-id>, reversal_entry: {...}, approval: {...}, governance_decision: {...}, approval_required: <bool> } }`. The `reversal_entry` is a NEW journal with `reversal_of: <original-id>`, debits and credits inverted from the original (`accountingEngine.createReversalDraft`). The response does NOT include `journal_entry` (the field name is `reversal_entry`) or `events`. The **original** journal is **unchanged** — still `status: 'posted'`. **No hard delete occurred** — both entries exist in the in-memory bucket.

**Deferral remediation paths** (any of these would re-enable check #9b):

1. Add an HTTP `/admin/seed-posted-journal` debug endpoint behind a separate env flag for staging-only testing (out of 3-8 scope).
2. Add an HTTP path that auto-executes a journal-entry approval to posting (would be a service-layer change; out of 3-8 scope).
3. Execute the reverse path via `docker exec` calling the service directly with `seedJournalEntry` then the reverse handler — this is what the route tests do, but it crosses out of "HTTP smoke" scope into "code-level testing" and would not exercise the auth + tenant + module gates that 3-8 is designed to verify.
4. Wait for Slice 2 to land projection-backed reads + a posting/execution path that operates over the persistent event store.

For 3-8 today, the deploy owner records §5.9.b as DEFERRED with reason "no HTTP path to posted state in current runtime; route handler verified by `backend/__tests__/routes/finance.v2.routes.test.js:101-123` which uses `seedJournalEntry`." The route-side error handling (§5.9.a) IS testable and verifies the gate.

### 5.10 Check #10 — Disabled-tenant rejection (`GET /runtime/status`, OTHER staging tenant)

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer <other-staging-tenant-human-jwt>" \
  https://staging-api.aishacrm.com/api/v2/finance/runtime/status
```

**Pass:** `HTTP 403`. Body is `{ status: 'error', message: 'Finance Ops is not enabled for this tenant' }` per `backend/routes/finance.v2.js:78-82` (the exact message from the module-gate middleware). Proves the per-tenant module gate is rejecting every tenant whose `modulesettings.financeOps.is_enabled` is not `true` — the "one tenant only" invariant from Phase 3-7 §11 is structurally enforced.

**Fail:** `HTTP 200` (the other tenant has access — **critical**, one-tenant-only invariant is violated; halt per §6 and verify Phase 3-7 §5.3 SQL didn't accidentally enable financeOps for another tenant), `HTTP 401` (auth issue with the test user, not a gate test), `HTTP 404` (route not mounted at all).

**Safety property:** the per-tenant module gate is the structural one-tenant-only enforcement.

### 5.11 Check #11 — Wrong-tenant rejection (controlled-tenant session + foreign tenant_id in request)

```bash
# Send a request authenticated as a controlled-tenant user, but with a tenant_id header
# pointing at a DIFFERENT tenant. validateTenantAccess should reject the mismatch
# BEFORE the module gate even runs.
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer <controlled-tenant-human-jwt>" \
  -H "X-Tenant-Id: 99999999-9999-9999-9999-999999999999" \
  https://staging-api.aishacrm.com/api/v2/finance/runtime/status
```

**Pass:** `HTTP 400` or `HTTP 403` (the exact status depends on `validateTenantAccess` behavior at `backend/middleware/validateTenant.js` — per Phase 3-3 §4.4, the middleware rejects either when the request tenant is missing/malformed (400) or when it's set but doesn't match the user's assigned tenant (403)). Body indicates the tenant-mismatch reason; the request never reaches the module gate or finance handler.

**Fail:** `HTTP 200` (the request was processed despite the foreign tenant_id — **critical**, tenant-isolation is broken; halt per §6 and investigate `validateTenantAccess` middleware), or the response data contains rows from the foreign tenant (would mean tenant scope was applied wrong inside the handler).

**Safety property:** `validateTenantAccess` middleware enforces session-tenant ↔ request-tenant consistency before the finance route's handlers execute. The middleware chain at `backend/routes/finance.v2.js:67` runs BEFORE the module gate and BEFORE the handler.

---

## 6. Pass / fail criteria summary

The smoke test as a whole **passes** if **all** of:

- Checks #1, #2, #3, #4, #6, #7 pass with the exact status codes and safety properties listed in §5.
- Check #5 returns `HTTP 400` with `FINANCE_UNBALANCED_JOURNAL` (rejection is the pass condition).
- Check #8 returns `HTTP 403` for the AI actor (rejection is the pass condition), OR is recorded as DEFERRED if no `ai_agent` test user is available.
- Check #9a returns `HTTP 409` for the reverse of a non-posted journal (rejection is the pass condition).
- Check #9b is recorded as DEFERRED with reason "no HTTP path to posted state in current runtime" (per §5.9.b — not a fail).
- Check #10 returns `HTTP 403` for the other tenant (rejection is the pass condition), OR is recorded as DEFERRED if no other-tenant test user is available.
- Check #11 returns `HTTP 400` or `HTTP 403` for the tenant mismatch (rejection is the pass condition), OR is recorded as DEFERRED if no test user available for it.
- No HTTP request to the route triggered any provider HTTP write (verified by code-path inspection: no provider client is constructed in the route runtime).
- No `finance.audit_events` row appears as a result of the smoke test (verified post-test by re-running the §8.4 query from Phase 3-11 — count should be unchanged from pre-smoke baseline).
- Production was not touched.

The smoke test **fails** if any required check fails or the safety properties are violated. The DEFERRED checks (#8, #10, #11 if their test users aren't available) reduce the operational confidence but don't fail the overall test — the deploy owner records the deferral and flags it as a known gap.

---

## 7. Stop conditions

- Check #1 returns anything other than `HTTP 200` — Phase 3-7 didn't activate the route cleanly; halt and re-verify 3-7.
- Check #5 returns `HTTP 201` (unbalanced journal accepted) — critical accounting-engine defect; halt all Finance Ops activation.
- Check #6 returns `journal_entry.status: 'posted'` directly (approval bypassed) — critical governance defect; halt.
- Check #6 returns `adapter_job.status` anything other than `'draft'` — adapter execution path engaged when no adapter worker exists; halt and investigate.
- Check #8 returns `HTTP 200` for the AI actor (approval allowed) — critical governance + actor-identity defect; halt; verify `buildActor()` and governance decision; re-run `backend/__tests__/routes/finance.v2.routes.test.js` actor-spoofing tests.
- Check #9a returns `HTTP 201` (the reverse endpoint accepted a non-posted journal — critical posted-only-invariant violation; halt).
- Check #9a returns `HTTP 409` but the in-memory journal record is mutated (would mean partial mutation before the throw at `financeDomainService.js:523-526` — would be a critical contract violation; halt).
- Check #10 returns `HTTP 200` for the other tenant — one-tenant-only invariant violated; halt and audit `modulesettings.financeOps` for stray rows.
- Check #11 returns `HTTP 200` for the tenant mismatch — tenant isolation broken; halt; do not proceed to any further Phase 3 activation.
- A `finance.audit_events` row appears as a result of the smoke test — backend somehow wrote to the persistent event store despite the fail-closed guard; halt and investigate `ENABLE_FINANCE_PERSISTENT_EVENTS` setting on `staging-backend-heavy`.
- A provider HTTP call is observed in backend logs during the smoke test — provider write path was somehow engaged; halt and audit code (this should be structurally impossible since no provider client is constructed in the route).
- Production environment is touched in any way — instant halt.

---

## 8. Rollback / disable

Rollback uses the same Phase 3-7 §9 mechanisms — config / module-toggle only, no code revert, no schema rollback, no data loss:

| Scenario                                              | Rollback action                                                                                                                                             | Effect                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any check fails and immediate revert is needed        | Per-tenant: `update modulesettings set is_enabled = false where tenant_id = 'a11dfb63-...' and module_name = 'financeOps';` (Phase 3-7 §9.1)                | Controlled tenant loses route access on the next request; module gate returns `403`. Route stays mounted for other tenants (none of whom have access either). |
| Coarser revert needed (route surface itself is wrong) | Unset `ENABLE_FINANCE_OPS` on `staging-backend-heavy` in Coolify and redeploy (Phase 3-7 §9.2)                                                              | `/api/v2/finance/*` unmounts entirely; Express returns `404`. Worker (separate Coolify app) is unaffected.                                                    |
| In-memory state pollution from prior smoke runs       | Redeploy `staging-backend-heavy` (any Coolify redeploy restarts the container, which clears the per-process in-memory bucket inside `financeDomainService`) | The in-memory event store starts fresh; subsequent reads return empty state.                                                                                  |

The in-memory bucket clearing on container restart is intentional behavior of the Slice 1 in-memory store — there's no per-process state to preserve across restarts because the persistent path is fail-closed. Once Slice 2 lifts the guard, state will live in `finance.audit_events` and won't be cleared by a container restart.

---

## 9. Hard constraints (explicit restatement)

| Constraint                                                                                                                                                                                                                                                                                         | Source              | Status this task       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------- |
| **No live smoke tests executed by this task.** §2 explicit "None" row for every modality.                                                                                                                                                                                                          | 3-8 scope           | Confirmed — plan only. |
| **No env var changes.** §2 explicit none for `ENABLE_FINANCE_OPS`, `ENABLE_FINANCE_PERSISTENT_EVENTS`, Doppler `stg_stg`.                                                                                                                                                                          | 3-8 acceptance      | Confirmed.             |
| **No module flag changes.** §2 explicit none for `modulesettings.financeOps` on the controlled tenant or any other tenant.                                                                                                                                                                         | 3-8 acceptance      | Confirmed.             |
| **No worker changes.** Phase 3-5 worker enablement / disablement is independent of 3-8; the worker is not exercised by route smoke tests (§4).                                                                                                                                                     | 3-8 acceptance      | Confirmed.             |
| **No migration application.**                                                                                                                                                                                                                                                                      | 3-2 scope           | Confirmed.             |
| **No provider writes.** No provider client is constructed in the route runtime; no `tenant_integrations.api_credentials` is read; `FINANCE_PROVIDER_WRITES_ENABLED` is irrelevant to the route. Provider writes are structurally impossible in 3-8 scope.                                          | Phase 3-1 §9        | Confirmed.             |
| **No production action.** Hetzner is not touched; `prd_prd` Doppler is not opened; no production tenant's session JWT is used; no production-customer impact possible.                                                                                                                             | Phase 3-1 §8        | Confirmed.             |
| **Do not enable `ENABLE_FINANCE_PERSISTENT_EVENTS`.** The Slice 1 fail-closed guard at `backend/routes/finance.v2.js:48` throws at constructor time if it's set true; backend startup would fail loud. 3-8 leaves the flag unset; the route operates against the in-memory event store throughout. | Phase 3-1 §7        | Confirmed.             |
| **Smoke-test the existing route runtime only.** §4 explicit current-runtime boundary: in-memory event store, no persistent-events writes, no projection-worker interaction, no adapter execution, no ERPNext.                                                                                      | 3-8 scope           | Confirmed.             |
| **Adapter-worker testing is Phase 3-9, NOT 3-8.** The `adapter_job.status: 'draft'` returned by check #6 is a in-memory bucket record; no adapter execution occurs; no adapter worker module exists.                                                                                               | 3-8 / 3-9 boundary  | Confirmed.             |
| **ERPNext testing is Phase 3-10, NOT 3-8.** No ERPNext URL is read; no ERPNext client is constructed.                                                                                                                                                                                              | 3-8 / 3-10 boundary | Confirmed.             |
| **Auth + tenant + module-gate chain preserved as mandatory.** Checks #1, #10, #11 exercise the chain; no check bypasses it; the chain remains the primary tenant control (Phase 3-7 §7).                                                                                                           | 3-7 / 3-8 contract  | Confirmed.             |
| **Rollback is config / module-toggle only.** §8 references Phase 3-7 §9 mechanisms; no code revert, no schema rollback, no data loss.                                                                                                                                                              | 3-8 acceptance      | Confirmed.             |

---

## 10. Evidence pack (populated on execution)

When the smoke test is executed, capture verbatim HTTP responses (status + body) here (or in a linked evidence record under `docs/architecture/finance/phase-3-evidence/`). Until execution, the table below is empty.

| Check                                                                                                              | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED)                                         | HTTP status | Response body (truncated) / evidence link | Notes                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ------------ | -------- | ----------------------------------------------------------------------- | ----------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| §5.1                                                                                                               |              |          |                                                                         |             |                                           |                                                                                                 |
| §5.2                                                                                                               |              |          |                                                                         |             |                                           |                                                                                                 |
| §5.3                                                                                                               |              |          |                                                                         |             |                                           |                                                                                                 |
| §5.4                                                                                                               |              |          |                                                                         |             |                                           |                                                                                                 |
| §5.5                                                                                                               |              |          |                                                                         |             |                                           | Reject-is-pass: HTTP 400 + `FINANCE_UNBALANCED_JOURNAL` is the pass condition.                  |
| §5.6                                                                                                               |              |          |                                                                         |             |                                           | Capture approval.id for §5.7 and journal_entry.id for §5.9.a.                                   |
| §5.7                                                                                                               |              |          |                                                                         |             |                                           | Approve only mutates the approval row; does NOT auto-post the journal (per §5.7 contract note). |
| §5.8                                                                                                               |              |          |                                                                         |             |                                           | DEFERRED if no `ai_agent` test user available. Reject-is-pass: HTTP 403 is the pass condition.  |
| §5.9.a                                                                                                             |              |          |                                                                         |             |                                           | Reject-is-pass: HTTP 409 is the pass condition (reverse of non-posted journal).                 |
| §5.9.b                                                                                                             |              |          | DEFERRED (no HTTP path to posted state in current runtime — see §5.9.b) | —           | —                                         | Route handler covered by `finance.v2.routes.test.js:101-123` via `service.seedJournalEntry`.    |
| §5.10                                                                                                              |              |          |                                                                         |             |                                           | DEFERRED if no other-tenant test user. Reject-is-pass: HTTP 403 is the pass condition.          |
| §5.11                                                                                                              |              |          |                                                                         |             |                                           | DEFERRED if no test user available. Reject-is-pass: HTTP 400/403 is the pass condition.         |
| Post-test `finance.audit_events` count check (per Phase 3-11 §8.4 query, expect unchanged from pre-smoke baseline) |              |          |                                                                         |             |                                           |                                                                                                 |
| Production-not-touched confirmation (per Phase 3-7 §8 / Phase 3-11 §11)                                            |              |          |                                                                         |             |                                           |                                                                                                 |

Next packet (once §5 + post-test count check PASS or DEFERRED with reason): **Phase 3-9 — Enable adapter worker in sandbox/draft-only mode** (per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3-9, [`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) 2C-8).
