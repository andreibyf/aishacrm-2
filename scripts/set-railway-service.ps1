param(
  [Parameter(Mandatory=$true)][string]$ServiceId
)

$monitorConfigPath = Join-Path $PSScriptRoot "monitoring.config.json"

# Persist to config file for monitor script
$cfg = @{ serviceId = $ServiceId } | ConvertTo-Json -Compress
$cfg | Set-Content -Path $monitorConfigPath -Encoding UTF8

Write-Host "Saved monitoring config:" -ForegroundColor Cyan
Write-Host $monitorConfigPath -ForegroundColor Green

# Also link the service for current directory (optional convenience)
try {
  railway service $ServiceId | Out-Null
  Write-Host "Linked Railway service $ServiceId to this directory" -ForegroundColor Green
} catch {
  Write-Host "Could not link service via CLI; config file still saved." -ForegroundColor Yellow
}
