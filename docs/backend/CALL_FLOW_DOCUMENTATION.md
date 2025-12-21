# Call Flow System Documentation

## Overview

The Aisha CRM call flow system provides comprehensive handling of both inbound and outbound telephone calls with automatic contact resolution, transcript processing, and activity logging.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Telephony Providers                       │
│  (Twilio, SignalWire, CallFluent, Thoughtly)               │
└────────────────┬───────────────────────┬────────────────────┘
                 │ Webhooks              │ Webhooks
                 ▼                       ▼
┌────────────────────────────┐  ┌──────────────────────────────┐
│  Provider Webhook Adapters │  │  Generic Webhook Endpoints   │
│  (normalize payloads)      │  │  (standard format)           │
└────────────┬───────────────┘  └────────────┬─────────────────┘
             │                                │
             └────────────┬───────────────────┘
                          ▼
          ┌───────────────────────────────────┐
          │     Call Flow Handler             │
          │  - Contact resolution             │
          │  - Auto-create leads              │
          │  - Transcript AI analysis         │
          │  - Activity logging               │
          │  - Note creation                  │
          └───────────────┬───────────────────┘
                          ▼
          ┌───────────────────────────────────┐
          │        Database Layer             │
          │  contacts, leads, activities,     │
          │  notes, ai_campaigns              │
          └───────────────────────────────────┘
