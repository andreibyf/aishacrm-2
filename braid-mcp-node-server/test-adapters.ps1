# Braid MCP Server - Adapter Test Suite
# Tests all adapters to verify AI tool calls work correctly

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "  Braid MCP Server - Adapter Tests" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

$testsPassed = 0
$testsFailed = 0
$baseUrl = "http://localhost:8000"

function Invoke-BraidTest {
    param (
        [string]$TestName,
        [hashtable]$Envelope
    )

    Write-Host "Running: $TestName" -ForegroundColor Cyan

    try {
        $body = $Envelope | ConvertTo-Json -Depth 10
        $response = Invoke-WebRequest -Uri "$baseUrl/mcp/run" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        $result = $response.Content | ConvertFrom-Json

        $actionResult = $result.results[0]

        if ($actionResult.status -eq "success") {
            Write-Host "  ✓ PASSED" -ForegroundColor Green
            $script:testsPassed++
            return $actionResult
        } else {
            Write-Host "  ✗ FAILED: $($actionResult.errorMessage)" -ForegroundColor Red
            $script:testsFailed++
            return $actionResult
        }
    } catch {
        Write-Host "  ✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $null
    }
}

# Test 1: Health Check
Write-Host "Test 0: Health Check" -ForegroundColor Cyan
try {
    $health = Invoke-WebRequest -Uri "$baseUrl/health" -Method GET | ConvertFrom-Json
    if ($health.status -eq "ok") {
        Write-Host "  ✓ Server is healthy" -ForegroundColor Green
    }
} catch {
    Write-Host "  ✗ Server is not responding!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 1: Web Adapter - Wikipedia Search
$result = Invoke-BraidTest -TestName "Test 1: Web Adapter - Wikipedia Search" -Envelope @{
    requestId = "test-web-search"
    actor = @{ id = "agent:test"; type = "agent" }
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    actions = @(
        @{
            id = "action-1"
            verb = "search"
            actor = @{ id = "agent:test"; type = "agent" }
            resource = @{ system = "web"; kind = "wikipedia-search" }
            payload = @{ q = "artificial intelligence" }
        }
    )
}
if ($result -and $result.data) {
    Write-Host "  Results: $($result.data.Count) articles found" -ForegroundColor Gray
    if ($result.data.Count -gt 0) {
        Write-Host "  First: $($result.data[0].title)" -ForegroundColor Gray
    }
}
Write-Host ""

# Test 2: Web Adapter - Get Wikipedia Page
$result = Invoke-BraidTest -TestName "Test 2: Web Adapter - Get Wikipedia Page" -Envelope @{
    requestId = "test-web-page"
    actor = @{ id = "agent:test"; type = "agent" }
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    actions = @(
        @{
            id = "action-1"
            verb = "read"
            actor = @{ id = "agent:test"; type = "agent" }
            resource = @{ system = "web"; kind = "wikipedia-page" }
            payload = @{ pageid = "1" }
        }
    )
}
if ($result -and $result.data) {
    Write-Host "  Page: $($result.data.title)" -ForegroundColor Gray
    Write-Host "  Extract: $($result.data.extract.Substring(0, [Math]::Min(100, $result.data.extract.Length)))..." -ForegroundColor Gray
}
Write-Host ""

# Test 3: CRM Adapter - Search Accounts
$result = Invoke-BraidTest -TestName "Test 3: CRM Adapter - Search Accounts" -Envelope @{
    requestId = "test-crm-accounts"
    actor = @{ id = "agent:test"; type = "agent" }
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    actions = @(
        @{
            id = "action-1"
            verb = "search"
            actor = @{ id = "agent:test"; type = "agent" }
            resource = @{ system = "crm"; kind = "accounts" }
            metadata = @{ tenant_id = "system" }
            options = @{ maxItems = 5 }
        }
    )
}
if ($result) {
    Write-Host "  Results: $($result.data.Count) accounts" -ForegroundColor Gray
}
Write-Host ""

# Test 4: CRM Adapter - Search Leads
$result = Invoke-BraidTest -TestName "Test 4: CRM Adapter - Search Leads" -Envelope @{
    requestId = "test-crm-leads"
    actor = @{ id = "agent:test"; type = "agent" }
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    actions = @(
        @{
            id = "action-1"
            verb = "search"
            actor = @{ id = "agent:test"; type = "agent" }
            resource = @{ system = "crm"; kind = "leads" }
            metadata = @{ tenant_id = "system" }
            options = @{ maxItems = 5 }
        }
    )
}
if ($result) {
    Write-Host "  Results: $($result.data.Count) leads" -ForegroundColor Gray
}
Write-Host ""

# Test 5: CRM Adapter - Search Contacts
$result = Invoke-BraidTest -TestName "Test 5: CRM Adapter - Search Contacts" -Envelope @{
    requestId = "test-crm-contacts"
    actor = @{ id = "agent:test"; type = "agent" }
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    actions = @(
        @{
            id = "action-1"
            verb = "search"
            actor = @{ id = "agent:test"; type = "agent" }
            resource = @{ system = "crm"; kind = "contacts" }
            metadata = @{ tenant_id = "system" }
            options = @{ maxItems = 5 }
        }
    )
}
if ($result) {
    Write-Host "  Results: $($result.data.Count) contacts" -ForegroundColor Gray
}
Write-Host ""

# Test 6: Mock Adapter
$result = Invoke-BraidTest -TestName "Test 6: Mock Adapter - Read Entity" -Envelope @{
    requestId = "test-mock"
    actor = @{ id = "agent:test"; type = "agent" }
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    actions = @(
        @{
            id = "action-1"
            verb = "read"
            actor = @{ id = "agent:test"; type = "agent" }
            resource = @{ system = "mock"; kind = "example-entity" }
            targetId = "123"
        }
    )
}
if ($result -and $result.data) {
    Write-Host "  Mock data: $($result.data | ConvertTo-Json -Compress)" -ForegroundColor Gray
}
Write-Host ""

# Test 7: Batch Actions (Multiple systems in one envelope)
Write-Host "Test 7: Batch Actions (CRM + Web)" -ForegroundColor Cyan
try {
    $body = @{
        requestId = "test-batch"
        actor = @{ id = "agent:test"; type = "agent" }
        createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        actions = @(
            @{
                id = "action-1"
                verb = "search"
                actor = @{ id = "agent:test"; type = "agent" }
                resource = @{ system = "crm"; kind = "accounts" }
                metadata = @{ tenant_id = "system" }
                options = @{ maxItems = 2 }
            },
            @{
                id = "action-2"
                verb = "search"
                actor = @{ id = "agent:test"; type = "agent" }
                resource = @{ system = "web"; kind = "wikipedia-search" }
                payload = @{ q = "CRM software" }
            }
        )
    } | ConvertTo-Json -Depth 10

    $response = Invoke-WebRequest -Uri "$baseUrl/mcp/run" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    $result = $response.Content | ConvertFrom-Json

    $allSuccess = ($result.results | Where-Object { $_.status -ne "success" }).Count -eq 0

    if ($allSuccess) {
        Write-Host "  ✓ PASSED - All $($result.results.Count) actions succeeded" -ForegroundColor Green
        Write-Host "    Action 1 (CRM): $($result.results[0].data.Count) results" -ForegroundColor Gray
        Write-Host "    Action 2 (Web): $($result.results[1].data.Count) results" -ForegroundColor Gray
        $testsPassed++
    } else {
        Write-Host "  ✗ FAILED - Some actions failed" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}
Write-Host ""

# Test 8: Error Handling - Missing Required Field
Write-Host "Test 8: Error Handling - Missing tenant_id" -ForegroundColor Cyan
$result = Invoke-BraidTest -TestName "" -Envelope @{
    requestId = "test-error-missing-tenant"
    actor = @{ id = "agent:test"; type = "agent" }
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    actions = @(
        @{
            id = "action-1"
            verb = "search"
            actor = @{ id = "agent:test"; type = "agent" }
            resource = @{ system = "crm"; kind = "accounts" }
            # Missing tenant_id intentionally
        }
    )
}
if ($result -and $result.status -eq "error") {
    # Error is expected, so this is a pass
    Write-Host "  ✓ Correctly returned error: $($result.errorCode)" -ForegroundColor Green
    Write-Host "  Message: $($result.errorMessage)" -ForegroundColor Gray
    $testsPassed++
    $testsFailed--  # Undo the auto-fail from Invoke-BraidTest
} else {
    Write-Host "  ✗ Should have returned error" -ForegroundColor Red
}
Write-Host ""

# Test 9: Error Handling - Unsupported System
Write-Host "Test 9: Error Handling - Unsupported System" -ForegroundColor Cyan
$result = Invoke-BraidTest -TestName "" -Envelope @{
    requestId = "test-error-unsupported"
    actor = @{ id = "agent:test"; type = "agent" }
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    actions = @(
        @{
            id = "action-1"
            verb = "search"
            actor = @{ id = "agent:test"; type = "agent" }
            resource = @{ system = "nonexistent-system"; kind = "test" }
        }
    )
}
if ($result -and $result.status -eq "error") {
    # Error is expected, so this is a pass
    Write-Host "  ✓ Correctly returned error: $($result.errorCode)" -ForegroundColor Green
    Write-Host "  Message: $($result.errorMessage)" -ForegroundColor Gray
    $testsPassed++
    $testsFailed--  # Undo the auto-fail from Invoke-BraidTest
} else {
    Write-Host "  ✗ Should have returned error" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  Test Summary" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  Passed: $testsPassed" -ForegroundColor Green
Write-Host "  Failed: $testsFailed" -ForegroundColor Red
Write-Host "  Total:  $($testsPassed + $testsFailed)" -ForegroundColor White
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "✓ All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ Some tests failed" -ForegroundColor Red
    exit 1
}