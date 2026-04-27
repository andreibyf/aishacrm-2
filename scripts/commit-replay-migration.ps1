# commit-replay-migration.ps1
# Commits, tags, and pushes the OpenReplay -> Clarity migration work in one shot.
# Idempotent on stale .git/index.lock (clears it before staging).
#
# Run from repo root:
#   pwsh -File .\scripts\commit-replay-migration.ps1
# or:
#   powershell -ExecutionPolicy Bypass -File .\scripts\commit-replay-migration.ps1
#
# Args:
#   -DryRun       Show what would happen without writing
#   -Tag <value>  Override the tag name (default: v7.1.22)
#   -SkipPush     Commit + tag locally, don't push

[CmdletBinding()]
param(
    [string]$Tag = 'v7.1.22',
    [switch]$DryRun,
    [switch]$SkipPush
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "==> Repo: $repoRoot"
Write-Host "==> Tag:  $Tag"
if ($DryRun)   { Write-Host '==> DRY RUN — no writes' -ForegroundColor Yellow }
if ($SkipPush) { Write-Host '==> SKIP PUSH — commit + tag locally only' -ForegroundColor Yellow }

# 1. Clear any stale lock (often left after a sandbox/foreign git op).
$lock = Join-Path $repoRoot '.git\index.lock'
if (Test-Path $lock) {
    Write-Host "==> Removing stale .git/index.lock"
    if (-not $DryRun) { Remove-Item $lock -Force }
}

# 2. Verify we're on main (or warn).
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "==> Branch: $branch"
if ($branch -ne 'main') {
    Write-Warning "Not on 'main' (you are on '$branch'). Continuing anyway."
}

# 3. Verify tag doesn't already exist.
$existing = git tag --list $Tag
if ($existing) {
    throw "Tag '$Tag' already exists. Pass a different -Tag or delete the existing one first."
}

# 4. Files to stage. Pre-existing dirty files are part of the same logical change
#    (OpenReplay decommission + Clarity migration).
$files = @(
    # Modified — OpenReplay decommission + provider abstraction integration
    '.env.example',
    'CHANGELOG.md',
    'docker-compose.yml',
    'src/App.jsx',
    'src/hooks/useOpenReplay.js',
    'staging/02-app-fast/docker-compose.yml',

    # New — diagnostic tooling
    'scripts/lockup-diagnostic.sh',
    'scripts/lockup-diagnostic.test.sh',
    'scripts/sync-doppler-mcp-token.ps1',
    'scripts/commit-replay-migration.ps1',

    # New — Microsoft Clarity provider + abstraction
    'src/hooks/useClarity.js',
    'src/hooks/useSessionReplay.js',
    'src/hooks/useSessionReplayTracking.js',
    'src/hooks/__tests__/useClarity.test.js',

    # New — companion live take-over button
    'src/components/support/RequestHelp.jsx'
)

# Filter to files that actually exist (avoid silent path typos).
$existingFiles = $files | Where-Object { Test-Path $_ }
$missing = $files | Where-Object { -not (Test-Path $_) }
if ($missing.Count -gt 0) {
    Write-Warning "Missing files (skipping): $($missing -join ', ')"
}

Write-Host "==> Files to stage ($($existingFiles.Count)):"
$existingFiles | ForEach-Object { Write-Host "    $_" }

# 5. Stage.
if (-not $DryRun) {
    git add -- $existingFiles
}

# 6. Show what's actually staged so user can sanity-check.
Write-Host "`n==> git status (staged):"
git status --short

# 7. Commit message.
$msg = @"
feat(replay): migrate from OpenReplay to Microsoft Clarity + Jitsi take-over

Drop-in replacement for OpenReplay session replay; OpenReplay backend on
prod VPS was identified as the trigger for the recurring 5-hour VPS
lock-up cycle (32-core box capped at 550% CPU by hosting provider).
Clarity is SaaS, zero infra, lightweight; pairs with on-demand Jitsi
rooms via <RequestHelp /> for live take-over (Clarity has no remote
control feature).

Architecture:
- New useClarity hook matches useOpenReplay's public interface
- New useSessionReplay selector switches on VITE_SESSION_REPLAY_PROVIDER
  (clarity | openreplay | none) with back-compat fallback to existing
  VITE_OPENREPLAY_ENABLED / VITE_CLARITY_ENABLED flags
- App.jsx now mounts useSessionReplayTracking instead of
  useOpenReplayTracking; the legacy hook stays in place for back-compat
- useOpenReplay.js gains explicit VITE_OPENREPLAY_ENABLED kill-switch
- docker-compose.yml + staging/02-app-fast/docker-compose.yml propagate
  the new env var to frontend builds

New files:
- src/hooks/useClarity.js (drop-in Clarity hook)
- src/hooks/useSessionReplay.js (provider selector)
- src/hooks/useSessionReplayTracking.js (refactored tracking)
- src/hooks/__tests__/useClarity.test.js (7 unit tests)
- src/components/support/RequestHelp.jsx (Jitsi take-over button)
- scripts/lockup-diagnostic.sh + .test.sh (VPS+Cloudflare evidence
  bundler with 7 unit tests; caught a real GNU-date arithmetic bug
  during dev — string-form '\$TS - 15 minutes' is mis-parsed as TZ
  offset, switched to epoch math)
- scripts/sync-doppler-mcp-token.ps1 (one-shot sync of
  DOPPLER_ACCESS_TOKEN from .env into Claude Desktop MCP config)
- scripts/commit-replay-migration.ps1 (this commit/tag/push helper)

Doppler (already applied via MCP, this commit ships the code that uses
the new env vars):
  prd_prd, stg_stg, dev_personal:
    VITE_OPENREPLAY_ENABLED      = false
    VITE_SESSION_REPLAY_PROVIDER = clarity
    VITE_CLARITY_ENABLED         = true
    VITE_CLARITY_DASHBOARD_URL   = https://clarity.microsoft.com
    VITE_HELP_MEETING_PROVIDER   = jitsi
  VITE_CLARITY_PROJECT_ID still pending Clarity sign-up.
"@

if ($DryRun) {
    Write-Host "`n==> DRY RUN — would commit with message:" -ForegroundColor Yellow
    Write-Host $msg
    Write-Host "`n==> DRY RUN — would tag $Tag and push origin main + $Tag"
    exit 0
}

# 8. Commit.
git commit -m $msg

# 9. Tag.
git tag -a $Tag -m "Release $Tag — Clarity migration"

# 10. Push.
if ($SkipPush) {
    Write-Host "`n==> Local commit + tag done. Skipping push." -ForegroundColor Yellow
    Write-Host "    To push later:"
    Write-Host "      git push origin main"
    Write-Host "      git push origin $Tag"
    exit 0
}

Write-Host "`n==> Pushing main..."
git push origin main

Write-Host "==> Pushing tag $Tag..."
git push origin $Tag

Write-Host "`n==> DONE." -ForegroundColor Green
Write-Host "    Commit:  $(git rev-parse --short HEAD)"
Write-Host "    Tag:     $Tag"
Write-Host "    Branch:  $(git rev-parse --abbrev-ref HEAD)"
Write-Host "    Remote:  $(git remote get-url origin)"
