# AiSHA Assistant User Guide

_Last updated: December 24, 2025_

AiSHA (AI Super Hi-performing Assistant) is the executive-assistant layer that runs inside the CRM sidebar. This guide explains how end users, product, and support teams should interact with the Phase 4-ready assistant experience, including layout, quick actions, guided forms, voice controls, and natural language commands.

---

## 1. Opening the Assistant

1. Click the AiSHA avatar button in the lower-right corner of any CRM view.
2. The right-side drawer widens to **540px** and shows the executive header card.
3. To close the assistant, press **Esc** or click the **×** button in the header.
4. **Wake Word:** Say "Hey Aisha" (or "Hi Aisha", "Aisha") when Wake Word mode is enabled to activate hands-free voice interaction.

> **Note:** AiSHA has full **CRM operations & automation** capabilities. It can create, read, update, and delete CRM records (accounts, leads, contacts, opportunities, activities, notes) as well as execute workflows, make AI-powered calls, conduct web research, generate reports, and navigate you through the CRM. All write operations are tracked in the audit log for compliance.

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

### 6.2 Conversation Flow & Session Context

AiSHA maintains **conversation context** within a session. This means you can have natural multi-turn conversations without repeating yourself:

1. **You:** "Show me my leads"
2. **AiSHA:** "Here are your leads: Jennifer Martinez (qualified), One Charge (new), ..."
3. **You:** "Tell me more about Jennifer"
4. **AiSHA:** "Jennifer Martinez is a qualified lead from Innovate Marketing Group..."
5. **You:** "Schedule a call with her for tomorrow"
6. **AiSHA:** "I'll schedule a call with Jennifer Martinez for tomorrow. What time works best?"
7. **You:** "Add a phone number 555-1234"
8. **AiSHA:** "Done! I've added phone number 555-1234 to Jennifer Martinez's record."

**How It Works:**
- When AiSHA retrieves records (leads, accounts, contacts, etc.), it remembers them for the session
- You can refer to records by name in follow-up questions
- Actions like "update", "add a note", or "schedule a call" apply to the referenced record
- The context resets when you clear the chat (trash button)

**Supported Entity Types:**
| Entity | Tracked By |
|--------|------------|
| Leads | first_name, last_name, email, company |
| Contacts | first_name, last_name, email |
| Accounts | name, company_name |
| Opportunities | name |
| Activities | subject |

### 6.3 Confirmation for Actions

AiSHA will ask for confirmation before:
- Creating new records
- Updating existing data
- Deleting or removing items
- Assigning records to team members

Always review the proposed action before confirming.

### 6.4 Clean User Responses (No Technical IDs)

AiSHA keeps technical details (like UUIDs) behind the scenes. You'll see clean, natural responses:

**What You See:**
> "Yes, you have a lead named One Charge with status 'New', sourced from Website. Would you like me to do anything with this lead?"

**What AiSHA Tracks Internally:**
- Record UUID for follow-up actions
- Entity type and metadata
- Last-queried context

**When You Need the ID:**
Simply ask: "What's the reference ID for One Charge?" and AiSHA will provide it.

This keeps conversations natural while maintaining full ability to perform updates, deletes, and other operations.

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
# Aisha CRM - AI Features Manual

> **AI-SHA: AI Super Hi-performing Assistant**
> 
> Comprehensive guide to AI capabilities, prompt engineering, expectations, and best practices.

---

## Table of Contents

