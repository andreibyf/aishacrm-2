# AiSHA CRM – Backend Field Parity Bugfix Plan

## Current Goal

Type: bugfix  
Title: Fix backend/ frontend field mismatch and propagate to dependent components

Description:  
The frontend allows entry of several fields (e.g., phone, job_title, metadata, secondary contact data, notes). In testing, some of these values are:

- Sent in POST/PUT payloads but missing from GET/list responses, or
- Present in the DB but stripped by backend serialization, or
- Missing when consumed by dashboards, AI snapshot endpoints, Braid tools, or reports.

This is a **critical data integrity bug**. The goal is:

1. Restore 1:1 field parity between UI forms, backend APIs, and DB schema.
2. Audit and fix downstream components that rely on these entities (dashboards, AI snapshot, Braid/MCP tools, exports, reports) so they see the same field set.

No new features. No UI redesign.

---

## Execution Rules (Critical)

Mode: BUGFIX ONLY

Do NOT:

- Redesign entity models or API shapes.
- Add new business logic unrelated to field parity.
- Refactor unrelated modules (auth, realtime, AI orchestration, n8n, etc.).

Allowed:

- Add missing fields to SELECT/INSERT/UPDATE/RETURNING.
- Fix serializers/DTOs so all existing UI fields round-trip.
- Update downstream consumers (dashboards, AI snapshot, Braid tools, exports) to include the same fields.
- Add minimal migrations **only if** a field used by the UI truly has no DB column.

Every fix must be covered by at least one test (unit or integration) where practical.

---

## Active Tasks

### BUG-BE-FIELDS-001 – Core CRUD Field Parity (Diagnosis + Fix)

**Area:** Backend CRUD routes/services + frontend models

**Goal:**  
Make sure each core entity’s CRUD API returns and accepts all fields the UI exposes.

**Scope Entities:**

- Leads
- Contacts
- Accounts
- Opportunities
- Activities

**Steps:**

1. Inventory UI fields:
   - Inspect frontend models / API clients / form components for each entity (e.g., `src/api/*`, `src/components/*Form*`).
   - List the fields that can be edited or displayed.

2. Inspect backend:
   - For each entity’s endpoints (create/update/get/list), inspect:
     - DB query columns (Supabase/SQL SELECT, INSERT, UPDATE).
     - Response serialization / DTO mapping.
   - Compare:
     - UI fields vs.
     - Request payloads vs.
     - Response JSON vs.
     - DB columns.

3. Apply minimal fixes:
   - Include missing columns in SELECT/RETURNING.
   - Ensure INSERT/UPDATE persist those fields.
   - Ensure serializers/DTOs expose the full field set.

4. Only if absolutely necessary:
   - If a UI field is clearly required but has no DB column:
     - Confirm it is not dead/stale UI.
     - Add the smallest safe migration (new column) with a default.

**Acceptance:**

- For each entity, a manual or inline mapping exists showing:
  - UI fields ↔ API fields ↔ DB columns.
- Creating/updating through the API and re-fetching returns all fields as entered.
- No regressions in existing CRUD behavior.

---

### BUG-BE-FIELDS-002 – Downstream Component Parity (Dashboards, AI, MCP, Exports)

**Area:** Components that consume entity data

**Goal:**  
Make sure all downstream components see the same complete field set as the core CRUD APIs.

**Components to review:**

- Dashboard/stat cards and summary endpoints.
- `/api/ai/snapshot-internal` and any AI snapshot helpers.
- Braid/MCP integration (`braidIntegration-v2`, Braid tools that read entity data).
- Any reporting/export endpoints (CSV/Excel/JSON).
- Any automation/webhook/event publishers that serialize entities.

**Steps:**

1. Dashboards:
   - Identify backend endpoints feeding dashboard tiles and summary counts.
   - Ensure they select and return the same fields added in BUG-BE-FIELDS-001 where relevant.
   - Confirm no fields are silently dropped or renamed.

2. AI Snapshot / Braid tools:
   - Inspect `/api/ai/snapshot-internal` and related helpers.
   - Ensure the snapshot includes all core entity fields fixed in BUG-BE-FIELDS-001 (e.g., phone, job_title, metadata, assigned_to, descriptions).
   - Inspect Braid tool schemas and execution:
     - Make sure they rely on the updated snapshot/API shapes.
     - Avoid “partial” projections that strip fields the AI may need.

3. Exports / reporting / webhooks:
   - Check any export or reporting endpoints to ensure:
     - They include the corrected field set.
     - They don’t serialize outdated or incomplete shapes.

4. Apply minimal changes:
   - Align field lists with updated CRUD/API models.
   - Avoid introducing new “computed” fields unless already documented.

**Acceptance:**

- Dashboards display expected values for the newly fixed fields.
- AI snapshot JSON contains the same field set as CRUD endpoints for each entity.
- Braid tools and any exports that consume these entities see and return complete records.
- No breaking changes to existing clients.

---

### BUG-BE-FIELDS-003 – Regression Tests (CRUD + Downstream)

**Area:** Backend tests / integration tests

**Goal:**  
Lock in field parity for core entities and downstream consumers.

**Steps:**

1. CRUD round-trip tests:
   - For each entity:
     - Create an entity with all meaningful fields set.
     - Read it back via:
       - Detail endpoint.
       - List endpoint (if applicable).
     - Assert all fields match.

2. Snapshot / AI tests:
   - Add tests for `/api/ai/snapshot-internal` (or equivalent snapshot helper) to:
     - Seed data with the fields fixed in BUG-BE-FIELDS-001.
     - Assert snapshot payload includes those fields for each entity.

3. Optional: Dashboard / export tests:
   - If practical, add small tests to ensure dashboard/export endpoints return the expected keys.

**Acceptance:**

- New tests fail on the old behavior (missing fields).
- All tests pass after fixes in BUG-BE-FIELDS-001/002.
- CI/orchestrator uses these tests to prevent future regressions.

---

## Testing & Validation Requirements

**Manual:**

- In the actual UI, for each entity:
  - Create a record with all fields filled.
  - Navigate away and back; open multiple views (detail, list, dashboard, AI summaries if applicable).
  - Confirm all values are present and unchanged.

**Automated:**

- All existing tests pass.
- New CRUD round-trip tests pass for each entity.
- Snapshot/AI tests confirm all fields are present.

**Environments:**

- Local dev containers (backend + frontend + Supabase).
- At least one remote environment (e.g., DEV on VPS) using the real Supabase instance.

---

## Status

- BUG-BE-FIELDS-001: Not started  
- BUG-BE-FIELDS-002: Not started  
- BUG-BE-FIELDS-003: Not started  

---

## Usage Instructions for AI Tools

When using Copilot or any orchestrator:

1. Read `.github/copilot-instructions.md`.
2. Read `orchestra/ARCHITECTURE.md`.
3. Read `orchestra/CONVENTIONS.md`.
4. Read this PLAN and start with **BUG-BE-FIELDS-001**.
5. Work one task at a time:
   - BUG-BE-FIELDS-001: core CRUD parity (diagnose + fix).
   - BUG-BE-FIELDS-002: propagate fixes to dashboards, AI snapshot, Braid tools, exports.
   - BUG-BE-FIELDS-003: tests only.
6. Keep changes minimal and strictly within field parity scope.  
   No new features, no cross-cutting refactors.











# AiSHA CRM – Phase 2C Plan (Hands-Free Voice Chat)


## Goal

Upgrade the existing Phase 2 voice layer so that voice behaves like a true “live chat with AiSHA”:

- User taps mic → speaks → STT runs → transcript is **auto-sent** as a message.
- Assistant responds in text and (optionally) voice via ElevenLabs TTS.
- Tenant isolation and all safety rules still apply.
- No “review/edit transcript” step for normal usage.

This is a UX/flow upgrade only. No new Brain modes, no new MCP tools.

---

## Execution Rules

Do NOT:

- Change Brain modes (`read_only`, `propose_actions`, `apply_allowed`).
- Add any `delete_*` tools or bypass existing Braid policies.
- Add new backend models or DB tables.
- Change conversation storage schema.

Allowed:

- Frontend-only changes in AI sidebar/speech hooks.
- Minor backend tweaks **only** inside existing `/api/ai/speech-to-text` and `/api/ai/tts` routes.
- Additional safety checks for voice input/output.

---

## Active Tasks

# PLAN – Realtime Voice Interaction (OpenAI Realtime WebRTC)

Phase: **Realtime Voice / Streaming Assistant**  
Status: **Active** (env key + feature flag verified Dec 1, 2025)  
Owner: **AiSHA Core**  
Scope: **Add continuous, hands-free voice conversation with AiSHA using OpenAI Realtime API, without breaking existing STT/TTS and text chat flows.**

---

## 1. Goals

- Allow users to **talk to AiSHA in realtime** (push to connect, then natural back-and-forth).
- Use **OpenAI Realtime WebRTC** for:
  - Low-latency audio in/out.
  - Event channel for text/metadata.
- Keep all existing guarantees:
  - **Tenant isolation**.
  - **Read-only / propose-actions** boundaries from Brain Phase 1.
  - No raw OpenAI API keys in the browser.
- Do **not** break:
  - Existing sidebar text chat.
  - Existing REST-based STT/TTS (Phase 2C); this becomes the fallback path.

Non-Goals (for this phase):
- No autonomous write/apply mode.
- No per-tenant custom voice yet (single default voice is fine).
- No mobile app work; browser only.

---

## 2. Architecture Overview

### 2.1 Backend

- New **Express router** mounted under `/api/ai`:
  - `GET /api/ai/realtime-token`
    - Mints an **ephemeral realtime client secret** using OpenAI REST:
      - `POST https://api.openai.com/v1/realtime/client_secrets`
    - Session config:
      - `type: "realtime"`
      - `model: "gpt-realtime"`
      - `audio.output.voice: "marin"` (or chosen default)
      - `instructions`: mirror AiSHA’s CRM-safe system prompt (read-only / propose-actions).
    - Uses `process.env.OPENAI_API_KEY` (or tenant key when available).
    - Returns `{ value: "<EPHEMERAL_KEY>", expires_at: ... }`.