```

## Core Components

### 1. Call Flow Handler (`backend/lib/callFlowHandler.js`)

Main orchestration module that processes calls through a standardized flow:

#### Inbound Call Flow
1. **Contact Resolution**: Lookup contact/lead by phone number
2. **Auto-Creation**: Create new lead if caller is unknown
3. **Transcript Analysis**: Summarize with AI if transcript provided
4. **Activity Logging**: Record call details in activities table
5. **Note Creation**: Auto-create note with summary
6. **Webhook Emission**: Notify integrations of call event

#### Outbound Call Flow
1. **Contact Validation**: Verify contact exists (or find by phone)
2. **Transcript Analysis**: Process if call was answered
3. **Activity Logging**: Record outcome and duration
4. **Note Creation**: Create note if meaningful conversation
5. **Status Update**: Update lead/contact status based on outcome
6. **Campaign Progress**: Update AI campaign metrics if applicable
7. **Webhook Emission**: Notify integrations

### 2. Provider Webhook Adapters (`backend/lib/webhookAdapters.js`)

Normalize different provider payload formats into a standard structure:

- **Twilio**: Standard telephony webhooks
- **SignalWire**: Twilio-compatible format
- **CallFluent**: AI calling platform with transcript
- **Thoughtly**: AI voice agent with conversation analysis
- **Generic**: For testing or custom integrations

### 3. Telephony Routes (`backend/routes/telephony.js`)

API endpoints for webhook handling:

- `POST /api/telephony/webhook/:provider/inbound` - Provider-specific inbound
- `POST /api/telephony/webhook/:provider/outbound` - Provider-specific outbound
- `POST /api/telephony/inbound-webhook` - Generic inbound (standard format)
- `POST /api/telephony/outbound-webhook` - Generic outbound (standard format)
- `POST /api/telephony/prepare-call` - **NEW**: Prepare outbound call context for AI agents
- `POST /api/telephony/log-call` - Manual call logging from UI

### NEW: Prepare Outbound Call Context

**Purpose**: AI agents (CallFluent, Thoughtly) need to know WHO to call, WHAT number to dial, and WHAT to discuss before making outbound calls.

**Endpoint**: `POST /api/telephony/prepare-call`

**Request**:
```json
{
  "tenant_id": "uuid",
  "contact_id": "uuid",
  "campaign_id": "uuid (optional)"
}
```

**Response**:
```json
{
  "contact": {
    "id": "uuid",
    "name": "John Smith",
    "phone": "+15551234567",
    "email": "john@example.com",
    "company": "Acme Corp",
    "title": "CEO",
    "type": "contact",
    "status": "active"
  },
  "call_context": {
    "purpose": "Follow up on premium package inquiry",
    "talking_points": [
      "Greet John by name",
      "Discuss: Premium Package Campaign",
      "Mention offer: 20% off first year",
      "Reference last interaction: Initial inquiry email",
      "Reference their company: Acme Corp",
      "Ask if they have any questions",
      "Schedule follow-up if interested"
    ],
    "campaign_info": {
      "name": "Premium Package Campaign",
      "type": "call",
      "call_script": "Hi {name}, ...",
      "offer": "20% off first year",
      "goal": "Convert leads to customers"
    },
    "recent_interactions": [
      {
        "date": "2025-11-15T10:30:00Z",
        "type": "email",
        "subject": "Inquiry about premium package"
      }
    ]
  }
}
```

**What AI Agent Gets**:
- **WHO**: Contact name, company, title
- **WHAT NUMBER**: Primary phone number to dial
- **WHAT TO SAY**: Campaign script, call purpose, talking points
- **CONTEXT**: Recent interactions, company info, relationship history

**Usage in Campaign Worker**:
1. Campaign worker identifies next contact to call
2. Calls `prepareOutboundCall()` to fetch full context
3. Passes context to AI provider (CallFluent/Thoughtly)
4. AI agent conducts personalized conversation with context
5. Provider sends webhook with call results
6. System logs activity and updates campaign progress

## Webhook Configuration

### Twilio Setup

Configure webhook URL in Twilio console:
```
https://your-domain.com/api/telephony/webhook/twilio/inbound?tenant_id={YOUR_TENANT_ID}
```

Twilio will POST:
```json
{
  "CallSid": "CA1234...",
  "From": "+15551234567",
  "To": "+15559876543",
  "CallStatus": "completed",
  "CallDuration": "120",
  "Direction": "inbound",
  "RecordingUrl": "https://...",
  "CallerName": "John Doe"
}
```

### SignalWire Setup

Similar to Twilio:
```
https://your-domain.com/api/telephony/webhook/signalwire/inbound?tenant_id={YOUR_TENANT_ID}
```

### CallFluent Setup

Configure in CallFluent dashboard:
```
https://your-domain.com/api/telephony/webhook/callfluent/outbound?tenant_id={YOUR_TENANT_ID}
```

CallFluent payload:
```json
{
  "call_id": "cf_abc123",
  "to": "+15551234567",
  "from": "+15559876543",
  "status": "completed",
  "duration_seconds": 180,
  "transcript": "Full conversation transcript...",
  "outcome": "answered",
  "campaign_id": "uuid",
  "contact_id": "uuid"
}
```

### Thoughtly Setup

Configure in Thoughtly platform:
```
https://your-domain.com/api/telephony/webhook/thoughtly/outbound?tenant_id={YOUR_TENANT_ID}
```

Thoughtly payload:
```json
{
  "call_id": "th_xyz789",
  "phone_number": "+15551234567",
  "caller_id": "+15559876543",
  "call_status": "ended",
  "call_duration": 240,
  "full_transcript": "AI agent conversation...",
  "ai_summary": "Customer interested in product X",
  "call_outcome": "answered",
  "campaign_id": "uuid"
}
```

## Standard Payload Format

When calling generic endpoints directly (not via provider adapters), use this format:

### Inbound Webhook Payload
```json
{
  "tenant_id": "uuid",
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "call_sid": "provider-call-id",
  "call_status": "completed",
  "duration": 120,
  "recording_url": "https://...",
  "transcript": "Optional transcript text",
  "caller_name": "John Smith",  // AI agent extracted from conversation
  "caller_email": "john@example.com",  // Optional: if caller provided during call
  "provider": "twilio|signalwire|callfluent|thoughtly",
  "metadata": {
    "custom_field": "value"
  }
}
```

### Outbound Webhook Payload
```json
{
  "tenant_id": "uuid",
  "to_number": "+15551234567",
  "from_number": "+15559876543",
  "call_sid": "provider-call-id",
  "call_status": "completed",
  "duration": 180,
  "outcome": "answered|no-answer|busy|failed|voicemail",
  "recording_url": "https://...",
  "transcript": "Optional transcript",
  "contact_id": "uuid (optional)",
  "campaign_id": "uuid (optional)",
  "provider": "twilio|signalwire|callfluent|thoughtly",
  "metadata": {
    "custom_field": "value"
  }
}
```

## Contact Resolution Logic

### Phone Number Matching

The system uses flexible phone number matching:

1. **Exact Match**: Direct phone field comparison
2. **Normalized Match**: Strips spaces, dashes, parentheses, plus signs
3. **Multiple Fields**: Checks both `phone` and `mobile` columns
4. **Priority**: Contacts table searched before leads table

### Auto-Creation Rules

When an inbound call comes from an unknown number:

1. Create new lead record with:
   - `phone`: Caller's number
   - `first_name`: Extracted from AI agent (or "Unknown")
   - `last_name`: Extracted from AI agent (or "Caller")
   - `email`: Optional - if caller provided during conversation
   - `source`: "inbound_call"
   - `status`: "new"
   - `metadata`: Provider details, AI-extracted data

2. **Name Extraction Logic**:
   - AI agent extracts name from conversation (e.g., "Hi, this is John Smith")
   - **Full name**: "Sarah Johnson" → `first_name: "Sarah"`, `last_name: "Johnson"`
   - **First name only**: "Mike" → `first_name: "Mike"`, `last_name: ""`
   - **Multiple names**: "Robert James Smith" → `first_name: "Robert"`, `last_name: "James Smith"`
   - **No name**: Anonymous caller → `first_name: "Unknown"`, `last_name: "Caller"`

3. **Email Extraction**:
   - AI agent may extract email if caller mentions it (e.g., "You can reach me at john@example.com")
   - Stored in `email` field if provided
   - Optional - not all callers provide email

4. Log activity with lead relationship
5. Future calls from same number will match this lead

## Transcript Processing

### AI Summarization & Action Item Extraction

When a transcript is provided, the system:

1. **Analyzes** the full conversation
2. **Extracts** structured information:
   - **Summary**: 2-3 sentence overview
   - **Sentiment**: positive/neutral/negative
   - **Action Items**: Tasks with priority, type, and due dates
   - **Customer Requests**: What the customer asked for
   - **Commitments Made**: Promises made during the call
3. **Creates** formatted note with action items
4. **Automatically generates** follow-up activities for high/medium priority items
5. **Logs** all metadata for reporting

### Pattern Recognition (Current)

The system extracts action items by detecting common phrases:

**Follow-Up Requests**:
- "send me..." → Creates email task: "Send [material]"
- "email me..." → Creates email task with high priority
- "call me back" → Creates follow-up call task (medium priority)

**Meetings & Appointments**:
- "schedule", "meeting", "appointment" → Creates meeting task (high priority)

**Commitments**:
- "I will...", "we will...", "I'll...", "we'll..." → Captured as commitments made

**Questions**:
- "can you...", "could you..." → Captured as customer requests

**Example Input**:
```
Customer: "Can you send me the pricing information? I'd like to schedule a meeting next week."
Agent: "I'll send you the pricing details by end of day and we'll schedule that meeting."
```

**Example Output**:
```json
{
  "summary": "Call with customer discussing positive topics. 2 action item(s) identified.",
  "sentiment": "positive",
  "actionItems": [
    { "task": "Send pricing information", "priority": "high", "type": "email", "dueDate": null },
    { "task": "Schedule meeting", "priority": "high", "type": "meeting", "dueDate": null }
  ],
  "customerRequests": [
    "Requested: pricing information",
    "Requested meeting/appointment"
  ],
  "commitmentsMade": [
    "I'll send you the pricing details by end of day",
    "we'll schedule that meeting"
  ]
}
```

### Note Format

Created notes include formatted action items:

```
Call with customer discussing positive topics. 2 action item(s) identified.

