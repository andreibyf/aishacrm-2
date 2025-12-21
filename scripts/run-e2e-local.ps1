#!/usr/bin/env pwsh
<#
.SYNOPSIS
Run E2E tests in local dev mode (skips Supabase auth setup)

.DESCRIPTION
This script runs E2E tests that don't require authentication,
perfect for testing with placeholder Supabase credentials.

.EXAMPLE
.\run-e2e-local.ps1
#>

Write-Host "🧪 Running E2E Tests (Local Dev Mode)" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check containers are running
Write-Host "📦 Checking Docker containers..." -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}" | Select-String "aishacrm"
if (-not $containers) {
    Write-Host "❌ No Aisha CRM containers running!" -ForegroundColor Red
    Write-Host "   Start with: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Containers running:" -ForegroundColor Green
docker ps --filter "name=aishacrm" --format "  - {{.Names}} ({{.Status}})"
Write-Host ""

# Check frontend is responding
Write-Host "🌐 Checking frontend..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000" -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Frontend responding on http://localhost:4000" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Frontend not responding!" -ForegroundColor Red
    exit 1
}

# Check backend is responding
Write-Host "🔧 Checking backend..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4001/health" -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Backend responding on http://localhost:4001" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Backend not responding!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 Running tests that work without auth..." -ForegroundColor Cyan
Write-Host ""

# Run only tests that don't require authentication
$testFiles = @(
    "tests/api-schema-validation.spec.js"
    "tests/form-validation.spec.js"
    "tests/e2e/api-docs.spec.js"
    "tests/e2e/metrics-smoke.spec.ts"
)

$passed = 0
$failed = 0

foreach ($testFile in $testFiles) {
    if (Test-Path $testFile) {
        Write-Host "Running: $testFile" -ForegroundColor Yellow
        npx playwright test $testFile --reporter=list
        if ($LASTEXITCODE -eq 0) {
            $passed++
        } else {
            $failed++
        }
        Write-Host ""
    } else {
        Write-Host "⚠️  Skipping: $testFile (not found)" -ForegroundColor DarkYellow
    }
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "📊 Results:" -ForegroundColor Cyan
Write-Host "   Passed: $passed" -ForegroundColor Green
Write-Host "   Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($failed -gt 0) {
    Write-Host "❌ Some tests failed!" -ForegroundColor Red
    Write-Host "   View report: npx playwright show-report" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✅ All tests passed!" -ForegroundColor Green
    exit 0
}
