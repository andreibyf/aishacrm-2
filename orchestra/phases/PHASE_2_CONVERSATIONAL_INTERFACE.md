# Phase 2: Conversational Interface (Months 3-4)

**Status**: In Progress (Core Complete)  
**Depends On**: Phase 1 (Foundation)  
**Target Start**: March 2026  
**Target End**: April 2026  
**Owner**: Frontend Team + UX Team + AI Team

---

## Objectives

Transform the user interface to conversational-first:
1. Build command parser and intent engine
2. Create conversational form components
3. Add chat sidebar to main UI
4. Implement voice input/output

---

## Detailed Tasks

### Week 1-2: Natural Language Command Parser

#### Task 2.1: Intent Detection Engine
- [x] Create `src/lib/intentParser.ts` ✅
- [x] Build command classification system ✅
- [x] Add entity extraction (accounts, contacts, dates, etc.) ✅
- [x] Implement ambiguity resolution ✅
- [x] Add multi-step command support ✅

> **Dev Note (Dec 1, 2025):** The parser now lives in `src/lib/intentParser.ts` and feeds `processChatCommand` via `classification.parserResult`. Downstream modules should reference that object (instead of re-parsing raw text) to access entity, filters, flags, and safety metadata.

**Parser Architecture**:
```javascript
// Input: "Show me all accounts in California with revenue over $1M"
// Output:
{
  intent: "query",
  entity: "accounts",
  filters: [
    { field: "state", operator: "equals", value: "California" },
    { field: "revenue", operator: "greater_than", value: 1000000 }
  ],
  confidence: 0.92
}
```

**Supported Command Types**:
- Query: "Show me...", "Find...", "List..."
- Create: "Add...", "Create...", "New..."
- Update: "Change...", "Update...", "Set..."
- Delete: "Remove...", "Delete..."
- Navigate: "Go to...", "Open..."
- Analyze: "What's...", "How many...", "Calculate..."

**Deliverable**: Parser with 90%+ accuracy on test cases

---

#### Task 2.2: Context-Aware Suggestions
- [x] Build suggestion engine based on current page ✅
- [x] Add command history tracking ✅
- [x] Implement command autocomplete ✅
- [x] Create quick action shortcuts ✅
- [ ] Add learning from user patterns

**Examples**:
```javascript
// On Accounts page
suggestions: [
  "Show accounts with no activity this month",
  "Create new account",
  "Export accounts to CSV",
  "Show accounts by revenue"
]

// On specific account detail page
suggestions: [
  "Add contact for this account",
  "Create opportunity",
  "Schedule follow-up call",
  "View activity history"
]
```

**Deliverable**: Context-aware suggestions on all major pages

---

### Week 3-4: Conversational Form Builder

#### Task 2.3: Chat-Based Form Component
- [x] Create `src/components/ai/ConversationalForm.jsx`
- [x] Build field-by-field collection flow
- [x] Add validation as conversation
- [x] Implement conditional fields based on responses
- [x] Add preview and confirmation step

> **Status**: Complete ✅ (December 2, 2025)
>
> **Component**: `src/components/ai/ConversationalForm.jsx`  
> **Test File**: `src/components/ai/__tests__/ConversationalForm.test.jsx`
>
> **Implementation Summary**:
> - Multi-step wizard with `schema.steps[]` driving field collection
> - `normalizeField()` supports string shortcuts or full field objects
> - `defaultValidation()` enforces required fields per step
> - `shouldIncludeStep()` callback enables conditional step visibility
> - Preview screen shows all collected data before submission
> - `buildPayload()` transforms answers → API-ready payload
>
> **Fixes Applied**:
> - Added schema guard in `useEffect` to prevent infinite re-render loop when `schema` is `null`
>
> **Test Coverage** (7 render-only tests, all passing):
> 1. Returns `null` when `schema` is not provided
> 2. Renders the first step prompt
> 3. Renders Cancel button
> 4. Renders Preview button for single-step schemas
> 5. Renders Next button for multi-step schemas
> 6. Renders input field with correct label
> 7. Shows step counter (`Step X of Y`)
>
> **Known Limitation**: `fireEvent.click()` causes Vitest 4.0.13/jsdom worker crashes. Interaction tests deferred to Playwright E2E.

**Component Interface**:
```jsx
<ConversationalForm
  schema={accountSchema}
  onComplete={(data) => createAccount(data)}
  initialMessage="I'll help you create a new account. What's the company name?"
/>
```

