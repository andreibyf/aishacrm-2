# AiSHA CRM – Phase 2A Plan (Conversational Core)

## Phase Summary

Type: feature  
Phase: **2A – Conversational Core**  
Title: Build AI-first conversational interaction layer without replacing existing UI

Description:  
Introduce a persistent, right-hand AI assistant panel and intent engine that can operate across the CRM from any page. The assistant should understand natural language, map it to CRM operations via Braid tools + AI Brain, and guide users through conversational workflows and forms. No major visual redesigns or dashboard replacements occur in this phase.

Phase 2A uses the existing Phase 1 AI Brain (`aiBrain.ts` + `/api/ai/brain-test`) and the existing Phase 2 Conversational Interface design doc as the foundation.

---

## Execution Rules (Critical)

Mode: **FEATURE, CONTROLLED SCOPE**

Do NOT:

- Change database schema or Supabase table structures.
- Introduce autonomous write mode (`apply_allowed`) in AI Brain.
- Enable any delete_* capabilities for AI.
- Replace dashboards or core entity pages (that is 2B).
- Break existing non-AI workflows (forms, navigation, CRUD).

You MAY:

- Add new API endpoints under `/api/ai/*` if needed.
- Add new React components and hooks for the conversational UI.
- Extend existing AI routes to support context-aware calls (tenant, entity, user).

All changes must:

- Respect `orchestra/CONVENTIONS.md` and `orchestra/ARCHITECTURE.md`.
- Use `read_only` or `propose_actions` modes only when talking to the AI Brain.
- Be testable via simple manual flows (no heroic QA required to verify).

---

## Active Tasks

### PH2A-CORE-001 – Right-Side AI Assistant Panel

Area: Frontend – layout + new components

Goal:  
Add a collapsible right-side AI panel, toggled by the existing AI-SHA widget/button, available on all primary screens (leads, accounts, opportunities, contacts, dashboard).

Requirements:

- Panel slides in from the right (300–400 px wide) and overlays or gently resizes the main content.
- Works with existing dark theme.
- Keeps existing floating AI widget (avatar) as the toggle.
- No routing changes; panel is an overlay layer on top of current pages.

Scope:

- Create dedicated components (example):
  - `components/ai/AiSidebar.tsx`
  - `components/ai/AiSidebarToggleButton.tsx`
  - `hooks/useAiSidebarState.ts`
- Wire the provider/state at the app layout level (e.g. root layout or shell component).
- Do not change any business logic in this task; UI only.

Acceptance:

- From any main page, clicking the AI widget opens/closes the panel.
- The core app continues to function even if the AI backend is down (panel shows a graceful error, not a crash).

Status: Not started

---

### PH2A-CORE-002 – Basic Chat Wiring to `/api/ai/chat`

Area: Frontend – AI panel internals, Backend – existing AI routes

Goal:  
Make the panel a functioning chat interface using the existing `/api/ai/chat` endpoint.

Requirements:

- Inside the panel:
  - Chat transcript area.
  - Input box: “Ask AiSHA…” + send button.
  - Optional: minimal loading indicator.
- Calls `/api/ai/chat` with:
  - Conversation ID (if available).
  - Tenant ID.
  - User info (where available).
- Supports streaming later, but Phase 2A baseline can be non-streaming.

Scope:

- No new models or AI providers; reuse existing AI provider setup.
- Use existing conversation storage if already integrated; otherwise, keep minimal local state and defer persisted threads to later.

Acceptance:

- User can type a prompt in the panel and get a response from the existing AI backend.
- Errors are captured and rendered as UX-friendly messages.
- No impact on current conversation page behavior.

Status: Not started

---

### PH2A-CORE-003 – Intent/Command Mapping Layer (Non-destructive)

Area: Backend + AI Brain usage

Goal:  
Add a thin intent/command mapping layer that interprets user text into structured tasks handed to `runTask` in `aiBrain`, using `read_only` and `propose_actions` modes only.

Requirements:

- Map a subset of commands, for example:
  - “Summarize my leads” → `taskType = "summarize_entity"`, `context = { entity: "leads" }`, `mode = "read_only"`.
  - “What should I follow up on today?” → `taskType = "improve_followups"`, context for leads/opportunities.
- No `apply_allowed` calls in this phase.
- All delete_* tools must remain blocked.