✅ Call went well.

**Action Items:**
1. 🔴 Send pricing information
2. 🔴 Schedule meeting
```

**Priority Icons**:
- 🔴 High priority (1 day due)
- 🟡 Medium priority (3 days due)
- 🟢 Low priority (7 days due)

### Automatic Activity Creation

For high/medium priority action items, the system **automatically creates follow-up activities**:

```javascript
// System creates these activities automatically:
{
  type: "email",
  subject: "Action: Send pricing information",
  description: "Follow-up required for John Smith. Origin: Call activity #123",
  status: "pending",
  due_date: "2025-11-17T10:00:00Z", // Tomorrow (high priority)
  metadata: {
    priority: "high",
    action_type: "email",
    origin_activity_id: "123",
    auto_created: true,
    created_from: "call_transcript_analysis"
  }
}
```

**Activity Type Mapping**:
- Action type `email` → Activity type `email`
- Action type `call` → Activity type `call`
- Action type `meeting` → Activity type `meeting`
- Action type `task`/`general` → Activity type `task`

**Due Date Logic**:
- **High priority**: 1 day (tomorrow)
- **Medium priority**: 3 days
- **Low priority**: 7 days (not auto-created)

**Benefits**:
- ✅ No manual task creation needed
- ✅ Nothing falls through the cracks
- ✅ Automatic reminders for team
- ✅ Full audit trail (links back to originating call)
- ✅ Activities can be reassigned/modified
- ✅ **NEW**: Auto-completes activities when fulfilled

### Automatic Activity Completion

The system **detects when activities are fulfilled** and automatically closes them:

**Fulfillment Detection Patterns**:
- "I sent you..." / "emailed you..." → Closes pending email activities
- "I scheduled..." / "booked the meeting" → Closes pending meeting activities
- "Following up as promised..." → Closes pending call activities
- "Sent the proposal/quote" → Closes pending proposal activities

**Example Workflow**:
1. **Day 1**: Customer calls → "Can you send me pricing?"
   - System creates: Email activity "Action: Send pricing information" (status: pending, due tomorrow)
2. **Day 2**: You call customer → "I sent you the pricing this morning"
   - System detects: "I sent" in transcript
   - System finds: Pending email activity for this contact
   - System completes: Activity marked as completed, completed_at = NOW()
   - Metadata updated: `{"completed_by":"call_transcript_analysis","completion_activity_id":"456","auto_completed":true}`

**Completion Logic**:
- Searches for **pending activities** of matching type (email/call/meeting)
- Filters to **last 30 days** to avoid closing very old tasks
- Completes **most recent** activity of that type
- Adds completion metadata linking back to the call that fulfilled it

**Example Query**:
```sql
-- Find auto-completed activities
SELECT 
    id,
    subject,
    status,
    completed_at,
    metadata->'completion_note' as what_was_done,
    metadata->'completion_activity_id' as completing_call