**Conversation Flow Example**:
```
AI: I'll help you create a new account. What's the company name?
User: Acme Corporation

AI: Great! What industry is Acme Corporation in?
User: Technology

AI: Perfect. What's their website?
User: acme.com

AI: [Validates domain, enriches data]
    I found some information about Acme Corporation:
    - Revenue: ~$50M (estimated)
    - Employees: 200-500
    - Location: San Francisco, CA
    
    Should I use this information?
User: Yes

AI: [Shows preview card with all data]
    Here's what I'll create:
    
    Name: Acme Corporation
    Industry: Technology
    Website: acme.com
    Revenue: $50M
    Employees: 350
    Location: San Francisco, CA
    
    Look good? [Create] [Edit] [Cancel]
```

**Deliverable**: Conversational forms for 5 core entities

---

#### Task 2.4: Smart Field Validation
- [x] Build conversational validation messages ✅
- [ ] Add AI-powered data enrichment during input
- [x] Implement duplicate detection mid-conversation ✅ (framework in place)
- [x] Create correction flow for invalid data ✅
- [ ] Add "Did you mean?" suggestions

> **Status**: Core Complete ✅ (December 2, 2025)
>
> **Implementation**:
> - `src/lib/validationEngine.ts` — Centralized validation with rule types: required, type (email/phone/number/currency/date/enum), minLength, maxLength, pattern, custom
> - `src/lib/validationSchemas.ts` — Entity schemas for leads, accounts, contacts, opportunities, activities + convenience validators
> - `src/lib/__tests__/validationEngine.test.ts` — 40 pure-function tests (all passing)
>
> **Usage**: Conversational schemas can call `validateLead(answers)`, `validateEntity('account', data)`, etc. in their `validate()` step functions.
>
> **Remaining** (Nice-to-have for later):
> - AI-powered data enrichment during input
> - "Did you mean?" typo suggestions

**Validation Examples**:
```
User: Create account for Microsft
AI: I think you meant "Microsoft" (already exists in system).
    Did you want to:
    1. Open existing Microsoft account
    2. Create a different account with similar name
    3. Edit your input

User: Set revenue to 5
AI: Just to clarify - is that:
    1. $5
    2. $5,000
    3. $5,000,000 (most common for company revenue)
```

### Smart Field Validation (Implementation Plan)

## Overview

**2.4 Smart Field Validation** introduces AI‑augmented, context‑aware validation inside Conversational Forms and standard CRUD forms. This includes:

* Schema‑driven rules
* Cross‑field validation
* AI‑assisted validation (propose, not enforce)
* Unified validator module consumed by conversational and traditional forms
* Full test coverage

This work integrates deeply with the Phase 2 conversational UI, the intent engine, and the upcoming Phase 3 automation.

---

## Goals

1. **Centralize validation logic** for all core CRM entities.
2. **Enable conversational form validation** beyond simple “required” rules.
3. **Support dependent constraints** (e.g., close_date > create_date, revenue >= 0).
4. **Introduce AI‑suggested validations** without allowing AI to block or mutate data.
5. **Provide detailed developer and UI‑friendly validation messages.**
6. **Add comprehensive unit tests** and prevent regressions.

---

## Deliverables

### New Modules

* `src/lib/validationEngine.ts`

  * Exports `validateEntity(entityName, payload)`
  * Includes built‑in rule sets for:

    * Accounts
    * Contacts
    * Leads
    * Opportunities
    * Activities
  * Supports composed validation pipelines:

    * structural validation
    * field‑level validation
    * cross‑field validation
    * AI optional advisory validation

* `src/lib/__tests__/validationEngine.test.ts`

  * Tests for all rule categories.
  * Tests for malformed input, missing fields, invalid dates, etc.

### Conversational Form Integration

Modify:

* `src/components/ai/ConversationalForm.jsx`

  * Inject `validationEngine` during:

    * Step advancement
    * Preview stage
    * Final confirmation
  * Show structured validation messages returned by engine.
  * Prevent form submission if **hard validation fails**.
  * Show non‑blocking **AI advisory messages** in a styled info panel.

### CRUD Form Integration (Optional but recommended)

* `src/components/forms/*`

  * Add `validateEntity()` hook before submit.
  * Reuse validation messages in toast + inline error areas.

### Chat Integration (Optional for Phase 2)

* `processChatCommand.ts`

  * When user issues "create lead" or "update opportunity" commands, responses should include advisory validation messages.

---

## Validation Categories

### 1. **Structural Validation**

* Required fields present
* Correct data types
* Non-empty strings

