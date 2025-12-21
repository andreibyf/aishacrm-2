# Call Flow Quick Test Guide

## Prerequisites

1. Backend running: `docker-compose up -d` or `cd backend && npm run dev`
2. **Braid MCP Server running**: `cd braid-mcp-node-server && docker compose up -d --build` (for AI transcript analysis)
3. Database connected (Supabase)
4. Valid tenant_id from your tenants table

## Configuration

Enable AI-powered transcript analysis in `backend/.env`:
```bash
USE_BRAID_MCP_TRANSCRIPT_ANALYSIS=true
BRAID_MCP_URL=http://braid-mcp-node-server:8000
TRANSCRIPT_ANALYSIS_MODEL=gpt-4o-mini
```

**Check Braid MCP Status:**
```powershell
# Verify Braid MCP is running
Invoke-RestMethod -Uri "http://localhost:8000/health"
# Expected: {"status":"ok","service":"braid-mcp-node-server"}

# Check memory status
Invoke-RestMethod -Uri "http://localhost:8000/memory/status"
```

## Quick Test: Inbound Unknown Caller

**Scenario**: Unknown caller +15551234567 calls your number

```bash
# PowerShell
$body = @{
    tenant_id = "your-tenant-uuid"
    from_number = "+15551234567"
    to_number = "+15559876543"
    call_sid = "test-inbound-001"
    call_status = "completed"
    duration = 95
    transcript = "Hi, I'm interested in learning more about your consulting services. Can you tell me about your pricing?"
    caller_name = "John Smith"  # AI agent extracted from conversation: "Hi, this is John Smith"
    caller_email = "john@example.com"  # Optional: AI agent extracted if caller provided it
    provider = "test"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/inbound-webhook" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

**Expected Result**:
```json
{
  "success": true,
  "contact_id": "new-lead-uuid",
  "contact_type": "lead",
  "activity_id": "activity-uuid",
  "summary": "Call summary: Hi, I'm interested in learning more...",
  "sentiment": "neutral"
}
```

**Database Verification**:
```sql
-- Check auto-created lead
SELECT * FROM leads WHERE phone = '+15551234567';

-- Check activity log
SELECT * FROM activities WHERE related_id = (SELECT id FROM leads WHERE phone = '+15551234567') ORDER BY created_at DESC LIMIT 1;

-- Check auto-generated note
SELECT * FROM notes WHERE related_id = (SELECT id FROM leads WHERE phone = '+15551234567') ORDER BY created_at DESC LIMIT 1;
```

## Quick Test: Outbound to Existing Contact

**Scenario**: You call an existing contact

```bash
# PowerShell - First get a contact_id
$contactResult = Invoke-RestMethod -Uri "http://localhost:4001/api/contacts?tenant_id=your-tenant-uuid&limit=1" -Method GET

$contactId = $contactResult.data[0].id

