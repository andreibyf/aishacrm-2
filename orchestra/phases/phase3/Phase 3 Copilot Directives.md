### 1. Current State Check (Phase 2C / Realtime AI)

**Answer:** Yes. Treat this as **mandatory** before Phase 3.

Concrete instruction for Copilot:

- Use the **Phase 2 Completion Summary** + **Phase 1&2 Readiness Checklist** as the acceptance criteria.
    
- Verify, in code, that:
    
    - `/api/ai/realtime-token` includes tools, instructions, and `tool_choice:"auto"`.
        
    - `/api/ai/realtime-tools/execute` exists and routes through `executeBraidTool`.
        
    - Realtime client:
        
        - subscribes to tool/function calls,
            
        - POSTs tool calls to the backend,
            
        - calls `sendToolResult` with the backend result.
            
    - Mic gating and TTS paths are implemented.
        

Phase 3 assumes this is solid. No “Phase 3” work should begin until this is green.

Instruction to Copilot:

> “Before implementing any Phase 3 code, validate that all Phase 2 checklist items are satisfied. If anything is missing or incomplete, generate PRs to bring Phase 2 to spec, then continue.”

---

### 2. Trigger Engine Scope (campaignWorker.js vs new worker)

**Answer:** Reuse the **same pattern**, but implement a **separate, dedicated trigger worker**.

Guidance:

- **Yes**, integrate with the same scheduling pattern you use for `campaignWorker.js` (same cron/job orchestration).
    
- **No**, do _not_ cram triggers into `campaignWorker.js` itself.  
    Instead, create something like:
    
    - `workers/aiTriggersWorker.js` or
        
    - `workers/autonomousTriggersWorker.js`
        

This keeps:

- campaigns logic separate from
    
- autonomous AI monitoring logic,
    

but reuses your existing job infrastructure (cron schedule, queue runner).

Instruction to Copilot:

> “Follow the same scheduling / job pattern as campaignWorker.js, but create a dedicated trigger worker module (e.g., aiTriggersWorker.js) for Phase 3 triggers.”

---

### 3. Suggestion Queue Storage (new table vs reuse)

**Answer:** This is a **new Supabase/Postgres table**, not a reuse.

The blueprint’s suggestion table schema is **its own dedicated structure**, with:

- `suggestion_id`
    
- `tenant_id`
    
- `trigger_id`
    
- `action` (JSONB)
    
- `status`
    
- `confidence`
    
- `reasoning`
    
- timestamps
    
- audit fields
    

Instruction to Copilot:

- Create a **new table** (e.g. `ai_suggestions` or `autonomous_suggestions`) that matches the blueprint schema.
    
- Do **not** try to overload existing campaign or tasks tables.
    

---

### 4. Priority Order of the 6 Stages

**Answer:** Yes, follow the given order **for core dependencies**. Some can be done in parallel, but there is a dependency chain:

Recommended order and notes:

1. **Trigger Engine**
    
    - Must exist first so the system knows _what_ to react to.
        
2. **Suggestion Engine**
    
    - Must turn triggers into proposed actions.
        
3. **Suggestion Queue**
    
    - Must exist before there is anything to review or apply.
        

Those three are **strictly sequential**.

Then:

4. **Review & Approval UI**
    
    - Can start in parallel with the queue APIs once schema is stable.
        
5. **Safe Apply Engine**
    
    - Depends on the suggestion format being stable and the queue in place.
        
    - You can scaffold it earlier, but don’t actually wire destructive or mutation calls without queue + review.
        
6. **Telemetry**
    
    - Minimum logging is required from day one; the more advanced dashboards/panels can be later.
        

Instruction to Copilot:

> “Treat Stages 1–3 as strict dependencies. Stages 4–6 can proceed partially in parallel, but no Safe Apply is allowed to go live until Queue + Review UI + validation are in place.”

---

### 5. Realtime Telemetry / Debug Panel

**Answer:** Distinguish between **telemetry/logging** and a **nice UI panel**.

- **Telemetry / logging itself:**  
    For Phase 3, this is **not optional**. You need at least:
    
    - structured logs for triggers,
        
    - suggestion generation,
        
    - approvals,
        
    - applies,
        
    - errors.
        
- **Developer-facing Realtime Debug Panel UI:**  
    This can be **deferred** if needed, but it’s highly recommended.  
    It’s not a hard blocker for Phase 3 _launch_, but basic observability is.
    

So:

- Must-have for Phase 3:
    
    - Logs and some way to inspect them.
        
- Nice-to-have (can be Phase 3.1):
    
    - A polished “Realtime/Autonomy Debug Panel” in the UI.
        

Instruction to Copilot:

> “Implement backend logging and minimal telemetry as part of Phase 3 core. Treat any advanced UI debug panel as a secondary, non-blocking deliverable.”