### 2. **Field-Level Validation**

Examples:

* Email format
* Phone number length
* URL format
* Revenue numeric
* close_date valid ISO 8601

### 3. **Cross‑Field Validation**

Examples:

* `close_date` must be > `create_date`
* `probability` must be 0–100
* lead status progression rules

### 4. **AI Advisory Validation**

AI may suggest:

* Missing critical fields (“Industry is recommended for scoring.”)
* Date inconsistencies
* Duplicate detection hints

**AI NEVER blocks submission.**

---

## API Shape

### `validateEntity(entityName, payload)` returns:

```ts
{
  valid: boolean,
  errors: Array<{ field: string, message: string }>,
  warnings: Array<{ field?: string, message: string }>,
  ai_advice?: Array<{ message: string, confidence: number }>
}
```

---

## Step-by-Step Implementation

### Step 1 — Create validationEngine.ts

* Define schemas per entity
* Implement structural + field validation
* Implement cross-field rule registry
* Implement optional AI advisory mode
* Export helper wrappers:

  * `validateLead()`
  * `validateAccount()`
  * etc.

### Step 2 — Add integration to ConversationalForm

Modify step progression:

* On **Next** → run per-step + partial entity validation.
* On **Preview** → run full validation.
* On **Confirm** → enforce blocking rules.
* Show warnings + AI advisory visually.

### Step 3 — Add optional CRUD integration

Wrap create/update handlers with `validateEntity()`.

### Step 4 — Add Tests

Unit Tests:

* Required field blocking
* Email formatting
* Date logic
* Multi-field validation
* Advisory messages present
* Invalid entity names

Conversational Tests:

* Preview blocking
* Inline error rendering
* Advisory (non-blocking) rendering

---

## Risks & Constraints

* Must not break existing CRUD form submission.
* AI validation must NOT auto-change payloads.
* Conversational flow must remain linear and predictable.
* Performance: validation must stay synchronous.

---

## Out of Scope

* Automated AI mutation of fields
* Server-side validation enforcement
* Realtime validation as user types

---

## Completion Criteria

* validationEngine.ts created
* ConversationalForm integrated with validation
* CRUD forms optionally integrated
* Full test suite for all validators
* No regressions in Phase 2A/2B behavior
* AI advisories appear without blocking

---

## Approved Task Boundaries

Copilot may:

* Add new files under `src/lib/`
* Modify ConversationalForm.jsx
* Modify CRUD forms
* Add unit tests

Copilot must NOT:

* Remove existing validation logic unless replaced equivalently
* Introduce new backend endpoints
* Let AI mutate form payloads automatically
* Add any destructive CRUD actions




---

### Week 5-6: Main UI Integration

#### Task 2.5: Chat Sidebar Component
- [x] Create `src/components/ai/AiSidebar.jsx` ✅ (named AiSidebar instead of ChatSidebar)
- [x] Build collapsible/expandable sidebar ✅
- [x] Add message history with scrolling ✅
- [x] Implement typing indicators ✅
- [x] Add quick action buttons ✅

**UI Layout**:
```
┌─────────────────────────────────────────────┐
│  [Logo]  [Navigation]         [User] [Chat]│
├───────────────────────────────┬─────────────┤
│                               │             │
│                               │  AI-SHA     │
│   Main Content Area          │  ┌─────────┐│
│   (Accounts, Leads, etc.)    │  │ Chat    ││
│                               │  │ History ││
│                               │  │         ││
│                               │  │ [Input] ││
│                               │  └─────────┘│
└───────────────────────────────┴─────────────┘
```

**Features**:
- Always accessible via button in header
- Keyboard shortcut: `Cmd+K` or `Ctrl+K`
- Persists chat history per session
- Context-aware based on current page
- Quick actions bar at bottom

**Deliverable**: Chat sidebar integrated on all pages

---

#### Task 2.6: Command Execution Layer
- [x] Build command → API mapping ✅ (via commandRouter.ts)
- [x] Add execution confirmation for destructive actions ✅
- [x] Implement progress indicators for long operations ✅
- [x] Create error handling and retry logic ✅
- [ ] Add undo/rollback for recent actions

**Execution Flow**:
```javascript
async function executeCommand(parsedCommand) {
  // 1. Validate command
  if (!canExecute(parsedCommand)) {
    return { error: "Permission denied" };
  }
  
  // 2. Confirm if destructive
  if (isDestructive(parsedCommand)) {
    const confirmed = await askConfirmation();
    if (!confirmed) return { cancelled: true };
  }
  
  // 3. Execute via API
  const result = await apiClient.execute(parsedCommand);
  
  // 4. Show result in chat
  return {
    success: true,
    message: formatSuccessMessage(result),
    data: result
  };
}
```

