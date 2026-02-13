# C.A.R.E. v1 – PR6 Implementation Pack (Triggers Worker Shadow Wiring)

This document contains:

1. PR6 implementation checklist (exact files + scope)
2. PR6 Copilot master prompt

Depends on:

- PR0 kill switch + shadow mode exists (autonomy still off)
- PR1 tables exist (PR6 must not write them)
- PR2 state engine exists
- PR3 escalation detector exists
- PR4 audit emitter exists (stdout telemetry-sidecar compatible)
- PR5 call shadow wiring complete
- `docs/product/customer-care-v1.md` includes Action Origin contract

---

## PR6 goal

Wire C.A.R.E. into **non-call time-decay triggers** in **SHADOW MODE ONLY**.

PR6 will:

- observe trigger signals already detected by the triggers worker (stagnant lead, deal decay, overdue, etc.)
- map them to minimal C.A.R.E. signals
- propose state transitions (read-only)
- emit `[CARE_AUDIT]` structured audit logs for:
  - `state_proposed`
  - `action_candidate` (shadow-only)
  - optionally `escalation_detected` only if trigger text contains escalation lexicon (rare)

PR6 MUST NOT:

- send messages
- schedule meetings
- execute workflows
- write to `customer_care_state` tables
- remove or change existing `ai_suggestions` behavior
- change worker scheduling/frequency beyond minimal refactor

Key constraints:

- **Do not call ********`applyTransition()`******** in PR6.**
- **No DB writes to C.A.R.E. tables.**

---

## 1) Branch

- Branch name:
  - `copilot/customer-care-pr6-triggers-shadow-wiring`

---

## 2) Files to Modify / Add

### 2.1 Modify (required)

- `backend/lib/aiTriggersWorker.js`

Insertion points (recommended):

- Immediately after each trigger condition is detected (where a suggestion is created/logged)
- Before any return/continue

Goal:

- emit shadow audits **in parallel** with existing behavior

---

### 2.2 Add (optional helper, recommended)

- `backend/lib/care/careTriggerSignalAdapter.js`

Purpose:

- Convert trigger context into `CareSignals` used by PR2 engine.

Exports:

- `signalsFromTrigger({ trigger_type, days_stale, stage, due_status, meta })`

Rules:

- deterministic
- no DB
- no side effects

---

## 3) Action Origin

For trigger-driven automation, set:

- `action_origin = 'care_autonomous'`

Reason:

- Triggers are system-initiated, not explicit user-instructed Office Agent tasks.

---

## 4) Trigger-to-Signal Mapping (minimal v1)

Map common triggers to minimal signals:

- **stagnant\_lead / no\_activity / deal\_decay**

  - set `silence_days` (if available)
  - set `has_bidirectional=false` (if no response)

- **overdue\_activity / overdue\_task**

  - treat as risk indicator (can map to `silence_days` or set a `meta.overdue=true`)

- **hot\_opportunity / positive\_momentum** (if present)

  - set engagement signal (`has_bidirectional=true`) OR `proposal_sent=true` (only if that’s already known in the trigger meta)

Do not invent data. Only use what the worker already has.

---

## 5) State Transition Proposal (read-only)

### 5.1 Determine current state

PR6 should NOT query DB yet.

Use safe placeholder:

- `current_state = 'unaware'`

(Real state reads will be introduced later when we formally decide to read/write state.)

### 5.2 Propose transition

Call:

- `proposeTransition({ current_state, signals })`

If proposal returned:

- emit `[CARE_AUDIT]` event `state_proposed`

Audit requirements:

- `action_origin: 'care_autonomous'`
- `policy_gate_result: 'allowed'` (proposal only)
- `reason: proposal.reason` (non-empty)
- meta should include:
  - `trigger_type`
  - any trigger key fields (e.g., `days_stale`, `stage`, `due_status`) without leaking sensitive details

---

## 6) Shadow Action Candidates (read-only)

Emit `action_candidate` audits that describe what AiSHA would do (logs only), for example:

- `"Follow up: no activity in X days"`
- `"Re-engage: overdue task indicates stalled momentum"`

Rules:

- Do not create tasks/activities beyond current worker behavior.
- Do not send messages.

---

## 7) Escalation Detection (optional, conservative)

Triggers are usually numeric/time-based, but if the worker has textual context (e.g., last note snippet), you MAY run escalation detection.

If you do:

- use only short summaries/snippets (no raw note bodies)
- emit `escalation_detected` audit if detector escalates

Otherwise, skip escalation detection in PR6.

---

## 8) Logging / Telemetry Requirements

Use PR4 emitter:

- `emitCareAudit({ ... })`

All logs must:

- be single-line JSON
- be prefixed `[CARE_AUDIT] `
- include `_telemetry: true` and `type: 'care_audit'`

---

## 9) Tests (recommended)

Keep tests minimal.

If adapter is added, add:

- `backend/lib/care/careTriggerSignalAdapter.test.js`

Test cases:

- stagnant lead => includes `silence_days`
- overdue task => sets risk meta

Do NOT add brittle worker integration tests.

---

## 10) Acceptance Criteria

- No user-visible behavior changes
- Existing worker behavior unchanged (suggestions still created as before)
- No outbound messages/scheduling/workflow execution
- No DB writes to C.A.R.E. tables
- Trigger events emit `[CARE_AUDIT]` audits:
  - `state_proposed` when applicable
  - `action_candidate` when applicable

---

#

---

