#!/usr/bin/env pwsh
# Verification script for enhanced MCP Monitor deployment

Write-Host "`n=== MCP Monitor Enhancement Verification ===" -ForegroundColor Cyan
Write-Host "Checking deployment status...`n" -ForegroundColor Gray

# Check Docker containers
Write-Host "1. Container Status:" -ForegroundColor Yellow
$frontendStatus = docker ps --filter "name=aishacrm-frontend" --format "{{.Status}}"
$backendStatus = docker ps --filter "name=aishacrm-backend" --format "{{.Status}}"
$braidStatus = docker ps --filter "name=braid-mcp-node-server" --format "{{.Status}}"

if ($frontendStatus -like "*Up*") {
    Write-Host "   ✓ Frontend: $frontendStatus" -ForegroundColor Green
} else {
    Write-Host "   ✗ Frontend: Not running" -ForegroundColor Red
}

if ($backendStatus -like "*Up*") {
    Write-Host "   ✓ Backend: $backendStatus" -ForegroundColor Green
} else {
    Write-Host "   ✗ Backend: Not running" -ForegroundColor Red
}

if ($braidStatus -like "*Up*") {
    Write-Host "   ✓ Braid MCP: $braidStatus" -ForegroundColor Green
} else {
    Write-Host "   ✗ Braid MCP: Not running" -ForegroundColor Red
}

# Check file changes
Write-Host "`n2. File Changes:" -ForegroundColor Yellow
if (Test-Path "src/components/settings/MCPServerMonitor.jsx.backup") {
    Write-Host "   ✓ Original backed up" -ForegroundColor Green
} else {
    Write-Host "   ✗ Backup not found" -ForegroundColor Red
}

if (Test-Path "src/components/settings/MCPServerMonitor.jsx") {
    $content = Get-Content "src/components/settings/MCPServerMonitor.jsx" -Raw
    if ($content -match "runFullTestSuite" -and $content -match "performanceMetrics") {
        Write-Host "   ✓ Enhanced component deployed" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Component not enhanced" -ForegroundColor Red
    }
}

# Test endpoints
Write-Host "`n3. Endpoint Tests:" -ForegroundColor Yellow

try {
    $frontendResp = Invoke-WebRequest -Uri "http://localhost:4000" -Method GET -TimeoutSec 5 -UseBasicParsing
    if ($frontendResp.StatusCode -eq 200) {
        Write-Host "   ✓ Frontend accessible (http://localhost:4000)" -ForegroundColor Green
    }
} catch {
    Write-Host "   ✗ Frontend not accessible: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $braidResp = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method GET -TimeoutSec 5
    if ($braidResp.status -eq "ok") {
        Write-Host "   ✓ Braid MCP healthy (http://localhost:8000/health)" -ForegroundColor Green
    }
} catch {
    Write-Host "   ✗ Braid MCP not responding: $($_.Exception.Message)" -ForegroundColor Red
}

# Summary
Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Open browser: http://localhost:4000" -ForegroundColor White
Write-Host "2. Navigate to: Settings → MCP Monitor" -ForegroundColor White
Write-Host "3. Click: 'Run Full Test Suite (9 Tests)'" -ForegroundColor White
Write-Host "4. Verify: All 9 tests pass with green checkmarks" -ForegroundColor White
Write-Host "5. Review: Performance metrics, security status, availability" -ForegroundColor White

Write-Host "`nDocumentation: MCP_MONITOR_ENHANCEMENT.md`n" -ForegroundColor Gray
