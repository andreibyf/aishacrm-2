#!/usr/bin/env pwsh
# Automated Braid CRM Endpoint Testing Script
# Tests all /api/braid/crm endpoints and reports results

$baseUrl = "http://localhost:4001/api/braid/crm"
$tempFile = "test-payload.json"
$results = @()

Write-Host "`n🧪 Braid CRM Endpoint Test Suite" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [hashtable]$Payload = $null
    )
    
    $url = "$baseUrl$Path"
    $startTime = Get-Date
    
    try {
        if ($Method -eq "GET") {
            $response = curl -s $url 2>&1
        } else {
            if ($Payload) {
                $Payload | ConvertTo-Json -Compress | Out-File -Encoding utf8 $tempFile
                $response = curl -s -X POST $url -H "Content-Type: application/json" --data-binary "@$tempFile" 2>&1
            } else {
                $response = curl -s -X POST $url -H "Content-Type: application/json" -d '{}' 2>&1
            }
        }
        
        $duration = (Get-Date) - $startTime
        
        # Check if response is valid JSON with result field
        $json = $response | ConvertFrom-Json -ErrorAction SilentlyContinue
        
        if ($json -and $json.result -ne $null) {
            Write-Host "✅ $Name" -ForegroundColor Green -NoNewline
            Write-Host " → " -NoNewline
            $resultStr = if ($json.result -is [array]) { "[$($json.result.Count) items]" } else { $json.result }
            Write-Host "$resultStr" -ForegroundColor Gray
            
            $script:results += [PSCustomObject]@{
                Endpoint = $Name
                Status = "✅ PASS"
                Result = $resultStr
                Duration = [math]::Round($duration.TotalMilliseconds, 0)
            }
            return $true
        } elseif ($json -and $json.status -eq "error") {
            Write-Host "❌ $Name" -ForegroundColor Red -NoNewline
            Write-Host " → ERROR: $($json.message)" -ForegroundColor Yellow
            
            $script:results += [PSCustomObject]@{
                Endpoint = $Name
                Status = "❌ FAIL"
                Result = $json.message
                Duration = [math]::Round($duration.TotalMilliseconds, 0)
            }
            return $false
        } else {
            Write-Host "⚠️  $Name" -ForegroundColor Yellow -NoNewline
            Write-Host " → Invalid response format" -ForegroundColor Gray
            
            $script:results += [PSCustomObject]@{
                Endpoint = $Name
                Status = "⚠️  WARN"
                Result = "Invalid JSON"
                Duration = [math]::Round($duration.TotalMilliseconds, 0)
            }
            return $false
        }
    } catch {
        Write-Host "❌ $Name" -ForegroundColor Red -NoNewline
        Write-Host " → EXCEPTION: $($_.Exception.Message)" -ForegroundColor Yellow
        
        $script:results += [PSCustomObject]@{
            Endpoint = $Name
            Status = "❌ FAIL"
            Result = $_.Exception.Message
            Duration = 0
        }
        return $false
    }
}

# ===== LEAD SCORING =====
Write-Host "`n📊 Lead Scoring" -ForegroundColor Cyan
Test-Endpoint "score_lead" "POST" "/score_lead" @{ company_size=100; budget=50000; urgency=8 }
Test-Endpoint "lead_quality (Hot)" "POST" "/lead_quality" @{ score=85 }
Test-Endpoint "lead_quality (Warm)" "POST" "/lead_quality" @{ score=65 }
Test-Endpoint "lead_quality (Cold)" "POST" "/lead_quality" @{ score=30 }

# ===== DEAL PIPELINE =====
Write-Host "`n💼 Deal Pipeline" -ForegroundColor Cyan
Test-Endpoint "deal_probability (stage 1)" "POST" "/deal_probability" @{ stage=1 }
Test-Endpoint "deal_probability (stage 3)" "POST" "/deal_probability" @{ stage=3 }
Test-Endpoint "deal_probability (stage 5)" "POST" "/deal_probability" @{ stage=5 }
Test-Endpoint "weighted_value" "POST" "/weighted_value" @{ deal_value=100000; stage=4 }

# ===== CONTACT MANAGEMENT =====
Write-Host "`n👤 Contact Management" -ForegroundColor Cyan
Test-Endpoint "format_contact" "POST" "/format_contact" @{ first_name="John"; last_name="Doe"; title="CEO" }
Test-Endpoint "create_contact" "POST" "/create_contact" @{ first_name="Jane"; last_name="Smith"; company="Acme Corp" }

# ===== REVENUE CALCULATIONS =====
Write-Host "`n💰 Revenue Calculations" -ForegroundColor Cyan
Test-Endpoint "calculate_mrr" "POST" "/calculate_mrr" @{ annual_value=120000 }
Test-Endpoint "calculate_commission (5%)" "POST" "/calculate_commission" @{ deal_value=10000; rate=5 }
Test-Endpoint "calculate_commission (10%)" "POST" "/calculate_commission" @{ deal_value=50000; rate=10 }

