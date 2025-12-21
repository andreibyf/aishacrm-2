
# AI-SHA CRM — Phase 3 Autonomous Operations  
# Copilot Workspace Tasks (Markdown Version with Checkboxes)

---

# ☑️ TASK 1 — Verify Phase 1 & Phase 2 Foundations Before Starting Phase 3

## Objective
Ensure Phase 1 (AI Brain + Braid) and Phase 2 (Realtime interface) are solid before building autonomous operations.

## Checklist
- [ ] Validate `aiBrain.js` logic  
- [ ] Validate `executeBraidTool()` as the **only** tool execution path  
- [ ] Validate `generateToolSchemas()` and tool filtering  
- [ ] Confirm Realtime token endpoint includes:
  - [ ] `BRAID_SYSTEM_PROMPT`
  - [ ] strengthened `DEFAULT_REALTIME_INSTRUCTIONS`
  - [ ] `session.tools = filteredSchemas`
  - [ ] `tool_choice = "auto"`
- [ ] Confirm Realtime client:
  - [ ] listens for tool_call events  
  - [ ] sends POST to `/api/ai/realtime-tools/execute`  
  - [ ] calls `sendToolResult` after backend execution  
- [ ] Validate mic gating + TTS gating  
- [ ] Confirm tenant isolation enforced throughout  

---

# ☑️ TASK 2 — Create the Trigger Engine Worker

## Objective
Create a dedicated scheduled worker to detect CRM conditions.

## Checklist
- [ ] Create `workers/aiTriggersWorker.js`  
- [ ] Implement cron scheduling (same pattern as campaignWorker.js)  
- [ ] Implement structured triggers:

```json
{
  "trigger_id": "lead_stagnant",
  "tenant_id": "tenant_123",
  "record_id": "lead_777",
  "context": { "days_stagnant": 12 }
}
```

- [ ] Include hooks for:
  - [ ] workflow canvas outputs  
  - [ ] inbound email events  
  - [ ] CallFluent events  
  - [ ] Thoughtly analytics  

---

# ☑️ TASK 3 — Build the Suggestion Engine

## Objective
Convert triggers into AI-generated suggested actions using the AI Brain.

## Checklist
- [ ] Create `workers/aiSuggestionEngine.js`  
- [ ] Convert trigger → prompt for AI Brain (`propose_actions` mode)  
- [ ] Validate tool names against Braid schemas  
- [ ] Emit structured suggestion JSON:

```json
{
  "action": "create_activity",
  "payload": {
    "lead_id": "lead_777",
    "description": "Follow-up due to inactivity",
    "due_date": "2025-02-01"
  },
  "confidence": 0.88,
  "reasoning": "Lead has been stagnant 12 days."
}
```

- [ ] Integrate optional context:
  - [ ] workflow canvas  
  - [ ] email analytics  
  - [ ] CallFluent conversation summaries  
  - [ ] Thoughtly sentiment analysis  

---

# ☑️ TASK 4 — Create Suggestion Queue (Database + API)

## Objective
Persist suggestions before human review.

## Checklist
- [ ] Create new Supabase table `ai_suggestions`  
- [ ] Include fields:
  - [ ] suggestion_id (PK)  
  - [ ] tenant_id  
  - [ ] trigger_id  
  - [ ] action (JSONB)  
  - [ ] confidence  
  - [ ] reasoning  
  - [ ] status (`pending`, `approved`, `rejected`, `applied`, `failed`)  
  - [ ] approved_by  
  - [ ] applied_at  
  - [ ] apply_result JSONB  
- [ ] Create API routes `/api/ai/suggestions/*`  
- [ ] Enforce tenant isolation  

---

# ☑️ TASK 5 — Build Review & Approval UI

## Objective
Create a user interface for reviewing and approving AI suggestions.

## Checklist
- [ ] Build `AutonomyQueuePanel.jsx`  
- [ ] Build `SuggestionReviewModal.jsx`  
- [ ] Display:
  - [ ] reasoning  
  - [ ] confidence  
  - [ ] proposed tool name  
  - [ ] tool payload  
  - [ ] before/after diff (when applicable)  
- [ ] Supporting actions:
  - [ ] Approve  
  - [ ] Reject  
  - [ ] Edit-before-apply  

---

# ☑️ TASK 6 — Implement Safe Apply Engine

## Objective
Execute approved suggestions safely through Braid tools.

## Checklist
- [ ] Create `backend/aiApplyEngine.js`  
- [ ] Validate:
  - [ ] payload schema  
  - [ ] tool exists  
  - [ ] tenant ownership  
- [ ] Execute via:

```js
executeBraidTool(toolName, payload, tenantRecord, userEmail, { mode: "apply_allowed" })
```

- [ ] Write audit logs  
- [ ] Update suggestion status → `applied` or `failed`  
- [ ] Integrate optional workflow canvas and email sending tools  

---

# ☑️ TASK 7 — Implement Telemetry & Observability

## Objective
Track system behavior and provide transparency.

## Checklist
- [ ] Create `backend/aiTelemetry.js`  
- [ ] Log:
  - [ ] triggers  
  - [ ] suggestion generation  
  - [ ] approvals/rejections  
  - [ ] apply events  
  - [ ] failures  
- [ ] Optional:
  - [ ] Realtime debug panel  
  - [ ] AI activity dashboard  
  - [ ] Trigger frequency visualization  

---

# ☑️ TASK 8 — Integration with Workflow Canvas, Email, CallFluent, Thoughtly

## Objective
Ensure optional modules contribute to triggers and suggestions.

## Checklist
- [ ] Workflow Canvas:
  - [ ] allow workflows to emit triggers  
  - [ ] allow workflow-generated payloads to seed suggestions  
- [ ] Email system:
  - [ ] allow email analytics to feed trigger context  
  - [ ] allow suggestions to propose email-based actions  
- [ ] CallFluent integration:
  - [ ] use call summaries as triggers  
  - [ ] feed conversation insights into suggestion reasoning  
- [ ] Thoughtly integration:
  - [ ] use sentiment + behavioral enrichment  
  - [ ] improve contextual awareness of suggestions  

---

# ☑️ TASK 9 — End-to-End Integration Testing

## Objective
Ensure full pipeline correctness.

## Checklist
- [ ] Test Trigger → Suggestion → Queue  
- [ ] Test Queue → Approval → Apply → DB mutation  
- [ ] Test fallback/error scenarios  
- [ ] Validate tenant isolation  
- [ ] Validate audit log completeness  
- [ ] Validate JSON outputs match Phase 3 schema  

---

# ☑️ TASK 10 — Final Phase 3 Readiness Review

## Objective
Ensure autonomous operations are safe, stable, and production-ready.

## Checklist
- [ ] All tasks 1–9 completed  
- [ ] Governance and safety rules validated  
- [ ] No direct writes outside Safe Apply Engine  
- [ ] All AI actions follow propose_actions → approval → apply flow  
- [ ] Auditability verified  
- [ ] Human override always available  

