# sync-doppler-mcp-token.ps1
# Copy DOPPLER_ACCESS_TOKEN from the repo's .env into the Claude Desktop
# MCP server config (claude_desktop_config.json -> mcpServers.doppler.env.DOPPLER_TOKEN).
#
# Why: the custom doppler-mcp/server.py reads DOPPLER_TOKEN, but our .env
# stores the personal token under DOPPLER_ACCESS_TOKEN. This keeps both in sync
# without exposing the token in chat or terminal history.
#
# Run from anywhere: pwsh -File .\scripts\sync-doppler-mcp-token.ps1
# Optional: -EnvPath / -ConfigPath to override defaults.

[CmdletBinding()]
param(
    [string]$EnvPath = (Join-Path $PSScriptRoot '..\.env' | Resolve-Path -ErrorAction SilentlyContinue).Path,
    [string]$ConfigPath = "$env:APPDATA\Claude\claude_desktop_config.json",
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if (-not $EnvPath) {
    $EnvPath = (Resolve-Path (Join-Path $PSScriptRoot '..\.env')).Path
}
if (-not (Test-Path $EnvPath))    { throw ".env not found at $EnvPath" }
if (-not (Test-Path $ConfigPath)) { throw "Claude Desktop config not found at $ConfigPath" }

# Extract DOPPLER_ACCESS_TOKEN tolerantly: handles `KEY=v`, `KEY =v`, `KEY="v"`, `KEY='v'`.
$match = Select-String -Path $EnvPath -Pattern '^\s*DOPPLER_ACCESS_TOKEN\s*=' | Select-Object -First 1
if (-not $match) { throw "DOPPLER_ACCESS_TOKEN not found in $EnvPath" }

$token = $match.Line -replace '^\s*DOPPLER_ACCESS_TOKEN\s*=\s*', ''
$token = $token.Trim().Trim('"').Trim("'")
if (-not $token) { throw "DOPPLER_ACCESS_TOKEN is empty in $EnvPath" }

# Sanity: personal token expected (dp.pt.*)
$prefix = if ($token.Length -ge 5) { $token.Substring(0,5) } else { $token }
if (-not $token.StartsWith('dp.pt.')) {
    Write-Warning "Token doesn't start with dp.pt. (got '$prefix'). Personal tokens are required for workspace-wide MCP access. Continuing anyway."
}

# Load + patch JSON
$json = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not $json.mcpServers)         { throw "No mcpServers block in $ConfigPath" }
if (-not $json.mcpServers.doppler) { throw "No mcpServers.doppler entry in $ConfigPath. Was the connector renamed?" }
if (-not $json.mcpServers.doppler.env) {
    $json.mcpServers.doppler | Add-Member -NotePropertyName env -NotePropertyValue (@{ })
}

$old = $json.mcpServers.doppler.env.DOPPLER_TOKEN
$oldPrefix = if ($old -and $old.Length -ge 5) { $old.Substring(0,5) } else { '<empty>' }

if ($old -eq $token) {
    Write-Host "Already in sync — DOPPLER_TOKEN in config matches DOPPLER_ACCESS_TOKEN in .env."
    Write-Host "If MCP still returns 401, the issue is a stale Python process. Run:"
    Write-Host "  Get-Process python,pythonw -ErrorAction SilentlyContinue | Where-Object { `$_.Path -like '*Python311*' } | Stop-Process -Force"
    Write-Host "Then fully quit Claude Desktop from the system tray and reopen."
    exit 0
}

if ($DryRun) {
    Write-Host "DRY RUN — would update DOPPLER_TOKEN"
    Write-Host "  old prefix: $oldPrefix"
    Write-Host "  new prefix: $prefix"
    Write-Host "  config:     $ConfigPath"
    exit 0
}

# Backup first
$backup = "$ConfigPath.bak-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item -Path $ConfigPath -Destination $backup -Force
Write-Host "Backup written to $backup"

$json.mcpServers.doppler.env.DOPPLER_TOKEN = $token

# Pretty-print, preserve UTF-8 without BOM
$out = $json | ConvertTo-Json -Depth 64
[System.IO.File]::WriteAllText($ConfigPath, $out, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "OK — DOPPLER_TOKEN synchronized."
Write-Host "  prefix changed: $oldPrefix -> $prefix"
Write-Host "  token length:   $($token.Length)"
Write-Host ""
Write-Host "NEXT:"
Write-Host "  1. Kill any zombie Python MCP process holding the old token:"
Write-Host "     Get-Process python,pythonw -ErrorAction SilentlyContinue |"
Write-Host "       Where-Object { `$_.Path -like '*Python311*' } | Stop-Process -Force"
Write-Host "  2. Fully quit Claude Desktop from the system tray (right-click -> Quit)."
Write-Host "  3. Reopen Claude Desktop."