FROM activities
WHERE metadata->>'auto_completed' = 'true'
ORDER BY completed_at DESC;
```

### OpenAI Integration (Ready)

**Two Modes Available:**

#### 1. **Braid MCP Server Integration** (Recommended)

Uses the braid-mcp-node-server for AI-powered transcript analysis with intelligent tenant-specific API key resolution.

**Enable in `.env`:**
```bash
USE_BRAID_MCP_TRANSCRIPT_ANALYSIS=true
BRAID_MCP_URL=http://braid-mcp-node-server:8000
TRANSCRIPT_ANALYSIS_MODEL=gpt-4o-mini
```

**Start Braid MCP Server:**
```bash
cd braid-mcp-node-server && docker compose up -d --build
```

**Benefits:**
- ✅ Automatic tenant-specific OpenAI key resolution
- ✅ Unified AI operations interface
- ✅ Redis-backed agent memory
- ✅ Better error handling and retry logic
- ✅ Structured JSON responses
- ✅ More nuanced action item extraction
- ✅ Better priority assignment
- ✅ Context-aware customer requests

**How It Works:**
1. Call flow sends transcript to `http://braid-mcp-node-server:8000/mcp/run`
2. Braid MCP resolves OpenAI API key:
   - Checks `tenant_integrations` table for tenant-specific key
   - Falls back to `system_settings` table
   - Uses `OPENAI_API_KEY` env var as last resort
3. GPT-4 analyzes transcript and returns structured JSON
4. Action items, customer requests, and fulfillment detection extracted
5. Results used to create notes and activities

