$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $repoRoot '.env'
$envMap = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
        $envMap[$matches[1]] = $matches[2].Trim().TrimStart('"').TrimEnd('"').TrimStart("'").TrimEnd("'")
    }
}

# Use VPS-2's Coolify DB to read deploy log/output for id=200
$plink   = 'C:\Program Files\PuTTY\plink.exe'
$pscp    = 'C:\Program Files\PuTTY\pscp.exe'
$hostkey = 'SHA256:myUaNEo+cBfg+ziVzNB5GZMNOF80ToSWuYKF9f66u8A'
$pwTmp   = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($pwTmp, $envMap['VPS_2_PWD'], [System.Text.UTF8Encoding]::new($false))
$vps2 = $envMap['VPS_2_SERVICES']

$cmd = @'
echo "=== Latest snippet of deploy 200's log ==="
docker exec coolify-db psql -U coolify -d coolify -t -A -c "SELECT RIGHT(logs, 3000) FROM application_deployment_queues WHERE id = 200;" | tail -50

echo ""
echo "=== Status now ==="
docker exec coolify-db psql -U coolify -d coolify -c "SELECT status, EXTRACT(EPOCH FROM NOW() - updated_at)::int AS stale_s FROM application_deployment_queues WHERE id = 200;"
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/deploy-200-tail.sh'

Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
$out = Get-Content $so -Raw -ErrorAction SilentlyContinue
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue

# Trim — we just want the last bit, but be defensive
if ($out -and $out.Length -gt 6000) {
    $out = '...[truncated]...' + $out.Substring($out.Length - 6000)
}
Write-Host $out
