# Finance Ops — Phase 2C-9: ERPNext Sandbox Integration Proof Gate

**Phase 2C-9 — Staging-Readiness Gate.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Proof-gate definition. Doc-only — no adapter code delivered in Phase 2C. No provider connection activated.
**Date:** 2026-05-22
**Related:** [`adapter-runtime-contract.md`](./adapter-runtime-contract.md) (Track E — §2, §5, §6, decisions E4/E5/E6) · [`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md) (2C-8)

---

## 1. Goal and Scope

Define — and specify how to _prove_ — the **first provider integration target**,
ERPNext, in **sandbox only**. This document is the **gate definition**: it states
what must be true for the ERPNext integration to be considered proven, and the
procedure that demonstrates it.

**Scope boundary.** Phase 2C introduces no new finance product functionality.
This document therefore **defines the proof gate**; it does **not** deliver the
adapter implementation. `backend/lib/finance/accountingAdapters/erpnextAdapter.js`
and its tests are a **future deliverable** (Track E / Phase 3 implementation
work), built against the `AccountingAdapter` interface in
`adapter-runtime-contract.md` §2. Nothing in this phase opens a provider
connection, stores provider credentials, or makes a provider HTTP call.

---

## 2. Why ERPNext First

Decision **E5** (`adapter-runtime-contract.md` §10): **ERPNext is the first
live-adapter proof target; QuickBooks remains the canonical schema standard.**

- ERPNext can be **self-hosted and inspected** — a sandbox or local instance is
  fully under our control, so every request and the resulting document can be
  examined directly.
- ERPNext authenticates with an **API key + secret** pair — long-lived, no OAuth
  authorization-code flow, no token-refresh loop. This removes the OAuth
  complexity that QuickBooks and Xero would force too early.
- It proves the `AccountingAdapter` interface end-to-end against a real provider
  before commercial-provider complexity is taken on.

The QuickBooks-derived canonical object model (`adapter-runtime-contract.md` §5)
remains the normalization standard; ERPNext maps into and out of it.

---

## 3. Allowed and Not Allowed

### Allowed (sandbox proof)

- A **sandbox or local ERPNext instance** — never a production ERPNext tenant.
- **Draft document creation only**, and only when explicitly gated (§5.3).
- **Read-only or draft-only sync** — `fetchObject`, `listObjects`, `syncStatus`,
  `pushDraft`.
- **Payload mapping tests** — `toCanonical` / `fromCanonical` round-trips and the
  ERPNext `PROVIDER_OBJECT_MAP`.

### Not allowed

- **Live customer accounting writes** of any kind.
- A **production ERPNext connection**.
- **QuickBooks OAuth** — not configured, not activated.
- **Xero OAuth** — not configured, not activated.
- **Payment movement** — no operation that moves money or finalises a ledger.

This list is the contract. The proof procedure (§6) and exit criteria (§7) must
not cross it.

---

## 4. Relationship to the Adapter Worker

The ERPNext adapter, when built, runs **inside `finance-adapter-worker`** under
the sandbox-only posture of [`adapter-worker-sandbox-plan.md`](./adapter-worker-sandbox-plan.md)
(2C-8). Everything in 2C-8 applies: the two enforcement layers
(`FINANCE_PROVIDER_WRITES_ENABLED=false` config + `assertWritePermitted` and the
provider-writes-enabled code gate), the E6 metadata-stripping boundary, and the
sandbox-`base_url`-only rule. The ERPNext adapter is a **plugin**; it does not
relax any of those guards.

---

## 5. The Proof Gate — What Must Be Demonstrated

For the ERPNext integration to be **proven**, the following must each be
demonstrated against a sandbox/local ERPNext instance.

### 5.1 Sandbox connection only

The connection config (`ProviderConnectionConfig`, `adapter-runtime-contract.md`
§6) has `provider: 'erpnext'`, a `base_url` pointing at a **sandbox or local**
ERPNext, `auth.type: 'api_key'`, and `mode: 'draft_only'`. A guard rejects a
`base_url` that is not a recognised sandbox/local host. `checkHealth()` succeeds
against that instance and resolves within 5 s.

### 5.2 The adapter satisfies the `AccountingAdapter` interface

The ERPNext adapter implements every **required** method of
`adapter-runtime-contract.md` §2 — `checkHealth`, `fetchObject`, `listObjects`,
`toCanonical`, `fromCanonical`, `pushDraft`, `pushFinal`, `syncStatus` — and
ships an ERPNext `PROVIDER_OBJECT_MAP` (§5). `pushFinal` exists to satisfy the
interface but is unreachable under `draft_only` mode (the write guard blocks it).
`voidRecord` / `reconcile` are optional.

### 5.3 Draft-only is enforced — at three levels

`pushDraft` must create an ERPNext document in **Draft state only**:

1. **ERPNext document state.** ERPNext documents carry `docstatus`: `0` = Draft,
   `1` = Submitted, `2` = Cancelled. `pushDraft` creates the document with
   `docstatus = 0` and **never calls the submit endpoint**. The document is a
   non-finalised draft (the ERPNext equivalent of a QuickBooks Estimate /
   Xero draft).
2. **Adapter mode.** `mode = 'draft_only'` — `assertWritePermitted` permits
   `push_draft` and blocks `void` / any finalising operation
   (`adapter-runtime-contract.md` §4).
3. **Provider-writes kill switch.** `FINANCE_PROVIDER_WRITES_ENABLED` gates the
   HTTP call itself (2C-8 §5.2). The proof is run with it deliberately enabled
   **for the sandbox instance only**, as the one explicit, reviewed exception —
   and reverted to `false` afterwards.

If ERPNext (or a given object type) had no draft concept, the adapter would
throw `AdapterCapabilityError` and the job would not retry. ERPNext's `docstatus`
model means it does support drafts.

### 5.4 Payload mapping is correct and metadata-stripped

- `toCanonical` maps an ERPNext object to the canonical shape; `fromCanonical`
  maps a canonical object to the ERPNext-native shape — both via the ERPNext
  `PROVIDER_OBJECT_MAP`. A round-trip (`canonical → ERPNext → canonical`)
  preserves all mapped fields; unmapped provider fields round-trip through
  `metadata.provider_extras` (`adapter-runtime-contract.md` §5).
- **Internal runtime metadata is stripped** before the payload reaches ERPNext
  — `draft_only`, governance/policy fields, Braid trace IDs,
  correlation/causation IDs (decision E6; 2C-8 §6). The ERPNext request body
  contains only ERPNext-native fields.

### 5.5 Adapter events are emitted and replayable

Each ERPNext job emits the canonical adapter events
(`finance.adapter.sync_queued` / `sync_succeeded` / `sync_failed`) to
`finance.audit_events` using the frozen Track A envelope
(`aggregate_type = 'adapter_job'`). Because they land in the append-only event
store, replaying the tenant stream reconstructs the full ERPNext job history and
the `adapter_queue` projection — proving the integration is auditable and
replayable.

---

## 6. Proof Procedure

Run against a sandbox/local ERPNext instance, for the controlled staging tenant
only ([`controlled-tenant-enablement.md`](./controlled-tenant-enablement.md),
2C-13):

1. **Stand up sandbox ERPNext.** A self-hosted or local ERPNext instance.
   Generate an API key + secret for a sandbox user.
2. **Store sandbox credentials.** Insert into `tenant_integrations` with
   `integration_type = 'finance.erpnext'`, `is_active = true`,
   `api_credentials` = `{ api_key, api_secret }` (plain JSONB is acceptable for
   the POC — decision E4). **Sandbox credentials only.**
3. **Health check.** Call `checkHealth()`; confirm `{ ok: true }` within 5 s.
4. **Read proof.** `listObjects('Account')` and `fetchObject('Account', <id>)`
   against the sandbox; `toCanonical` the results; confirm the canonical shape.
5. **Mapping proof.** Round-trip a canonical `Account` and `JournalEntry`
   through `fromCanonical` → ERPNext shape → `toCanonical`; assert field
   fidelity and that **no internal metadata** appears in the ERPNext-bound
   payload (E6).
6. **Draft-write proof.** With `FINANCE_PROVIDER_WRITES_ENABLED` enabled **for
   the sandbox instance only**, run a `push_draft` job; confirm an ERPNext
   document is created with `docstatus = 0`; confirm **no submit call** was made
   (inspect the ERPNext instance directly). Revert
   `FINANCE_PROVIDER_WRITES_ENABLED=false` afterward.
7. **Event/replay proof.** Confirm `finance.adapter.sync_queued` and
   `finance.adapter.sync_succeeded` were emitted; replay the tenant event stream
   and confirm the `adapter_queue` projection reconstructs the job.
8. **Negative proof.** Attempt a `void` job → confirm `assertWritePermitted`
   throws (`void` needs `approval_required_write`). Attempt a `push_draft` with
   `FINANCE_PROVIDER_WRITES_ENABLED=false` → confirm the HTTP call is skipped.
9. **Record evidence.** Capture every result for the staging activation review
   ([`staging-activation-review.md`](./staging-activation-review.md), 2C-14).

---

## 7. Proof Gate — Exit Criteria

The ERPNext sandbox proof passes only when all of the following hold:

- [ ] The connection targets a **sandbox/local ERPNext only**; a non-sandbox
      `base_url` is rejected.
- [ ] The adapter implements every required `AccountingAdapter` method and ships
      a `PROVIDER_OBJECT_MAP`.
- [ ] `pushDraft` creates an ERPNext document with `docstatus = 0` and never
      submits/finalises it.
- [ ] `toCanonical` / `fromCanonical` round-trips preserve mapped fields;
      `metadata.provider_extras` carries unmapped fields.
- [ ] The ERPNext-bound payload contains **no** internal runtime metadata
      (`draft_only`, governance, trace/correlation/causation fields).
- [ ] Adapter events are emitted and the job is replayable from the event stream.
- [ ] The negative tests pass (`void` blocked; write skipped when
      `FINANCE_PROVIDER_WRITES_ENABLED=false`).
- [ ] No QuickBooks/Xero OAuth was configured; no payment movement occurred; no
      production provider was contacted.

---

## 8. What Passing This Gate Does — and Does Not — Unlock

Passing the ERPNext sandbox proof demonstrates the adapter runtime is correct
end-to-end against a real provider. It does **not**:

- enable ERPNext in production;
- enable live (finalising) ERPNext writes — `pushFinal` / `void` /
  `approval_required_write` remain a separate, later gate;
- enable QuickBooks or Xero;
- change the default posture — `FINANCE_PROVIDER_WRITES_ENABLED` returns to
  `false` after the proof; the adapter worker stays sandbox/draft-only.

Promotion of any provider to a finalising or production write is a distinct
decision recorded in [`production-readiness-review.md`](./production-readiness-review.md)
(2C-15), not unlocked here.

---

## 9. Acceptance Criteria — Self-Check

| 2C-9 acceptance criterion                           | Status                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ERPNext integration remains sandbox-only            | ✅ Sections 3, 5.1, 7 — sandbox/local `base_url` only, guard-rejected otherwise; production connection prohibited.                                    |
| Draft-only mode is enforced                         | ✅ Section 5.3 — three levels: ERPNext `docstatus = 0` (no submit), `mode = 'draft_only'` write guard, `FINANCE_PROVIDER_WRITES_ENABLED` kill switch. |
| Provider payload does not include internal metadata | ✅ Section 5.4 — E6 stripping; round-trip + payload-content assertion in the proof procedure.                                                         |
| Adapter events are emitted/replayable               | ✅ Section 5.5 — canonical adapter events to the append-only store; replay reconstructs `adapter_queue`.                                              |

> **Note:** these criteria are satisfied at the _gate-definition_ level by this
> document. The runtime demonstration (§6) executes when the ERPNext adapter is
> implemented in a later phase — Phase 2C delivers the gate and procedure, not
> the adapter code.

---

_Part of the Finance Ops architecture suite. Related: `adapter-runtime-contract.md`
(Track E), `adapter-worker-sandbox-plan.md` (2C-8), `dead-letter-retry-verification.md`
(2C-10), `controlled-tenant-enablement.md` (2C-13), `staging-activation-review.md`
(2C-14), `production-readiness-review.md` (2C-15)._
