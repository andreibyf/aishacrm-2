# sync-workers-to-ai-server.ps1
# Deploys task-worker files to the HP Omen AI Server via tar+scp.
# Run from repo root after any worker code change.
#
# Usage: .\scripts\sync-workers-to-ai-server.ps1
#        .\scripts\sync-workers-to-ai-server.ps1 -IP 192.168.7.219  # override IP

param(
    [string]$IP   = (Get-Content .env -ErrorAction SilentlyContinue |
                     Select-String 'AI_SERVER_IP' |
                     ForEach-Object { $_ -replace '^AI_SERVER_IP=','' } |
                     Select-Object -First 1),
    [string]$User = "aisha",
    [string]$Dest = "/home/aisha/aisha-worker",
    [string]$Key  = "$env:USERPROFILE\.ssh\hp_omen_ed25519"
)

if (-not $IP) { $IP = "192.168.7.219" }

$bash    = "C:\Program Files\Git\bin\bash.exe"
$TAR     = "/tmp/aisha-worker.tar.gz"

# Convert key path to POSIX for Git Bash
$bashKey = ($Key -replace '\\', '/') -replace '^([A-Za-z]):', '/c'

Write-Host "→ Packing and syncing worker files to ${User}@${IP}:${Dest}" -ForegroundColor Cyan

# Pack + upload + extract in one bash script
$script = @"
set -euo pipefail
KEY="$bashKey"
IP="$IP"
USER="$User"
DEST="$Dest"
TAR="$TAR"

cd /c/Users/andre/Documents/GitHub/aishacrm-2

tar czf "`$TAR" \
  --exclude="backend/node_modules" \
  --exclude="backend/.env*" \
  --exclude="backend/__tests__" \
  --exclude="backend/migrations" \
  --exclude="backend/routes" \
  --exclude="backend/middleware" \
  --exclude="braid-llm-kit/editor" \
  --exclude="braid-llm-kit/node_modules" \
  --exclude="braid-llm-kit/docs" \
  --exclude="braid-llm-kit/spec" \
  --exclude="braid-llm-kit/tests" \
  backend/workers backend/lib backend/services \
  backend/package.json backend/package-lock.json \
  shared/contracts braid-llm-kit ecosystem.config.cjs

echo "  packed: `$(du -sh `$TAR | cut -f1)"

scp -i "`$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes "`$TAR" "`${USER}@`${IP}:/tmp/"
ssh -i "`$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes "`${USER}@`${IP}" \
  "cd `$DEST && tar xzf /tmp/aisha-worker.tar.gz && rm /tmp/aisha-worker.tar.gz"
"@

& $bash -c $script

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Pack/upload failed" -ForegroundColor Red
    exit 1
}

Write-Host "→ Running npm install on AI server..." -ForegroundColor Cyan
& $bash -c "ssh -i '$bashKey' -o StrictHostKeyChecking=no -o BatchMode=yes ${User}@${IP} 'cd ${Dest}/backend && npm install --omit=dev --silent'"

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ npm install failed" -ForegroundColor Red
    exit 1
}

Write-Host "→ Reloading PM2 workers..." -ForegroundColor Cyan
& $bash -c "ssh -i '$bashKey' -o StrictHostKeyChecking=no -o BatchMode=yes ${User}@${IP} 'cd ${Dest} && pm2 reload ecosystem.config.cjs 2>/dev/null || pm2 start ecosystem.config.cjs'"

Write-Host "✓ Done — workers updated on $IP" -ForegroundColor Green
Write-Host ""
Write-Host "  Check status : ssh ${User}@${IP} 'pm2 list'"
Write-Host "  Tail logs    : ssh ${User}@${IP} 'pm2 logs'"
