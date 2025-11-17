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

# Build Playwright base args
$args = @('playwright','test','tests/e2e','--grep','@smoke','--workers', $Workers)
if ($Headed) { $args += '--headed' }
if ($Html) { $args += '--reporter=html' } else { $args += '--reporter=line' }

Write-Host "Running: npx $($args -join ' ')" -ForegroundColor Yellow

$env:FORCE_COLOR=1
$proc = Start-Process -FilePath 'npx' -ArgumentList $args -NoNewWindow -PassThru -Wait

if ($proc.ExitCode -eq 0) {
  Write-Host "Smoke suite PASSED" -ForegroundColor Green
  if ($Html) { Write-Host "Open report: npx playwright show-report" -ForegroundColor Green }
  exit 0
} else {
  Write-Host "Smoke suite FAILED (exit $($proc.ExitCode))" -ForegroundColor Red
  exit $proc.ExitCode
}