**Deliverable**: Commands execute correctly 99%+ of the time

---

### Week 7: Voice Interface

#### Task 2.7: Voice Input Component
- [x] Create `src/components/ai/useSpeechInput.js` ✅ (implemented as hook)
- [x] Integrate Web Speech API ✅
- [x] Add push-to-talk button ✅ (in AiSidebar)
- [ ] Build continuous listening mode
- [ ] Implement noise cancellation

**Component**:
```jsx
<VoiceInput
  onTranscript={(text) => processCommand(text)}
  onError={(error) => showError(error)}
  continuous={false}  // Push-to-talk vs continuous
/>
```

**Browser Support**:
- Chrome/Edge: Full support (Web Speech API)
- Firefox: Fallback to Whisper API
- Safari: Limited support, show warning

**Deliverable**: Voice commands working in Chrome/Edge

---

#### Task 2.8: Voice Output (TTS)
- [x] Add text-to-speech for AI responses ✅ (useSpeechOutput.js)
- [ ] Create voice selection settings
- [x] Build audio queue management ✅
- [x] Add playback controls (pause, skip) ✅
- [ ] Implement accessibility features

**Settings**:
```javascript
voiceSettings: {
  enabled: true,
  voice: "Google US English",
  rate: 1.0,      // Speaking speed
  pitch: 1.0,     // Voice pitch
  volume: 0.8,    // Volume level
  autoPlay: true  // Auto-play responses
}
```

**Deliverable**: TTS working with configurable voices

---

### Week 8: Polish & Testing

#### Task 2.9: UX Refinements
- [ ] Add onboarding tutorial for chat interface
- [ ] Create example commands list
- [ ] Build interactive help system
- [ ] Add keyboard shortcuts documentation
- [ ] Implement dark/light theme support
- [x] Full Voice Interaction Model (continuous + push-to-talk) ✅

> **Status**: Voice Mode Complete ✅ (December 2, 2025)
>
> **Implementation**: PH2-VOICE-001 Full Voice Interaction Model
>
> **New Files Created**:
> - `src/hooks/useVoiceInteraction.js` — Unified voice hook coordinating STT, TTS, realtime
>   - Three modes: idle, continuous, push_to_talk
>   - Auto-reopens mic after TTS ends in continuous mode
>   - Maintains safety guards for destructive commands
> - `src/hooks/usePushToTalkKeybinding.js` — Global spacebar PTT helper
>   - Detects typing targets (input/textarea/contenteditable) and ignores them
>   - Handles key repeats and cleanup on unmount
> - `src/hooks/__tests__/useVoiceInteraction.test.jsx` — 12 tests
> - `src/hooks/__tests__/usePushToTalkKeybinding.test.jsx` — 6 tests
>
> **Modified Files**:
> - `src/components/ai/AiSidebar.jsx`:
>   - Voice Mode toggle button (Headphones icon)
>   - Integrated spacebar PTT for hands-free conversation
>   - Voice mode status indicator panel
>   - Auto-speaks AI responses when voice mode active
>   - New telemetry: ui.voice_mode.enabled/disabled
> - `src/components/ai/__tests__/AiSidebar.voice.test.jsx` — 3 new tests (16 total)
>
> **User Experience**:
> - Click "Voice" button to enter hands-free mode
> - Space bar triggers PTT from anywhere (except when typing)
> - AI responses auto-spoken in voice mode
> - Click "Voice On" to exit or close sidebar
>
> **Test Coverage**: 106 tests passing across all AI-related test suites

**Onboarding Flow**:
```
1. Welcome modal on first login
2. Interactive tutorial: "Try saying 'Show my accounts'"
3. Highlight chat button + keyboard shortcut
4. Show example commands for current page
5. Dismiss and remember preference
```


## Voice Interaction Model (Continuous + Push-to-Talk)

> **Status**: Complete ✅ (December 2, 2025)
> 
> See Task 2.9 above for full implementation details.

## 1. Objective

Enhance AiSHA’s conversational interface with **two fully supported voice input modes**:

### A. Push-to-Talk (PTT) Mode

* User holds **Spacebar** (desktop) or **Mic button** (mobile) to record.
* Recording stops on release.
* Transcript is **auto-sent immediately** (no edit/review).