- Optional (not required in first cut, but design for later):
  - `POST /api/ai/realtime-session`
    - Server-side SDP proxy for environments where client → OpenAI direct is blocked.
    - Mirrors the `/v1/realtime/calls` pattern from the docs.

- All calls:
  - Log `{ tenant_id, user_id, mode: "realtime", created_at }` to existing logging system.
  - Enforce auth (only signed-in users, tenant bound).

### 2.2 Frontend

- New **hook**: `useRealtimeAiSHA`
  - Responsibilities:
    - Create and manage `RTCPeerConnection`.
    - Capture mic via `getUserMedia({ audio: true })`.
    - Attach local audio track.
    - Create `DataChannel` `"oai-events"` for events.
    - Handle remote audio track and pipe to hidden `<audio autoplay>` element.
    - State:
      - `isSupported`
      - `isConnecting`
      - `isConnected`
      - `isListening`
      - `error`
    - API:
      - `connectRealtime(options)` → establishes session:
        - Fetches `/api/ai/realtime-token`.
        - Performs WebRTC offer/answer with `EPHEMERAL_KEY`.
      - `sendUserMessage(text)`:
        - Sends `conversation.item.create` event over data channel.
        - Also emits a local “user message” into AiSidebar transcript.
      - `disconnectRealtime()`:
        - Closes PC/data channel, stops tracks, clears flags.

- **AiSidebar integration**
  - Add a **Realtime toggle** (Phase name: RT-UI):
    - “Talk to AiSHA (realtime)” button or switch.
    - When toggled on:
      - Calls `connectRealtime`.
      - Shows **LIVE** indicator.
      - Mic is “open” for conversation (press-to-connect, not always-on eavesdrop).
    - When toggled off:
      - Calls `disconnectRealtime`.
      - Falls back to existing text + STT/TTS pipeline.

  - Transcript:
    - Reuse existing message list structure where possible.
    - Map server events to transcript entries:
      - When we send `conversation.item.create` (user), add message bubble.
      - When we receive assistant messages/events, convert to assistant bubbles.
    - If needed, maintain a simple local “sessionId” for grouping.

- **Safety alignment**
  - Realtime session instructions must mirror:
    - BRAID_SYSTEM_PROMPT CRM rules.
    - Brain Ph1 modes: **read_only / propose_actions** only.
  - No delete/update calls via realtime; any “do X in CRM” should still route through existing Brain APIs (future phase). For this phase, realtime is **assistant + insight layer**, not executor.

---

## 3. Work Breakdown

### 3.1 Backend Tasks

**RT-BE-001 – Realtime token endpoint**

- Add `backend/routes/aiRealtime.js`:
  - `GET /api/ai/realtime-token`
  - Steps:
    1. Resolve tenant + user from request (same helper as other AI routes).
    2. Build session config JSON:
       - `type: "realtime"`, `model: "gpt-realtime"`.
       - `audio.output.voice` default.
       - `instructions` including:
         - Tenant name/slug.
         - “Read-only / propose-actions only” rule.
         - No deletes or destructive actions.
    3. Call `POST /v1/realtime/client_secrets` with server OpenAI key.
    4. Return `{ value, expires_at }` or 5xx on error.
  - Add environment docs:
    - `OPENAI_REALTIME_MODEL` (optional).
    - Reuse `OPENAI_API_KEY`.

**RT-BE-002 – Wire router into ai.js**

- Import router and mount under `/api/ai`.
- Ensure CORS / auth settings match other AI routes.

**RT-BE-003 – Logging & safety**

- Log every token mint:
  - `tenant_uuid`, `tenant_slug`, `user_id`, `ip`, `user_agent`, `expires_at`.
- Ensure requests require auth token/session cookie (no anonymous).

---

### 3.2 Frontend Tasks

**RT-FE-001 – Hook: useRealtimeAiSHA**

- New file: `src/hooks/useRealtimeAiSHA.js` (or `.ts` if repo is ready).
- Implement:
  - Internal `pcRef`, `dcRef`, `audioElementRef`.
  - `connectRealtime()`:
    - Guard against double-connect.
    - Fetch `/api/ai/realtime-token`.
    - Create `RTCPeerConnection`.
    - Attach local mic track.
    - Create data channel `"oai-events"`.
    - Create offer → POST to `https://api.openai.com/v1/realtime/calls` (with EPHEMERAL_KEY) OR (if using server proxy) to `/api/ai/realtime-session`.
    - Apply remote answer.
    - Set `isConnected = true`, `isListening = true`.
  - `sendUserMessage(text)`:
    - Send `conversation.item.create` JSON as per docs.
    - Handle case where `dc` not ready (no-op with error).
  - `disconnectRealtime()`:
    - Close PC, DC, stop tracks, reset flags.
  - Expose:
    - `{ isSupported, isConnecting, isConnected, isListening, error, connectRealtime, sendUserMessage, disconnectRealtime }`.

**RT-FE-002 – Integrate with AiSidebar**

- Modify `AiSidebar.jsx`:
  - Import `useRealtimeAiSHA`.
  - Add realtime toggle button in header/footer:
    - Show status: “Realtime OFF / ON (LIVE)”.
  - When realtime ON:
    - On sending messages from input:
      - Use `sendUserMessage` instead of existing REST flow.
      - Still render text message locally.
    - Listen to incoming data channel messages:
      - For now, log to console and map any assistant messages into transcript.
  - When realtime OFF:
    - Existing text/STT pipeline behaves exactly as before.

- Update transcription UI:
  - If realtime is ON:
    - Keep input box for fallback text, but primary interaction is voice.
  - Ensure existing mic/ElevenLabs buttons remain (for non-realtime mode).

**RT-FE-003 – Realtime indicator**

- New component: `src/components/ai/RealtimeIndicator.jsx`
  - Simple “LIVE” pill with pulsing dot.
  - Props: `{ active: boolean }`.

**RT-FE-004 – State & safety integration**

- In `useAiSidebarState` (or equivalent):
  - Add “mode” flag: `"text" | "realtime"`.
  - Ensure messages from realtime and from traditional pipeline share a unified transcript model.
  - Do **not** bypass existing destructive-command filters; if we later wire realtime → Brain, it must still pass through intent filters.

---

## 4. Testing & Verification

**RT-TEST-001 – Backend**

- Manual curl:
  - `GET /api/ai/realtime-token` as authenticated user.
  - Confirm `{ value, expires_at }` shape.
  - Confirm logs written.

**RT-TEST-002 – Browser happy path**

1. Enable realtime toggle in AiSidebar.
2. Browser prompts for mic access; connection succeeds.
3. Speak: “Hi AiSHA, summarize my open opportunities.”
4. Hear spoken answer; transcript shows AiSHA reply.

**RT-TEST-003 – Error handling**

- No mic permission:
  - Show explicit error.
- Token failure (5xx):
  - Show “Unable to start realtime session” and fall back to normal chat.
- Disconnect from network:
  - Realtime indicator turns off; user can reconnect.

**RT-TEST-004 – Isolation / safety**

- Confirm no OpenAI secret key appears in browser dev tools.
- Confirm `EPHEMERAL_KEY` has short lifetime (from API response).
- Confirm session uses instructions forbidding destructive CRM actions.

---

## 5. Rollout

- **Feature flag** `AI_REALTIME_ENABLED`:
  - Dev: ON
  - Staging: ON (limited testers)
  - Prod: OFF until verification checklist is signed.

- Once stable:
  - Update marketing copy:
    - “Talk to AiSHA in realtime.”
  - Update in-app onboarding to highlight the new “Realtime Voice” mode.

---

## Completed Goals



### PH2C-VOICE-001 – Auto-Send Voice Transcripts

**Status:** Complete ✅ (validated via `useSpeechInput` + `AiSidebar.voice` vitest suites)  
**Area:** Frontend (AI sidebar, speech input hook)

**Problem**

Current behavior:
- Mic → STT → transcript draft → user must manually review + press Send.

Target behavior:
- Mic → STT → **final transcript is immediately sent** as a message.
- User sees their voice message appear in the sidebar like any typed message.

**Files to inspect/modify**

- `src/components/ai/useSpeechInput.js`
- `src/components/ai/useAiSidebarState.jsx`
- `src/components/ai/AiSidebar.jsx`
- `src/components/ai/__tests__/useSpeechInput.test.jsx`
- `src/components/ai/__tests__/AiSidebar.voice.test.jsx` (or equivalent)

**Implementation outline**

1. **Hook callback**
   - Update `useSpeechInput` to accept an optional `onFinalTranscript(text)` callback.
   - When STT finishes and returns final text, call `onFinalTranscript` (if provided).

2. **Auto-send wiring**
   - In `AiSidebar.jsx`, initialize `useSpeechInput({ onFinalTranscript })`.
   - In `onFinalTranscript`, call:
     - `sendMessage(text, { origin: 'voice', autoSend: true })`.
   - Remove/disable any “voice draft” review UI.

3. **State + UX**
   - `sendMessage` should:
     - Immediately append a local “user” bubble so the transcript appears right away.
     - Then call `processChatCommand` as today.
   - Ensure mic/transcribing state is shown but does not require extra clicks.

4. **Voice safety**
   - Keep destructive-phrase guard:
     - If transcript matches unsafe phrases (e.g. “delete all contacts”, “wipe everything”), do **not** auto-send.
     - Instead, show a warning and optionally drop the transcript or require manual re-try.

**Acceptance**

- Speaking into mic results in:
  - Final transcript automatically appearing as a user message.
  - Assistant response returned through the existing chat pipeline.
