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

# Poll every 8 seconds for ~6 minutes max
for ($i = 1; $i -le 45; $i++) {
    Write-Host ""
    Write-Host "=== poll $i/45 @ $(Get-Date -Format HH:mm:ss) ==="

    $cmd = @'
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, application_id, status, force_rebuild, is_webhook,
       LEFT(commit, 8) AS sha, created_at,
       EXTRACT(EPOCH FROM NOW() - created_at)::int AS age_s
FROM application_deployment_queues
WHERE created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC;
"
'@
    $tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
    [System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
    $remote = '/tmp/watch-deploy.sh'
    Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
    Remove-Item $tmpScript -ErrorAction SilentlyContinue

    $so = [System.IO.Path]::GetTempFileName()
    Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
    Get-Content $so -Raw | Write-Host
    Remove-Item $so -ErrorAction SilentlyContinue

    # Quick external probe
    try {
        $r = Invoke-WebRequest -Uri 'https://staging-app.aishacrm.com' -UseBasicParsing -TimeoutSec 5
        if ($r.Content -match '/assets/(entry-[a-zA-Z0-9_-]+)\.js') {
            Write-Host "  current entry bundle: $($matches[1]).js"
        }
    } catch { Write-Host "  staging-app probe fail: $($_.Exception.Message)" }

    Start-Sleep -Seconds 8
}

Remove-Item $pwTmp -ErrorAction SilentlyContinue
