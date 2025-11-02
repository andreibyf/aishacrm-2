param(
  [Parameter(Mandatory=$true)][string]$Url,
  [string]$Project = "chromium",
  [string]$Email,
  [string]$Password
)

Write-Host "Verifying current directory..." -ForegroundColor Cyan
Get-Location

# Set the frontend and backend URLs for tests and optional login creds
$env:VITE_AISHACRM_FRONTEND_URL = $Url
# Derive backend URL from frontend URL (replace frontend subdomain with backend)
$env:VITE_AISHACRM_BACKEND_URL = $Url -replace 'frontend', 'backend'
if ($Email) { $env:SUPERADMIN_EMAIL = $Email }
if ($Password) { $env:SUPERADMIN_PASSWORD = $Password }

Write-Host "Running staging smoke tests against $Url on project $Project" -ForegroundColor Green
Write-Host "Backend URL: $env:VITE_AISHACRM_BACKEND_URL" -ForegroundColor Cyan

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
