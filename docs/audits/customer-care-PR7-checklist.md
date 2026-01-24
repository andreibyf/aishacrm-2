# Customer C.A.R.E. v1 – PR7 Implementation Pack (Persist State + Policy Gate, No Actions)

This document contains:

1. PR7 implementation checklist (exact files + scope)
2. PR7 Copilot master prompt

Depends on:

- PR0 kill switch + shadow mode exists
- PR1 C.A.R.E. tables exist
- PR2 state engine + store helpers exist
- PR3 escalation detector exists
- PR4 audit emitter exists (sidecar-compatible)
- PR5/PR6 shadow wiring exists
- `docs/product/customer-care-v1.md` includes Action Origin contract

---

## PR7 goal

Enable **real C.A.R.E. state persistence** (read + write) and introduce a **policy gate** module, while still keeping the system **non-autonomous** (no outbound actions).

PR7 will:

- read current state from `customer_care_state`
- apply transitions (write state + append history) **only when explicitly enabled**
- emit `[CARE_AUDIT]` events:
  - `state_applied`
  - `escalation_detected` (if present)
  - `action_skipped` (explicitly documenting that actions are not executed)
- introduce `carePolicyGate` (not wired to execute anything yet)

PR7 MUST NOT:

- send messages
- schedule meetings
- execute workflows
- change existing user-facing behavior

Key principle:

- PR7 persists **state only**, not actions.

---

## 0) New gating flags (required)

Introduce a second gate specifically for DB writes (state persistence). This keeps your existing client safe.

- `CARE_STATE_WRITE_ENABLED=false` (default)

Behavior:

- When false:
  - PR5/PR6 continue to propose in shadow
  - PR7 reads state but does not write
- When true:
  - PR7 can apply transitions (state + history)

Note:

- This is separate from `CARE_AUTONOMY_ENABLED`.
- Even if state writes are enabled, **autonomy remains off** unless PR0 gates are opened.

---

## 1) Branch

- Branch name:
  - `copilot/customer-care-pr7-persist-state-policy-gate`

---

## 2) Files to Add (new)

### 2.1 Policy gate module (not executing actions)

Add: `backend/lib/care/carePolicyGate.js`

Required API:

- `evaluateCarePolicy({ action_origin, proposed_action_type, text, meta }) -> { policy_gate_result, escalate, reasons[] }`

Rules:

- This module is **pure** and **deterministic** (no DB).
- It MUST enforce the Action Origin contract:
  - `care_autonomous` must be conservative
  - `user_directed` is not blocked except for hard prohibitions (returns escalated)

Minimum prohibitions (from contract):

- negotiation / pricing change
- binding commitments
- regulated actions
- impersonation

Note:

- In PR7 we do not have action execution; this gate is prepared for PR8+.

---

### 2.2 State write gate helper

Add: `backend/lib/care/isCareStateWriteEnabled.js`

Behavior:

- Reads `CARE_STATE_WRITE_ENABLED` (default false)

---

## 3) Files to Modify (existing)

### 3.1 Update store to support read + write paths

Modify: `backend/lib/care/careStateStore.js`

Ensure it supports:

- `getCareState(ctx)`
- `upsertCareState(ctx, patch)`
- `appendCareHistory(ctx, event)`

If store already exists, do not refactor heavily—just stabilize.

---

### 3.2 Apply transitions in call flow and triggers — but only when state-write gate is enabled

Modify BOTH:

- `backend/lib/callFlowHandler.js`
- `backend/lib/aiTriggersWorker.js`

Implementation pattern:

1. Resolve entity context (tenant\_id, entity\_type, entity\_id)
2. Read current state from store:
   - if none exists, treat current\_state = `unaware`
3. Run escalation detector (PR3)
4. Propose transition (PR2)
5. If proposal exists:
   - always emit `state_proposed` (already done)
   - if `isCareStateWriteEnabled()` is true:
     - call `applyTransition({ ctx, proposal, store })`
     - emit `[CARE_AUDIT]` `state_applied`
   - else:
     - do NOT write

Additionally:

- Always emit `[CARE_AUDIT]` `action_skipped` with reason:
  - "Autonomous actions disabled in PR7" (or similar)

Important:

- **Do not call any action executor.**
- **Do not create new tasks/messages.**

---

## 4) Action Origin

Set action origin for these PR7 flows:

- Call flows (PR5 wiring): `care_autonomous`
- Trigger worker (PR6 wiring): `care_autonomous`

Do not touch Office Agent user tasks.

---

## 5) Tests (required)

### 5.1 State write gate tests

Add: `backend/lib/care/isCareStateWriteEnabled.test.js`

Cases:

- env unset => false
- env true => true

### 5.2 Policy gate tests

Add: `backend/lib/care/carePolicyGate.test.js`

Minimum cases:

- care\_autonomous + prohibited type => escalated
- user\_directed + prohibited type => escalated (not allowed)
- user\_directed + normal type => allowed

### 5.3 Store/applyTransition tests

If applyTransition already tested in PR2, do not duplicate.

---

## 6) Acceptance Criteria

- Default behavior (state write gate off):
  - No DB writes occur
  - Only `[CARE_AUDIT]` logs emitted (as before)
- With `CARE_STATE_WRITE_ENABLED=true`:
  - `customer_care_state` rows are created/updated
  - `customer_care_state_history` rows are appended
  - No outbound actions occur
- No user-visible behavior change
- Action Origin contract remains intact

---

#

---

