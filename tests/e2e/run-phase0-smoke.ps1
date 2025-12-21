param(
  [switch]$Headed,
  [switch]$Html,
  [int]$Workers = 1
)

Write-Host "== Ai-SHA CRM Phase 0 Smoke Suite ==" -ForegroundColor Cyan
Write-Host "Headed: $($Headed.IsPresent) | HTML Report: $($Html.IsPresent) | Workers: $Workers" -ForegroundColor Cyan

# Ensure location
$root = Split-Path $MyInvocation.MyCommand.Path -Parent | Split-Path -Parent
Set-Location $root

# Build Playwright command
$playwrightArgs = @('test','tests/e2e','--grep','@smoke','--workers',$Workers)
if ($Headed) { $playwrightArgs += '--headed' }
if ($Html) { $playwrightArgs += '--reporter=html' } else { $playwrightArgs += '--reporter=line' }

Write-Host "Running: npx playwright $($playwrightArgs -join ' ')" -ForegroundColor Yellow

$env:FORCE_COLOR='1'
npx playwright @playwrightArgs

if ($LASTEXITCODE -eq 0) {
  Write-Host "`nSmoke suite PASSED" -ForegroundColor Green
  if ($Html) { Write-Host "Open report: npx playwright show-report" -ForegroundColor Green }
  exit 0
} else {
  Write-Host "`nSmoke suite FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
  exit $LASTEXITCODE
}
