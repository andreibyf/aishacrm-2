# AiSHA Assistant User Guide

_Last updated: December 6, 2025_

AiSHA (AI Super Hi-performing Assistant) is the executive-assistant layer that runs inside the CRM sidebar. This guide explains how end users, product, and support teams should interact with the Phase 4-ready assistant experience, including layout, quick actions, guided forms, voice controls, and natural language commands.

---

## 1. Opening the Assistant

1. Click the AiSHA avatar button in the lower-right corner of any CRM view.
2. The right-side drawer widens to **540px** and shows the executive header card.
3. To close the assistant, press **Esc** or click the **×** button in the header.
4. **Wake Word:** Say "Hey Aisha" (or "Hi Aisha", "Aisha") when Wake Word mode is enabled to activate hands-free voice interaction.

> **Tip:** The assistant always runs in **read-only / propose-actions** mode. It never writes to production data without explicit confirmation via the existing Brain pipeline.

---

## 2. Layout Overview

| Region | Purpose |
|--------|---------|
| **Executive Hero Card** | Shows the AiSHA avatar, current tenant badge, user role, and realtime status chip (Live voice + chat, Chat ready, or Chat-only). This gives leadership a quick health glance before issuing commands. |
| **Workspace Snapshot** | Highlights the active tenant and role, including whether guided forms are unlocked. If no tenant is selected, the card explains how to unlock forms and insights. |
| **Quick Actions** | Two-column grid of high-frequency prompts ("Show leads", "View pipeline", "My tasks"). Each chip sends the prefilled instruction immediately. |
| **Guided Creations** | Icon buttons for entity-specific conversational forms (Lead, Account, Contact, Opportunity, Activity). Selecting a chip opens an in-panel form with validation and success toasts. |
| **Suggestions** | Context-aware nudges tied to the current page. Tapping a suggestion queues its prompt in the composer. |
| **Transcript Stream** | Ordered list of user/assistant bubbles with Markdown rendering, inline action pills, and welcome card styling for the first assistant message. |
| **Composer & Voice Controls** | Unified area for drafting messages, enabling realtime voice, managing push-to-talk (PTT), Wake Word detection, and monitoring telemetry/warnings. |

---

## 3. Voice & Realtime Modes

The footer exposes all voice states so users always know whether the mic or speaker is active.

### 3.1 Enable Realtime Voice

1. Click **Realtime Voice**. The system fetches an ephemeral WebRTC key and connects to the OpenAI Realtime API.
2. When connected, the status pill reads **Live voice + chat** and the LED on the avatar glows green.
3. Use the dedicated **Hold to Talk** button (or the spacebar) to unmute the mic temporarily. Release to send the captured turn.
4. Press the red **stop square** to end the session.

### 3.2 Wake Word Detection

1. Click **Wake Word** to enable hands-free activation.
2. Say "Hey Aisha", "Hi Aisha", or just "Aisha" to activate the assistant.
3. AiSHA will greet you and begin listening for your command.
4. Say "Thanks", "Goodbye", or "That's all" to end the session.
5. Auto-sleep activates after 60 seconds of inactivity.

**Recognized Wake Words:**
- "Aisha", "Hey Aisha", "Hi Aisha"
- "AI-SHA", "Isha", "Alisha", "Ayesha" (common pronunciations)

**End Session Phrases:**
- "Thanks", "Thank you", "Goodbye", "Bye"
- "That's all", "I'm done", "Stop listening"

### 3.3 Push-to-Talk (Legacy STT)

- Toggle **Voice** when realtime is unavailable. AiSHA records audio locally, sends it through STT, displays the transcript, and auto-sends safe commands.
- Destructive phrases ("delete all...") are blocked and require manual editing before sending.

### 3.4 Status Indicators

