param(
  [switch]$Headed,
  [switch]$Html,
  [int]$Workers = 3
)

# Always verify current directory
Get-Location | Out-Host

$playwrightArgs = @('test','tests/e2e','--grep','@phase1','--workers', $Workers)
if ($Headed) { $playwrightArgs += '--headed' }
if ($Html) { $playwrightArgs += '--reporter=html' } else { $playwrightArgs += '--reporter=line' }

npx playwright @playwrightArgs

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }