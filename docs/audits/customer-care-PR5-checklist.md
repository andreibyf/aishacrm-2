# Customer C.A.R.E. v1 – PR5 Implementation Pack (Call Flow Shadow Wiring)

This document contains:

1. PR5 implementation checklist (exact files + scope)
2. PR5 Copilot master prompt

Depends on:

- PR0 kill switch + shadow mode exists
- PR1 tables exist (but PR5 must not write them)
- PR2 state engine exists
- PR3 escalation detector exists
- PR4 audit emitter exists (stdout telemetry-sidecar compatible)
- `docs/product/customer-care-v1.md` includes Action Origin contract

---

## PR5 goal

Wire Customer C.A.R.E. **into call flows in SHADOW MODE ONLY**.

PR5 will:

- derive minimal C.A.R.E. signals from call outcomes/transcripts
- run escalation detection (read-only)
- run state transition proposal (read-only)
- emit `[CARE_AUDIT]` structured audit logs for:
  - escalation\_detected
  - state\_proposed
  - action\_candidate (shadow-only)

PR5 MUST NOT:

- send messages
- schedule meetings
- execute workflows
- modify customer records beyond existing call logging behavior
- write to `customer_care_state` tables
- create user-facing notifications/activities beyond what call flow already does

Key constraint:

- **Do not call ********`applyTransition()`******** in PR5.**
- **No DB writes.**

---

## 1) Branch

- Branch name:
  - `copilot/customer-care-pr5-call-shadow-wiring`

---

## 2) Files to Modify / Add

### 2.1 Modify (required)

- `backend/lib/callFlowHandler.js`

Add shadow wiring in BOTH handlers:

- `handleInboundCall()`
- `handleOutboundCall()`

Insertion point (recommended):

- After transcript analysis completes and you have `summary`, `sentiment`, `analysis`, `actionItems`
- Before return

---

### 2.2 Add (optional helper, recommended)

- `backend/lib/care/careCallSignalAdapter.js`

Purpose:

- Convert call context into `CareSignals` used by PR2 engine.

Exports:

- `signalsFromCall({ direction, outcome, transcript, summary, sentiment, analysis, actionItems })`

Rules:

- deterministic
- no DB
- no side effects

---

## 3) Action Origin

For call-driven automation, set:

- `action_origin = 'care_autonomous'`

Reason:

- This is not an explicit user-instructed Office Agent task.
- This respects the Action Origin contract and prevents unintended gating later.

---

## 4) Escalation Detection (read-only)

### 4.1 Inputs to detector

Build a `text` value using the best available:

- `summary` if present
- else `transcript` (truncate to safe length if needed)

Call:

- `detectEscalation({ text, sentiment, channel: 'call', action_origin: 'care_autonomous', meta })`

### 4.2 Emit audit on escalation

If `escalate === true`, emit:

- event\_type: `escalation_detected`
- policy\_gate\_result: `escalated`
- reason: join reasons (must be non-empty)
- meta: include `reasons`, `confidence`, `direction`, `outcome`, and minimal call metadata (no raw transcript)

Important:

- Do not block or change existing call flow behavior in PR5.

---

## 5) State Transition Proposal (read-only)

### 5.1 Determine current state

PR5 should NOT query DB yet.

Use safe placeholder:

- current\_state = `unaware`

(Real state reads will be introduced later once we choose whether it’s safe to touch DB in PR7+.)

### 5.2 Build signals

From call:

- inbound/outbound answered => `has_bidirectional=true`
- any meaningful transcript/summary => engagement signal
- negative sentiment => `negative_sentiment=true`
- explicit rejection markers can be inferred via PR3 detector reasons (objection)

### 5.3 Propose transition

Call:

- `proposeTransition({ current_state, signals })`

If proposal returned:

- emit `state_proposed` audit event

Audit requirements:

- action\_origin: `care_autonomous`
- policy\_gate\_result: `allowed` (because we are only proposing)
- reason: `proposal.reason` (must be non-empty)

---

## 6) Shadow Action Candidates (read-only)

If any `actionItems` exist OR there is a non-escalated meaningful call, emit `action_candidate` audit logs, e.g.:

- `"Follow up based on call summary"`
- `"Complete action item: <first action item>"`

Rules:

- Do not create tasks/activities beyond current callFlowHandler behavior.
- These are logs only.

---

## 7) Logging / Telemetry Requirements

Use PR4 emitter:

- `emitCareAudit({ ... })`

All logs must:

- be single-line JSON
- be prefixed `[CARE_AUDIT] `
- include `_telemetry: true` and `type: 'care_audit'` (as established in PR4)

---

## 8) Tests (recommended)

Because PR5 modifies callFlowHandler, keep tests minimal.

If the repo has unit test coverage for call flows, add/extend tests.

Otherwise, add a small test for adapter only:

- `backend/lib/care/careCallSignalAdapter.test.js`

Test cases:

- answered inbound => has\_bidirectional true
- negative sentiment => negative\_sentiment true

PR5 MUST NOT introduce brittle integration tests.

---

## 9) Acceptance Criteria

- No user-visible behavior changes
- No outbound messages/scheduling/workflow execution
- No DB writes to C.A.R.E. tables
- Inbound/outbound calls emit `[CARE_AUDIT]` events:
  - escalation\_detected when applicable
  - state\_proposed when applicable
  - action\_candidate when applicable

---

#

---