### B. Continuous Listening Mode

* User toggles a **LIVE Voice** switch.
* Microphone streams continuously into the **Realtime WebRTC session**.
* AiSHA responds in real time (voice out + text transcript).
* Silence detection + phrase-boundary detection included.

Both modes must follow AiSHA’s safety logic and routing rules.

---

## 2. Architecture Overview

### 2.1 New Hook: `useVoiceInputMode.js`

Central coordinator managing:

* `pttActive`
* `continuousMode`
* `realtimeActive`
* Routing logic determining whether audio goes to REST or Realtime API
* Safety checks before sending

### 2.2 Updated: `useSpeechInput.js`

Add:

* `startPttRecording()` / `stopPttRecording()`
* Extended MediaRecorder pipeline
* Silence-detection utilities
* Callback `onTranscript(transcript, origin)` to push results upstream

### 2.3 Updated: `useRealtimeAiSHA.js`

Enhancements:

* Support streaming mic audio into the WebRTC track
* Auto-disconnect when LIVE mode ends
* Expose `sendUserMessage()` for voice transcripts

---

## 3. UI & UX Enhancements

### 3.1 AiSidebar UI Additions

* **PTT Mic Button**

  * Shows "Hold Space to Talk"
  * Built-in PTT state visuals

* **LIVE Mode Toggle**

  * Enables continuous streaming
  * Shows "LIVE ●" indicator
  * Auto-resets on WebRTC drop

### 3.2 Behavior Rules

* PTT button is shown unless continuous mode is on
* Continuous mode hides PTT
* Both modes must show safety warnings when triggered

---

## 4. Input Routing Logic

Routing decision tree:

```
if (continuousMode && realtimeActive) → sendRealtimeUserMessage
else if (pttActive && realtimeActive) → sendRealtimeUserMessage
else → REST /api/ai/chat via processChatCommand
```

Metadata added to every transcript:

```
origin: "voice-ptt" | "voice-live"
```

---

## 5. Safety Logic

### 5.1 Destructive Phrase Detection

Block transcripts containing phrases like:

* "delete all"
* "wipe records"
* "remove everything"
* Any schema-defined destructive variants

Display sidebar warning:

> "Voice command blocked for safety. Type to confirm."

### 5.2 Continuous Mode Safeguards

LIVE mode auto-disables when:

* WebRTC disconnects
* STT output contains destructive language
* Silence exceeds threshold (e.g., 30 seconds)
* Optional: resource spike conditions

---

## 6. Backend Requirements

No schema modifications.

Ensure endpoints exist:

* `GET /api/ai/realtime-token`
* `POST /api/ai/speech-to-text`
* `POST /api/ai/tts`

---

## 7. Testing Plan

### 7.1 Unit Tests (Vitest)

**useVoiceInputMode.test.js**

* PTT toggles correctly
* Continuous mode routes to realtime
* Auto-disables on connection drop

**AiSidebar.voice.test.jsx**

* Correct button visibility per mode
* Press/hold PTT triggers state
* LIVE toggle activates streaming
* Destructive phrases blocked

---

## 8. Deliverables

### New File

* `src/hooks/useVoiceInputMode.js`

### Modified Files

* `src/hooks/useSpeechInput.js`
* `src/hooks/useRealtimeAiSHA.js`
* `src/components/ai/AiSidebar.jsx`

### Tests

* `src/hooks/__tests__/useVoiceInputMode.test.js`
* `src/components/ai/__tests__/AiSidebar.voice.test.jsx` (updated)

---

## 9. Acceptance Criteria

* Spacebar + mic PTT fully functional
* Continuous live voice streaming works with realtime AI
* LIVE indicator is accurate and auto-resets
* All voice routes respect safety gating
* All tests pass
* No backend changes required


---

#### Task 2.10: Error Handling & Edge Cases
- [ ] Handle unclear/ambiguous commands gracefully
- [ ] Add "I don't understand" fallbacks
- [ ] Build escalation to human support
- [ ] Create error recovery flows
- [ ] Add feedback mechanism for bad responses

**Error Responses**:
```
User: "Do the thing"
AI: I'm not sure what you mean. Did you want to:
    - Create something? (account, contact, lead)
    - Search for something?
    - Update existing data?
    
    Or try being more specific, like "Create new account"

User: [Unintelligible voice input]
AI: Sorry, I couldn't understand that. Could you:
    - Try speaking more clearly
    - Type your command instead [Switch to Text]
    - See example commands [Show Examples]
```