Scope:

- Add a small controller or helper for mapping text → aiBrain.runTask input.
- Maximum of a handful of well-defined intents initially (start small).

Acceptance:

- From the chat panel, specific plain-language queries trigger a Brain run.
- Responses show:
  - Summary.
  - Insights.
  - Proposed actions (when mode is `propose_actions`), clearly labeled as suggestions only.

Status: **Completed** – Implemented in `src/ai/nlu/intentClassifier.ts` and `src/ai/engine/commandRouter.ts` with full test coverage.

---

### PH2A-CORE-004 – Conversational Forms (Guided Entity Creation/Update)

Area: Frontend – AI panel conversation flows

Goal:  
Enable the assistant to walk the user through multi-step forms (create/update lead/contact/account) via conversational prompts, but stop at “propose_actions” (no automatic DB writes).

Requirements:

- For supported flows (example: create lead):
  - AI asks required fields one by one.
  - AI validates obvious issues (missing email, nonsense phone numbers).
  - At the end, the assistant presents a summary of the payload as “proposed action(s).”
- These proposed actions can later be:
  - Manually applied via a normal form, or
  - Used by Phase 3 for autonomous behavior.

Scope:

- Frontend only needs to display proposed actions in a compact, readable view (e.g. JSON-like diff or friendly summary).
- Do not add any new backend routes for writes in this task.

Acceptance:

- At least one high-value entity flow (e.g. new lead) is supported.
- Proposed data is correctly structured and associated with the current tenant.

Status: **Completed** – Implemented in `src/components/ai/ConversationalForm.jsx` with schema definitions in `src/components/ai/conversationalForms/schemas.js`. Full test coverage in `ConversationalForm.test.jsx`.

---

### PH2A-CORE-005 – Voice Input (Speech-to-Text Commands)

Area: Frontend – browser APIs / integration

Goal:  
Allow users to click a mic icon in the AI panel and speak commands that are transcribed into text, then processed like regular chat/commands.

Requirements:

- Basic speech-to-text support in modern browsers.
- If speech APIs are not available, the mic button should:
  - Be disabled, or
  - Show a clear message.

Scope:

- Frontend only.
- No voice output yet (that can be 2B or later).

Acceptance:

- On supported browsers, user can click the mic, speak, see transcribed text appear in the input, and submit the command.

Status: **Completed** – Implemented in `src/components/ai/useSpeechInput.js` with browser API fallbacks. Full test coverage in `useSpeechInput.test.jsx`. Voice UI integrated in AiSidebar.

---

## Testing & Validation

Manual:

- Ensure the AI panel works on:
  - Dashboard, leads, accounts, opportunities, contacts.
- Simulate:
  - Normal chat question.
  - “Summarize my leads.”
  - “Suggest follow-ups for this week.”

Backend:

- Verify `aiBrain` logs show `mode = read_only` and `mode = propose_actions` only.
- Confirm no `apply_allowed` calls are made.

Regression:

- Existing non-AI features behave unchanged.
- Login, navigation, basic CRUD still pass smoke tests.

---

## Status Overview

- PH2A-CORE-001: Completed  
- PH2A-CORE-002: Completed  
- PH2A-CORE-003: Completed  
- PH2A-CORE-004: Completed  
- PH2A-CORE-005: Completed  

**Phase 2A is COMPLETE.** All conversational core features are implemented with test coverage.

---

## Backlog (Not in 2A)

- AI-driven dashboards (replace current widget-heavy pages).
- Per-entity AI summary headers (contacts, leads, accounts, opportunities).
- Email/call thread embedding and summarization.
- Voice output.

---

## Usage Instructions for AI Tools (Copilot / Orchestrator)

When using Copilot or an external orchestrator:

1. Read:
   - `.github/copilot-instructions.md`
   - `orchestra/ARCHITECTURE.md`
   - `orchestra/CONVENTIONS.md`
   - This plan (`PLAN_PHASE2A_CONVERSATIONAL_CORE.md`)
   - `docs/PHASE2_CONVERSATIONAL_INTERFACE.md`
2. Pick ONE active task (PH2A-CORE-00X) and work only on that.
3. Keep changes minimal, focused, and well-described in commit messages.
4. Never enable `apply_allowed` mode in this phase.