- Destructive commands spoken by voice are blocked, not auto-sent.
- Tests cover:
  - `onFinalTranscript` firing.
  - Voice-origin messages calling `sendMessage` with `{ origin: 'voice', autoSend: true }`.

---

### PH2C-VOICE-002 – Auto-Play Assistant Replies (Optional)

**Status:** Complete ✅ (auto-play hooked into `useSpeechOutput`, covered in `AiSidebar.voice` tests)  
**Area:** Frontend (speech output hook, sidebar UI)

**Goal**

When a message originated from voice (`origin: 'voice'`) and TTS is available, optionally auto-play assistant replies.

**Files**

- `src/components/ai/useSpeechOutput.js`
- `src/components/ai/AiSidebar.jsx`
- `src/components/ai/useAiSidebarState.jsx`
- `src/components/ai/__tests__/useSpeechOutput.test.jsx`

**Implementation outline**

- When a new assistant message arrives for a voice-origin turn:
  - Optionally call `speakText(responseText)` via `useSpeechOutput`.
  - Provide a way to stop playback from the UI (existing Listen button can double as stop).

**Acceptance**

- Voice conversation feels “phone-like” when enabled, but can be disabled later without breaking text UX.

---

### PH2C-VOICE-003 – Voice UX & Safety Polish

**Status:** Complete ✅ (press-to-talk UX + safety note/live warnings shipped)  
**Area:** Frontend only

**Goal**

Ensure users clearly understand that:

- Voice transcripts are treated exactly like text messages.
- Safety rules apply equally to voice and text.

**Tasks**

- Ensure a small, persistent note in AiSidebar like:
  > “Voice commands are treated the same as typed messages. Destructive operations are blocked or require explicit confirmation.”
- Make sure any error states (no STT key, network error, blocked phrase) show clear, non-technical messages.

---

## Testing & Validation

Manual:

- Start mic, speak a normal CRM request (e.g., “Show me all open leads from this week.”):
  - Transcript appears immediately as a user bubble.
  - Assistant responds via text.
  - (Optional) voice output plays automatically.
- Speak a destructive phrase (e.g., “Delete all contacts for this tenant”):
  - No message is sent.
  - A clear safety warning appears.

Automated:

- `npx vitest run src/components/ai/__tests__/useSpeechInput.test.jsx`
- `npx vitest run src/components/ai/__tests__/AiSidebar.voice.test.jsx`
- `npx vitest run src/components/ai/__tests__/useSpeechOutput.test.jsx`

---

## Status

- PH2C-VOICE-001: Active (Phase 2C kicked off Dec 1, 2025)  
- PH2C-VOICE-002: Complete ✅  
- PH2C-VOICE-003: Complete ✅





# Phase 2C – Speech Layer (Voice Input + Output) 

Type: feature  
Title: Add safe voice input/output to AiSHA assistant sidebar

Description:  
Extend the existing conversational sidebar so users can talk to AiSHA and optionally listen to its replies. All voice commands must flow through the existing Phase 2B intent engine and **MUST NOT** bypass safety modes (`read_only` / `propose_actions`) or introduce any autonomous `apply_allowed` paths.

Primary TTS provider: **ElevenLabs** (for assistant voice output).  
Primary STT provider: OpenAI Whisper (or existing Audio API) for transcription.

---

## Execution Rules (Critical)

Do NOT:

- Add any new write paths or bypass `processChatCommand`.
- Call Braid / Brain endpoints directly from audio components.
- Introduce `apply_allowed` mode or delete operations.
- Auto-submit voice commands without showing the transcript to the user first.

You MAY:

- Add a microphone control to the existing AiSidebar UI.
- Add TTS playback controls for assistant replies.
- Add small UX tweaks in the sidebar to support voice (icons, labels, hints).

Every voice command must:
1. Be transcribed to visible text.
2. Go through `processChatCommand` (Phase 2B pipeline).
3. Respect existing routing + safety logic.

---