# ===== ACTIVITY TRACKING =====
Write-Host "`n📈 Activity Tracking" -ForegroundColor Cyan
Test-Endpoint "activity_score" "POST" "/activity_score" @{ emails=10; calls=5; meetings=3 }
Test-Endpoint "follow_up_priority (Urgent)" "POST" "/follow_up_priority" @{ days_since_contact=20 }
Test-Endpoint "follow_up_priority (High)" "POST" "/follow_up_priority" @{ days_since_contact=10 }
Test-Endpoint "follow_up_priority (Normal)" "POST" "/follow_up_priority" @{ days_since_contact=3 }

# ===== TERRITORY MANAGEMENT =====
Write-Host "`n🗺️  Territory Management" -ForegroundColor Cyan
Test-Endpoint "assign_territory (Enterprise)" "POST" "/assign_territory" @{ company_size=5000 }
Test-Endpoint "assign_territory (Mid-Market)" "POST" "/assign_territory" @{ company_size=500 }
Test-Endpoint "assign_territory (SMB)" "POST" "/assign_territory" @{ company_size=50 }
Test-Endpoint "territory_quota" "POST" "/territory_quota" @{ accounts=10 }

# ===== FORECASTING =====
Write-Host "`n📅 Forecasting" -ForegroundColor Cyan
Test-Endpoint "stage_name (1)" "GET" "/stage_name?stage=1"
Test-Endpoint "stage_name (3)" "GET" "/stage_name?stage=3"
Test-Endpoint "stage_name (5)" "GET" "/stage_name?stage=5"
Test-Endpoint "avg_deal_size" "POST" "/avg_deal_size" @{ count=10; total_value=500000 }

# ===== ASYNC OPERATIONS =====
Write-Host "`n⚡ Async Operations" -ForegroundColor Cyan
Test-Endpoint "account_summary" "POST" "/account_summary" @{ account_id=12345; name="Acme Corp" }

# ===== VALIDATION =====
Write-Host "`n✔️  Validation" -ForegroundColor Cyan
Test-Endpoint "validate_email (valid)" "POST" "/validate_email" @{ email="test@example.com" }
Test-Endpoint "validate_email (too short)" "POST" "/validate_email" @{ email="t@e" }
Test-Endpoint "validate_deal (valid)" "POST" "/validate_deal" @{ amount=10000; stage=3 }
Test-Endpoint "validate_deal (negative amount)" "POST" "/validate_deal" @{ amount=-5000; stage=3 }
Test-Endpoint "validate_deal (invalid stage)" "POST" "/validate_deal" @{ amount=10000; stage=0 }
Test-Endpoint "validate_deal (stage out of range)" "POST" "/validate_deal" @{ amount=10000; stage=10 }

# ===== ARRAY OPERATIONS =====
Write-Host "`n📋 Array Operations" -ForegroundColor Cyan
Test-Endpoint "pipeline_stages" "GET" "/pipeline_stages"
Test-Endpoint "stage_at_index (0)" "POST" "/stage_at_index" @{ index=0 }
Test-Endpoint "stage_at_index (2)" "POST" "/stage_at_index" @{ index=2 }
Test-Endpoint "stage_count" "GET" "/stage_count"

# ===== COMPOSITE OPERATIONS =====
Write-Host "`n🔗 Composite Operations" -ForegroundColor Cyan
Test-Endpoint "evaluate_lead (Hot)" "POST" "/evaluate_lead" @{ company_size=1000; budget=100000; urgency=10 }
Test-Endpoint "evaluate_lead (Cold)" "POST" "/evaluate_lead" @{ company_size=10; budget=5000; urgency=2 }
Test-Endpoint "total_pipeline" "POST" "/total_pipeline" @{ deal1=50000; deal2=75000; deal3=100000 }

# Cleanup
if (Test-Path $tempFile) {
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}

# ===== SUMMARY =====
Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "📊 TEST SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$passed = ($results | Where-Object { $_.Status -eq "✅ PASS" }).Count
$failed = ($results | Where-Object { $_.Status -eq "❌ FAIL" }).Count
$warned = ($results | Where-Object { $_.Status -eq "⚠️  WARN" }).Count
$total = $results.Count

Write-Host "`nTotal Tests: $total" -ForegroundColor White
Write-Host "✅ Passed: $passed" -ForegroundColor Green
Write-Host "❌ Failed: $failed" -ForegroundColor Red
Write-Host "⚠️  Warned: $warned" -ForegroundColor Yellow

$successRate = if ($total -gt 0) { [math]::Round(($passed / $total) * 100, 1) } else { 0 }
Write-Host "`nSuccess Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })

$avgDuration = if ($results.Count -gt 0) { [math]::Round(($results | Measure-Object -Property Duration -Average).Average, 0) } else { 0 }
Write-Host "Average Response Time: ${avgDuration}ms" -ForegroundColor Gray

if ($failed -gt 0) {
    Write-Host "`n❌ Failed Tests:" -ForegroundColor Red
    $results | Where-Object { $_.Status -eq "❌ FAIL" } | ForEach-Object {
        Write-Host "  • $($_.Endpoint): $($_.Result)" -ForegroundColor Yellow
    }
}

Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Cyan

# Exit with appropriate code
if ($failed -eq 0) {
    Write-Host "`n✅ All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n❌ Some tests failed. Please review." -ForegroundColor Red
    exit 1
}
