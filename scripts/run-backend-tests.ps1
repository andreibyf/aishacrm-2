param(
  [string]$BackendUrl
)

# Ensure we're in repo root
$here = Get-Location
Write-Host "Current directory: $here" -ForegroundColor DarkGray

# Default BackendUrl: use env var if provided, else 4001 (Docker), else 3001
if (-not $BackendUrl -or [string]::IsNullOrWhiteSpace($BackendUrl)) {
  if ($env:VITE_AISHACRM_BACKEND_URL) {
    $BackendUrl = $env:VITE_AISHACRM_BACKEND_URL
  } else {
    $BackendUrl = "http://localhost:4001"  # Docker default
  }
}

Write-Host "Running backend tests against: $BackendUrl" -ForegroundColor Cyan

# Set env var for test files
$env:BACKEND_URL = $BackendUrl

# Move to backend folder
Push-Location "$PSScriptRoot/..\backend"
try {
  # Run Node's test runner
  npm test
} finally {
  Pop-Location
}
