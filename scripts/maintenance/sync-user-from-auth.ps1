param(
  [Parameter(Mandatory = $true)][string]$Email,
  [string]$Role,
  [string]$Tenant,
  [switch]$Create,
  [string]$Password
)

Write-Host "[Sync User] Preparing to sync $Email from Supabase Auth into CRM..." -ForegroundColor Cyan

# Verify we're in the repo root; if not, attempt to cd
$expected = "c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53"
$cwd = (Get-Location).Path
if ($cwd -ne $expected) {
  Write-Host "Changing directory to repo root: $expected" -ForegroundColor Yellow
  Set-Location $expected
}

# Build argument list for the Node script
$scriptPath = Join-Path $expected "backend\scripts\sync-user-from-auth.js"
if (!(Test-Path $scriptPath)) {
  Write-Host "Script not found: $scriptPath" -ForegroundColor Red
  exit 1
}

$argsList = @("--email", $Email)
if ($Role) { $argsList += @("--role", $Role) }
if ($Tenant) { $argsList += @("--tenant", $Tenant) }
if ($Create) { $argsList += @("--create", "true") }
if ($Password) { $argsList += @("--password", $Password) }

Write-Host "Running: node $scriptPath $($argsList -join ' ')" -ForegroundColor Gray
& node $scriptPath @argsList
$code = $LASTEXITCODE

if ($code -eq 0) {
  Write-Host "[Sync User] Completed successfully." -ForegroundColor Green
} else {
  Write-Host "[Sync User] Failed with exit code $code" -ForegroundColor Red
}
exit $code