```

### PH2C-SPEECH-001 – Voice Input (STT) Integration

Area: Frontend only (AiSidebar + AI hooks)

Goal:  
Allow users to press and hold (or click) a microphone button to record audio, send it to STT, then inject the transcribed text into the sidebar input box.

Steps:

- Add a mic button to `AiSidebar.jsx`:
  - Visible near the text input.
  - States: idle, recording, processing, error.
- Implement `useSpeechInput` hook:
  - Uses Web Audio / MediaRecorder to capture microphone audio.
  - Sends audio blob to STT endpoint:
    - Either OpenAI Whisper (backend `/api/ai/speech-to-text`) or a dedicated audio route.
  - Returns `{ transcript, isRecording, isTranscribing, error }`.
- UX rule:
  - Do NOT auto-send; place transcript in the existing input field and let the user hit “Send”.
  - If STT fails, show a small inline error and keep any partially captured text (if available).

Scope:

- No backend changes beyond a single STT proxy route (if not already present).
- No changes to `processChatCommand` logic.

Acceptance:

- User can:
  - Click/hold mic → speak → see text appear in input.
  - Edit transcript before sending.
- No request is sent to `/api/ai/chat` or `/api/ai/brain-test` until user explicitly hits Send.

---

### PH2C-SPEECH-002 – Voice Output (ElevenLabs TTS) Integration

Area: Frontend + small backend proxy for ElevenLabs

Goal:  
Let users optionally listen to AiSHA’s responses using ElevenLabs.

Steps:

- Backend:
  - Add `/api/ai/tts` route that:
    - Validates `text` payload length and tenant/user context.
    - Uses `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` to call ElevenLabs TTS.
    - Returns an audio stream or base64 audio.
  - Add env docs in `.env.example`:
    ```env
    # ElevenLabs TTS
    ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
    ELEVENLABS_VOICE_ID=default_or_custom_voice_id
    ```
- Frontend:
  - Add a “speaker” icon per assistant message in `AiSidebar.jsx`.
  - Implement `useSpeechOutput` hook:
    - Calls `/api/ai/tts` with the assistant message text.
    - Plays back audio via `Audio` element or Web Audio API.
    - Handles states: loading, playing, error, cancel.
  - Preserve messages exactly; do not mutate content for TTS.

Scope:

- No changes to how assistant text is generated (still via `processChatCommand` → backend).
- TTS is purely a presentation layer.

Acceptance:

- Clicking the speaker icon:
  - Triggers a TTS call.
  - Plays the correct message audio.
  - Shows a minimal playback state (e.g., spinner or “Playing…”).
- Errors are handled gracefully (inline message, no crashes).

---

### PH2C-SPEECH-003 – Voice Safety & UX Guardrails

Area: Frontend (AiSidebar + hooks) + minimal backend validation

Goal:  
Ensure voice interaction remains safe, predictable, and doesn’t accidentally trigger risky commands.

Steps:

- UX:
  - Default to **push-to-talk** or explicit “Start/Stop recording” button.
  - Show the recognized text clearly before sending.
  - Add a small note in sidebar: “Voice commands go through the same assistant as text.”
- Safety checks on transcript:
  - Before sending transcript to `processChatCommand`, run a cheap local filter:
    - If it looks like “delete all …”, “wipe …”, “remove everything”, etc., show a confirmation dialog or refuse with a warning.
  - Even if user confirms, the backend still blocks deletes via Phase 1 policies.
- Logging:
  - Tag voice-originated messages in metadata (e.g. `origin: "voice"`).
  - Ensure logs don’t store raw audio, only text + context.

Scope:

- Frontend-only logic plus minor metadata changes in existing request payloads.
- No new backend capabilities for writes.

Acceptance:

- Voice-originated messages:
  - Are clearly marked in logs/metadata.
  - Still respect `read_only` / `propose_actions` mode.
  - Cannot bypass the no-delete guarantee.

---

## Testing & Validation Requirements

Manual checks:

- Voice input:
  - Mic → speak → transcript appears in input field.
  - User must click “Send” to actually submit.
- Voice output:
  - Click speaker icon → assistant message is spoken with ElevenLabs voice.
  - Network errors degrade gracefully (no crashes, clear message).
- Safety:
  - Obvious destructive phrases are flagged before send.

Automated:

- Unit tests for:
  - `useSpeechInput` (mock STT API).
  - `useSpeechOutput` (mock TTS API).
  - Safety filter for transcripts.
- Regression:
  - Existing Phase 2A/2B tests still pass.

---

## Status

- PH2C-SPEECH-001: Not started  
- PH2C-SPEECH-002: Not started  
- PH2C-SPEECH-003: Not started  

---

## Usage Instructions for AI Tools (Copilot / Orchestrator)

When working on Phase 2C:

1. Read `.github/copilot-instructions.md`.
2. Read `orchestra/PLAN.md` (especially Phase 2B + Phase 2C sections).
3. Read existing conversational files:
   - `AiSidebar.jsx`
   - `useAiSidebarState.jsx`
   - `processChatCommand.ts`
   - `intentClassifier.ts`
4. Work ONLY on PH2C tasks:
   - PH2C-SPEECH-001, then 002, then 003.
5. Do NOT:
   - Introduce `apply_allowed` mode anywhere.
   - Add delete operations.
6. Keep changes small, logged, and covered by basic tests.



## Phase 2B – Conversational Engine & Intent Layer (Completed)

Objective:
Transform the sidebar into a full AI command interface that can interpret natural language and translate it into structured CRM intents — without executing writes. This bridges Phase 2A (UI) into Phase 3 (autonomous operations).

Constraints:
- No backend schema changes.
- No modification to aiBrain.ts beyond adding a safe "intent_only" taskType wrapper.
- No new write endpoints.
- Must use only read-only/propose-actions modes.
- Must maintain a safe, reversible UI-only layer.
- Follow `orchestra/PLAN_PHASE2A_CONVERSATIONAL_CORE.md` and Phase 2 global PLAN.

Deliverables:
1. NLU Intent Classifier (client-side, deterministic)
   - Map natural language → { intent, entity, filters }
   - Example intents: “show leads”, “summaries”, “forecast”, “activities due today”
   - Implement as `src/ai/nlu/intentClassifier.ts`
   - Zero backend dependency.

2. Command Router
   - Routes `{intent, entity}` →:
     - `/api/ai/chat` (raw query), OR
     - `/api/ai/brain-test` (read_only), OR
     - local UI action (scroll, filter, open record)
   - File: `src/ai/engine/commandRouter.ts`

3. Prompt Orchestration Layer
   - Wraps the chat prompt so requests become:
     - “User intent: X”
     - “Target entity: Y”
     - “Context: Z”
   - Ensures AiSHA stays in safe modes.
   - File: `src/ai/engine/promptBuilder.ts`

4. Sidebar Integration
   - AiSidebar calls `processChatCommand(text)`
   - That function:
     - Runs intent classifier
     - Calls command router
     - Updates transcript

5. Optional Enhancements
   - Quick action chips: “Show leads”, “View pipeline”, “My tasks”
   - CRM-specific autocomplete (Phase 3)

Tests:
- `intentClassifier.test.ts` (classification)
- `commandRouter.test.ts` (routing)
- e2e: user → sidebar → output

Acceptance Criteria:
- Natural language becomes structured intent.
- Intent becomes either:
  - AI read-only response
  - AI propose-actions preview
  - UI navigation helper
- No writes occur.
- No backend regressions.

Status: **Complete ✅** – intent classifier, prompt builder, command router, and sidebar integration are in place for PH2B. Core unit tests pass.

Verification Notes (Nov 30, 2025):
- Ran targeted Phase 2B tests: `src/ai/nlu/intentClassifier.test.ts` and `src/ai/engine/commandRouter.test.ts`.
- Results: 2/2 files passed, 7/7 tests passed.
- Scope: Verified NLU→Router→Prompt orchestration in read_only/propose_actions; no writes performed.

Documentation Update (Nov 30, 2025):
- Marked Phase 2B as Completed in this plan.
- Guardrails remain tracked below as follow-up hardening tasks.

Pending: **Guardrails + regression tests** to ensure production readiness and safety coverage.
Planned guardrails:
- Enforce `mode` to `read_only` or `propose_actions` at router boundary.
- Validate `tenantId` presence and UUID format before routing.
- Add negative tests (write intents rejected, unsafe commands blocked).

---

## Phase 2A – Conversational Core (Completed)

Phase 2A has been completed for the initial scope: UI drawer and baseline chat wiring. The assistant panel is a right-side drawer (420px), toggled by the avatar, and calls `/api/ai/chat` in read-only/propose-actions modes. Remaining intents/forms/voice are deferred.

Reference full scoped plan in `orchestra/PLAN_PHASE2A_CONVERSATIONAL_CORE.md`.

Completed in Phase 2A:
- PH2A-CORE-001 (AI Assistant Panel UI)
- PH2A-CORE-002 (Basic Chat Wiring)

Deferred:
- PH2A-CORE-003 (Intent Mapping Layer)
- PH2A-CORE-004 (Conversational Forms – propose only)
- PH2A-CORE-005 (Voice Input – speech-to-text)

---

## Current Goal

Type: feature (internal)  
Title: Promote Braid MCP + OpenAI into the official AiSHA “Brain” layer

Description:  
We already have OpenAI integrated with the Braid MCP server and CRM CRUD tools (no delete). The goal of this phase is to:

- Understand the goal in docs/AI_BRAIN.md
- Learn the the phases in orchestra\phases and use in conjuntion with this plan
- Wrap that capability in a single `aiBrain` module in the backend.
- Define a clear input/output schema for all AI tasks.
- Route all future AI features through this Brain interface.


** No new user-visible features in this phase; this is a structural upgrade.

---

## Execution Rules

- Do NOT change existing REST/CRUD behavior.
- Do NOT introduce autonomous writes yet.
- Only add:
  - AI brain wrapper module.
  - Documentation.
  - A small internal API for experimentation.

---



### BRAIN-001 – Document the AI Brain

Area: Architecture / Docs

Steps:
- Create `docs/AI_BRAIN.md` describing:
  - Brain implementation: OpenAI + Braid MCP + CRM tools (no delete).
  - Task input schema (task_type, tenant_id, user_id, context, mode).
  - Result schema (summary, insights, proposed_actions, requires_confirmation).
- Link this doc from `ARCHITECTURE.md`.

Acceptance:
- AI Brain is referenced as a first-class component in docs.
- Input/output schema is stable enough to implement.

---

### BRAIN-002 – Implement aiBrain module (wrapper around MCP)

Area: Backend

Steps:
- Add `backend/src/ai/aiBrain.ts` (or equivalent) with:
  - `runTask({ tenantId, userId, taskType, context, mode })`.
  - Internal call to the existing OpenAI+Braid MCP setup.
  - Enforcement of “no delete” policy at the module boundary (defensive).
- Ensure **no other backend code calls MCP directly**; they must go through `aiBrain`.

Acceptance:
- Single entrypoint for all future AI features: `aiBrain.runTask`.
- No new behavior changes; only refactor MCP usage to go through this module.

---

### BRAIN-003 – Add internal API endpoint for Brain experiments

Area: Backend API

Steps:
- Add an internal-only endpoint, e.g. `POST /api/internal/ai/brain-test`:
  - Accepts: `taskType`, `context`, `mode`.
  - Calls `aiBrain.runTask`.
  - Returns Brain output as JSON.
- Protected by:
  - Internal flag, or
  - Admin-only access.

Acceptance:
- You can hit a single endpoint to:
  - Exercise the Brain over live data.
  - Inspect structured AI outputs without UI changes.

---

## Testing & Validation

- Manual:
  - Call `/api/internal/ai/brain-test` with:
    - Task: summarize tenant’s open leads.
    - Task: propose follow-ups for one account.
  - Confirm:
    - Responses respect tenant boundaries.
    - No delete operations are included in proposed actions.

- Structural:
  - Search codebase to ensure:
    - MCP / OpenAI is invoked only inside `aiBrain` (except legacy code you intentionally leave alone but mark as deprecated).

---

## Status

All Brain Phase 1 tasks are complete (see Completed Tasks section below).




## Execution Rules (Critical)

Mode: BUGFIX ONLY

Do NOT:
- Redesign auth or tenant architecture.
- Change routing structure globally.
- Add new dashboard features or widgets.
- Introduce new dependencies for state management.

Allowed only when strictly necessary:
- Minimal changes to backend auth checks for dashboard-related endpoints.
- Minimal changes to frontend guards to handle auth failures more gracefully.
- Performance optimizations focused on dashboard APIs and their immediate consumers.

Every change must:
- Be small and justified.
- Include clear explanation of root cause.
- Include tests or at least a reproducible manual verification path.

---

## Active Tasks

### BUG-AI-001 – Fix Braid snapshot tool tenant propagation

**Status**: Complete ✅ (v2.0.1, December 1, 2025)  
**Priority**: Medium  
**Area**: AI Routes / Braid Tool Integration

**Goal**:  
Fix `/api/ai/snapshot-internal` endpoint to properly resolve tenant context so Braid tools can fetch CRM data.

**Resolution Summary**:
- Added tenant resolution to snapshot endpoint using canonical resolver with PGRST205 handling
- Flattened accounts schema to align dev database with production (phone, email, assigned_to, address fields)
- Updated 30+ test files from legacy slug "local-tenant-001" to UUID format "a11dfb63-4b18-4eb8-872e-747af2e37c46"
- Removed description field from accounts routes (unstructured data belongs in metadata JSONB)
- Validated end-to-end: AI assistant successfully retrieves CRM data via Braid tools

**Implementation Details**:
1. **Tenant Resolution** (backend/routes/ai.js lines 920-946):
   - Extract tenant from `x-tenant-id` header or `tenant_id` query parameter using `getTenantId()`
   - Call `resolveCanonicalTenant()` with PGRST205 error handling
   - Map to flat `tenantRecord` format: `{ id: uuid, tenant_id: slug, source, found }`
   - Validation guard: return 400 if `!tenantRecord?.id`
2. **Schema Alignment** (APPLY_ACCOUNTS_FLATTEN.sql):
   - Added contact fields: phone (TEXT), email (TEXT), assigned_to (TEXT)
   - Added address fields: street, city, state, zip, country (all TEXT)
   - Added employee_count (INTEGER)
   - Created indexes: idx_accounts_phone, idx_accounts_email, idx_accounts_assigned_to, idx_accounts_city, idx_accounts_employee_count
3. **Test Data Consistency** (30+ files):
   - Updated E2E tests: tests/e2e/helpers.ts (TENANT_ID constant), auth.setup.js, all spec files
   - Updated backend tests: backend/test/*.test.js (8 files)
   - Updated utility scripts: seed-test-data.js, seed-won-deals.js, test-activities.js, etc.

**Verification**:
- Created test account: `POST /api/accounts` → 201 with flattened fields populated
- Snapshot query: `GET /api/ai/snapshot-internal` → 200 with account data (phone, email, assigned_to, city, state)
- AI chat test: "Get phone and email for Furst Neulead" → Successful response with contact details
- Tool execution: `fetch_tenant_snapshot` returned `{"tag":"Ok"}` with CRM data

**Files Modified**:
- `backend/routes/ai.js` - tenant resolution for snapshot endpoint
- `backend/lib/tenantCanonicalResolver.js` - PGRST205 error handling
- `backend/routes/accounts.js` - removed description field (4 locations)
- `backend/migrations/APPLY_ACCOUNTS_FLATTEN.sql` - schema migration
- 30+ test files - UUID tenant format update

**Git Operations**:
- Commit: 701d1b9 (40 files changed, +619/-191 lines)
- Tag: v2.0.1
- Pushed: December 1, 2025

---

## CRUD Health Tests

### BUG-CRUD-001 – Auth failures for CRUD health tests (Contacts, Leads, Accounts, Lists)

Status: Complete ✅  
Priority: High  
Area: Core API – Contacts / Leads / Accounts / Listing

Symptoms (from automated tests):
- CRUD Operations – Contact:
  - Create: `Error: Create should succeed (status: 401)`
  - Read: `Error: Contact ID from create test should exist`
  - Update: `Error: Contact ID from create test should exist`
  - Delete: `Error: Contact ID from create test should exist`
- CRUD Operations – Lead:
  - Create: `Error: Create should succeed (status: 401)`
  - Read/Update/Delete: `Error: Lead ID from create test should exist`
- CRUD Operations – Account:
  - Create: `Error: Create should succeed (status: 401)`
  - Read/Update/Delete: `Error: Account ID from create test should exist`
- CRUD Operations – List with Filters:
  - `Error: List should succeed (status: 401)`

Interpretation:
- All create operations for Contacts, Leads, and Accounts are returning HTTP 401 (Unauthorized) in the health test context.
- All read/update/delete failures are cascading from the missing ID (because create never succeeded).
- List-with-filters endpoint also returns 401, indicating the same auth problem.

Suspected Causes:
- The health test runner (or MCP/Braid test suite) is not authenticated correctly:
  - Missing or invalid auth token/cookie for API calls.
  - Using a user or service account that lacks the required CRM permissions.
- CRUD endpoints may be using stricter or different auth middleware compared to other endpoints that are passing.
- Possible mismatch between “normal app” auth flow and “health test” auth flow.

Notes:
- Fix must NOT weaken security or make CRUD endpoints publicly accessible.
- The goal is to:
  - Ensure health tests use a proper authenticated context (service account or test user).
  - Ensure CRUD endpoints honor that authenticated context consistently.

Resolution (Completed):
- **Root Cause:** Browser-based tests used unauthenticated `fetch()` calls against production-mode backend
- **Fix:** Added Supabase auth to all CRUD test fetch calls via `getAuthHeaders()` helper
- **Changes:** Updated `src/components/testing/crudTests.jsx` with auth headers + credentials for 14 fetch calls
- **Impact:** Tests now authenticate like production app; no security weakening; validates full auth flow




# AiSHA CRM – Orchestra Plan (Platform Health & MCP/Braid Integrations)

## Current Goal

Type: bugfix  
Title: Stabilize core API reliability and MCP/Braid integrations

Description:  
Focus on fixing critical platform health issues detected in Settings/health tests:
- Core tenant/employee/leads APIs failing (fetch errors, auth errors).
- Braid MCP server and n8n integrations unreachable.
- Elevated API error rate (~10%).
- Health issue reporter behaving unreliably.
- Tenant resolve cache currently ineffective.

No new features in this phase. Only targeted reliability, auth, connectivity, and performance fixes.

---

## Execution Rules (Critical)

Mode: BUGFIX ONLY

Do NOT:
- Redesign entire auth or tenant architecture.
- Introduce new external services or queues without necessity.
- Add new product features or expand API surface.

Allowed only if strictly required:
- Minimal changes to auth middleware or token handling.
- Minimal wiring fixes between services (hostnames, ports, TLS).
- Adding logging, metrics, or small caching where needed to stabilize behavior.

Every change must:
- Be as small and localized as possible.
- Be tied to a specific BUG ID.
- Include a verifiable test or monitored metric that confirms improvement.

---

## Active Tasks (Priority Order)

### BUG-UI-001 – Fix Blocked IPs page crash

**Status**: Complete ✅
**Priority**: High  
**Area**: Frontend / Settings / Security Monitor

**Goal**:
Fix crash when navigating to Blocked IPs tab in Security Monitor settings page.

**Symptoms**:
- Page crashes with `TypeError: Cannot read properties of undefined (reading 'map')`
- Error at SecurityMonitor.jsx line 499: `idrStatus.blocked_ips.map(...)`
- Blocks access to Blocked IP management functionality

**Root Cause**:
- Guard condition at line 492 doesn't handle case where `idrStatus` exists but `blocked_ips` is undefined
- Current: `!idrStatus || idrStatus.blocked_ips?.length === 0`
- Fails when: `idrStatus = {}` (object without `blocked_ips` property)

**Resolution**:
- Updated guard condition in SecurityMonitor.jsx line 492
- Changed from: `!idrStatus || idrStatus.blocked_ips?.length === 0`
- Changed to: `!idrStatus || !idrStatus.blocked_ips || idrStatus.blocked_ips.length === 0`
- Now properly handles all cases: null idrStatus, undefined blocked_ips, empty array, populated array

**Files Changed**:
- `src/components/settings/SecurityMonitor.jsx`: Fixed guard condition at line 492

**Acceptance Criteria**:
- ✅ Blocked IPs tab loads without JavaScript error
- ✅ Handles all response states gracefully (null, undefined, empty, populated)
- ✅ UI shows appropriate message for each state
- ✅ Minimal, surgical change to guard condition only

---

### BUG-PROD-002 – Diagnose and fix production backend fetch failures

**Status**: Complete ✅  
**Priority**: Critical  
**Area**: Production Backend / Database Connectivity

**Goal**:
Restore production backend connectivity to Supabase database and resolve HTTP 500 errors affecting multiple API endpoints.

**Symptoms**:
- Multiple endpoints returning 500 with "TypeError: fetch failed"
- Affected: `/api/notifications`, `/api/modulesettings`, `/api/system-logs`
- Backend health checks passing (server is running)
- Local development working fine
- Production only (app.aishacrm.com)

**Tasks**:

1. **Investigation Phase (Diagnostic)**:
   - [ ] SSH to production VPS: `ssh beige-koala-18294`
   - [ ] Check production backend logs: `docker logs aishacrm-backend --tail=200 | grep -i error`
   - [ ] Verify Supabase connectivity from VPS: `curl -v https://PROJECT.supabase.co`
   - [ ] Check DNS resolution: `nslookup PROJECT.supabase.co`
   - [ ] Verify production `.env` has correct Supabase credentials
   - [ ] Check Supabase project status in dashboard
   - [ ] Review Supabase logs for rate limiting or errors
   - [ ] Check container resource usage: `docker stats --no-stream`
   - [ ] Verify network connectivity: `docker exec aishacrm-backend ping -c 3 8.8.8.8`

