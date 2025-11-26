# New Endpoints Testing Guide

This document provides comprehensive testing procedures for newly implemented endpoints: AI Campaigns and Telephony (Call Flow System).

## Test Environment Setup

### Prerequisites
1. Backend running on port 4001 (Docker) or 3001 (local)
2. Frontend running on port 4000 (Docker) or 5173 (local)
3. Valid tenant_id from database
4. Braid MCP Server running (optional, for AI transcript analysis)

### Get Test Tenant ID
```powershell
# Query database for tenant
$tenantQuery = @{
    query = "SELECT id, name FROM tenants LIMIT 1"
} | ConvertTo-Json

# Or use API if available
$tenants = Invoke-RestMethod -Uri "http://localhost:4001/api/tenants" -Method GET
$testTenantId = $tenants.data[0].id
Write-Host "Test Tenant ID: $testTenantId"
```

---

## 1. AI Campaigns Endpoints

### Base URL
```
http://localhost:4001/api/aicampaigns
```

### 1.1 List All Campaigns (GET /)

**Purpose**: Retrieve all AI campaigns with filtering and pagination

**Test Request**:
```powershell
$params = @{
    tenant_id = "your-tenant-uuid"
    status = "running"  # Optional: draft, scheduled, running, paused, completed, cancelled
    search = ""         # Optional: search by name/description
    limit = 200
    offset = 0
}

$queryString = ($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"
$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns?$queryString" -Method GET

$result | ConvertTo-Json -Depth 3
```

**Expected Response**:
```json
{
  "status": "success",
  "data": {
    "campaigns": [
      {
        "id": "uuid",
        "tenant_id": "uuid",
        "name": "Q4 Demo Campaign",
        "status": "running",
        "description": "Outbound demos for Q4",
        "target_contacts": ["contact-uuid-1", "contact-uuid-2"],
        "performance_metrics": {
          "sent": 10,
          "responded": 5
        },
        "metadata": {},
        "created_at": "2025-11-16T10:00:00Z"
      }
    ],
    "total": 1,
    "limit": 200,
    "offset": 0
  }
}
```

**Validation**:
- ✅ Status 200
- ✅ Returns campaigns array
- ✅ Includes total, limit, offset
- ✅ Filtering by status works
- ✅ Search functionality works

---

### 1.2 Get Campaign by ID (GET /:id)

**Purpose**: Retrieve single campaign details

**Test Request**:
```powershell
$campaignId = "your-campaign-uuid"
$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId?tenant_id=your-tenant-uuid" -Method GET

$result | ConvertTo-Json -Depth 3
```

