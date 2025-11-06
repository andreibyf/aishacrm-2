<#
.SYNOPSIS
  Deletes employee records that match test email patterns or metadata flags (is_e2e_test_data) via API calls.
.DESCRIPTION
  Uses backend API on the configured backend URL (auto-detected from .env VITE_AISHACRM_BACKEND_URL or defaults to http://localhost:4001).
  Requires that the backend is running and accessible.
.PARAMETER Confirm
  Pass -Confirm:$false to suppress the interactive confirmation.
#>
param(
  [switch]$Force,
  [switch]$DryRun
)

Write-Host "[cleanup-e2e-employees] Starting cleanup..." -ForegroundColor Cyan

# Resolve repo root
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
if (-not (Test-Path $repoRoot/.env)) {
  Write-Host "[cleanup-e2e-employees] .env not found at $repoRoot; using defaults." -ForegroundColor Yellow
}

$envFile = Join-Path $repoRoot '.env'
$backendUrl = $null
if (Test-Path $envFile) {
  $lines = Get-Content $envFile
  $match = $lines | Where-Object { $_ -match '^VITE_AISHACRM_BACKEND_URL=' }
  if ($match) {
    $backendUrl = ($match -replace '^VITE_AISHACRM_BACKEND_URL=', '').Trim()
  }
}
if (-not $backendUrl) { $backendUrl = 'http://localhost:4001' }

Write-Host "[cleanup-e2e-employees] Using backend URL: $backendUrl" -ForegroundColor Green

# Fetch a reasonable batch of employees across tenants (this assumes an admin context or open listing in test env)
try {
  $url = "$backendUrl/api/employees?tenant_id=test-tenant&limit=500"
  $resp = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
} catch {
  Write-Host "[cleanup-e2e-employees] ERROR: Failed fetching employees: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$employees = @()
if ($resp.data -and $resp.data.employees) { $employees = $resp.data.employees }
elseif ($resp -is [System.Collections.IEnumerable]) { $employees = $resp }

if (-not $employees -or $employees.Count -eq 0) {
  Write-Host "[cleanup-e2e-employees] No employees returned (tenant_id may be wrong or access restricted)." -ForegroundColor Yellow
}

$patterns = @('audit.test.', 'e2e.temp.', '@playwright.test', '@example.com')
$targets = $employees | Where-Object { $e = $_.email.ToLower(); $patterns | ForEach-Object { if ($e.Contains($_)) { $true } } }

# Also check metadata flag if present
$metaTargets = $employees | Where-Object { $_.metadata -and $_.metadata.is_e2e_test_data }

# Combine unique ids
$uniqueTargets = @{}
foreach ($t in $targets) { $uniqueTargets[$t.id] = $t }
foreach ($m in $metaTargets) { $uniqueTargets[$m.id] = $m }
$toDelete = $uniqueTargets.Values

Write-Host "[cleanup-e2e-employees] Found $($toDelete.Count) employee(s) matching test patterns or metadata." -ForegroundColor Cyan
if ($toDelete.Count -eq 0) { exit 0 }

if (-not $Force -and -not $DryRun) {
  $confirm = Read-Host "Proceed with deletion? (y/N)"
  if ($confirm.ToLower() -ne 'y') {
    Write-Host "[cleanup-e2e-employees] Aborted by user." -ForegroundColor Yellow
    exit 0
  }
}

foreach ($emp in $toDelete) {
  $delUrl = "$backendUrl/api/employees/$($emp.id)?tenant_id=$($emp.tenant_id)"
  if ($DryRun) {
    Write-Host "[DRY-RUN] Would DELETE $delUrl ($($emp.email))" -ForegroundColor Magenta
    continue
  }
  try {
    Invoke-RestMethod -Uri $delUrl -Method Delete -ErrorAction Stop | Out-Null
    Write-Host "[cleanup-e2e-employees] Deleted $($emp.email) (id=$($emp.id))" -ForegroundColor Green
  } catch {
    Write-Host "[cleanup-e2e-employees] ERROR deleting $($emp.email): $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host "[cleanup-e2e-employees] Cleanup complete." -ForegroundColor Cyan