2. **Root Cause Analysis**:
   - [ ] Determine exact failure point (DNS, TLS, connection, timeout)
   - [ ] Check if issue is intermittent or persistent
   - [ ] Verify if started after specific deployment or time
   - [ ] Review recent changes to production environment

3. **Resolution Phase** (based on findings):
   - **If Supabase credentials invalid:** Update production `.env` with correct values
   - **If network/firewall issue:** Configure VPS firewall to allow Supabase traffic
   - **If DNS issue:** Add static DNS entry or fix resolver
   - **If rate limiting:** Contact Supabase support or upgrade plan
   - **If SSL/TLS issue:** Verify `PGSSLMODE=require` or adjust as needed
   - **If connection pool issue:** Tune Supabase client pool settings

4. **Verification**:
   - [x] Test affected endpoints return 200 OK
   - [x] Verify Settings page loads without errors
   - [x] Confirm notifications load correctly

**Resolution (November 29, 2025)**:
- Production backend connectivity restored automatically
- All endpoints returning proper HTTP responses (200, 201, 401)
- Database connection stable: `"database":"connected"`
- Verified via curl tests:
  - `/api/notifications` → 200 OK (empty array)
  - `/api/modulesettings` → 401 (correct auth required)
  - `/api/system-logs` → 201 Created (test log inserted)
  - `/health` → 200 OK (uptime: 21 minutes)
- Issue likely resolved by recent deployment (v1.1.9 or earlier)
- No "TypeError: fetch failed" errors remain
   - [ ] Check error rate drops in monitoring
   - [ ] Ensure no cascading failures

**Acceptance Criteria**:
- `/api/notifications` returns data or empty array (not 500 error)
- `/api/modulesettings` returns module settings successfully
- `/api/system-logs` accepts log entries
- Settings page loads without console errors
- Production error rate returns to normal (<1%)

**Scope Limitations**:
- Do NOT modify application code unless required for connectivity
- Do NOT redesign database schema or queries
- Focus on infrastructure and connectivity fixes only

---

### REF-SERVER-001 – Modularize Backend Server Initialization

**Status**: Complete ✅
**Priority**: High
**Area**: Backend Architecture / Stability

**Goal**:
Refactor `backend/server.js` to reduce complexity and improve maintainability by extracting initialization logic into dedicated modules in `backend/startup/`.

**Tasks**:
1.  ✅ Create `backend/startup/` directory.
2.  ✅ Extract Database initialization to `backend/startup/initDatabase.js`.
3.  ✅ Extract Service initialization (Redis, Cache) to `backend/startup/initServices.js`.
4.  ✅ Extract Middleware configuration to `backend/startup/initMiddleware.js`.
5.  ✅ Update `backend/server.js` to use these new modules.

**Acceptance Criteria**:
-   ✅ `backend/server.js` is significantly smaller and cleaner.
-   ✅ Server starts up correctly with all services (DB, Redis, Middleware) initialized.
-   ✅ No regression in functionality (API endpoints work, logging works).
-   ✅ Tests pass (when server is not already running).

**Resolution**: Completed in v1.0.96. Server successfully refactored into modular startup files.

---

### BUG-PROD-001 – Settings page authentication failure (Production only)

**Status**: Resolved ✅  
**Priority**: Critical  
**Area**: Settings API / Authentication  
**Completion**: November 27, 2025

**Goal**:  
Investigate Settings page error in production returning "Authentication required" instead of module settings.

