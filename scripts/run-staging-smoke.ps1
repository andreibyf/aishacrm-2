param(
  [Parameter(Mandatory=$true)][string]$Url,
  [string]$Project = "chromium"
)

Write-Host "Verifying current directory..." -ForegroundColor Cyan
Get-Location

# Set the frontend base URL for tests
$env:VITE_AISHACRM_FRONTEND_URL = $Url

Write-Host "Running staging smoke tests against $Url on project $Project" -ForegroundColor Green

# Stop on first failure
$ErrorActionPreference = 'Stop'

# 1. Contacts - create new contact (critical CRUD path)
Write-Host "[1/3] Contacts: create new contact" -ForegroundColor Yellow
npm run test:e2e -- --project=$Project tests/e2e/crud-operations.spec.js -g "should create a new contact"
if ($LASTEXITCODE -ne 0) { throw "Contacts create test failed." }

# 2. Settings - Data Consistency
Write-Host "[2/3] Settings: Data Consistency" -ForegroundColor Yellow
npm run test:e2e -- --project=$Project data-consistency
if ($LASTEXITCODE -ne 0) { throw "Data Consistency test failed." }

# 3. Settings - Security
Write-Host "[3/3] Settings: Security" -ForegroundColor Yellow
npm run test:e2e -- --project=$Project security
if ($LASTEXITCODE -ne 0) { throw "Security test failed." }

Write-Host "✅ Staging smoke suite PASSED" -ForegroundColor Green
