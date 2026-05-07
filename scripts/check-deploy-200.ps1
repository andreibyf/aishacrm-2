$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $repoRoot '.env'
$envMap = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
        $envMap[$matches[1]] = $matches[2].Trim().TrimStart('"').TrimEnd('"').TrimStart("'").TrimEnd("'")
    }
}

$plink   = 'C:\Program Files\PuTTY\plink.exe'
$pscp    = 'C:\Program Files\PuTTY\pscp.exe'
$hostkey = 'SHA256:myUaNEo+cBfg+ziVzNB5GZMNOF80ToSWuYKF9f66u8A'
$pwTmp   = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($pwTmp, $envMap['VPS_2_PWD'], [System.Text.UTF8Encoding]::new($false))
$vps2 = $envMap['VPS_2_SERVICES']

$cmd = @'
echo "=== Deploy id=200 status ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, status, force_rebuild, is_webhook, LEFT(commit, 8) AS sha,
       created_at, updated_at,
       EXTRACT(EPOCH FROM updated_at - created_at)::int AS lifetime_s,
       EXTRACT(EPOCH FROM NOW() - created_at)::int AS age_s
FROM application_deployment_queues
WHERE id = 200;
"

echo ""
echo "=== Any newer rows? (would indicate double-fire returning) ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, status, force_rebuild, is_webhook, LEFT(commit, 8) AS sha, created_at
FROM application_deployment_queues
WHERE id > 200
ORDER BY id;
"
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/check-200.sh'
Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue

# Bundle check
Write-Host ''
Write-Host '=== Frontend bundle hash ==='
try {
    $r = Invoke-WebRequest -Uri 'https://staging-app.aishacrm.com' -UseBasicParsing -TimeoutSec 10
    if ($r.Content -match '/assets/(entry-[a-zA-Z0-9_-]+)\.js') {
        Write-Host "  current: $($matches[1]).js"
    }
} catch { Write-Host "  FAIL: $($_.Exception.Message)" }