**Investigation Results**:
- ✅ Cloudflare Tunnel routing verified working: `/api/*` reaches backend
- ✅ Backend health check: `http://localhost:4001/health` returns JSON
- ✅ `/api/modulesettings` endpoint returns JSON (401 auth error), not HTML
- ✅ Settings page successfully makes API calls and receives JSON responses

**Root Cause**:
- Initial report of HTML parse error was either:
  - Transient during Cloudflare Tunnel setup
  - Cached frontend build issue  
  - Specific auth state now resolved
- Current behavior: API routing works correctly, returning proper JSON
- 401 "Authentication required" is expected for unauthenticated/expired sessions

**Resolution**:
- No code or infrastructure changes needed
- Cloudflare Tunnel configuration confirmed working:
  ```yaml
  ingress:
    - hostname: app.aishacrm.com
      path: /api/*
      service: http://localhost:4001
    - hostname: app.aishacrm.com
      service: http://localhost:4000
    - service: http_status:404
  ```
- Settings page already handles 401 errors gracefully via `callBackendAPI` error handling

**Verification**:
```bash
curl https://app.aishacrm.com/api/modulesettings?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46
# Returns: {"status":"error","message":"Authentication required"}
```

**Outcome**: Bug closed - routing works, authentication expected behavior.
   - Check if issue is specific to `/settings` or affects other routes

3. **Resolution Phase**:
   - Fix nginx configuration if routing issue
   - Update frontend API calls if using wrong base URL
   - Ensure backend routes are accessible from production nginx
   - Test fix in staging before production deploy

**Acceptance Criteria**:
- Settings page loads in production without JSON parse error
- API calls return proper JSON responses, not HTML
- Dev and production behavior is consistent
- No regression on other API endpoints

---

### BUG-DB-001 – Missing synchealth table in database schema

**Status**: Open  
**Priority**: Critical  
**Area**: Database Schema / Sync Health Monitoring

**Goal**:  
Resolve the missing `synchealth` table error that is blocking the sync health monitoring endpoint.

**Symptoms**:
- Endpoint: `GET /api/synchealths?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46`
- Error: `Could not find the table 'public.synchealth' in the schema cache`
- Complete failure of sync health monitoring functionality

**Tasks**:
1. **Investigation Phase**:
   - Search for synchealth table migration files in `backend/migrations/`
   - Check if table exists in local/dev Supabase database
   - Review `backend/routes/synchealths.js` for expected schema
   - Determine if this is a missing migration or schema mismatch

2. **Resolution Phase**:
   - Create or apply migration to add `synchealth` table to production
   - Include proper columns, indexes, and constraints
   - Apply RLS policies for tenant isolation
   - Test endpoint after table creation

**Acceptance Criteria**:
- `GET /api/synchealths` returns data or empty array (not schema error)
- Table visible in Supabase Table Editor
- RLS policies enforce tenant isolation
- No impact on existing sync functionality

---

## Usage Instruction for AI Tools

When using Claude, Copilot, or orchestrator:

1. Read `.github/copilot-instructions.md`.  
2. Read `orchestra/ARCHITECTURE.md` and `orchestra/CONVENTIONS.md`.  
3. Read this PLAN and select the highest-priority Active task:

   - Start with **BUG-API-001A (diagnostic)**.

4. For the selected task:
   - State the task ID and title.
   - List the files and services you will inspect.
   - Wait for human approval before making code/config changes.
   - Keep changes minimal and tied to the task’s Acceptance criteria.

---


## Completed Tasks

### BRAIN-001 – Document the AI Brain
Status: Complete ✅  
Area: Architecture / Docs  
Summary: Added `docs/AI_BRAIN.md` defining implementation (OpenAI + Braid MCP + read/create/update tools), input schema (tenant_id, user_id, task_type, context, mode) and output schema (summary, insights, proposed_actions, requires_confirmation). Pending optional cross-link in `ARCHITECTURE.md`.

### BRAIN-002 – Implement aiBrain module (wrapper around MCP)
Status: Complete ✅  
Area: Backend  
Summary: Implemented `backend/lib/aiBrain.js` with `runTask({ tenantId, userId, taskType, context, mode })`. Enforces Phase 1 policies (no delete, no autonomous apply). Centralizes tool invocation; UUID validation and tenant resolution via canonical resolver.

### BRAIN-003 – Add internal API endpoint for Brain experiments
Status: Complete ✅  
Area: Backend API  
Summary: Added protected `POST /api/ai/brain-test` endpoint in `backend/routes/ai.js` requiring `X-Internal-AI-Key`. Routes requests through `aiBrain.runTask` and returns structured Brain output for controlled internal testing.

### 10) BUG-SEC-SUITE-001 – Security & monitoring improvements suite

Type: bugfix suite  
Status: Complete ✅ (v1.1.9, November 29, 2025)  
Area: Security Monitoring / Container Health / Intrusion Detection / Threat Intelligence / UI

Goal:  
Comprehensive fixes for security monitoring, container health checks, IDR functionality, threat intelligence, and UI clarity issues.

Sub-Tasks Completed:

**A) MCP/N8N Container Health Check False Negatives**
- Fixed system.js using wrong service name (`braid-mcp-node-server` vs `mcp`)
- Updated mcpNodeCandidates priority to match Docker Compose service name
- Result: MCP shows Code 200 instead of false Code 0
- File: `backend/routes/system.js` (lines 137-145)

**B) IDR Dashboard Blocked IPs Display**
- Fixed missing `await` in security.js causing Promise to be returned instead of data
- Added comprehensive blocked IPs UI to InternalPerformanceDashboard.jsx
- Implemented unblock functionality with admin controls
- Added IDR whitelist configuration (localhost + Docker networks)
- Files: `backend/routes/security.js` (line 272), InternalPerformanceDashboard.jsx, .env

**C) False Positive Bulk Extraction Alerts**
- Fixed IDR triggering high-severity alerts for high limits with empty results
- Implemented two-tier blocking: 1000-4999 (warn), 5000+ (block)
- Downgraded severity: security_alert→warning, high→medium
- File: `backend/middleware/intrusionDetection.js` (lines 594-630)

**D) External Threat Intelligence Integration**
- Added GreyNoise Community API (free, no key): scanner/bot identification
- Added AbuseIPDB API (1000/day free): abuse confidence scores
- Implemented threat score boosting (+50 malicious, +30 high abuse)
- Optional enrichment via `?enrich=true` query parameter
- File: `backend/routes/security.js` (lines 1-110, 405-525)

**E) Duplicate "Security" Tabs Renamed**
- Renamed "Security" → "Auth & Access" (Lock, purple)
- Renamed "Security" → "Intrusion Detection" (Shield, red)
- File: `src/pages/Settings.jsx` (lines 165, 178)

Acceptance (All Met):
- ✅ Container health checks accurate
- ✅ Blocked IPs visible and manageable in dashboard
- ✅ False positive alerts eliminated
- ✅ External threat intelligence integrated
- ✅ Settings tabs clearly distinguished

Builds: Backend 4x (18-30s), Frontend 2x (45-110s)

---


### 1) BUG-API-001A – Diagnose tenant/employee fetch failures

Type: bugfix  
Status: Complete ✅  
Area: Core API – tenants and employees

Goal:  
Find out why `GET /api/tenants/<tenant-id>` and `GET /api/employees?tenant_id=<tenant-id>` are failing with `TypeError: fetch failed` for user `abyfield@4vdataconsulting.com`.

Steps:
1. Reproduce the failure path:
   - Same tenant ID: `a11dfb63-4b18-4eb8-872e-747af2e37c46`.
   - Same or similar user context.
2. Inspect:
   - Frontend/API caller for these endpoints.
   - Backend route handlers and any upstream services they depend on.
   - Network/proxy/TLS configuration between caller and backend.
3. Determine exact nature of “fetch failed”:
   - DNS/host resolution?
   - TLS error?
   - Connection reset/refused?
   - Misconfigured base URL?

Scope:
- Diagnostics only (logging, tracing).
- No behavior changes yet.

Acceptance:
- Clear root cause explanation for the fetch failures.
- List of exact files/services to be changed in the fix phase BUG-API-001B.

---

### 2) BUG-API-001B – Fix tenant/employee fetch failures

Type: bugfix  
Status: Complete ✅  
Area: Core API – tenants and employees
Resolution: v1.0.74 (APP_BUILD_VERSION runtime injection via env-config.js)

Goal:  
Implement minimal changes so that tenant and employee endpoints no longer produce `TypeError: fetch failed`, and instead behave like normal authenticated/unauthenticated HTTP endpoints.

Steps:
1. Apply connectivity/config fixes identified in BUG-API-001A:
   - Correct base URL, host, or protocol if required.
   - Fix any reverse proxy or container networking issues.
2. Ensure:
   - Valid requests succeed.
   - Invalid/unauthorized requests return explicit HTTP errors (401/403/404), not fetch-level failures.
3. Remove any temporary debug-only logging not needed for normal operation.

Scope:
- Only relevant backend/API config and caller logic for tenants/employees.
- No broad auth system redesign.

Acceptance:
- No `TypeError: fetch failed` for the monitored endpoints under normal operation.
- Health checks for tenant/employee endpoints pass consistently.

---

### 3) BUG-API-002 – Fix false "Authentication required" on leads endpoint

Type: bugfix  
Status: Resolved ✅ (No longer occurring)
Area: Leads API / Auth

Goal:  
Ensure that `GET /api/leads?tenant_id=<tenant-id>` behaves consistently with other authenticated endpoints and does not return `Authentication required` for valid sessions.

Resolution:
- Authentication issue resolved as part of BUG-API-001B fixes
- New issue discovered: generateUniqueId console warnings in production
- See BUG-API-003 for follow-up

Steps:
1. Compare auth middleware for:
   - `/api/leads`
   - `/api/tenants`
   - `/api/employees`
