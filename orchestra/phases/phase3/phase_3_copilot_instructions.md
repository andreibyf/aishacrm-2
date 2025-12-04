# COPILOT SYSTEM DIRECTIVE – PHASE 3 AUTONOMOUS OPERATIONS (AI‑SHA CRM)

This is the **authoritative specification** Copilot must follow to implement **Phase 3 Autonomous Operations**. Use this to generate code, PRs, tests, workers, routes, DB tables, UI components, and integration logic.

---
# 0. ROLE & CONSTRAINTS
You MUST implement Phase 3 on top of fully completed Phase 1 (AI Brain + Braid) and Phase 2 (Realtime Conversational Interface).

You MUST NOT:
- invent new tools
- bypass the Braid tool layer
- write directly to Supabase outside Safe Apply Engine
- allow the AI to mutate data without human approval

You MUST:
- enforce tenant isolation
- maintain read_only → propose_actions → apply_allowed separation
- log every autonomous step
- avoid hallucinated fields or tool names

---
# 1. FOUNDATION CHECK — REQUIRED BEFORE ANY PHASE 3 WORK
Phase 3 work may only begin when Phase 2C (Realtime + Tools) is proven stable.

### Validate:
- `/api/ai/realtime-token` includes BRAID_SYSTEM_PROMPT, strengthened DEFAULT_REALTIME_INSTRUCTIONS, tool_choice:"auto", and filtered tool schemas.
- Realtime client handles `tool_call` events → POSTs to `/api/ai/realtime-tools/execute` → receives results → calls `sendToolResult`.
- executeBraidTool is the **only** tool executor.
- Mic gating & TTS gating work.

If anything is missing, generate PRs to correct Phase 2 **before** Phase 3.

---
# 2. PHASE 3 ARCHITECTURE TO FOLLOW
Autonomous Operations follow this exact pipeline:

```
Trigger Engine → Suggestion Engine → Suggestion Queue → Review & Approval UI → Safe Apply Engine → Telemetry
```

## 2.1 Trigger Engine
Create a new worker (do NOT modify campaignWorker.js). Suggested names:
- `aiTriggersWorker.js`
- `autonomousTriggersWorker.js`

### Requirements:
- Uses the same job scheduling pattern as campaign workers.
- Runs on cron.
- Emits structured trigger JSON:
```json
{
  "trigger_id": "lead_stagnant",
  "tenant_id": "tenant_abc",
  "record_id": "lead_123",
  "context": { "days_stagnant": 12 }
}
```

### Triggers may include:
- lead stagnation
- deal regression
- overdue activity
- missing follow‑up
- account at‑risk scoring
- inbound email/call requiring action
- workflow canvas outputs
- CallFluent / Thoughtly events

---
## 2.2 Suggestion Engine
Implements AI‑driven **propose_actions** behavior.

### Responsibilities:
- Convert trigger context → structured AI prompt.
- Call AI Brain in `propose_actions` mode.
- Validate tool names against existing Braid schemas.
- Produce safe, structured recommendations.

### Output format (MANDATORY):
```json
{
  "action": "create_activity",
  "payload": {
    "lead_id": "lead_123",
    "description": "Follow-up",
    "due_date": "2025-01-26"
  },
  "confidence": 0.88,
  "reasoning": "Lead has been inactive for 12 days."
}
```

No freeform text. No hallucinated fields.

---
## 2.3 Suggestion Queue (NEW DB TABLE)
Create a **new Supabase table**. Do NOT reuse existing tables.

### Table: `ai_suggestions`
Fields:
- suggestion_id (PK)
- tenant_id
- trigger_id
- action (JSONB)
- confidence
- reasoning
- status: `pending | approved | rejected | applied | failed`
- approved_by
- applied_at
- apply_result (JSONB)
- timestamps

---
## 2.4 Review & Approval UI
A human-facing panel for reviewing suggestions.

### Requirements:
- Pending suggestions panel
- Suggestion detail modal
- Shows tool name + payload
- Shows reasoning + confidence
- Inline before/after diff (when applicable)
- Approve / Reject / Edit‑Before‑Apply