| Indicator | Meaning | Suggested Action |
|-----------|---------|------------------|
| \`Connecting…\` | Realtime session establishing. | Wait a few seconds before speaking. |
| \`Realtime voice requires a supported browser.\` | Browser lacks WebRTC support. | Switch to Chromium-based (Chrome/Edge 120+). |
| Amber warning bar | Voice disabled for tenant. | Ask admins to enable **Realtime Voice** module. |
| Rose error card | Realtime error with code/hint. | Review hint, click **Dismiss**, and retry (often toggling off/on fixes it). |
| \`Continuous Listening\` card | Legacy STT is actively recording or transcribing. | Speak normally or click stop to end recording. |
| Green LED on avatar | Wake Word is active and listening. | Say "Hey Aisha" to activate. |

---

## 4. Natural Language Commands

AiSHA understands natural language and recognizes keywords associated with different CRM entities. You can speak or type conversationally.

### 4.1 Leads & Prospects

**Keywords:** lead, leads, prospect, prospects, prospecting, inbound, outbound, cold lead, warm lead, hot lead, lead source, lead score, lead status, qualified lead, unqualified, nurture, nurturing

**Example Commands:**
- "Show me my hot leads"
- "Create a new prospect"
- "What leads came in this week?"
- "How many qualified leads do we have?"
- "List all leads from the website source"

### 4.2 Accounts & Companies

**Keywords:** account, accounts, company, companies, organization, organizations, business, businesses, client, clients, customer, customers, vendor, vendors, partner, partners, enterprise, SME, SMB, account manager, account owner, revenue, ARR, MRR

**Example Commands:**
- "List all enterprise accounts"
- "What's the revenue for this client?"
- "Show me partner companies"
- "Find accounts in California"
- "Who owns the Acme Corp account?"

### 4.3 Contacts & People

**Keywords:** contact, contacts, person, people, individual, stakeholder, stakeholders, decision maker, decision-maker, buyer, buyers, champion, influencer, executive, CEO, CFO, CTO, phone number, email address, LinkedIn

**Example Commands:**
- "Find the decision maker at Acme Corp"
- "Show me all CEOs in my contacts"
- "Who's the champion for this deal?"
- "Get John Smith's phone number"
- "Add a new contact for Global Tech"

### 4.4 Opportunities & Pipeline

**Keywords:** opportunity, opportunities, deal, deals, pipeline, pipelines, stage, stages, funnel, sales cycle, win, won, lost, close, closed, proposal, proposals, quote, quotes, negotiation, negotiating, discovery, demo, presentation, POC, proof of concept, contract, contracts, forecast, forecasting, expected close, close date, due date, deal size, deal value, amount, probability, win rate

**Stage Names:** prospecting, qualification, qualified, needs analysis, value proposition, decision makers, perception analysis, proposal sent, negotiation review, closed-won, closed-lost

**Example Commands:**
- "What's in my pipeline?"
- "Show deals closing this month"
- "What's the forecast?"
- "Move this deal to negotiation"
- "How many proposals are pending?"
- "What's my win rate this quarter?"

### 4.5 Activities & Tasks

**Keywords:** activity, activities, task, tasks, todo, to-do, to do, call, calls, calling, phone call, follow up, follow-up, followup, meeting, meetings, appointment, appointments, calendar, schedule, scheduled, scheduling, reschedule, rescheduling, book, booked, booking, email, emails, emailing, note, notes, log, logged, reminder, reminders, due, overdue, pending, completed, done

**Time References:** today, tomorrow, this week, next week, Monday, Tuesday, Wednesday, Thursday, Friday, morning, afternoon, evening, 9am, 10am, 11am, 2pm, 3pm, etc.

**Example Commands:**
- "Schedule a call for Monday at 11am"
- "What's on my calendar today?"
- "Add a follow-up task"
- "Show overdue activities"
- "Book a meeting with Jane for tomorrow afternoon"
- "What tasks are due this week?"
- "Log a note about my call with John"

### 4.6 Dashboard & Analytics

**Keywords:** dashboard, overview, summary, report, reports, reporting, analytics, metrics, KPI, KPIs, performance, stats, statistics, chart, charts, graph, graphs, trend, trends, insight, insights

**Example Commands:**
- "Show me the dashboard"
- "What are my KPIs?"
- "Give me a summary of this week"
- "How is my team performing?"
- "What's the trend for new leads?"

### 4.7 Action Types

| Action | Keywords | Examples |
|--------|----------|----------|
| **Create** | create, creating, add, adding, new, schedule, book | "Create a new lead", "Add a contact", "Schedule a meeting" |
| **Update** | update, updating, edit, editing, modify, change, changing, move | "Update the account", "Change the status", "Move to next stage" |
| **View/List** | list, show, display, view, see, find, search, lookup, look up, get | "Show me leads", "List all accounts", "Find overdue tasks" |
| **Assign** | assign, assigning, reassign, transfer | "Assign this lead to Sarah", "Reassign the opportunity" |
| **Convert** | convert, converting | "Convert this lead to an account" |
| **Export** | export, download | "Export my contacts", "Download the report" |
| **Delete** | delete, deleting, remove, removing | "Delete this task" (requires confirmation) |

---

## 5. Guided Forms & Quick Actions

### 5.1 Quick Actions

- Located directly under the hero card.
- Instant, one-click prompts for executive overviews.
- Disabled while a message is sending to avoid duplicate submissions.

**Available Quick Actions:**
- Dashboard overview
- Summarize my pipeline
- Show today's tasks
- View recent activities
- List new leads

### 5.2 Guided Creations

1. Ensure a tenant is selected (badge must show **Active tenant**).
2. Click an entity chip (Lead, Account, Contact, Opportunity, Activity).
3. Complete the conversational form that appears below the chip row.
4. AiSHA confirms success via toast + assistant message. Errors display inline with retry guidance.

### 5.3 Suggestions Panel

- Appears when the AI engine has context-specific recommendations (e.g., "Summarize this account").
- Each pill sources metadata (hover reveals the source).
- Selecting a suggestion pre-fills the composer and focuses the textarea for optional edits.

---

## 6. Best Practices for Talking to AiSHA

### 6.1 Tips for Best Results

- **Be Specific**: "Show contacts in California" is better than "Show me my West Coast contacts."
- **Use Full Names**: Refer to "John Smith" instead of just "John."
- **Speak Naturally**: You don't need rigid commands. "Tell me about my top deals" works as well as "List opportunities sorted by amount descending."
- **Use Time References**: Say "tomorrow", "next Monday", or "at 3pm" for scheduling.
- **Mention the Entity**: Include words like "lead", "account", "deal", or "task" so AiSHA knows what you're referring to.

### 6.2 Conversation Flow

AiSHA maintains conversation context within a session. You can have multi-turn conversations:

1. **You:** "Show me my leads"
2. **AiSHA:** "Here are your leads: Jennifer Martinez (qualified), ..."
3. **You:** "Tell me more about Jennifer"
4. **AiSHA:** "Jennifer Martinez is a qualified lead from Innovate Marketing Group..."
5. **You:** "Schedule a call with her for tomorrow"
6. **AiSHA:** "I'll schedule a call with Jennifer Martinez for tomorrow. What time works best?"

### 6.3 Confirmation for Actions

AiSHA will ask for confirmation before:
- Creating new records
- Updating existing data
- Deleting or removing items
- Assigning records to team members

Always review the proposed action before confirming.

---

## 7. Testing & Preview Workflow

| Scenario | Recommended Workflow |
|----------|---------------------|
| UI/UX iteration | Run \`npm run dev\` (frontend) and \`npm run dev\` inside \`backend/\`. Preview at \`http://localhost:5173\` with hot reload. |
| Docker validation | After finishing tweaks, run \`docker compose up -d --build frontend\` so the container picks up the latest bundle and opens \`http://localhost:4000\`. |
| Voice QA | Use Chromium-based browsers with mic permissions. Test realtime voice, legacy STT, and Wake Word modes. Verify warning banners and telemetry debug card (enable via \`VITE_AI_DEBUG_TELEMETRY=true\`). |
| Wake Word Testing | Enable Wake Word, say "Hey Aisha", verify greeting response, then say "Thanks" to end session. |
| Asset updates | Replace \`public/assets/aisha-executive-portrait.jpg\` with a same-sized square image to keep the glow ring aligned. Clear cache or hard-refresh to see the change. |

---

## 8. Troubleshooting

| Symptom | Resolution |
|---------|------------|
| Panel width or layout hasn't changed | Ensure you're on the dev server (\`npm run dev\`). Docker containers require rebuilds to pick up \`src/\` edits. |
| \`ReferenceError: Cannot access 've' before initialization\` in console | This occurs if local edits reorder constants improperly. Pull the latest \`AiSidebar.jsx\` or run linting to catch block-scoped hoisting issues. |
| Voice commands stuck on "Transcribing…" | Check network tab for \`/api/ai/speech-to-text\` failures. If realtime mode is enabled, toggle it off/on to refresh the ephemeral token. |
| "I'm not sure what action you want to take" | Your message may not include recognized CRM keywords. Try rephrasing with specific entity names (lead, account, deal, task, etc.). |
| Wake Word not responding | Ensure microphone permissions are granted. Wake Word requires Web Speech API support (Chrome/Edge recommended). |
| Guided forms disabled | Select a tenant from the global tenant picker. The Workspace card will update to **Active tenant** and unlock forms. |
| Suggestions missing | They only populate on routes where telemetry has enough context (e.g., Accounts, Opportunities). Navigate to a supported view and wait a few seconds. |
| AI returns "no leads found" when leads exist | Ensure you're connected to the correct tenant. Check the tenant badge in the header card. |

---

## 9. Available AI Tools (48 Functions)

AiSHA has access to 48 specialized tools for CRM operations:

### Data Retrieval
- \`fetch_tenant_snapshot\` - Get overview of all CRM data
- \`listLeads\`, \`listAccounts\`, \`listContacts\`, \`listOpportunities\`, \`listActivities\` - List entities with filters
- \`getLeadDetails\`, \`getAccountDetails\`, \`getContactDetails\`, \`getOpportunityDetails\` - Get specific record details
- \`searchLeads\`, \`searchAccounts\`, \`searchContacts\`, \`searchOpportunities\`, \`searchActivities\` - Search by name/keyword

### Data Creation
- \`createLead\`, \`createAccount\`, \`createContact\`, \`createOpportunity\`, \`createActivity\` - Create new records
- \`createNote\` - Add notes to records

### Data Updates
- \`updateLead\`, \`updateAccount\`, \`updateContact\`, \`updateOpportunity\`, \`updateActivity\` - Modify existing records
- \`convertLeadToAccount\` - Convert qualified leads

### Workflows & Automation
- \`listWorkflows\`, \`executeWorkflow\`, \`getWorkflowStatus\` - Manage automated workflows

### Telephony & Communication
- \`initiateCall\`, \`logCallOutcome\`, \`scheduleCallback\` - Call management
- \`sendSmsMessage\`, \`getSmsHistory\` - SMS communication

### Analytics
- \`getDashboardStats\` - Dashboard metrics and KPIs

---

## 10. Related References

- **Developer Manual:** \`docs/AISHA_CRM_DEVELOPER_MANUAL.md\` (see "AiSidebar overview for Phase 4 workstreams")
- **Phase 4 Plan:** \`orchestra/phases/phase4/PHASE_4_FULL_CUTOVER.md\`
- **Speech Hooks Tests:** \`src/components/ai/__tests__/AiSidebar.voice.test.jsx\`
- **Realtime Hook:** \`src/hooks/useRealtimeAiSHA.js\`
- **Wake Word Hook:** \`src/hooks/useWakeWordDetection.js\`
- **Keyword Categories:** \`src/lib/ambiguityResolver.ts\` (see \`CRM_KEYWORD_CATEGORIES\`)
- **Braid Tools:** \`braid-llm-kit/examples/assistant/*.braid\`

---

## 11. Quick Reference Card

### Voice Activation
| Mode | How to Start | How to End |
|------|--------------|------------|
| Wake Word | Say "Hey Aisha" | Say "Thanks" or "Goodbye" |
| Realtime Voice | Click "Realtime Voice" button | Click stop button |
| Push-to-Talk | Click "Voice" button | Release button or click stop |

### Common Commands
| What You Want | What to Say |
|---------------|-------------|
| See your leads | "Show me my leads" |
| Check pipeline | "What's in my pipeline?" |
| Today's tasks | "What's on my calendar today?" |
| Schedule a call | "Schedule a call with [name] for [time]" |
| Create a lead | "Create a new lead for [company]" |
| Get details | "Tell me about [name]" |
| Dashboard | "Show me the dashboard" |

---

Maintain this guide alongside any future Phase 4-ready UI work so launch, training, and support teams can rely on a single source of truth for AiSHA-focused workflows.
