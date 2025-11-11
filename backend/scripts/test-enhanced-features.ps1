#!/usr/bin/env pwsh
# Enhanced Feature Test - Async/Await and Arithmetic Chaining
# Tests newly implemented transpiler capabilities

$baseUrl = "http://localhost:4001/api/braid"
$tempFile = "test-payload.json"
$results = @()

Write-Host "`n🚀 Enhanced Braid Feature Tests" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [hashtable]$Payload = $null,
        $ExpectedResult = $null
    )
    
    $url = "$baseUrl$Path"
    
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
        
        $json = $response | ConvertFrom-Json -ErrorAction SilentlyContinue
        
        if ($json -and $json.result -ne $null) {
            $resultStr = if ($json.result -is [array]) { "[$($json.result.Count) items]" } else { $json.result }
            
            # Validate expected result if provided
            $passed = $true
            if ($ExpectedResult -ne $null) {
                $passed = ($json.result -eq $ExpectedResult)
            }
            
            if ($passed) {
                Write-Host "✅ $Name" -ForegroundColor Green -NoNewline
                Write-Host " → $resultStr" -ForegroundColor Gray
                if ($ExpectedResult -ne $null) {
                    Write-Host "   Expected: $ExpectedResult ✓" -ForegroundColor DarkGray
                }
            } else {
                Write-Host "❌ $Name" -ForegroundColor Red -NoNewline
                Write-Host " → $resultStr (Expected: $ExpectedResult)" -ForegroundColor Yellow
            }
            
            $script:results += [PSCustomObject]@{
                Test = $Name
                Status = if ($passed) { "✅ PASS" } else { "❌ FAIL" }
                Result = $resultStr
                Expected = $ExpectedResult
            }
            return $passed
        } else {
            Write-Host "❌ $Name" -ForegroundColor Red -NoNewline
            Write-Host " → ERROR: $($json.message)" -ForegroundColor Yellow
            
            $script:results += [PSCustomObject]@{
                Test = $Name
                Status = "❌ FAIL"
                Result = $json.message
                Expected = $ExpectedResult
            }
            return $false
        }
    } catch {
        Write-Host "❌ $Name" -ForegroundColor Red -NoNewline
        Write-Host " → EXCEPTION: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
}

# ===== ASYNC/AWAIT TESTS =====
Write-Host "`n⚡ Async/Await Features" -ForegroundColor Cyan
Test-Endpoint "async_delay (with await)" "POST" "/async_delay" @{ ms=1000; message="Hello Async" } "Hello Async"
Test-Endpoint "async_multi (multiple awaits)" "GET" "/async_multi" $null "Step 1 -> Step 2"

# ===== ARITHMETIC CHAINING TESTS =====
Write-Host "`n🔢 Arithmetic Chaining (Multi-Operator)" -ForegroundColor Cyan
Test-Endpoint "chain_multiply_divide" "GET" "/math/chain_multiply_divide" $null 50
Test-Endpoint "chain_add_multiply (precedence)" "GET" "/math/chain_add_multiply" $null 20
Test-Endpoint "parentheses" "GET" "/math/parentheses" $null 30
Test-Endpoint "commission_direct (chained)" "POST" "/math/commission_direct" @{ deal_value=10000; rate=5 } 500
Test-Endpoint "activity_direct (chained)" "POST" "/math/activity_direct" @{ emails=10; calls=5; meetings=3 } 40
Test-Endpoint "mixed_operators" "POST" "/math/mixed_operators" @{ x=100; y=50; z=20 } 140

# ===== CRM UPDATED ENDPOINTS (Simplified) =====
Write-Host "`n💼 CRM Endpoints (Now with Direct Chaining)" -ForegroundColor Cyan
Test-Endpoint "calculate_commission (CRM, simplified)" "POST" "/crm/calculate_commission" @{ deal_value=10000; rate=5 } 500
Test-Endpoint "activity_score (CRM, simplified)" "POST" "/crm/activity_score" @{ emails=10; calls=5; meetings=3 } 40

# Cleanup
if (Test-Path $tempFile) {
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}

# ===== SUMMARY =====
Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "📊 ENHANCED FEATURES TEST SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$passed = ($results | Where-Object { $_.Status -eq "✅ PASS" }).Count
$failed = ($results | Where-Object { $_.Status -eq "❌ FAIL" }).Count
$total = $results.Count

Write-Host "`nTotal Tests: $total" -ForegroundColor White
Write-Host "✅ Passed: $passed" -ForegroundColor Green
Write-Host "❌ Failed: $failed" -ForegroundColor Red

$successRate = if ($total -gt 0) { [math]::Round(($passed / $total) * 100, 1) } else { 0 }
Write-Host "`nSuccess Rate: $successRate%" -ForegroundColor $(if ($successRate -eq 100) { "Green" } elseif ($successRate -ge 80) { "Yellow" } else { "Red" })

Write-Host "`n✨ New Features Validated:" -ForegroundColor Cyan
Write-Host "  • Async/await in let bindings" -ForegroundColor Gray
Write-Host "  • Multiple await expressions in single function" -ForegroundColor Gray
Write-Host "  • Chained arithmetic operators (no intermediate lets)" -ForegroundColor Gray
Write-Host "  • Operator precedence preservation" -ForegroundColor Gray
Write-Host "  • Parentheses support in expressions" -ForegroundColor Gray

Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Cyan

if ($failed -eq 0) {
    Write-Host "`n✅ All enhanced features working!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n❌ Some tests failed. Review above." -ForegroundColor Red
    exit 1
}
