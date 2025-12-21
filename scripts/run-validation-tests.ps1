#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Run form validation and schema alignment tests
.DESCRIPTION
    Executes comprehensive tests to validate that all entity forms correctly
    align with database schemas and accept minimal required fields
#>

Write-Host "`n🧪 Form Validation & Schema Alignment Test Suite" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Ensure we're in the project root
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Check if containers are running
Write-Host "🔍 Checking Docker containers..." -ForegroundColor Yellow
$frontendRunning = docker ps --filter "name=aishacrm-frontend" --filter "status=running" --format "{{.Names}}"
$backendRunning = docker ps --filter "name=aishacrm-backend" --filter "status=running" --format "{{.Names}}"

if (-not $frontendRunning) {
    Write-Host "❌ Frontend container is not running!" -ForegroundColor Red
    Write-Host "   Run: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

if (-not $backendRunning) {
    Write-Host "❌ Backend container is not running!" -ForegroundColor Red
    Write-Host "   Run: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Containers are running" -ForegroundColor Green
Write-Host ""

# Check if Playwright is installed
Write-Host "🔍 Checking Playwright installation..." -ForegroundColor Yellow
$playwrightInstalled = Test-Path "node_modules/@playwright/test"

if (-not $playwrightInstalled) {
    Write-Host "⚠️  Playwright not found. Installing..." -ForegroundColor Yellow
    npm install --save-dev @playwright/test
    npx playwright install chromium
}

Write-Host "✅ Playwright is ready" -ForegroundColor Green
Write-Host ""

# Run the tests
Write-Host "🚀 Running Tests..." -ForegroundColor Cyan
Write-Host "-" * 80 -ForegroundColor Cyan
Write-Host ""

# Test options
$testFiles = @(
    "tests/form-validation.spec.js",
    "tests/api-schema-validation.spec.js"
)

$allPassed = $true

foreach ($testFile in $testFiles) {
    if (Test-Path $testFile) {
        Write-Host "`n📝 Running: $testFile" -ForegroundColor Cyan
        
        npx playwright test $testFile --reporter=list
        
        if ($LASTEXITCODE -ne 0) {
            $allPassed = $false
        }
    } else {
        Write-Host "⚠️  Test file not found: $testFile" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "-" * 80 -ForegroundColor Cyan

if ($allPassed) {
    Write-Host "`n✅ ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Form validation is correctly aligned with database schemas." -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n❌ SOME TESTS FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Review the output above for details." -ForegroundColor Yellow
    exit 1
}
