# check-deploy.ps1 — single-shot staging deploy status check.
#
# Three probes, in order from cheapest to most informative:
#   1. External: GET https://staging-app.aishacrm.com — extracts the
#      Vite bundle hash from /assets/entry-<HASH>.js. If the hash
#      differs from a previous run, the frontend deploy landed.
#   2. External: GET https://staging-backend.aishacrm.com/api/system/health
#      — confirms backend is up.
#   3. Coolify DB: queries application_deployment_queues on VPS-2 for
#      anything in the last 15 minutes, showing status, commit SHA,
#      age. Tells you whether the build is running / queued / done /
#      failed.
#
# Runs once and exits. Use scripts/watch-deploy.ps1 if you want to
# poll until done.

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $repoRoot '.env'
$envMap = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
        $envMap[$matches[1]] = $matches[2].Trim().TrimStart('"').TrimEnd('"').TrimStart("'").TrimEnd("'")
    }
}

Write-Host ""
Write-Host "=== 1. staging-app.aishacrm.com (frontend) ===" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri 'https://staging-app.aishacrm.com' -UseBasicParsing -TimeoutSec 8
    Write-Host "  HTTP $($r.StatusCode)"
    if ($r.Content -match '/assets/(entry-[a-zA-Z0-9_-]+)\.js') {
        Write-Host "  entry bundle: $($matches[1]).js" -ForegroundColor Green
    }
    # Look for any cache-busting marker we can use as a build fingerprint
    if ($r.Content -match '<meta name="commit" content="([^"]+)"') {
        Write-Host "  embedded commit: $($matches[1])" -ForegroundColor Green
    }
} catch {
    Write-Host "  probe failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== 2. staging-backend.aishacrm.com (backend health) ===" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri 'https://staging-backend.aishacrm.com/api/system/health' -UseBasicParsing -TimeoutSec 8
    Write-Host "  HTTP $($r.StatusCode)"
    Write-Host "  body: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
} catch {
    Write-Host "  probe failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== 3. Coolify deployment queue (last 15 min) ===" -ForegroundColor Cyan
$plink   = 'C:\Program Files\PuTTY\plink.exe'
$pscp    = 'C:\Program Files\PuTTY\pscp.exe'
$hostkey = 'SHA256:myUaNEo+cBfg+ziVzNB5GZMNOF80ToSWuYKF9f66u8A'
$vps2    = $envMap['VPS_2_SERVICES']
$pw      = $envMap['VPS_2_PWD']

if (-not $pw -or -not $vps2) {
    Write-Host "  VPS_2_PWD / VPS_2_SERVICES missing from .env — skipping Coolify DB probe" -ForegroundColor Yellow
} else {
    $pwTmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($pwTmp, $pw, [System.Text.UTF8Encoding]::new($false))

    $cmd = @'
docker exec coolify-db psql -U coolify -d coolify -t -c "
SELECT id || ' | ' ||
       COALESCE(application_id::text, '-') || ' | ' ||
       status || ' | ' ||
       COALESCE(LEFT(commit, 8), '-') || ' | ' ||
       to_char(created_at, 'HH24:MI:SS') || ' | age=' ||
       EXTRACT(EPOCH FROM NOW() - created_at)::int || 's'
FROM application_deployment_queues
WHERE created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC;
"
'@
    $tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
    [System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
    $remote = '/tmp/check-deploy.sh'
    Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
    Remove-Item $tmpScript -ErrorAction SilentlyContinue

    $so = [System.IO.Path]::GetTempFileName()
    Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
    $output = Get-Content $so -Raw
    if ([string]::IsNullOrWhiteSpace($output)) {
        Write-Host "  (no deployments in the last 15 minutes — either it finished cleanly or the webhook never fired)" -ForegroundColor Yellow
    } else {
        Write-Host "  id | application_id | status | commit | started_at | age"
        Write-Host "  ---|----------------|--------|--------|------------|----"
        $output -split "`n" | ForEach-Object {
            $line = $_.Trim()
            if ($line) { Write-Host "  $line" }
        }
    }
    Remove-Item $so -ErrorAction SilentlyContinue
    Remove-Item $pwTmp -ErrorAction SilentlyContinue
}

Write-Host ""
