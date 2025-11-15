# Sync selected environment variables from backend/.env into braid-mcp-node-server/.env
# Usage: from repo root: pwsh ./braid-mcp-node-server/scripts/sync-env.ps1
# This will create or overwrite braid-mcp-node-server/.env (excluding secrets you may not want).

$backendEnv = Join-Path $PSScriptRoot '..' '..' 'backend' '.env'
$targetEnv  = Join-Path $PSScriptRoot '..' '.env'

if (-not (Test-Path $backendEnv)) {
  Write-Host "backend/.env not found at $backendEnv" -ForegroundColor Yellow
  exit 2
}

$varsToCopy = @(
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY'
)

$lines = Get-Content $backendEnv
$newEnvContent = @()
foreach ($line in $lines) {
  if ($line -match '^(?<key>[^#=]+)=(?<val>.*)$') {
    $k = $matches['key'].Trim()
    $v = $matches['val'].Trim()
    if ($varsToCopy -contains $k) {
      $newEnvContent += "$k=$v"
    }
  }
}
# Add required MCP-specific entries
$newEnvContent += 'CRM_BACKEND_URL=http://host.docker.internal:4001'
$newEnvContent += 'USE_DIRECT_SUPABASE_ACCESS=true'

$newEnvContent | Out-File $targetEnv -Encoding UTF8
Write-Host "Created/updated $targetEnv with $(($newEnvContent).Count) entries" -ForegroundColor Green
Write-Host "Run: docker compose -f braid-mcp-node-server/docker-compose.dev.yml up --build" -ForegroundColor Cyan
