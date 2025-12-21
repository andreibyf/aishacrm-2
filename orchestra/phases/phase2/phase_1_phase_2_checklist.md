# Phase 1 & Phase 2 Detailed Completion Checklist (Pre‑Phase 3 Readiness)
A fully actionable, granular checklist with explicit checkboxes designed for Copilot alignment and engineering verification.

---
# ✅ SECTION A — Core AI Brain Infrastructure (Phase 1)

## A1. Braid Integration — Tooling & Execution
- [ ] `aiBrain.js` routes tasks through `runTask()` without bypass paths
- [ ] `executeBraidTool()` correctly:
  - [ ] accepts `(toolName, args, tenantRecord, userEmail)`
  - [ ] validates arguments according to schema
  - [ ] enforces read-only/propose_actions
  - [ ] surfaces errors with full context
- [ ] `generateToolSchemas()`:
  - [ ] returns ALL tools
  - [ ] schema definitions include descriptions
  - [ ] parameter definitions include types & required properties
  - [ ] outputs valid JSON schema for Realtime + Chat
- [ ] All CRM tools:
  - [ ] produce deterministic outputs
  - [ ] never hallucinate values internally
  - [ ] return structured JSON, not strings

## A2. Safety & Modes
- [ ] Destructive tools (`delete_*`, schema ops) fully isolated
- [ ] No destructive tools appear in generated schemas
- [ ] System blocks `apply_allowed` everywhere
- [ ] `propose_actions` mode always returns safe actions WITHOUT executing them

## A3. Tenant Isolation & Database Access
- [ ] `resolveCanonicalTenant()`:
  - [ ] validates tenant input
  - [ ] returns uuid + slug
  - [ ] rejects unknown tenants
- [ ] All tool calls include tenant binding
- [ ] No global DB queries exist in codebase
- [ ] Supabase queries scoped by tenant id

## A4. Typed Chat Pipeline
- [ ] `/api/ai/task` works end‑to‑end
- [ ] Tool calls created correctly by the model
- [ ] Backend executes tool → returns structured result → summarizes
- [ ] Typed chat never hallucinates CRM numbers
- [ ] Error logs include: tool_name, tenant_id, args, user

---
# ✅ SECTION B — Realtime Voice & Tool Bridge (Phase 2)

## B1. Realtime Token Endpoint
- [ ] `/api/ai/realtime-token` requires auth
- [ ] Accepts tenant_id explicitly
- [ ] Adds `BRAID_SYSTEM_PROMPT` into instructions
- [ ] `DEFAULT_REALTIME_INSTRUCTIONS` includes:
  - [ ] MUST call tools for CRM data
  - [ ] MUST not hallucinate
  - [ ] MUST summarize after tool result
  - [ ] MUST stay in read_only / propose_actions
- [ ] Realtime Session Config:
  - [ ] `session.tools` populated from filtered schemas
  - [ ] destructive tools removed
  - [ ] `tool_choice = "auto"`
  - [ ] audio output voice configured

## B2. Frontend → Backend Tool Call Bridge
- [ ] Realtime client listens to correct event:
  - [ ] `conversation.updated`
  - [ ] detects tool_call/function_call reliably
- [ ] Tool Call Extraction:
  - [ ] extracts `tool_name`
  - [ ] extracts & parses arguments (safe JSON)
- [ ] Sends correct payload to backend:
  - [ ] `{ tenant_id, tool_name, tool_args }`
- [ ] Backend route `/realtime-tools/execute`:
  - [ ] checks auth
  - [ ] validates tenant
  - [ ] blocks destructive tools
  - [ ] executes `executeBraidTool()`
  - [ ] returns `{status: 'success', data: result}`
- [ ] Frontend calls `sendToolResult(call_id, result)`
- [ ] Final model message uses tool result (no guessing)

## B3. WebRTC Audio + Voice Logic
- [ ] Mic → WebRTC audio stream stable
- [ ] Interim transcription works
- [ ] Final transcription works
- [ ] TTS streaming→plays without delay
- [ ] Mic gating logic:
  - [ ] mic pauses when TTS starts
  - [ ] mic resumes after TTS ends
  - [ ] no self‑hearing events
- [ ] No double-open mic events
- [ ] Continuous + PTT modes both working

## B4. Realtime UI Stability
- [ ] Connection status indicator present
- [ ] Transcript display correct ordering
- [ ] AI messages streamed incrementally
- [ ] Errors visible in UI dev console
- [ ] Realtime logs accessible for debugging

---
# ✅ SECTION C — Parity: Typed Chat vs Realtime

## C1. Tool Schema Parity
- [ ] Both typed chat & Realtime use SAME schemas
- [ ] No tool exclusive to chat unless intentional
- [ ] No mismatch in argument shapes

## C2. Behavioral Parity
Test the following **same questions** in both chat + voice:
- [ ] "How many leads do I have?"
- [ ] "Show me my overdue activities."
- [ ] "What’s my open pipeline total?"
Expected:
- [ ] both paths call SAME tool
- [ ] both paths return SAME data
- [ ] summaries match (aside from wording)
- [ ] Realtime never improvises numbers

---
# ✅ SECTION D — Stability, Logging, and Error Handling

## D1. Backend Logging
- [ ] Every tool execution logs:
  - [ ] tenant
  - [ ] toolName
  - [ ] args
  - [ ] duration
  - [ ] success / failure
- [ ] Realtime errors log call_id + tool context
- [ ] Missing/malformed schemas reported clearly

## D2. Frontend Logging
- [ ] Realtime connection issues logged
- [ ] Tool call events logged (debug level)
- [ ] sendToolResult success/failure logged
- [ ] TTS / audio pipeline logs

## D3. Test Scenarios
- [ ] CRM questions return tool results
- [ ] Non‑CRM questions answered normally
- [ ] Destructive requests declined cleanly
- [ ] Long TTS responses do not cut off mic state
- [ ] Realtime resumes gracefully after disconnect

---
# ✅ SECTION E — Phase 3 Readiness Criteria
Phase 3 should ONLY begin if **all** the following are green:

## E1. Infrastructure Confidence
- [ ] AI Brain stable under repeated loads
- [ ] Realtime stable under long sessions
- [ ] No intermittent null tool results

## E2. Cross‑Channel Consistency
- [ ] Chat and Realtime produce identical CRM results
- [ ] No divergence in tool execution paths

## E3. Safety + Governance
- [ ] destructive tools fully blocked
- [ ] propose_actions returns correct structured actions
- [ ] logs allow audit of every model suggestion

## E4. Team Validation
- [ ] All items in this checklist manually verified
- [ ] Copilot confirms no code path violates architecture
- [ ] Troubleshooting Pack validated

---
# ⭐ Ready for Phase 3
If every checkbox above is satisfied:
**The system is considered Phase 3‑ready.**
Phase 3 Autonomous Operations can be safely built on top of this foundation.