Integrate optional workflow canvas actions and email output previews.

---
## 2.5 Safe Apply Engine
Executes approved actions **only**.

### Rules:
- Validates action + payload
- Enforces tenant isolation
- Calls Braid tools in `apply_allowed` mode
- Logs every mutation
- Updates suggestion status → `applied` / `failed`

### Pipeline:
```
Validate → Execute (apply_allowed) → Audit Log → Update DB
```

---
## 2.6 Telemetry (MANDATORY BACKEND, OPTIONAL UI)
Backend must log:
- triggers fired
- suggestions generated
- approvals / rejections
- apply engine executions
- errors

UI debug panel is optional for Phase 3.

---
# 3. CODING REQUIREMENTS

### DO NOT:
- mutate CRM data directly via Supabase
- expose mutation tools to Realtime
- mix trigger logic inside campaign workers

### MUST:
- centralize all mutations in Safe Apply Engine
- validate all suggestion payloads
- maintain strict tenant boundaries
- return consistent JSON formats

---
# 4. WORK PRIORITY ORDER (STRICT)
You must follow this sequence:

1. Trigger Engine
2. Suggestion Engine
3. Suggestion Queue (DB + APIs)
4. Review & Approval UI
5. Safe Apply Engine
6. Telemetry

No jumping ahead.

---
# 5. MODULES YOU MAY NEED TO CREATE
- `/workers/aiTriggersWorker.js`
- `/workers/aiSuggestionEngine.js`
- `/db/aiSuggestionModel.js`
- `/routes/aiSuggestions.js` (CRUD + approval APIs)
- `/backend/aiApplyEngine.js`
- `/backend/aiTelemetry.js`
- `/components/ai/AutonomyQueuePanel.jsx`
- `/components/ai/SuggestionReviewModal.jsx`

---
# 6. JSON FORMATS FOR AI PIPELINES

## Trigger JSON
```json
{
  "trigger_id": "deal_regressed",
  "tenant_id": "tenant_x",
  "record_id": "deal_45",
  "context": { "previous_stage": "proposal", "current_stage": "qualification" }
}
```

## Suggestion JSON
```json
{
  "action": "update_opportunity",
  "payload": { "id": "deal_45", "stage": "recovery" },
  "confidence": 0.72,
  "reasoning": "Deal regressed and requires escalation."
}
```

## Apply Result JSON
```json
{
  "status": "success",
  "tool": "update_opportunity",
  "applied_payload": { "id": "deal_45", "stage": "recovery" },
  "timestamp": "2025-01-28T11:55:00Z"
}
```

---
# 7. INTEROPERABILITY REQUIREMENTS

### Workflow Canvas
- Triggers may originate from workflow canvas outputs.
- Suggestions may include workflow canvas-generated payloads.

### Email Integrations
- Autonomous suggestions may propose sending emails via CRM’s email service.
- Actual email sending MUST go through Safe Apply Engine using proper tools.

### CallFluent & Thoughtly
- Their events may produce triggers.
- Their analytics may feed context into suggestion reasoning.

---
# 8. TESTING REQUIREMENTS

### Unit tests:
- trigger detection
- suggestion validation
- apply engine logic

### Integration tests:
- Trigger → Suggestion → Queue
- Queue → Approval → Apply → DB mutation

### UI tests (optional):
- suggestion list
- review modal
- diff preview

---
# 9. WHEN UNSURE — DO THIS
Ask yourself:
1. Does this pass through the AI Brain correctly?
2. Is the tenant enforced everywhere?
3. Does this mutate data ONLY through Safe Apply Engine?
4. Is the result fully auditable?

If ANY answer is "no", revise the implementation.

---
# 10. PHASE 3 SUCCESS CRITERIA
A correct implementation will:
- detect CRM conditions autonomously
- propose structured Braid tool actions
- require human approval
- safely apply approved changes
- provide full auditability
- integrate optional workflow canvas, email, CallFluent, and Thoughtly

This is the **only acceptable output** of Phase 3.