#### 2. **Direct OpenAI Integration** (Legacy)

Direct API calls to OpenAI (requires uncommenting code in `analyzeTranscript()`).

**Enable:**
1. Add `OPENAI_API_KEY` to `.env`
2. Set `USE_BRAID_MCP_TRANSCRIPT_ANALYSIS=false`
3. Uncomment OpenAI code in `callFlowHandler.js`

**Limitations:**
- No tenant-specific key resolution
- Manual error handling
- No Redis memory layer

## Activity Logging

All calls are logged to the `activities` table:

```sql
INSERT INTO activities (
  tenant_id,
  related_type,    -- 'contact' or 'lead'
  related_id,      -- UUID of contact/lead
  type,            -- 'call'
  subject,         -- "Inbound call from John Doe"
  description,     -- AI summary or outcome description
  status,          -- 'completed'
  metadata         -- JSON with call details
)
```

### Activity Metadata Fields

```json
{
  "call_sid": "provider-call-id",
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "duration": 120,
  "recording_url": "https://...",
  "outcome": "answered",
  "provider": "twilio",
  "campaign_id": "uuid",
  "sentiment": "positive",
  "transcript_length": 1234,
  "direction": "inbound|outbound",
  "call_type": "call",
  "logged_via": "call_flow_handler"
}
```

## Note Creation

Automatic notes are created when:
- Transcript is provided AND
- AI summary is generated

Notes table structure:
```sql
INSERT INTO notes (
  tenant_id,
  related_type,
  related_id,
  content,          -- AI-generated summary
  metadata
)
```

### Note Metadata

```json
{
  "activity_id": "uuid",
  "sentiment": "positive",
  "action_items": ["Follow up", "Send info"],
  "outcome": "answered",
  "call_sid": "provider-call-id",
  "note_type": "call_summary"
}
```

## Campaign Integration

For outbound calls from AI campaigns:

1. **Campaign Worker** triggers AI call via provider
2. **Provider** calls webhook with `campaign_id` in payload
3. **Call Flow Handler** updates campaign progress:
   - Increments `processed` count
   - Updates contact status in `target_contacts` array
   - Records outcome, sentiment, completion time
4. **Campaign Monitor UI** reflects real-time progress

### Campaign Progress Update

```sql
UPDATE ai_campaigns
SET 
  target_contacts = /* Update specific contact status */,
  metadata = /* Increment progress counters */
WHERE tenant_id = $1 AND id = $2
```

## Webhook Emissions

The system emits tenant-specific webhooks for:

- `call.inbound` - When inbound call processed
- `call.outbound` - When outbound call completed

Payload includes:
```json
{
  "contact_id": "uuid",
  "contact_type": "contact|lead",
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "outcome": "answered",
  "duration": 120,
  "sentiment": "positive",
  "summary": "Call summary text",
  "action_items": ["Task 1", "Task 2"],
  "campaign_id": "uuid (if applicable)"
}
```

## Testing

### Manual Testing via Postman

#### Test Inbound Call
```bash
POST http://localhost:4001/api/telephony/inbound-webhook
Content-Type: application/json

{
  "tenant_id": "your-tenant-uuid",
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "call_sid": "test-call-001",
  "call_status": "completed",
  "duration": 90,
  "transcript": "Hello, I'm interested in your services. Can you tell me more about pricing?",
  "provider": "test"
}
```

Expected result:
- New lead created for +15551234567 (if not exists)
- Activity logged with "Inbound call from Unknown Caller"
- Note created with AI summary
- Returns `{ success: true, contact_id: "uuid", activity_id: "uuid", summary: "..." }`

#### Test Outbound Call
```bash
POST http://localhost:4001/api/telephony/outbound-webhook
Content-Type: application/json

{
  "tenant_id": "your-tenant-uuid",
  "to_number": "+15551234567",
  "from_number": "+15559876543",
  "call_sid": "test-call-002",
  "call_status": "completed",
  "duration": 120,
  "outcome": "answered",
  "transcript": "Thank you for your interest. Here's what we offer...",
  "provider": "test"
}
```

