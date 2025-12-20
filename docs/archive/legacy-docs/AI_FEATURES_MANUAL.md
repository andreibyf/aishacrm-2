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

**Document Version:** 1.0  
**Last Updated:** December 5, 2025  
**Maintainer:** Aisha CRM Team

For questions or feedback, contact your system administrator.
