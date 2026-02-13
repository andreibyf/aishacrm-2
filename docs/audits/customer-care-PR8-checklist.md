# C.A.R.E. v1 – PR8 Implementation Pack (Workflow Webhook Trigger → Routing via Pabbly / Thoughtly / CallFluent)

This document contains:

1. PR8 implementation checklist (exact files + scope)
2. PR8 Copilot master prompt

Context:

- Your workflow engine starts from a **Webhook Trigger** node.
- You already have action nodes/connectors:
  - **Pabbly Webhook**
  - **Thoughtly Message**
  - **CallFluent SMS**
- Therefore, the correct pattern is:
  - **Backend emits event → Backend POSTs to Workflow Webhook Trigger → Workflow routes to connectors**

Depends on:

- PR3 escalation detector exists
- PR4 audit emitter exists (stdout sidecar-compatible)
- PR5/PR6 emit `escalation_detected` audits
- PR7 persists state (optional) but does not execute actions

---

## PR8 goal

Implement a **gated, non-blocking workflow trigger invoker** in the backend that can POST C.A.R.E. events (starting with escalations) to a configured **Workflow Webhook Trigger URL**.

PR8 will:

- add env-gated ability to invoke workflow webhook triggers
- define a stable payload contract for C.A.R.E. events
- call the invoker ONLY when escalation is detected (and only when enabled)
- keep backend “hands clean”: backend does **not** message customers; workflows do routing

PR8 MUST NOT:

- send customer messages directly
- schedule meetings directly
- block call flows / triggers on webhook failures
- change behavior when disabled

---

## 0) New gating flags (required)

Add env defaults (safe):

- `CARE_WORKFLOW_TRIGGERS_ENABLED=false`

Escalation routing target:

- `CARE_WORKFLOW_ESCALATION_WEBHOOK_URL=`

Security (recommended):

- `CARE_WORKFLOW_WEBHOOK_SECRET=`

Reliability:

- `CARE_WORKFLOW_WEBHOOK_TIMEOUT_MS=3000`
- `CARE_WORKFLOW_WEBHOOK_MAX_RETRIES=2`

Defaults must ensure:

- disabled = **no outbound HTTP calls**

---

## 1) Payload contract (stable + minimal)

Use a compact payload so workflows can branch and fan out to Pabbly / Thoughtly / CallFluent.

**Envelope (required):**

- `event_id` (uuid)
- `type` (string)
  - `care.escalation_detected`
  - `care.state_applied` (optional for later)
- `ts` (ISO string)
- `tenant_id`
- `entity_type` (`lead` | `contact` | `account`)
- `entity_id`
- `action_origin` (`user_directed` | `care_autonomous`)
- `reason` (non-empty)
- `policy_gate_result` (`allowed` | `escalated` | `blocked`)

**Escalation fields (when type = care.escalation\_detected):**

- `reasons[]`
- `confidence` (`high` | `medium` | `low`)

**Optional:**

- `deep_link` (path within AiSHA)
- `meta` (small object; avoid raw transcripts)

---

## 2) Workflow template (how you use Thoughtly + CallFluent nodes)

Because workflows start from a **Webhook Trigger**, build one canonical template:

### Template: `Care Escalation Router`

**Node 1 — Webhook Trigger**

- Receives the payload above.

**Node 2 — Router / Condition**

- Branch on `reasons[]` and `confidence`.

**Node 3A — Pabbly Webhook (optional)**

- Use to fan out into external automations.
- Use mapped fields (recommended).

**Node 3B — Thoughtly Message (recommended early)**

- Use for internal notifications (you/agent), not customer outreach initially.

**Node 3C — CallFluent SMS (recommended early)**

- Use for internal paging (you/agent), not customer outreach initially.

### v1 Safety posture

In PR8, restrict workflow actions to **internal routing** only:

- notify internal agent
- create internal follow-up tasks
- forward to Pabbly

Do **not** auto-message the customer until you add safeguards:

- consent rules
- quiet hours
- throttles
- escalation resolution loop

---

## 3) Backend changes (exact files)

### 3.1 Add workflow trigger invoker

Add: `backend/lib/care/careWorkflowTriggerClient.js`

Exports:

- `triggerCareWorkflow({ url, secret, payload, timeout_ms, retries })`

Requirements:

- Non-blocking: failures must not break call flows / workers
- Timeout bounded by env
- Retries bounded by env
- Logs `[CARE_AUDIT]` **action\_skipped** or **action\_candidate** when failing (do not throw)

Security:

- Add header `X-AISHA-SIGNATURE` as HMAC-SHA256 over the raw body using `CARE_WORKFLOW_WEBHOOK_SECRET`
- Add header `X-AISHA-EVENT-ID` = event\_id

---

### 3.2 Add gate helper

Add: `backend/lib/care/isCareWorkflowTriggersEnabled.js`

- Reads `CARE_WORKFLOW_TRIGGERS_ENABLED` (default false)

---

### 3.3 Wire escalation → workflow webhook (minimal)

Modify BOTH (minimal diff):

- `backend/lib/callFlowHandler.js`
- `backend/lib/aiTriggersWorker.js`

At the point where escalation is detected (already in PR5/PR6), add:

- If `isCareWorkflowTriggersEnabled()` AND `CARE_WORKFLOW_ESCALATION_WEBHOOK_URL` is set:
  - build payload `type='care.escalation_detected'`
  - call `triggerCareWorkflow(...)`

If disabled:

- do nothing (existing behavior unchanged)

Important:

- This is **routing**, not direct outreach.

---

## 4) Tests (required)

Add:

- `backend/lib/care/isCareWorkflowTriggersEnabled.test.js`

Add:

- `backend/lib/care/careWorkflowTriggerClient.test.js`

Minimum cases:

- disabled gate returns false by default
- signature header is set when secret exists
- client times out and returns gracefully (no throw)
- retries bounded

---

## 5) Env defaults update

Update ONE env defaults file (whatever you use, typically `.env.example`):

- `CARE_WORKFLOW_TRIGGERS_ENABLED=false`
- `CARE_WORKFLOW_ESCALATION_WEBHOOK_URL=`
- `CARE_WORKFLOW_WEBHOOK_SECRET=`
- `CARE_WORKFLOW_WEBHOOK_TIMEOUT_MS=3000`
- `CARE_WORKFLOW_WEBHOOK_MAX_RETRIES=2`

---

## 6) Acceptance Criteria

- With defaults (disabled):

  - no outbound HTTP calls occur
  - no user-visible behavior changes

- When enabled:

  - escalations trigger POST to workflow webhook
  - failures do not break call flows/workers
  - payload is stable and signed

- Backend still does not message customers.

---

#

---



