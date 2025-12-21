# **PHASE 3 — Autonomous Operations Blueprint (Consolidated Architecture)**

## **Purpose**
Phase 3 introduces autonomous CRM intelligence while maintaining strict safety and governance.  
The system must:
- Observe CRM conditions
- Detect meaningful events
- Generate structured, safe recommendations
- Require human approval
- Apply actions through the Braid tool layer
- Maintain tenant isolation and full auditability

---

# **1. Architectural Principles**

## **1.1 One Brain, One Tool Layer**
All AI reasoning and autonomous activity must use:
- AI Brain (`runTask`)
- Braid tools
- Tenant-aware execution
- read_only / propose_actions / apply modes

## **1.2 Autonomous ≠ Uncontrolled**
Phase 3 enables autonomous *suggestions*, not direct execution.

## **1.3 Human-in-the-loop**
Pipeline:
```
Trigger → Suggestion → Review → Approval → Safe Apply
```

## **1.4 Full Auditability**
Every action must log:
- Trigger source
- AI reasoning
- Proposed tool call
- Reviewer identity
- Mutation result

---

# **2. Core Components**

---

## **2.1 Trigger Engine**
Monitors CRM data and emits structured triggers.

### Examples
- Lead stagnation
- Deal regression
- Account risk signals
- Re-engagement opportunities

### Trigger Format
```json
{
  "trigger_id": "lead_stagnant",
  "tenant_id": "tenant_abc",
  "record_id": "lead_123",
  "context": { "days_stagnant": 12 }
}
```

---

## **2.2 Suggestion Engine**
Uses AI Brain in `propose_actions` mode.

### Output
```json
{
  "action": "create_activity",
  "payload": {
    "lead_id": "lead_123",
    "description": "Follow-up",
    "due_date": "2025-01-26"
  },
  "confidence": 0.88,
  "reasoning": "Lead inactive for 12 days."
}
```

---

## **2.3 Suggestion Queue**
Stores autonomous proposals awaiting approval.

### Fields
- suggestion_id
- tenant_id
- trigger_id
- proposed_action
- status
- confidence
- reasoning
- approved_by
- applied_at

---

## **2.4 Review & Approval UI**
Human-facing module that allows:
- Approve
- Reject
- Edit
- View reasoning

---

## **2.5 Safe Apply Engine**
Executes approved actions via Braid tools.

### Guarantees
- Tenant isolation
- Validation of payloads
- Audit logs
- Atomic database operations

Pipeline:
```
Validate → Execute (apply_allowed) → Log → Update Status
```

---

## **2.6 Telemetry & Observability**
Tracks:
- Trigger activity
- Model reasoning frequency
- Suggestion generation metrics
- Approval patterns
- Errors and anomalies

---

# **3. Data Models**

## **3.1 Trigger Table**
```sql
trigger_id TEXT
tenant_id TEXT
record_id TEXT
context JSONB
created_at TIMESTAMP
```

## **3.2 Suggestion Table**
```sql
suggestion_id TEXT PRIMARY KEY
tenant_id TEXT
trigger_id TEXT
action JSONB
status TEXT
confidence FLOAT
reasoning TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
approved_by TEXT
applied_at TIMESTAMP
apply_result JSONB
```

---

# **4. Integration With Existing Architecture**

## **4.1 AI Brain Modes**
- read_only → safe CRM queries  
- propose_actions → AI suggests actions  
- apply_allowed → safe apply engine only  

## **4.2 Realtime Compatibility**
Realtime can:
- Generate triggers
- Produce suggestions

But cannot:
- Apply actions directly

## **4.3 Tool Validation**
Mutation tools require:
- Existence in Braid schema
- apply_allowed mode
- Proper argument structure

---

# **5. Phase 3 Development Stages**

### **Stage 1 — Trigger Engine**
- Create scheduled workers
- Implement detection logic

### **Stage 2 — Suggestion Engine**
- AI prompt templates
- Braid propose_actions integration

### **Stage 3 — Suggestion Queue**
- Backend queue models + APIs

### **Stage 4 — Review UI**
- Pending suggestions panel
- Approval modal
- Diff viewer

### **Stage 5 — Safe Apply Engine**
- Validation
- Execution via Braid tools
- Audit logging

### **Stage 6 — Telemetry**
- Logging and analytics dashboards

---

# **6. Governance & Safety Rules**
- No AI-initiated writes without approval
- All writes flow through Safe Apply Engine
- Every action includes reasoning + confidence
- Tenant isolation is mandatory

---

# **7. Deliverables Checklist**
- [ ] Trigger engine
- [ ] Suggestion engine
- [ ] Suggestion queue
- [ ] Review UI
- [ ] Safe Apply Engine
- [ ] Logging & Telemetry
- [ ] Braid mutation tool schemas
- [ ] Human approval workflow
- [ ] Chat + Realtime parity

---

# **8. Outcome**
Upon completion, the CRM will:
- Detect issues autonomously
- Propose precise next actions
- Automate follow-up workflows
- Provide structured, safe AI-driven CRM operations
- Prepare foundation for Phase 4 autonomous agents