#### Test Provider-Specific Webhook (Twilio)
```bash
POST http://localhost:4001/api/telephony/webhook/twilio/inbound?tenant_id=your-tenant-uuid
Content-Type: application/x-www-form-urlencoded

CallSid=CA1234&From=%2B15551234567&To=%2B15559876543&CallStatus=completed&CallDuration=90&Direction=inbound
```

### Database Verification

Check created records:
```sql
-- Check for auto-created lead
SELECT * FROM leads WHERE phone = '+15551234567';

-- Check activity log
SELECT * FROM activities WHERE related_type = 'lead' ORDER BY created_at DESC LIMIT 5;

-- Check auto-generated notes
SELECT * FROM notes WHERE metadata->>'note_type' = 'call_summary' ORDER BY created_at DESC LIMIT 5;

-- Check campaign progress (if applicable)
SELECT metadata->'progress' FROM ai_campaigns WHERE id = 'your-campaign-uuid';
```

## Environment Variables

Required for full functionality:

```env
# OpenAI (for transcript summarization)
OPENAI_API_KEY=sk-...

# Webhooks (for external notifications)
WEBHOOKS_ENABLED=true

# Provider credentials (stored in tenant_integrations table)
# No env vars needed - configured per-tenant in UI
```

## Security Considerations

### Webhook Signature Verification

**Production TODO**: Add signature verification for each provider

```javascript
// Twilio example
import twilio from 'twilio';

function verifyTwilioSignature(req) {
  const signature = req.headers['x-twilio-signature'];
  const url = `https://your-domain.com${req.originalUrl}`;
  const params = req.body;
  
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  );
}
```

### Rate Limiting

Add rate limiting to webhook endpoints:
```javascript
import rateLimit from 'express-rate-limit';

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many webhook requests'
});

router.post('/webhook/:provider/inbound', webhookLimiter, async (req, res) => {
  // ...
});
```

### Tenant Isolation

All queries include `tenant_id` filter to ensure data isolation:
```sql
WHERE tenant_id = $1 AND ...
```

## Troubleshooting

### Call not logged
1. Check webhook URL configuration in provider dashboard
2. Verify `tenant_id` is passed correctly (query param or body)
3. Check backend logs: `docker logs aishacrm-backend`
4. Verify database connection: `SELECT 1 FROM contacts LIMIT 1`

### Contact not created
1. Verify phone number format (E.164 recommended: +15551234567)
2. Check leads table: `SELECT * FROM leads WHERE phone LIKE '%555123%'`
3. Review activity logs for errors
4. Ensure database has write permissions

### Transcript not summarized
1. Check if OpenAI API key is configured
2. Verify `analyzeTranscript()` function is called (see logs)
3. Currently returns mock data - OpenAI integration pending
4. Check note creation: `SELECT * FROM notes WHERE metadata->>'note_type' = 'call_summary'`

### Campaign not updating
1. Verify `campaign_id` is in webhook payload
2. Check campaign exists: `SELECT * FROM ai_campaigns WHERE id = 'uuid'`
3. Ensure `target_contacts` array includes contact
4. Review `updateCampaignProgress()` function logic

## Future Enhancements

### Planned Features
- [ ] OpenAI transcript summarization integration
- [ ] Real-time call transcription (live streaming)
- [ ] Sentiment-based lead scoring
- [ ] Automatic task creation from action items
- [ ] Call recording playback in UI
- [ ] Multi-language transcript support
- [ ] Call analytics dashboard
- [ ] Voice biometric identification

### Integration Opportunities
- [ ] CRM sync (Salesforce, HubSpot)
- [ ] Calendar integration (schedule callbacks)
- [ ] Email follow-up automation
- [ ] SMS follow-up for missed calls
- [ ] Voicemail transcription and analysis

## API Reference

See OpenAPI documentation at `/api/docs` for:
- Full endpoint specifications
- Request/response schemas
- Authentication requirements
- Error codes

## Support

For issues or questions:
- Check backend logs: `docker logs aishacrm-backend -f`
- Review database state: Connect to Supabase console
- Test webhooks: Use Postman collection (TBD)
- Contact: app@base44.com
