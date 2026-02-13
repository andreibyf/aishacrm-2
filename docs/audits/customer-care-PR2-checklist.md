# C.A.R.E. v1 – PR2 Implementation Pack (State Engine Logic Only)

This document contains:
1) PR2 implementation checklist (exact files + scope)
2) PR2 Copilot master prompt

---

## PR2 — C.A.R.E. State Engine (Pure Logic)

**PR2 goal:** Implement the **canonical C.A.R.E. state engine** as **pure logic + store helpers only**.

This PR MUST NOT:
- change runtime behavior
- add hooks to call flows/workers
- execute actions
- send messages
- schedule meetings
- modify existing tables

This PR MAY:
- add new files under `backend/lib/care/`
- add unit tests

Depends on:
- `docs/product/customer-care-v1.md` (contract)
- PR1 tables exist (or are pending but schema agreed)

---

## 1) Branch

- Branch name:
  - `copilot/customer-care-pr2-state-engine`

---

## 2) Files to Add (new)

### 2.1 Canonical types

Add: `backend/lib/care/careTypes.ts`

Must include:
- `CareState` union of canonical states:
  - `unaware | aware | engaged | evaluating | committed | active | at_risk | dormant | reactivated | lost`
- `CareEntityType` union:
  - `lead | contact | account`
- `CareContext` shape (minimum):
  - `tenant_id`, `entity_type`, `entity_id`
- `CareTransitionProposal`:
  - `from_state`, `to_state`, `reason`, `meta?`

---

### 2.2 State engine

Add: `backend/lib/care/careStateEngine.ts`

Required functions:

1) `validateCareState(state: string): CareState`
- throws on invalid

2) `getDefaultCareState(entity_type: CareEntityType): CareState`
- default: `unaware`

3) `proposeTransition(params)`
- inputs (minimum):
  - `current_state: CareState`
  - `signals: CareSignals`
- output:
  - `CareTransitionProposal | null`

4) `applyTransition(params)`
- inputs:
  - `ctx: CareContext`
  - `proposal: CareTransitionProposal`
  - `store: CareStateStore`
- behavior:
  - upsert `customer_care_state`
  - append `customer_care_state_history`

Important:
- **No transition without a non-empty `reason`.**
- **No invalid state strings.**

---

### 2.3 Signals model (minimal v1)

Add: `backend/lib/care/careSignals.ts`

Define a minimal, deterministic signal schema (no AI required):
- `last_inbound_at?: Date`
- `last_outbound_at?: Date`
- `has_bidirectional?: boolean`
- `proposal_sent?: boolean`
- `commitment_recorded?: boolean`
- `negative_sentiment?: boolean`
- `explicit_rejection?: boolean`
- `silence_days?: number`

---

### 2.4 Store helpers (read/write)

Add: `backend/lib/care/careStateStore.ts`

Must provide:
- `getCareState(ctx) -> { care_state, hands_off_enabled, escalation_status, last_signal_at } | null`
- `upsertCareState(ctx, patch) -> row`
- `appendCareHistory(ctx, event) -> row`

Important:
- This PR should only create the helpers; **do not call them from production flows yet**.

Implementation detail:
- Use the repo’s existing DB access method (Supabase client, Postgres client, etc.).

---

## 3) Deterministic Transition Rules (v1 minimum)

Implement the smallest useful state logic aligned with the contract:

### 3.1 Transition table (minimum rules)

- `unaware -> aware`
  - if any engagement signal exists (e.g., inbound response)

- `aware -> engaged`
  - if `has_bidirectional === true`

- `engaged -> evaluating`
  - if `proposal_sent === true`

- `evaluating -> committed`
  - if `commitment_recorded === true`

- `committed -> active`
  - after commitment, stable relationship (can be immediate)

- `any -> at_risk`
  - if `silence_days >= threshold` AND not already `lost`

- `at_risk -> dormant`
  - if `silence_days >= higher_threshold`

- `dormant -> reactivated`
  - if inbound occurs after dormancy

- `any -> lost`
  - if `explicit_rejection === true`

Notes:
- Keep thresholds as configurable constants (do not hardcode magic numbers in logic).
- Do not implement outbound actions in PR2.

---

## 4) Tests (required)

Add: `backend/lib/care/careStateEngine.test.ts`

Minimum test cases:
- Invalid state rejected
- No transition returned without reason
- Each rule above produces expected proposal
- applyTransition writes both state + history (mock store)

---

## 5) Acceptance Criteria

- PR2 introduces **no runtime behavior changes**.
- State engine is deterministic and unit-tested.
- Engine is aligned with canonical states in the contract.
- Store helpers exist but are not wired into production flows.

---