# Make outbound call
$body = @{
    tenant_id = "your-tenant-uuid"
    to_number = "+15557778888"
    from_number = "+15559876543"
    call_sid = "test-outbound-001"
    call_status = "completed"
    duration = 150
    outcome = "answered"
    transcript = "Thank you for your interest. I wanted to follow up on our conversation about the premium package..."
    contact_id = $contactId
    provider = "test"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/outbound-webhook" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

**Expected Result**:
```json
{
  "success": true,
  "contact_id": "existing-contact-uuid",
  "contact_type": "contact",
  "activity_id": "activity-uuid",
  "outcome": "answered",
  "summary": "Thank you for your interest...",
  "sentiment": "neutral"
}
```

## Quick Test: Campaign-Triggered Call

**Scenario**: AI campaign triggers outbound call

```bash
# PowerShell - Need campaign_id
$body = @{
    tenant_id = "your-tenant-uuid"
    to_number = "+15553334444"
    call_sid = "test-campaign-001"
    call_status = "completed"
    duration = 180
    outcome = "answered"
    transcript = "Hello! This is Sarah from Acme. I'm calling to tell you about our special offer..."
    campaign_id = "your-campaign-uuid"
    provider = "callfluent"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/outbound-webhook" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

**Expected Result**:
- Activity created
- Campaign progress updated
- Webhook emitted

**Campaign Progress Check**:
```sql
SELECT 
    id, 
    name, 
    status,
    metadata->'progress' as progress,
    target_contacts
FROM ai_campaigns 
WHERE id = 'your-campaign-uuid';
```

## Quick Test: Action Item Extraction

**Scenario**: Call transcript contains action requests that need follow-up

```bash
# PowerShell - Call with multiple action items
$body = @{
    tenant_id = "your-tenant-uuid"
    from_number = "+15557771234"
    to_number = "+15559876543"
    call_sid = "test-actions-001"
    call_status = "completed"
    duration = 180
    transcript = @"
Hi, I'm interested in your services. Can you send me the pricing information? 
I'd also like to schedule a meeting with your team next week to discuss the implementation. 
Please email me at sarah@company.com with the details. I'll be available Tuesday or Wednesday.
"@
    caller_name = "Sarah Martinez"
    caller_email = "sarah@company.com"
    provider = "callfluent"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/inbound-webhook" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

# Display the result
$result | ConvertTo-Json -Depth 5
```

**Expected Result**:
```json
{
  "success": true,
  "contact_id": "new-lead-uuid",
  "contact_type": "lead",
  "activity_id": "activity-uuid",
  "summary": "Call with customer discussing positive topics. 2 action item(s) identified.",
  "sentiment": "positive"
}
```

**Database Verification - Note Created with Action Items**:
```sql
-- Check the created note
SELECT 
    id,
    related_type,
    content,
    metadata->'action_items' as action_items,
    metadata->'customer_requests' as requests,
    metadata->'commitments_made' as commitments
FROM notes 
WHERE related_id = (SELECT id FROM leads WHERE phone = '+15557771234')
ORDER BY created_at DESC 
LIMIT 1;
```

**Expected Note Content**:
```
Call with customer discussing positive topics. 2 action item(s) identified.

✅ Call went well.

**Action Items:**
1. 🔴 Send pricing information
2. 🔴 Schedule meeting
```

**Database Verification - Auto-Created Activities**:
```sql
-- Check automatically created follow-up activities
SELECT 
    id,
    type,
    subject,
    status,
    due_date,
    metadata->'priority' as priority,
    metadata->'origin_activity_id' as origin_call,
    metadata->'auto_created' as auto_created
FROM activities
WHERE related_id = (SELECT id FROM leads WHERE phone = '+15557771234')
    AND metadata->>'auto_created' = 'true'
ORDER BY created_at DESC;
```

**Expected Activities**:
1. **Email Activity**: "Action: Send pricing information" (due tomorrow, high priority)
2. **Meeting Activity**: "Action: Schedule meeting" (due tomorrow, high priority)

**What Happened Automatically**:
1. ✅ Lead created with name "Sarah Martinez" and email "sarah@company.com"
2. ✅ Call activity logged with 180 second duration
3. ✅ Transcript analyzed for action items
4. ✅ Note created with formatted action items and emojis
5. ✅ 2 follow-up activities auto-created (email + meeting)
6. ✅ Customer requests captured ("pricing information", "meeting/appointment")
7. ✅ Activities appear in team's task list with due dates

## Quick Test: Activity Completion (Fulfillment Detection)

**Scenario**: Follow-up call where agent fulfilled a previous action request

```bash
# PowerShell - First, get the lead_id from the previous test
$leadResult = Invoke-RestMethod -Uri "http://localhost:4001/api/leads?tenant_id=your-tenant-uuid&phone=%2B15557771234" -Method GET
$leadId = $leadResult.data[0].id

# Now make a follow-up outbound call where we mention we sent the information
$body = @{
    tenant_id = "your-tenant-uuid"
    to_number = "+15557771234"
    from_number = "+15559876543"
    call_sid = "test-fulfillment-001"
    call_status = "completed"
    duration = 120
    outcome = "answered"
    transcript = @"
Hi Sarah, this is John from Acme. I'm following up on your inquiry. 
I sent you the pricing information this morning via email. 
I also scheduled a meeting for next Tuesday at 2 PM with our implementation team.
Did you receive the email?
"@
    contact_id = $leadId
    provider = "test"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/outbound-webhook" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

# Display the result
$result | ConvertTo-Json -Depth 5
```

**Expected Result**:
```json
{
  "success": true,
  "contact_id": "lead-uuid",
  "contact_type": "lead",
  "activity_id": "new-activity-uuid",
  "outcome": "answered",
  "summary": "Call with customer discussing positive topics. 0 action item(s) identified.",
  "sentiment": "positive"
}
```

**What Happened Automatically**:
1. ✅ Detected "I sent you the pricing" → Found pending email activity → Marked as completed
2. ✅ Detected "I scheduled a meeting" → Found pending meeting activity → Marked as completed
3. ✅ Detected "following up" → Confirms this is a follow-up action
4. ✅ Both previous activities now have status = 'completed' and completed_at timestamp

**Database Verification - Completed Activities**:
```sql
-- Check that the email and meeting activities were auto-completed
SELECT 
    id,
    type,
    subject,
    status,
    created_at,
    completed_at,
    metadata->'auto_completed' as auto_completed,
    metadata->'completion_note' as what_was_done,
    metadata->'completion_activity_id' as completing_call
FROM activities
WHERE related_id = (SELECT id FROM leads WHERE phone = '+15557771234')
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Results**:
1. **New Call Activity**: Follow-up call logged (status: completed)
2. **Email Activity**: Status changed from 'pending' → 'completed', completed_at = NOW(), metadata shows `auto_completed: true`, `completion_note: "sent information"`
3. **Meeting Activity**: Status changed from 'pending' → 'completed', completed_at = NOW(), metadata shows `auto_completed: true`, `completion_note: "scheduled meeting"`

**Fulfillment Patterns Detected**:
- ✅ "I sent you..." → Closes email activities
- ✅ "I scheduled..." / "booked" → Closes meeting activities  
- ✅ "Following up" → Confirms follow-up action
- ✅ "Sent the proposal" → Closes proposal/email activities

**Completion Logic**:
- Searches **last 30 days** for pending activities
- Matches activity **type** (email/call/meeting)
- Completes **most recent** pending activity
- Adds metadata linking to the completing call

## Quick Test: Prepare Outbound Call Context

**Scenario**: AI agent needs to know WHO to call and WHAT to discuss

```bash
# PowerShell - Prepare call context before making call
$body = @{
    tenant_id = "your-tenant-uuid"
    contact_id = "existing-contact-uuid"
    campaign_id = "your-campaign-uuid"  # Optional
} | ConvertTo-Json

$callContext = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/prepare-call" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

# View the prepared context
$callContext | ConvertTo-Json -Depth 5
```

**Expected Result**:
```json
{
  "contact": {
    "id": "uuid",
    "name": "John Smith",
    "phone": "+15551234567",
    "email": "john@example.com",
    "company": "Acme Corp",
    "title": "CEO",
    "type": "contact"
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
      "call_script": "Hi {name}, following up on your interest in our premium package...",
      "offer": "20% off first year",
      "goal": "Convert leads to customers"
    },
    "recent_interactions": [
      {
        "date": "2025-11-15T10:30:00Z",
        "type": "email",
        "subject": "Inquiry about premium package",
        "outcome": null
      }
    ]
  }
}
```

**Use Case**: AI agent uses this context to:
- **Know WHO**: "John Smith" at "Acme Corp"
- **Know WHAT NUMBER**: "+15551234567"
- **Know WHAT TO SAY**: Campaign script + talking points
- **Have CONTEXT**: Recent interactions and company info

## Quick Test: Twilio Webhook Format

**Scenario**: Test Twilio's actual webhook format

```bash
# PowerShell with form-urlencoded (Twilio format)
$twilioParams = @{
    CallSid = "CA1234567890abcdef"
    From = "+15556667777"
    To = "+15559876543"
    CallStatus = "completed"
    CallDuration = "120"
    Direction = "inbound"
    CallerName = "John Doe"
    CallerCity = "San Francisco"
    CallerState = "CA"
}

$body = ($twilioParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"

Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/webhook/twilio/inbound?tenant_id=your-tenant-uuid" `
    -Method POST `
    -ContentType "application/x-www-form-urlencoded" `
    -Body $body
```

## Common Test Scenarios

### 1. Caller Provides Full Name
```json
{
  "tenant_id": "uuid",
  "from_number": "+15551112222",
  "caller_name": "Sarah Johnson",
  "transcript": "Hi, this is Sarah Johnson calling about...",
  "provider": "callfluent"
}
```
**Result**: Lead created with `first_name: "Sarah"`, `last_name: "Johnson"`

### 2. Caller Provides First Name Only
```json
{
  "tenant_id": "uuid",
  "from_number": "+15551113333",
  "caller_name": "Mike",
  "transcript": "Hey, it's Mike. I wanted to ask about...",
  "provider": "thoughtly"
}
```
**Result**: Lead created with `first_name: "Mike"`, `last_name: ""` (empty)

### 3. Caller Provides Name with Middle Name
```json
{
  "tenant_id": "uuid",
  "from_number": "+15551114444",
  "caller_name": "Robert James Smith",
  "transcript": "This is Robert James Smith...",
  "provider": "callfluent"
}
```
**Result**: Lead created with `first_name: "Robert"`, `last_name: "James Smith"`

### 4. Caller Provides Email During Call
```json
{
  "tenant_id": "uuid",
  "from_number": "+15551115555",
  "caller_name": "Jennifer Lee",
  "caller_email": "jennifer.lee@company.com",
  "transcript": "You can reach me at jennifer.lee@company.com",
  "provider": "callfluent"
}
```
**Result**: Lead created with email field populated

### 5. No Name Provided (Anonymous Caller)
```json
{
  "tenant_id": "uuid",
  "from_number": "+15551116666",
  "transcript": "I'd like some information about your services",
  "provider": "test"
}
```
**Result**: Lead created with `first_name: "Unknown"`, `last_name: "Caller"`

### 6. No-Answer Outbound
```json
{
  "tenant_id": "uuid",
  "to_number": "+15559998888",
  "outcome": "no-answer",
  "call_status": "completed",
  "duration": 0,
  "provider": "test"
}
```

### 2. Voicemail Detection
```json
{
  "tenant_id": "uuid",
  "to_number": "+15559998888",
  "outcome": "voicemail",
  "call_status": "completed",
  "duration": 45,
  "transcript": "You've reached John's voicemail...",
  "provider": "test"
}
```

### 3. Busy Signal
```json
{
  "tenant_id": "uuid",
  "to_number": "+15559998888",
  "outcome": "busy",
  "call_status": "failed",
  "duration": 0,
  "provider": "test"
}
```

### 4. Manual UI Log
```json
{
  "tenant_id": "uuid",
  "contact_id": "existing-contact-uuid",
  "direction": "outbound",
  "duration": 300,
  "notes": "Discussed pricing, will send proposal"
}
```
POST to `/api/telephony/log-call`

## Troubleshooting Commands

### Check Backend Logs
```powershell
# Docker
docker logs aishacrm-backend -f --tail 50

# Local dev
# Check terminal where npm run dev is running
```

### Check Database State
```sql
-- Recent activities
SELECT 
    id, 
    related_type, 
    related_id, 
    type, 
    subject, 
    created_at,
    metadata->'call_sid' as call_sid,
    metadata->'duration' as duration
FROM activities 
WHERE type = 'call' 
ORDER BY created_at DESC 
LIMIT 10;

-- Recent notes
SELECT 
    id, 
    related_type, 
    related_id, 
    LEFT(content, 100) as summary,
    metadata->'sentiment' as sentiment,
    created_at
FROM notes 
WHERE metadata->>'note_type' = 'call_summary' 
ORDER BY created_at DESC 
LIMIT 10;

-- Recent leads (auto-created)
SELECT 
    id, 
    phone, 
    first_name, 
    last_name, 
    source, 
    status,
    created_at
FROM leads 
WHERE source = 'inbound_call' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Verify Contact Resolution
```sql
-- Test phone matching
SELECT 
    id, 
    CONCAT(first_name, ' ', last_name) as name, 
    phone, 
    mobile,
    'contact' as type
FROM contacts 
WHERE tenant_id = 'your-tenant-uuid'
    AND (phone = '+15551234567' OR mobile = '+15551234567')
LIMIT 1;
```

## Integration Tests

### Test with Campaign Worker

1. **Create Test Campaign**:
   - Go to Campaign Monitor UI
   - Create new AI campaign with call type
   - Add test contacts with phone numbers

2. **Enable Worker**:
   ```env
   CAMPAIGN_WORKER_ENABLED=true
   CAMPAIGN_WORKER_INTERVAL_MS=10000
   ```

3. **Monitor Logs**:
   ```powershell
   docker logs aishacrm-backend -f | Select-String "CallFlow|Campaign"
   ```

4. **Simulate Provider Response**:
   - Worker triggers call via provider
   - Provider calls your webhook
   - Use test endpoint to simulate:
   ```bash
   POST /api/telephony/outbound-webhook
   # Include campaign_id from your campaign
   ```

### Test Provider Adapters

Each provider has specific format:

```powershell
# Test all providers
$providers = @("twilio", "signalwire", "callfluent", "thoughtly")

foreach ($provider in $providers) {
    Write-Host "Testing $provider..."
    
    $body = @{
        tenant_id = "your-tenant-uuid"
        # Provider-specific fields...
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/webhook/$provider/inbound?tenant_id=your-tenant-uuid" `
        -Method POST -ContentType "application/json" -Body $body
}
```

## Success Indicators

✅ Response includes `success: true`  
✅ `contact_id` returned (existing or newly created)  
✅ `activity_id` returned  
✅ Database has new activity record  
✅ If transcript provided, note is created  
✅ Campaign progress updated (if campaign_id present)  
✅ Backend logs show "[CallFlow]" entries  

## Common Issues

### Issue: "tenant_id required"
**Solution**: Add `?tenant_id=uuid` to URL or in body

### Issue: Contact not found/created
**Solution**: 
- Check phone format (E.164 recommended: +15551234567)
- Verify tenant_id matches your tenant
- Check leads table: `SELECT * FROM leads WHERE phone LIKE '%555%'`

### Issue: No note created
**Solution**:
- Ensure `transcript` field is provided in payload
- Check if `analyzeTranscript()` was called (logs)
- Verify notes table: `SELECT * FROM notes WHERE metadata->>'note_type' = 'call_summary'`

### Issue: Campaign not updating
**Solution**:
- Verify `campaign_id` is in payload
- Check campaign exists: `SELECT * FROM ai_campaigns WHERE id = 'uuid'`
- Ensure contact is in campaign's `target_contacts` array

## Next Steps After Testing

1. ✅ Verify core flows work with test data
2. ✅ **Braid MCP integration for AI transcript analysis** - NOW INTEGRATED!
3. 🔄 Configure tenant-specific OpenAI keys in `tenant_integrations` table
4. 🔄 Configure Twilio webhooks in production
5. 🔄 Add webhook signature verification
6. 🔄 Test with real AI calling providers (CallFluent/Thoughtly)
7. 🔄 Build UI components for call history
8. 🔄 Add rate limiting to webhook endpoints

## Braid MCP Integration

The call flow system now uses the Braid MCP Server for AI-powered transcript analysis:

**What Changed:**
- ✅ Transcript analysis now routes through `braid-mcp-node-server:8000`
- ✅ Automatic tenant-specific OpenAI key resolution
- ✅ Better action item extraction with GPT-4o-mini
- ✅ Pattern-based fallback if Braid MCP unavailable
- ✅ Structured JSON responses with priorities and types

**Test AI Analysis:**
```powershell
# Make a call with a complex transcript
$body = @{
    tenant_id = "your-tenant-uuid"
    from_number = "+15559991234"
    transcript = @"
Hi, I'm calling about your enterprise package. I need pricing for 50 users. 
Can you send me a detailed proposal by Friday? I'd also like to schedule a demo 
next Tuesday if possible. My email is ceo@bigcompany.com. Thanks!
"@
    caller_name = "Jennifer CEO"
    caller_email = "ceo@bigcompany.com"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/inbound-webhook" `
    -Method POST -ContentType "application/json" -Body $body
```

**Expected AI-Extracted Items:**
1. 🔴 Email activity: "Send detailed proposal" (due Friday, high priority)
2. 🔴 Meeting activity: "Schedule demo" (due next Tuesday, high priority)
3. Customer request: "Pricing for 50 users"
4. Customer request: "Enterprise package information"

**Braid MCP Benefits:**
- More accurate action extraction than pattern matching
- Context-aware priority assignment
- Tenant-specific AI model preferences
- Redis-backed memory for multi-turn conversations