2. Check:
   - How tokens/cookies are passed from frontend to leads endpoint.
   - Whether tenant-based permission checks are aligned for leads.
3. Apply minimal fix:
   - Align auth handling with the working endpoints.
   - Do NOT weaken security; only correct false negative auth decisions.

Scope:
- Leads endpoint handler(s).
- Any specific auth middleware/guards applied to leads.

Acceptance:
- Leads endpoint returns data for authenticated, properly-permitted users.
- Unauthorized access still returns `Authentication required` or appropriate code.
- Monitoring no longer shows auth warnings for valid sessions.

---

### 4) BUG-API-003 – Add backend endpoint for generateUniqueId

Type: bugfix  
Status: Complete ✅
Resolution: v1.0.75 (backend endpoint + frontend integration)
Area: Leads/Contacts/Accounts - Unique ID generation

Goal:
Stop console warnings in production: "Function 'generateUniqueId' not available. Use backend routes."

Resolution:
- Created POST /api/utils/generate-unique-id endpoint
- Generates format: L-YYYYMMDD-RANDOM (e.g., L-20251126-6BD0C6)
- Updated src/api/functions.js to call backend in production
- Supports Lead, Contact, Account, Opportunity entity types
- No console warnings when creating entities

Files Changed:
- backend/routes/utils.js: Added generate-unique-id endpoint
- src/api/functions.js: Added production mode handler for generateUniqueId
- orchestra/PLAN.md: Documented issue and resolution

Testing:
- Backend endpoint verified with curl
- Frontend build successful
- Local Docker containers tested
- Deployed to production in v1.0.75

---

### 5) BUG-MCP-001 – Restore MCP/Braid and n8n reachability

Type: bugfix  
Status: Complete ✅ (v1.0.87–v1.0.90)  
Area: Integrations – Braid MCP / n8n

Goal:  
Make `mcp-node`, `n8n-proxy`, and `n8n` reachable again and restore MCP test suite to a passing or mostly-passing state.

Resolution:
- Production compose uses internal service URL `http://mcp:8000` for backend (`BRAID_MCP_URL`, `MCP_NODE_HEALTH_URL`).
- Backend `/api/mcp/health-proxy` fixed with timeout, payload validation, and multi-candidate attempts. Enhanced diagnostics added.
- GitHub Actions deployment injects `GITHUB_TOKEN` to prod `.env`; MCP container recreated when token is present.
- MCP monitor shows all green in production; validation issues created and confirmed: `#60` (dev), `#61` (prod), `#62` (post v1.0.90 deploy).
- Direct prod curl to `/api/mcp/health-proxy` returns `reachable: true`, `url: http://mcp:8000/health`, low latency.

Acceptance:
- MCP and n8n containers healthy under `docker compose ps`.
- MCP health suite and monitor green; health-proxy reachable with diagnostics.

---

### 6) BUG-INT-001 – Stabilize GitHub health issue reporter

Type: bugfix  
Status: Complete ✅ (v1.0.91)  
Area: Integrations – GitHub health reporting

Goal:  
Stop flapping/repeated attempts for `POST /api/github-issues/create-health-issue` and make health issue creation idempotent and reliable.

Resolution:
- **Idempotency:** Generate hash key from incident context (env, type, component, severity, error signature). Redis-backed with 24h TTL prevents duplicate issues for same incident.
- **Retry Logic:** Exponential backoff with 30% jitter for transient GitHub API failures (rate limits, network errors). Skips retries on client errors (except 429).
- **Suppression Logging:** Logs duplicate detections with existing issue reference. Returns `suppressed: true` response with existing issue URL.
- **Token & Metadata:** Enhanced in earlier iterations (token fallback, environment labels, build version footer).
- **Validation:** Tested locally; ready for production deployment via tag.

Files Changed:
- `backend/routes/github-issues.js`: Added `getRedisClient`, `generateIdempotencyKey`, `checkIdempotency`, `recordIssueCreation`, `retryWithBackoff` functions; integrated into create-health-issue endpoint.

Acceptance:
- ✅ No repeated bursts of `create-health-issue` calls for the same event (dedupe via Redis).
- ✅ Transient failures retry automatically with backoff/jitter.
- ✅ Suppressed duplicates logged clearly with existing issue reference.

---

### 7) BUG-CACHE-001 – Make tenant resolve cache actually useful

Type: bugfix  
Status: Complete ✅ (v1.0.92)  
Area: Performance – Tenant resolution cache

Goal:  
Improve tenant resolution cache effectiveness so that repeated tenant lookups benefit from caching without breaking correctness.

Resolution:
- **Root Cause:** `backend/routes/ai.js` had duplicate tenant resolution logic with local `tenantLookupCache` (80 lines). AI routes (handling most tenant traffic) bypassed canonical resolver completely, resulting in 0% cache hit ratio.
- **Fix:** Removed duplicate implementation; replaced with calls to `resolveCanonicalTenant()` from `tenantCanonicalResolver.js`.
- **Impact:** All tenant resolution now flows through single canonical cache with TTL (300s prod). Reduced code duplication (~65 lines removed). Cache hit ratio expected to improve from 0% to 50%+ under normal load.

Files Changed:
- `backend/routes/ai.js`: Import canonical resolver; replace `resolveTenantRecord()` with wrapper calling `resolveCanonicalTenant()`; remove `tenantLookupCache` Map and `UUID_PATTERN` constant.

Acceptance:
- ✅ `tenant_resolve_cache_hit_ratio` moves above 0 under normal usage.
- ✅ No incorrect tenant resolution due to cache.
- ✅ Single source of truth for tenant resolution across all routes.

---

### 8) BUG-DASH-003 – Fix dashboard phantom counts and cache issues

Type: bugfix  
Status: Complete ✅ (v1.0.93-95)  
Area: Dashboard – Data accuracy and caching

Goal:  
Eliminate incorrect dashboard counts showing phantom data when tables are empty, and fix cache-related data leakage issues.

Resolution:

**v1.0.93 - Cache Key Isolation:**
- **Root Cause:** Dashboard bundle cache used `'GLOBAL'` fallback when `tenant_id` was missing, causing cross-tenant cache leakage. One tenant's cached data returned to another tenant.
- **Fix:** Removed `'GLOBAL'` fallback; required explicit `tenant_id` parameter for cache keys. Each tenant now has isolated cache entry.
- **Side Effect:** Broke superadmin "All Clients Global" view (sent `null` tenant_id, rejected by backend).

**v1.0.94 - Superadmin Regression Fix:**
- **Root Cause:** v1.0.93 was too restrictive - rejected `null` tenant_id, breaking legitimate superadmin global aggregation view.
- **Fix:** Allow `null` tenant_id but use distinct `'SUPERADMIN_GLOBAL'` cache key. Maintains tenant isolation while enabling global view.
- **Impact:** Both single-tenant and global views work correctly with proper cache separation.

**v1.0.95 - Phantom Count Fix:**
- **Root Cause:** PostgreSQL `count: 'planned'` uses statistical estimates that don't update immediately after DELETE operations, showing phantom counts (e.g., "67 activities" when table empty).
- **Fix:** Changed all dashboard count queries to use `count: 'exact'` instead of `'planned'` estimates. Added `bust_cache=true` query parameter for testing.
- **Impact:** Dashboard now shows accurate counts reflecting actual database rows. No more phantom data from stale statistics.

Files Changed:
- `backend/routes/reports.js`: Cache key logic (effectiveTenantKey), count mode changed from 'planned' to 'exact', added cache bust parameter, simplified new leads and activities queries.

Acceptance:
- ✅ Dashboard shows 0 counts when tables are empty (no phantom data).
- ✅ Each tenant has isolated cache (no cross-tenant data leakage).
- ✅ Superadmin global view works without errors.
- ✅ Test data toggle functions correctly.
- ✅ Cache bypass available for testing (`?bust_cache=true`).

---

### 9) FEAT-WORKFLOW-001 – Add Workflows module to Module Settings

Type: feature  
Status: Complete ✅ (v1.1.8)  
Area: Module Settings / Navigation Permissions

Goal:  
Add Workflows module to Module Settings and ensure it's properly integrated with the Navigation Permissions system so administrators can enable/disable the Workflows menu option for users.

Resolution:

**Implementation:**
- Added "Workflows" module definition to `ModuleManager.jsx` defaultModules array with:
  - Module ID: `workflows`
  - Icon: Workflow (lucide-react)
  - Features: Visual Workflow Builder, Event-Based Triggers, Multi-Step Automation, Conditional Logic, External Integrations
- Added module mapping in `Layout.jsx` hasPageAccess function: `Workflows: 'workflows'`
- Verified "Workflows" already exists in NavigationPermissions.jsx ORDER array
- Verified Workflows navigation item already exists in Layout.jsx navItems

**How It Works:**
1. Superadmin enables/disables Workflows module in Settings → Module Settings
2. Module setting controls visibility of Workflows menu item via hasPageAccess() → moduleMapping check
3. User-level Navigation Permissions (User Management) can further restrict access per user
4. Both controls work together: Module must be enabled AND user must have navigation permission

Files Changed:
- `src/components/shared/ModuleManager.jsx`: Added Workflow icon import and workflows module definition
- `src/pages/Layout.jsx`: Added `Workflows: 'workflows'` to moduleMapping object

Acceptance:
- ✅ Workflows module appears in Settings → Module Settings
- ✅ Module can be enabled/disabled per tenant
- ✅ Module setting controls navigation menu visibility via hasPageAccess
- ✅ Navigation Permissions toggle already exists for user-level control
- ✅ No errors in modified files

---

## Testing & Validation Requirements

Manual:
- Re-run Settings / health tests for:
  - Tenants, employees, and leads endpoints.
  - MCP/Braid and n8n integrations.
  - GitHub health reporter.
- Confirm no `fetch failed` or bogus `Authentication required` where they shouldn’t appear.

