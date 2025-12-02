# Phase 2: Conversational Interface (Months 3-4)

**Status**: Not Started  
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
- [ ] Create `src/lib/intentParser.js`
- [ ] Build command classification system
- [ ] Add entity extraction (accounts, contacts, dates, etc.)
- [ ] Implement ambiguity resolution
- [ ] Add multi-step command support

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
- [ ] Build suggestion engine based on current page
- [ ] Add command history tracking
- [ ] Implement command autocomplete
- [ ] Create quick action shortcuts
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
- [ ] Build conversational validation messages
- [ ] Add AI-powered data enrichment during input
- [ ] Implement duplicate detection mid-conversation
- [ ] Create correction flow for invalid data
- [ ] Add "Did you mean?" suggestions

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

**Deliverable**: Smart validation preventing 90%+ data entry errors

---

### Week 5-6: Main UI Integration

#### Task 2.5: Chat Sidebar Component
- [ ] Create `src/components/ai/ChatSidebar.jsx`
- [ ] Build collapsible/expandable sidebar
- [ ] Add message history with scrolling
- [ ] Implement typing indicators
- [ ] Add quick action buttons

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
- [ ] Build command → API mapping
- [ ] Add execution confirmation for destructive actions
- [ ] Implement progress indicators for long operations
- [ ] Create error handling and retry logic
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
- [ ] Create `src/components/ai/VoiceInput.jsx`
- [ ] Integrate Web Speech API
- [ ] Add push-to-talk button
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
- [ ] Add text-to-speech for AI responses
- [ ] Create voice selection settings
- [ ] Build audio queue management
- [ ] Add playback controls (pause, skip)
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

**Onboarding Flow**:
```
1. Welcome modal on first login
2. Interactive tutorial: "Try saying 'Show my accounts'"
3. Highlight chat button + keyboard shortcut
4. Show example commands for current page
5. Dismiss and remember preference
```

**Deliverable**: Smooth onboarding experience

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
- ✅ Users can complete 10 common tasks via chat
- ✅ Intent parser accuracy >90% on test set
- ✅ Chat sidebar accessible from all pages
- ✅ Voice input works in Chrome/Edge
- ✅ Conversational forms for 5 entities

### Nice to Have
- 🎯 Voice output (TTS) working
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
- ✅ Chat interface with command execution
- ✅ Voice input/output (basic)
- ✅ Intent parser (trained on 100+ examples)
- ✅ Conversational forms (5 entities)

### Outstanding for Phase 3
- Proactive suggestions (AI initiating conversations)
- Autonomous actions (AI executing without prompting)
- Predictive models (lead scoring, deal forecasting)
- Advanced workflow generation

---

**Phase Owner**: [Frontend Lead Name]  
**Last Updated**: November 29, 2025  
**Status**: Ready for Review