**Deliverable**: Error rate <5% on common commands

---

## Testing & Validation

### Test Scenarios
- [ ] 50 common command variations (create, read, update, delete)
- [ ] Multi-step workflows (account → contact → opportunity)
- [ ] Voice commands in noisy environment
- [ ] Mobile responsiveness (chat sidebar)
- [ ] Accessibility (screen reader compatibility)

### User Testing
- [ ] 20 users complete 10 tasks each (conversational vs traditional)
- [ ] Measure time-to-completion for both interfaces
- [ ] Collect NPS score for conversational interface
- [ ] Identify confusing commands or flows
- [ ] A/B test chat placement (sidebar vs modal)

### Performance Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| Intent parsing latency | <100ms | Client-side timing |
| Command execution time | <2s end-to-end | API latency + rendering |
| Voice recognition accuracy | >90% | Manual review of transcripts |
| User task completion rate | >85% | Analytics tracking |

---

## Dependencies

### Browser APIs
- Web Speech API (Chrome, Edge)
- Speech Recognition API (fallback)
- Audio Context API (for TTS)

### External Services
- OpenAI Whisper API (voice transcription fallback)
- Elevenlabs or Google TTS (premium voices)

### New npm Packages
```bash
# Frontend
npm install use-whisper@^0.5.0           # Voice input hook
npm install react-speech-recognition@^3.10.0
npm install react-markdown@^9.0.0        # Chat message formatting
npm install highlight.js@^11.9.0         # Code snippet highlighting
```

---

## Acceptance Criteria

### Must Have
- ✅ Users can complete 10 common tasks via chat — **DONE**
- ✅ Intent parser accuracy >90% on test set — **DONE** (intentParser.ts + tests)
- ✅ Chat sidebar accessible from all pages — **DONE** (AiSidebar.jsx)
- ✅ Voice input works in Chrome/Edge — **DONE** (useSpeechInput.js)
- ✅ Conversational forms for 5 entities — **DONE** (ConversationalForm.jsx)

### Nice to Have
- ✅ Voice output (TTS) working — **DONE** (useSpeechOutput.js)
- 🎯 Command history saved across sessions
- 🎯 Multi-language support (English + Spanish)
- 🎯 Voice-only mode for accessibility

---

## Rollout Plan

### Week 7: Alpha Testing
- Deploy to staging with feature flag
- Internal team testing (20 users)
- Collect feedback and iterate

### Week 8: Beta Release
- Enable for 10% of users (opt-in)
- Monitor usage metrics and errors
- Fix critical bugs

### Week 9: General Availability
- Launch conversational interface to all users
- Traditional UI remains available (toggle in settings)
- Marketing campaign: "Meet the new AI-SHA"

---

## Success Metrics

### Adoption Metrics
- [ ] 60% of users try conversational interface in first week
- [ ] 40% of users prefer conversational interface over traditional
- [ ] 25% of daily tasks completed via chat commands

### Performance Metrics
- [ ] Average task completion time reduced by 30%
- [ ] User satisfaction (NPS) increases by 15 points
- [ ] Support tickets decrease by 20% (easier to use)

### Technical Metrics
- [ ] Command success rate >95%
- [ ] Chat response latency <500ms (p95)
- [ ] Voice recognition accuracy >90%

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Users don't adopt chat interface | High | Medium | Keep traditional UI available, gradual onboarding |
| Voice input poor quality | Medium | High | Provide text fallback, improve noise handling |
| Intent parsing inaccurate | Critical | Medium | Extensive training data, fallback to clarifying questions |
| Mobile UX problems | Medium | High | Responsive design testing, mobile-first chat |

---

## Handoff to Phase 3

### Deliverables Ready for Phase 3
- ✅ Chat interface with command execution — **DONE** (AiSidebar.jsx + commandRouter.ts)
- ✅ Voice input/output (basic) — **DONE** (useSpeechInput.js + useSpeechOutput.js)
- ✅ Intent parser (trained on 100+ examples) — **DONE** (intentParser.ts + intentClassifier.ts)
- ✅ Conversational forms (5 entities) — **DONE** (ConversationalForm.jsx + schemas.js)

### Outstanding for Phase 3
- Proactive suggestions (AI initiating conversations)
- Autonomous actions (AI executing without prompting)
- Predictive models (lead scoring, deal forecasting)
- Advanced workflow generation

---

**Phase Owner**: [Frontend Lead Name]  
**Last Updated**: December 2, 2025  
**Status**: Core Implementation Complete — Ready for Phase 3