Automated / Monitoring:
- API error rate drops significantly from ~10%.
- MCP test suite moves from 0/12 to majority passing (target: all green).
- GitHub health reporter calls are well-behaved and deduplicated.
- Tenant cache metrics show non-zero hit ratio under realistic load.

---

## Status

- BUG-API-001A: Complete ✅ (v1.0.66-74 - diagnosed runtime env issues)
- BUG-API-001B: Complete ✅ (v1.0.74 - APP_BUILD_VERSION runtime injection)
- BUG-API-002: Resolved ✅ (auth issue resolved with 001B fixes)
- BUG-API-003: Complete ✅ (v1.0.75 - generateUniqueId backend endpoint)
- BUG-MCP-001: Complete ✅ (v1.0.87-90 - MCP connectivity, health-proxy, token injection)
- BUG-INT-001: Complete ✅ (v1.0.91 - idempotency, retry, suppression logging)
- BUG-CACHE-001: Complete ✅ (v1.0.92 - consolidated tenant resolution to canonical cache)
- BUG-DASH-003: Complete ✅ (v1.0.93-95 - phantom counts, cache isolation, exact count queries)

**All planned bugfixes complete! Platform stable and ready for feature work. 🎉**

---

### BUG-DASH-001A – Diagnose Dashboard auth failure (root cause)

Type: bugfix  
Status: Completed (P1)  
Area: Dashboard / Backend API / Auth

Goal:  
Determine why the Dashboard fails to load for an authenticated user and why calls to `/api/modulesettings?tenant_id=<tenant>` return `{"status":"error","message":"Authentication required"}` despite valid Supabase user and tenant context.

Steps:
1. Reproduce:
   - Log in with an affected user.
   - Allow tenant auto-selection to occur.
   - Navigate to the Dashboard and observe console and network logs.
2. Inspect frontend:
   - Where module settings and dashboard data are fetched (e.g. `src/api/entities.js`, dashboard data hooks/components).
   - Route guards and `hasPageAccess` logic for the dashboard route.
3. Inspect backend:
   - Endpoint that serves module settings and dashboard-related data (e.g. `backend/routes/modulesettings.js` or equivalent).
   - Auth middleware / token extraction used for these endpoints.
4. Identify mismatch:
   - Is the auth header or cookie missing?
   - Is the backend expecting a different token than what the frontend sends?
   - Is tenant scoping causing an auth failure?

Scope:
- Diagnostic only.
- You may add temporary logging.
- Do not implement fixes yet.

Acceptance:
- Clear, documented root cause for the “Authentication required” response for dashboard module settings.
- List of exact files to be modified in the fix phase (BUG-DASH-001B).

---

### BUG-DASH-001B – Fix Dashboard auth failure and restore load

Type: bugfix  
Status: Completed (P1)  
Area: Dashboard / Backend API / Auth

Dependencies:
- BUG-DASH-001A (root cause identified).

Goal:  
Implement the smallest viable change that allows a properly authenticated user, with a valid tenant, to successfully load Dashboard module settings and render the Dashboard.

Steps:
1. Fix the auth mismatch:
   - Ensure the frontend sends the correct auth token/cookie on dashboard/module settings requests.
   - Ensure the backend validates the same token/cookie used for other authenticated endpoints.
2. Update guards (if needed):
   - If the dashboard route guard treats “Authentication required” as a fatal state, adjust it to:
     - Retry, OR
     - Redirect appropriately, OR
     - Show a clear error screen rather than silently failing.
3. Remove any temporary logging added during diagnosis.

Scope:
- Only the backend auth handling for dashboard/module settings.
- Only the frontend request and guard logic that interacts with those endpoints.
- No broader auth system redesign.

Acceptance:
- Authenticated user with valid tenant loads Dashboard successfully.
- Module settings calls no longer return “Authentication required” for valid sessions.
- No regression in other authenticated routes.

Verification:
- Frontend `callBackendAPI` attaches Supabase bearer + credentials; backend auth middleware supports publishable key fallback.
- Local, dev Docker, and staging verified; production tag `v1.0.66` published.

---

### BUG-DASH-002 – Improve Dashboard stats loading performance

Type: bugfix  
Status: Completed (P2)  
Area: Dashboard / Backend API / Performance

Goal:  
Reduce the time it takes for dashboard cards and stats to appear after page load, without changing the meaning of any metrics.

Steps:
1. Measure current behavior:
   - Identify which API endpoints are called for dashboard stats.
   - Determine whether calls are sequential or redundant.
2. Backend optimizations:
   - Consolidate multiple small calls into fewer, aggregated calls where safe.
   - Optimize database queries (indexes, joins, filters) for dashboard endpoints.
   - Consider adding short-lived caching (e.g. Redis) for frequently-read stats, ensuring tenant isolation.
3. Frontend optimizations:
   - Avoid duplicate requests on rerender.
   - Ensure components subscribe to shared data where appropriate instead of re-fetching.

Scope:
- Backend: only dashboard-related endpoints and queries.
- Frontend: only dashboard data-fetching components/hooks.
- No changes to metric definitions or visibility rules.

Acceptance:
- Noticeable reduction in time-to-display for dashboard cards/statistics.
- No incorrect or cross-tenant data shown.
- No increased error rates or auth issues from optimization changes.

Verification:
- Backend: `/api/reports/dashboard-bundle` aggregated response with cache (≈60s TTL), exact small-count fallback.
- Frontend: bundle-first render; background hydration; animations disabled; widgets memoized.
- DB: indexes applied via `077_dashboard_indexes.sql`; usage confirmed with EXPLAIN ANALYZE.

---

## Testing & Validation Requirements

Manual:
- For BUG-DASH-001:
  - Log in as an affected user, select tenant, open Dashboard.
  - Confirm the Dashboard actually loads and does not get stuck due to “Authentication required”.
- For BUG-DASH-002:
  - Observe dashboard load time before and after changes in the same environment.
  - Confirm metrics match expected values.

Automated:
- Add/extend tests for:
  - Auth checks on dashboard/module settings endpoints.
  - Basic dashboard data retrieval flows.
- Performance tests where feasible (e.g. request counts, execution time metrics).

Environment:
- Validate both:
  - Local dev
  - The deployed environment where the problem was observed (Docker / cloud).

---

## Status

- BUG-DASH-001A: **Completed** (P1, diagnostic) – Root cause identified: `callBackendAPI` lacked auth token attachment; `requireAdminRole` middleware rejected requests.
- BUG-DASH-001B: **Completed** (P1, fix) – Frontend attaches bearer + credentials; backend auth supports publishable key. Verified locally and staged; released under `v1.0.66`.
- BUG-DASH-002: **Completed** (P2, performance) – Bundle endpoint + cache, frontend background hydration, INP improvements, and DB indexes applied.

---

## Usage Instruction for AI Tools

When using Claude, Copilot, or any AI assistant:

1. Read `.github/copilot-instructions.md` and comply fully.  
2. Read `orchestra/ARCHITECTURE.md` and `orchestra/CONVENTIONS.md`.  
3. Read this PLAN and identify the highest priority task:

   - Start with **BUG-DASH-001A (diagnostic)**.
   - Do not work on BUG-DASH-001B until diagnosis is clear.
   - Do not work on BUG-DASH-002 until BUG-DASH-001A/B are completed or explicitly paused.

4. For the selected task:
   - State the task ID and title.
   - List the files you plan to touch.
   - Wait for human approval before changing code.
   - Keep diffs minimal and within scope.

---

## Backlog

### FEAT-NOTIFICATIONS-001 – Enable notifications feature in production

Type: feature  
Status: Backlog  
Area: Notifications / Database  
Priority: Low

Goal:  
Enable the in-app notifications feature (Bell icon panel) in production by creating the required database table and RLS policies.

Context:
- Notifications table exists in migrations but not yet created in production Supabase database
- Feature currently gracefully fails with suppressed console warnings (v1.0.79)
- Non-critical feature - app works fine without it

Steps:
1. Run migration `001_init.sql` (lines 76-85) to create notifications table in production Supabase
2. Add `created_date` column and sync trigger (from migration 002)
3. Enable RLS policies via migration `061_consolidate_rls_notifications.sql`
4. Verify table exists in Supabase Table Editor
5. Test Bell icon functionality in production app

Scope:
- Database only (no code changes required)
- Migrations already exist in `backend/migrations/`
- Feature code already deployed and working in v1.0.79+

---

### FEAT-WORKFLOW-AI-001 – MCP-backed AI workflow nodes

Type: feature  
Status: Backlog  
Area: Workflows / AI Integrations  
Priority: Medium

Goal:  
Add AI-driven workflow steps with MCP-first executors and provider stubs for OpenAI, Anthropic, and Gemini. Nodes: `ai_classify_opportunity_stage`, `ai_generate_email`, `ai_enrich_account`, `ai_route_activity`.

Context:
- Frontend Node Library entries added; configuration UI placeholders added (provider/model/prompt/context fields).
- Backend workflow executor requires MCP-backed handlers plus provider stubs and output variable population.
- Must remain tenant-safe and auditable; outputs stored in `context.variables` and execution logs.

Acceptance Criteria:
- Backend executors implement MCP-first logic with graceful fallbacks; provider stubs return deterministic outputs for tests.
- Outputs available via variables: `ai_stage`, `ai_email`, `ai_enrichment`, `ai_route`.
- Timeouts and error handling added; no SSRF or external network calls outside MCP/provider SDKs.
- Minimal, localized changes; no impact on existing CRUD nodes.

Steps:
1. Add executor cases for AI nodes in `backend/routes/workflows.js` (MCP-first, stub providers).  
2. Expose configuration fields in `WorkflowBuilder.jsx` for provider/model/prompt/context where relevant.  
3. Add unit tests for deterministic stubs and variable propagation.  
4. Document usage in `docs/workflows/ai-nodes.md` (short guide).

