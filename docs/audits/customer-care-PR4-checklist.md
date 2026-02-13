# C.A.R.E. v1 – PR4 Implementation Pack (Audit + Telemetry Internal Only)

This document contains:

1. PR4 implementation checklist (exact files + scope)
2. PR4 Copilot master prompt

Depends on:

- `docs/product/customer-care-v1.md` (contract; includes Action Origin requirements)
- `docs/build/customer-care-v1.tasks.md` (Safety-Gated PR Plan)
- PR0 kill switch exists (autonomy still off)
- PR2 state engine exists
- PR3 escalation detector exists

---

## PR4 goal

Implement an **internal audit + telemetry emitter** for C.A.R.E. that:

- standardizes how we log “why” decisions
- can be used in PR5/PR6 (shadow wiring)
- does NOT create user-facing artifacts
- does NOT change runtime behavior

This PR MUST NOT:

- wire into call flows, workers, routing, or agents
- send messages
- schedule meetings
- write database records
- create user-facing notifications/activities

Note:

- In PR4 we only build the emitter utilities.
- PR5/PR6 will call them.

---

## 1) Branch

- Branch name:
  - `copilot/customer-care-pr4-audit-telemetry`

---

## 2) Files to Add (new)

### 2.1 Audit event types

Add: `backend/lib/care/careAuditTypes.js`

Must export:

- `CarePolicyGateResult` (string constants)

  - `allowed`
  - `escalated`
  - `blocked`

- `CareAuditEventType` (string constants)

  - `state_proposed`
  - `state_applied`
  - `escalation_detected`
  - `action_candidate`
  - `action_skipped`

- `CareAuditEvent` shape (JSDoc typedef)

  - `ts` (ISO string)
  - `tenant_id`
  - `entity_type`
  - `entity_id`
  - `event_type`
  - `action_origin` (`user_directed` | `care_autonomous`)
  - `reason` (non-empty)
  - `policy_gate_result` (`allowed` | `escalated` | `blocked`)
  - `meta?` (object)

---

### 2.2 Logger-based audit emitter

Add: `backend/lib/care/careAuditEmitter.js`

Required API:

- `emitCareAudit(event: CareAuditEvent): void`

Rules:

- Must validate:
  - `reason` is non-empty
  - `action_origin` present
  - `policy_gate_result` present
- Must not write DB
- Must not create notifications
- Must log via existing logger infrastructure (console or your app logger)
- Output should be structured JSON (single line), prefixed with a stable tag, e.g.:
  - `[CARE_AUDIT] { ...json... }`

---

### 2.3 Telemetry adapter (optional, internal)

If the repo already has a telemetry event bus / NDJSON emitter used by agent-office, add:

Add (optional): `backend/lib/care/careTelemetryEmitter.js`

Required API:

- `emitCareTelemetry(event: CareAuditEvent): void`

Rules:

- If no telemetry system exists/accessible in backend, this file can be omitted.
- If present, it must not change any existing schema; it can emit new types only.
- Suggested event name prefix: `care_*`

---

## 3) Tests (required)

Add: `backend/lib/care/careAuditEmitter.test.js`

Minimum test cases:

- Missing reason throws
- Missing action\_origin throws
- Missing policy\_gate\_result throws
- Valid event logs without throwing (mock logger)

---

## 4) Acceptance Criteria

- No runtime behavior changes
- No DB writes
- No hooks to production flows
- Audit events are structured and include:
  - action\_origin
  - policy\_gate\_result
  - reason
- Unit tests pass

---

#

---