1. [Overview](#1-overview)
2. [AI Assistant (Chat Interface)](#2-ai-assistant-chat-interface)
3. [Voice Features](#3-voice-features)
4. [AI Calling (CallFluent & Thoughtly)](#4-ai-calling-callfluent--thoughtly)
5. [AI Campaigns](#5-ai-campaigns)
6. [Prompt Engineering Guide](#6-prompt-engineering-guide)
7. [Understanding AI Behavior](#7-understanding-ai-behavior)
8. [Hallucination Awareness](#8-hallucination-awareness)
9. [Troubleshooting](#9-troubleshooting)
10. [Configuration Reference](#10-configuration-reference)

---

## 1. Overview

### What is AI-SHA?

AI-SHA (AI Super Hi-performing Assistant) is an integrated AI executive assistant that helps you manage your CRM operations through natural language. It can:

- **Query CRM Data**: Search accounts, leads, contacts, opportunities
- **Manage Records**: Create, update, and organize CRM entities
- **Schedule Activities**: Set up meetings, tasks, and follow-ups
- **Make AI Calls**: Initiate outbound calls via AI voice agents
- **Run Campaigns**: Orchestrate email and call campaigns
- **Research**: Look up company information from external sources
- **Summarize**: Generate insights from call transcripts and data

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend UI                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AiChatWidget │  │ MicButton    │  │ CommandPalette       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend AI Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ /api/ai/*    │  │ Braid SDK    │  │ Tool Executor        │  │
│  │ Chat, TTS,   │  │ 27+ Tools    │  │ (Tenant-Scoped)      │  │
│  │ STT, Tokens  │  │ CRM Ops      │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     External AI Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ OpenAI       │  │ ElevenLabs   │  │ CallFluent/Thoughtly │  │
│  │ GPT-4, etc   │  │ TTS Voice    │  │ AI Voice Agents      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. AI Assistant (Chat Interface)

### Getting Started

The AI Assistant is available via:
- **Header Widget**: Click "✨ ASK AISHA" in the top header bar (shows "Executive Assistant • Ready" when available)
- **Command Palette**: Press `Ctrl+K` / `Cmd+K` for quick access

The header widget opens a chat panel where you can type or speak your requests.

### Capabilities

| Category | What You Can Ask |
|----------|------------------|
| **Accounts** | "Show me all accounts in California", "Create an account for Acme Corp" |
| **Leads** | "List my hot leads", "Update John's lead status to qualified" |
| **Contacts** | "Find contacts at Microsoft", "Add a new contact for lead #123" |
| **Activities** | "What meetings do I have today?", "Schedule a follow-up call for tomorrow" |
| **Opportunities** | "Show pipeline for Q4", "Move opportunity to negotiation stage" |
| **Notes** | "Add a note to Acme account", "Search notes mentioning 'pricing'" |
| **Research** | "Look up company info for TechCorp", "What does Acme Corp do?" |
| **Calls** | "Call John at Acme Corp", "Check if calling is available" |

### Example Conversations

**Data Query:**
```
You: Show me leads created this week

AI-SHA: I found 12 leads created this week:
1. John Smith (Tech Corp) - Hot - Created Dec 2
2. Sarah Johnson (Innovate LLC) - Warm - Created Dec 3
...

Would you like me to:
- Filter by status?
- Show contact details for any of these?
- Schedule follow-up activities?
```

**Record Creation:**
```
You: Create a new lead for Mike Brown at CloudTech, email mike@cloudtech.com

AI-SHA: ✅ I've created the lead:
- Name: Mike Brown
- Company: CloudTech
- Email: mike@cloudtech.com
- Status: New

Would you like me to:
- Add more details (phone, address)?
- Schedule an introductory call?
- Look up CloudTech company information?
```

**Multi-Step Workflow:**
```
You: Find all accounts without activities this month and create follow-up tasks

AI-SHA: I found 8 accounts without recent activities. I'll create follow-up 
tasks for each:

✅ Created "Follow-up call" for Acme Corp (assigned to you, due in 3 days)
✅ Created "Check-in email" for TechStart Inc (assigned to you, due in 3 days)
...

All 8 follow-up tasks created. Would you like me to prioritize any of these?
```

### Tool Iterations

The AI can chain up to **3 tool calls** per conversation turn. This enables complex operations like:

1. Search for records → 2. Analyze results → 3. Take action

If more steps are needed, the AI will pause and ask for confirmation.

---

## 3. Voice Features

### Speech-to-Text (STT)

Click the microphone button to speak your request. The AI uses OpenAI Whisper for transcription.

**Best Practices:**
- Speak clearly and at a normal pace
- Pause between sentences for better parsing
- Keep requests under 30 seconds for best results
- Avoid background noise when possible

**Limitations:**
- Maximum audio size: 6MB
- Supported formats: MP3, WAV, WebM
- Language: English (primary), other languages supported with reduced accuracy

### Text-to-Speech (TTS)

AI responses can be read aloud using ElevenLabs or browser TTS.

**Voice Options:**
- **ElevenLabs** (if configured): High-quality, natural-sounding voice
- **Browser TTS** (fallback): Built-in browser speech synthesis

**Limitations:**
- Maximum text: 4,000 characters per request
- Long responses may be truncated for audio playback

### Realtime Voice Mode

For live voice conversations, the AI uses OpenAI's Realtime API.

**Safety Restrictions in Voice Mode:**
- ❌ Delete operations are blocked
- ❌ Bulk modifications are blocked
- ✅ Read operations allowed
- ✅ Create/update with confirmation

---

## 4. AI Calling (CallFluent & Thoughtly)

### Overview

AI-SHA can initiate outbound calls using AI voice agents from CallFluent or Thoughtly. These calls are fully automated conversations handled by AI.

### Initiating a Call

**Via Chat:**
```
You: Call John Smith at Acme Corp about the proposal follow-up

AI-SHA: 📞 Initiating call to John Smith (+1-555-123-4567)
- Agent: Sales Follow-up Agent
- Purpose: Proposal follow-up
- Provider: CallFluent

The call is in progress. I'll notify you when it completes with a summary.
```

**Via Direct Command:**
```
You: Check if calling is available

AI-SHA: ✅ Calling is configured with CallFluent.
Available agents:
1. Sales Follow-up Agent
2. Appointment Setter
3. Customer Check-in Agent

Would you like me to initiate a call?
```

### Call Flow

1. **Initiation**: AI triggers call via provider API
2. **Conversation**: AI agent conducts the call
3. **Transcript**: Full transcript captured
4. **Analysis**: AI analyzes transcript for:
   - Summary
   - Sentiment (positive/neutral/negative)
   - Action items
   - Customer requests
   - Commitments made
5. **CRM Updates**: 
   - Activity logged
   - Note created with summary
   - Follow-up tasks auto-created
   - Lead status updated (if applicable)
6. **Notification**: In-app notification sent to assigned user

### What to Expect

| Outcome | What Happens |
|---------|--------------|
| **Answered** | Full transcript analysis, CRM updates, follow-up tasks |
| **Voicemail** | Voicemail detected, activity logged, retry scheduled |
| **Busy** | Call marked as busy, automatic retry queued |
| **Failed** | Error logged, notification sent, manual follow-up suggested |

### Provider Configuration

AI calling requires one of:
- **CallFluent**: Configure API key and agent ID in tenant settings
- **Thoughtly**: Configure API key and agent ID in tenant settings

Credentials are stored per-tenant in `tenant_integrations` table.

---

## 5. AI Campaigns

### Overview

Run automated outreach campaigns with AI-powered personalization.

### Campaign Types

| Type | Description |
|------|-------------|
| **Email Campaign** | Send personalized emails to a list of contacts |
| **Call Campaign** | AI agent calls each contact with customized talking points |
| **Sequence** (Planned) | Multi-step campaigns combining emails and calls |

### Creating a Campaign

1. **Define Target Audience**: Select contacts, leads, or use filters
2. **Choose Template**: Email template or call script
3. **Set Personalization**: Map fields like {{first_name}}, {{company}}
4. **Schedule**: Start immediately or schedule for later
5. **Launch**: Campaign runs in background

### Campaign Lifecycle

```
draft → scheduled → running → completed
          ↓           ↓
        paused    (on error)
          ↓
       resumed
```

### Monitoring Progress

- **Dashboard**: View progress, success/failure counts
- **Per-Contact Status**: See which contacts were reached
- **Metrics**: Open rates, call outcomes, response rates

### Best Practices

1. **Start Small**: Test with 5-10 contacts before scaling
2. **Personalize**: Use merge fields for better engagement
3. **Time Zones**: Schedule calls during business hours
4. **Consent**: Ensure contacts have opted in to communications
5. **Monitor**: Watch early results and adjust

---

## 6. Prompt Engineering Guide

### Principles for Effective Prompts

#### Be Specific

❌ **Vague**: "Show me some leads"  
✅ **Specific**: "Show me leads created this week with status 'Hot' in California"

#### Provide Context

❌ **No Context**: "Call him"  
✅ **With Context**: "Call John Smith at Acme Corp about the pricing proposal"

#### Use Natural Language

❌ **Technical**: "SELECT * FROM leads WHERE status = 'qualified'"  
✅ **Natural**: "Find all qualified leads"

#### Break Down Complex Tasks

❌ **Too Much**: "Find all stale accounts, create tasks for each, assign to sales team, and send me a report"  
✅ **Step by Step**: 
1. "Find accounts with no activity in 30 days"
2. "Create follow-up tasks for these accounts"
3. "Summarize what was created"

### Prompt Templates

**Data Queries:**
```
Show me [entity type] where [condition] sorted by [field]

Examples:
- "Show me accounts in Texas sorted by revenue"
- "List leads assigned to me created last month"
- "Find contacts with email ending in @google.com"
```

**Record Creation:**
```
Create a [entity type] for [name] at [company] with [details]

Examples:
- "Create a lead for Sarah Johnson at TechCorp, email sarah@techcorp.com, phone 555-1234"
- "Add an account for Microsoft with industry Technology"
```

**Updates:**
```
Update [entity] [identifier] - set [field] to [value]

Examples:
- "Update lead John Smith - set status to Qualified"
- "Change opportunity Acme Deal stage to Negotiation"
```

**Scheduling:**
```
Schedule a [activity type] for [date/time] with [entity]

Examples:
- "Schedule a call with John tomorrow at 2pm"
- "Create a follow-up task for Acme account due next Friday"
```

**Research:**
```
Look up [what] for [company/entity]

Examples:
- "Look up company information for Salesforce"
- "Research the latest news about Microsoft"
```

### Advanced Prompting

**Chained Operations:**
```
"Find all leads from last week, identify which don't have phone numbers, 
and add a task to each saying 'Collect phone number'"
```

**Conditional Logic:**
```
"For each opportunity in Proposal stage for more than 2 weeks, 
create a follow-up task with high priority"
```

**Aggregations:**
```
"Summarize my pipeline by stage with total values"
"Count leads by source for this quarter"
```

---

## 7. Understanding AI Behavior

### How AI-SHA Thinks

1. **Intent Recognition**: AI parses your request to understand what you want
2. **Tool Selection**: Chooses appropriate CRM tools (search, create, update, etc.)
3. **Execution**: Runs tools with proper tenant context
4. **Response Generation**: Formats results and suggests next steps

### Response Patterns

**Confirmation Before Destructive Actions:**
```
You: Delete all test leads

AI-SHA: ⚠️ I found 15 leads matching "test". Deleting these is permanent.
Are you sure you want to proceed?
```

**Clarification When Ambiguous:**
```
You: Update John's status

AI-SHA: I found multiple Johns:
1. John Smith (Lead)
2. John Williams (Contact)
3. John Davis (Account contact)

Which John did you mean?
```

**Suggestions for Next Steps:**
```
AI-SHA: ✅ Created lead for Mike Brown.

Would you like me to:
- Look up company information for CloudTech?
- Schedule an introductory call?
- Add them to an outreach campaign?
```

### Confidence Levels

AI-SHA operates with different confidence levels:

| Level | Behavior |
|-------|----------|
| **High** | Executes action directly |
| **Medium** | Executes but asks for confirmation on significant changes |
| **Low** | Asks for clarification before proceeding |

### Tool Policies

| Policy | Tools | Behavior |
|--------|-------|----------|
| **READ_ONLY** | search_, list_, get_, fetch_ | Always allowed |
| **WRITE** | create_, update_, add_ | Allowed with context |
| **DESTRUCTIVE** | delete_, remove_, bulk_ | Requires confirmation, blocked in voice mode |

---

## 8. Hallucination Awareness

### What is Hallucination?

AI hallucination occurs when the AI generates information that sounds plausible but is **not accurate or not present in your data**.

### Common Hallucination Scenarios

#### 1. Fabricated Data

**Example:**
```
You: What's John Smith's revenue contribution?

AI-SHA (hallucinating): John Smith has contributed $150,000 in revenue 
across 3 closed deals this quarter.
```

**Reality:** No revenue data exists for John Smith. The AI invented specifics.

**How to Detect:**
- Ask for the source: "Which deals are you counting?"
- Cross-reference with actual CRM data
- Be suspicious of very specific numbers you haven't tracked

#### 2. Assumed Relationships

**Example:**
```
You: Who should I follow up with at Acme Corp?

AI-SHA (hallucinating): Based on your previous calls with Sarah Johnson 
(VP Sales) and Mike Brown (CTO), I recommend following up with Sarah 
as she expressed interest in the enterprise plan.
```

**Reality:** You never spoke with Mike Brown; the AI assumed based on patterns.

**How to Detect:**
- Verify with: "When did I last contact Mike Brown?"
- Check activity history in CRM

#### 3. Invented Features

**Example:**
```
You: Can you send a contract to John?

AI-SHA (hallucinating): I'll generate the contract from the template 
and send it to John's email now.
```

**Reality:** Contract generation might not be an available feature.

**How to Detect:**
- Ask: "Do you have the ability to send contracts?"
- Check feature documentation

### Preventing Hallucinations

#### 1. Verify Important Information

Always verify critical data before taking action:
```
You: Before scheduling this call, show me John's contact record first.
```

#### 2. Ask for Sources

Request the AI cite its sources:
```
You: What data are you basing that recommendation on?
You: Show me the records you're referencing.
```

#### 3. Use Explicit Queries

Don't rely on AI summaries for important decisions:
```
You: List all activities with John in the last 30 days (exact records, not summary)
```

#### 4. Validate Before Acting

For updates or creations, review before confirming:
```
AI-SHA: I'll create a task for follow-up with Acme Corp.

You: What exactly will the task say? Show me before creating.
```

### When AI Says "I Don't Know"

This is actually a **good sign**. The AI admitting uncertainty is more reliable than confident hallucination:

```
You: What's the best time to call John?

AI-SHA: I don't have information about John's preferred contact times 
in the system. Would you like me to check his past activity patterns 
or create a task to ask him directly?
```

### Reporting Hallucinations

If you notice consistent hallucination patterns:
1. Note the exact prompt and response
2. Check if the issue is reproducible
3. Report to your system administrator
4. Consider whether prompt clarity could help

---

## 9. Troubleshooting

### Common Issues

#### "AI is not responding"

**Possible Causes:**
- Network connectivity issues
- OpenAI API rate limits
- Server errors

**Solutions:**
1. Check internet connection
2. Refresh the page
3. Wait 30 seconds and retry
4. Check if other AI features work (TTS, STT)

#### "AI gives wrong data"

**Possible Causes:**
- Stale cache
- Tenant context mismatch
- Hallucination

**Solutions:**
1. Refresh and retry
2. Be more specific in your query
3. Ask AI to "search fresh" or "fetch latest"
4. Verify with direct CRM lookup

#### "Tool execution failed"

**Possible Causes:**
- Invalid parameters
- Missing required fields
- Permission issues
- Database constraints

**Solutions:**
1. Check error message for specifics
2. Provide missing information
3. Simplify the request
4. Contact admin for permission issues

#### "Voice not working"

**Possible Causes:**
- Microphone permissions denied
- Browser not supported
- Audio format issues

**Solutions:**
1. Check browser microphone permissions
2. Use Chrome or Firefox (recommended)
3. Ensure microphone is connected and working
4. Try browser TTS fallback

#### "Calls not initiating"

**Possible Causes:**
- Provider not configured
- Invalid phone number format
- API quota exceeded

**Solutions:**
1. Run: "Check if calling is available"
2. Verify phone number format (+1-XXX-XXX-XXXX)
3. Check tenant integrations settings
4. Contact admin for quota issues

### Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "Tenant context missing" | Session lost | Refresh and re-login |
| "Tool not available" | Feature disabled | Check mode (voice vs chat) |
| "Rate limit exceeded" | Too many requests | Wait 60 seconds |
| "Invalid entity ID" | Record not found | Verify the ID exists |
| "Permission denied" | Access restricted | Contact admin |

---

## 10. Configuration Reference

### Environment Variables (System Admin)

| Variable | Purpose | Required |
|----------|---------|----------|
| `OPENAI_API_KEY` | OpenAI GPT access | Yes |
| `ELEVENLABS_API_KEY` | Premium TTS voice | No |
| `BRAID_MCP_URL` | Braid tool server | Yes |

### Per-Tenant Settings

| Setting | Location | Purpose |
|---------|----------|---------|
| OpenAI API Key | tenant_integrations | Tenant-specific AI key |
| CallFluent API Key | tenant_integrations | AI calling |
| CallFluent Agent ID | tenant_integrations | Which AI agent to use |
| Thoughtly API Key | tenant_integrations | Alternative AI calling |
| Thoughtly Agent ID | tenant_integrations | Which agent to use |

### Tool Availability by Mode

| Tool Category | Chat Mode | Voice Mode | Read-Only Mode |
|---------------|-----------|------------|----------------|
| Search/List | ✅ | ✅ | ✅ |
| Get/Fetch | ✅ | ✅ | ✅ |
| Create | ✅ | ✅ (with confirm) | ❌ |
| Update | ✅ | ✅ (with confirm) | ❌ |
| Delete | ✅ (with confirm) | ❌ | ❌ |
| Bulk Operations | ✅ (with confirm) | ❌ | ❌ |
| AI Calling | ✅ | ❌ | ❌ |

### Rate Limits

| Feature | Limit | Reset |
|---------|-------|-------|
| Chat requests | 60/minute | Rolling |
| TTS requests | 30/minute | Rolling |
| STT requests | 20/minute | Rolling |
| Tool executions | 100/minute | Rolling |
| AI calls | Depends on provider | Provider-specific |

---

## Appendix A: Available Tools

### CRM Operations

| Tool | Description |
|------|-------------|
| `getCrmSnapshot` | Get overview of all CRM data |
| `searchAccounts` | Search accounts by criteria |
| `createAccount` | Create new account |
| `updateAccount` | Update account fields |
| `deleteAccount` | Delete an account |
| `searchLeads` | Search leads by criteria |
| `createLead` | Create new lead |
| `updateLead` | Update lead fields |
| `convertLead` | Convert lead to opportunity |
| `searchContacts` | Search contacts |
| `createContact` | Create new contact |
| `updateContact` | Update contact fields |
| `searchActivities` | Search activities |
| `createActivity` | Schedule activity |
| `updateActivity` | Update activity |
| `completeActivity` | Mark activity complete |
| `searchOpportunities` | Search opportunities |
| `createOpportunity` | Create opportunity |
| `updateOpportunity` | Update opportunity |
| `searchNotes` | Search notes |
| `createNote` | Create note |
| `updateNote` | Update note |

### Research & Integration

| Tool | Description |
|------|-------------|
| `fetchCompanyInfo` | Look up company info from web |
| `webSearch` | General web search |
| `fetchWebPage` | Fetch and summarize webpage |

### Telephony

| Tool | Description |
|------|-------------|
| `initiateCall` | Start AI call to phone number |
| `callContact` | Call contact by ID |
| `checkCallingProvider` | Verify calling is configured |
| `getCallingAgents` | List available AI agents |

### Workflows

| Tool | Description |
|------|-------------|
| `listWorkflowTemplates` | List available templates |
| `createWorkflowFromTemplate` | Create workflow from template |
| `getWorkflowExecutions` | View workflow run history |

---

## Appendix B: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open command palette |
| `Escape` | Close AI widget |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Ctrl+/` / `Cmd+/` | Toggle AI sidebar |

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **AI-SHA** | AI Super Hi-performing Assistant - the AI assistant system |
| **Braid SDK** | Tool execution framework for CRM operations |
| **CallFluent** | AI voice calling provider |
| **Hallucination** | When AI generates plausible but incorrect information |
| **MCP** | Model Context Protocol - tool integration standard |
| **Tenant** | Isolated workspace for organization's data |
| **Thoughtly** | Alternative AI voice calling provider |
| **Tool** | A function the AI can execute (search, create, update, etc.) |
| **TTS** | Text-to-Speech - AI reading responses aloud |
| **STT** | Speech-to-Text - Voice input transcription |

---

**Document Version:** 1.1  
**Last Updated:** December 20, 2025  
**Maintainer:** Aisha CRM Team

For questions or feedback, contact your system administrator.
