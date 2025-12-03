
AI-SHA CRM v2.0 Roadmap Component

## Goal
Move from "chat as optional" → **chat as the primary command surface** across the entire CRM.

This is the bridge phase into the v2.0.0 “AI-SHA as the Brain” release.

---

## Core Objectives

### 1. Universal Natural-Language Command Support
Everything a user can click → they can say.

Examples:
- “Show all leads from last week.”
- “Update all open opportunities over $10k to stage 3.”
- “Create a follow-up task for Andre tomorrow at 9am.”

### 2. Integrated AI Routing
Conversation engine sends:
- Read queries → AI Brain in read_only
- Suggestions → propose_actions
- Confirmed commands → Phase 3 execution pipeline

### 3. Conversational Memory Layer
Metadata saved:
- First user message → auto-title
- Topic classification
- Prior operations

### 4. Multi-Turn Tool Execution Loop
Upgrade current single-turn → multi-step chain:
- AI requests snapshot
- AI filters
- AI queries details
- AI proposes actions

Integrate turn-by-turn summaries.

### 5. Enhanced System Prompt
Rewrite system prompt to emphasize:
- AI is the **primary interface**
- Tool usage mandated before answers
- No assumptions / no hallucination

### 6. Unified Chat Panel in UI
Chat becomes:
- Global search bar
- Command console
- Workflow generator
- Data assistant

### 7. Workflow Autogeneration
User says:
> “Build me a sales follow-up workflow for my stale leads.”

AI returns:
- Proposed n8n workflow spec
- Proposed CRM action steps
- Proposed automations

User approves → stored for Phase 3.

---

## Deliverables

### A. Updated Chat Endpoint Behavior
- Route all chat → AI Brain
- Add new “chat → task type → brain mode selector”

### B. Task Types Catalog
Define official Phase 2 tasks:
- summarize_entity
- update_records
- improve_followups
- find_tasks
- draft_workflow
- resolve_issue
- generate_report
- plan_pipeline

### C. UX Integration
- Left sidebar “AI Chat”
- Replace most dashboards with AI-generated summaries
- Add AI confirmation modals for proposes_actions

### D. New Schema for Proposed Actions (saved ops)
Add table:


ai_pending_operations (  
id uuid pk  
tenant_id uuid  
user_id uuid  
actions jsonb  
created_at timestamp  
)


---

## Acceptance Criteria
- Chat-first workflow fully functional
- All commands route through AI Brain
- No direct UI bypasses (unless manually overridden)
- Propose-actions workflow stable
- No unexpected writes without confirmation

---

## Expected Output
Phase 2 establishes the conversational shell around the AI Brain built in Phase 1.

After Phase 2, AI-SHA CRM becomes a true **AI-first CRM**, ready for Phase 3 autonomous behavior.