**Expected Response**:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Test Campaign",
    "status": "draft",
    "target_contacts": [],
    "performance_metrics": {},
    "created_at": "2025-11-16T10:00:00Z"
  }
}
```

**Validation**:
- ✅ Status 200
- ✅ Returns single campaign object
- ✅ 404 for non-existent ID

---

### 1.3 Create Campaign (POST /)

**Purpose**: Create new AI campaign

**Test Request**:
```powershell
$body = @{
    tenant_id = "your-tenant-uuid"
    name = "Test Campaign - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    status = "draft"
    description = "Testing campaign creation"
    target_contacts = @()
    performance_metrics = @{}
    metadata = @{
        campaign_type = "email"
        goal = "book_demos"
    }
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result | ConvertTo-Json -Depth 3
Write-Host "Created Campaign ID: $($result.data.id)"
```

**Expected Response**:
```json
{
  "status": "success",
  "data": {
    "id": "new-uuid",
    "tenant_id": "uuid",
    "name": "Test Campaign - 2025-11-16 10:30",
    "status": "draft",
    "created_at": "2025-11-16T10:30:00Z"
  }
}
```

**Validation**:
- ✅ Status 201
- ✅ Returns created campaign with ID
- ✅ Webhook emitted (check logs)
- ✅ Campaign appears in list

---

### 1.4 Update Campaign (PUT /:id)

**Purpose**: Update existing campaign

**Test Request**:
```powershell
$campaignId = "your-campaign-uuid"
$body = @{
    tenant_id = "your-tenant-uuid"
    name = "Updated Campaign Name"
    status = "scheduled"
    description = "Updated description"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId" `
    -Method PUT `
    -ContentType "application/json" `
    -Body $body

$result | ConvertTo-Json -Depth 3
```

**Expected Response**:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Updated Campaign Name",
    "status": "scheduled",
    "description": "Updated description"
  }
}
```

**Validation**:
- ✅ Status 200
- ✅ Fields updated correctly
- ✅ Webhook emitted

---

### 1.5 Delete Campaign (DELETE /:id)

**Purpose**: Delete campaign

**Test Request**:
```powershell
$campaignId = "your-campaign-uuid"
$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId?tenant_id=your-tenant-uuid" -Method DELETE

$result | ConvertTo-Json
```

**Expected Response**:
```json
{
  "status": "success",
  "message": "AI Campaign deleted"
}
```

**Validation**:
- ✅ Status 200
- ✅ Campaign no longer in list
- ✅ Webhook emitted

---

### 1.6 Start Campaign (POST /:id/start)

**Purpose**: Start a draft/paused campaign

**Test Request**:
```powershell
$campaignId = "your-campaign-uuid"
$body = @{
    tenant_id = "your-tenant-uuid"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId/start" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result | ConvertTo-Json -Depth 3
```

**Expected Response**:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "status": "running",
    "metadata": {
      "started_at": "2025-11-16T10:35:00Z"
    }
  }
}
```

**Validation**:
- ✅ Status 200
- ✅ Status changed to "running"
- ✅ started_at timestamp added
- ✅ Webhook emitted

---

### 1.7 Pause Campaign (POST /:id/pause)

**Purpose**: Pause running campaign

**Test Request**:
```powershell
$campaignId = "your-campaign-uuid"
$body = @{
    tenant_id = "your-tenant-uuid"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId/pause" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result | ConvertTo-Json -Depth 3
```

**Expected Response**:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "status": "paused"
  }
}
```

**Validation**:
- ✅ Status 200
- ✅ Status changed to "paused"
- ✅ Webhook emitted

---

### 1.8 Resume Campaign (POST /:id/resume)

**Purpose**: Resume paused campaign

**Test Request**:
```powershell
$campaignId = "your-campaign-uuid"
$body = @{
    tenant_id = "your-tenant-uuid"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId/resume" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result | ConvertTo-Json -Depth 3
```

**Expected Response**:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "status": "running"
  }
}
```

**Validation**:
- ✅ Status 200
- ✅ Status changed back to "running"
- ✅ Webhook emitted

---

## 2. Telephony Endpoints

### Base URL
```
http://localhost:4001/api/telephony
```

### 2.1 Inbound Webhook - Generic (POST /inbound-webhook)

**Purpose**: Handle inbound calls with standard format

**Test Request**:
```powershell
$body = @{
    tenant_id = "your-tenant-uuid"
    from_number = "+15551234567"
    to_number = "+15559876543"
    call_sid = "test-inbound-$(Get-Date -Format 'yyyyMMddHHmmss')"
    call_status = "completed"
    duration = 120
    transcript = "Hi, I'm interested in your services. Can you send me more information?"
    caller_name = "Jane Smith"
    caller_email = "jane@example.com"
    provider = "test"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/inbound-webhook" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result | ConvertTo-Json -Depth 5
```

**Expected Response**:
```json
{
  "success": true,
  "contact_id": "new-or-existing-uuid",
  "contact_type": "lead",
  "activity_id": "activity-uuid",
  "summary": "Call with customer discussing positive topics...",
  "sentiment": "neutral",
  "action_items_created": 1
}
```

**Validation**:
- ✅ Status 200
- ✅ Lead created if phone not found
- ✅ Activity logged
- ✅ Note created with transcript analysis
- ✅ Action items auto-created (if applicable)

---

### 2.2 Outbound Webhook - Generic (POST /outbound-webhook)

**Purpose**: Handle outbound call results

**Test Request**:
```powershell
$body = @{
    tenant_id = "your-tenant-uuid"
    to_number = "+15557778888"
    from_number = "+15559876543"
    call_sid = "test-outbound-$(Get-Date -Format 'yyyyMMddHHmmss')"
    call_status = "completed"
    duration = 180
    outcome = "answered"
    transcript = "Thank you for your interest. I wanted to follow up on our conversation..."
    contact_id = "existing-contact-uuid"
    campaign_id = "optional-campaign-uuid"
    provider = "callfluent"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/outbound-webhook" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result | ConvertTo-Json -Depth 5
```

**Expected Response**:
```json
{
  "success": true,
  "contact_id": "uuid",
  "contact_type": "contact",
  "activity_id": "activity-uuid",
  "outcome": "answered",
  "summary": "Thank you for your interest...",
  "sentiment": "positive",
  "campaign_updated": true
}
```

**Validation**:
- ✅ Status 200
- ✅ Activity logged
- ✅ Note created
- ✅ Campaign progress updated (if campaign_id provided)
- ✅ Activity completion detection runs

---

### 2.3 Provider-Specific Webhooks

**Twilio Inbound**:
```powershell
$twilioParams = @{
    CallSid = "CA$(Get-Random -Minimum 1000000000 -Maximum 9999999999)"
    From = "+15556667777"
    To = "+15559876543"
    CallStatus = "completed"
    CallDuration = "120"
    Direction = "inbound"
    CallerName = "John Doe"
}

$body = ($twilioParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/webhook/twilio/inbound?tenant_id=your-tenant-uuid" `
    -Method POST `
    -ContentType "application/x-www-form-urlencoded" `
    -Body $body

$result | ConvertTo-Json -Depth 3
```

**SignalWire, CallFluent, Thoughtly**:
```powershell
# Same format as generic, just different URL
$providers = @("signalwire", "callfluent", "thoughtly")

foreach ($provider in $providers) {
    Write-Host "Testing $provider..."
    
    $body = @{
        tenant_id = "your-tenant-uuid"
        from_number = "+15551234567"
        # ... same fields as generic webhook
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/webhook/$provider/inbound?tenant_id=your-tenant-uuid" `
        -Method POST -ContentType "application/json" -Body $body
}
```

**Validation**:
- ✅ Each provider adapter normalizes correctly
- ✅ Results match generic webhook behavior

---

### 2.4 Prepare Call Context (POST /prepare-call)

**Purpose**: Get context for AI agent before making outbound call

**Test Request**:
```powershell
$body = @{
    tenant_id = "your-tenant-uuid"
    contact_id = "existing-contact-uuid"
    campaign_id = "optional-campaign-uuid"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/prepare-call" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result | ConvertTo-Json -Depth 5
```

**Expected Response**:
```json
{
  "contact": {
    "id": "uuid",
    "name": "John Smith",
    "phone": "+15551234567",
    "email": "john@example.com",
    "company": "Acme Corp",
    "title": "CEO"
  },
  "call_context": {
    "purpose": "Follow up on inquiry",
    "talking_points": [
      "Greet John by name",
      "Reference last interaction",
      "Discuss premium package"
    ],
    "campaign_info": {
      "name": "Q4 Campaign",
      "type": "call",
      "call_script": "Hi {name}...",
      "goal": "Book demos"
    },
    "recent_interactions": []
  }
}
```

**Validation**:
- ✅ Status 200
- ✅ Returns contact details
- ✅ Includes talking points (7 items)
- ✅ Campaign info included if campaign_id provided
- ✅ Recent interactions populated

---

## 3. Integration Tests

### 3.1 Full Campaign Flow Test

```powershell
# 1. Create campaign
$campaign = @{
    tenant_id = $testTenantId
    name = "Integration Test Campaign"
    status = "draft"
    target_contacts = @("contact-uuid-1", "contact-uuid-2")
    metadata = @{ campaign_type = "call" }
} | ConvertTo-Json

$created = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns" `
    -Method POST -ContentType "application/json" -Body $campaign

$campaignId = $created.data.id
Write-Host "✅ Campaign created: $campaignId"

# 2. Start campaign
$startBody = @{ tenant_id = $testTenantId } | ConvertTo-Json
$started = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId/start" `
    -Method POST -ContentType "application/json" -Body $startBody

Write-Host "✅ Campaign started, status: $($started.data.status)"

# 3. Simulate outbound call
$callBody = @{
    tenant_id = $testTenantId
    to_number = "+15551234567"
    call_sid = "integration-test-call"
    outcome = "answered"
    duration = 120
    transcript = "Great conversation, booking demo for next week"
    campaign_id = $campaignId
    provider = "test"
} | ConvertTo-Json

$callResult = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/outbound-webhook" `
    -Method POST -ContentType "application/json" -Body $callBody

Write-Host "✅ Call logged: $($callResult.activity_id)"

# 4. Check campaign updated
$updated = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId?tenant_id=$testTenantId" -Method GET
Write-Host "✅ Campaign progress: $($updated.data.metadata.progress | ConvertTo-Json)"

# 5. Pause campaign
$pauseBody = @{ tenant_id = $testTenantId } | ConvertTo-Json
$paused = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId/pause" `
    -Method POST -ContentType "application/json" -Body $pauseBody

Write-Host "✅ Campaign paused: $($paused.data.status)"

# 6. Resume campaign
$resumeBody = @{ tenant_id = $testTenantId } | ConvertTo-Json
$resumed = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId/resume" `
    -Method POST -ContentType "application/json" -Body $resumeBody

Write-Host "✅ Campaign resumed: $($resumed.data.status)"

# 7. Delete campaign
$deleted = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$campaignId?tenant_id=$testTenantId" -Method DELETE
Write-Host "✅ Campaign deleted"

Write-Host "`n🎉 Integration test completed successfully!"
```

---

## 4. API Health Monitor Tests

### 4.1 Add to API Health Monitor

Update `src/utils/apiHealthMonitor.js` to test these endpoints.

### 4.2 Manual Health Check

```powershell
# Test all new endpoints
$endpoints = @(
    @{ method = "GET"; path = "/api/aicampaigns"; params = "?tenant_id=$testTenantId" },
    @{ method = "POST"; path = "/api/aicampaigns/:id/start"; body = @{ tenant_id = $testTenantId } },
    @{ method = "POST"; path = "/api/telephony/inbound-webhook"; body = @{ tenant_id = $testTenantId; from_number = "+15551234567" } },
    @{ method = "POST"; path = "/api/telephony/prepare-call"; body = @{ tenant_id = $testTenantId; contact_id = "test-uuid" } }
)

foreach ($endpoint in $endpoints) {
    Write-Host "Testing: $($endpoint.method) $($endpoint.path)"
    # Test each endpoint...
}
```

---

## 5. Error Scenarios

### 5.1 Missing tenant_id
```powershell
# Should return 400
$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns" -Method GET -ErrorAction SilentlyContinue
# Expected: 400 or empty data
```

### 5.2 Invalid campaign ID
```powershell
# Should return 404
$result = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/invalid-uuid?tenant_id=$testTenantId" -Method GET -ErrorAction SilentlyContinue
# Expected: 404
```

### 5.3 Invalid phone format
```powershell
$body = @{
    tenant_id = $testTenantId
    from_number = "invalid"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/inbound-webhook" `
    -Method POST -ContentType "application/json" -Body $body -ErrorAction SilentlyContinue
# Expected: 400 or handled gracefully
```

---

## 6. Performance Tests

### 6.1 Bulk Campaign Creation
```powershell
1..50 | ForEach-Object -Parallel {
    $body = @{
        tenant_id = $using:testTenantId
        name = "Perf Test Campaign $_"
        status = "draft"
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns" `
        -Method POST -ContentType "application/json" -Body $body
} -ThrottleLimit 10

Write-Host "✅ 50 campaigns created"
```

### 6.2 Concurrent Call Webhooks
```powershell
1..20 | ForEach-Object -Parallel {
    $body = @{
        tenant_id = $using:testTenantId
        from_number = "+155512345$(Get-Random -Minimum 10 -Maximum 99)"
        call_sid = "perf-test-$_"
        duration = 60
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:4001/api/telephony/inbound-webhook" `
        -Method POST -ContentType "application/json" -Body $body
} -ThrottleLimit 5

Write-Host "✅ 20 concurrent calls processed"
```

---

## 7. Database Verification

After running tests, verify database state:

```sql
-- Check campaigns created
SELECT COUNT(*) FROM ai_campaigns WHERE name LIKE '%Test%';

-- Check call activities
SELECT COUNT(*) FROM activities WHERE type = 'call' AND created_at > NOW() - INTERVAL '1 hour';

-- Check auto-created leads
SELECT COUNT(*) FROM leads WHERE source = 'inbound_call' AND created_at > NOW() - INTERVAL '1 hour';

-- Check notes with transcripts
SELECT COUNT(*) FROM notes WHERE metadata->>'note_type' = 'call_summary' AND created_at > NOW() - INTERVAL '1 hour';

-- Check auto-created activities
SELECT COUNT(*) FROM activities WHERE metadata->>'auto_created' = 'true' AND created_at > NOW() - INTERVAL '1 hour';
```

---

## 8. Cleanup

After testing, clean up test data:

```powershell
# Delete test campaigns
$campaigns = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns?tenant_id=$testTenantId&search=Test" -Method GET

foreach ($campaign in $campaigns.data.campaigns) {
    Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/$($campaign.id)?tenant_id=$testTenantId" -Method DELETE
    Write-Host "Deleted campaign: $($campaign.name)"
}

Write-Host "✅ Cleanup completed"
```

---

## Summary

### Endpoints Tested:
- ✅ 8 AI Campaign endpoints (CRUD + actions)
- ✅ 4 Telephony endpoints (webhooks + prepare-call)
- ✅ 4 Provider-specific webhook adapters

### Test Categories:
- ✅ Unit tests (individual endpoints)
- ✅ Integration tests (full workflows)
- ✅ Error handling tests
- ✅ Performance tests
- ✅ Database verification

### Next Steps:
1. Add endpoints to API Health Monitor UI
2. Create automated E2E tests
3. Add to CI/CD pipeline
4. Document in API documentation
