$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envMap = @{}
foreach ($line in Get-Content (Join-Path $repoRoot '.env')) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
        $envMap[$matches[1]] = $matches[2].Trim().TrimStart('"').TrimEnd('"').TrimStart("'").TrimEnd("'")
    }
}
$plink   = 'C:\Program Files\PuTTY\plink.exe'
$hostkey = 'SHA256:myUaNEo+cBfg+ziVzNB5GZMNOF80ToSWuYKF9f66u8A'
$pwTmp   = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($pwTmp, $envMap['VPS_2_PWD'], [System.Text.UTF8Encoding]::new($false))
$vps2    = $envMap['VPS_2_SERVICES']

$cmd = @'
cat << 'ENDSQL' | docker exec -i coolify-db psql -U coolify -d coolify
SELECT adq.deployment_uuid, adq.status, adq.is_webhook, adq.force_rebuild,
       LEFT(adq.commit, 10) AS commit_sha,
       adq.created_at, adq.finished_at
FROM application_deployment_queues adq
JOIN applications a ON a.id = adq.application_id
WHERE a.name = 'staging-backend-heavy'
ORDER BY adq.created_at DESC
LIMIT 10;
ENDSQL
'@

Write-Host "=== Querying Coolify DB on VPS-2 ($vps2) ==="
& $plink -ssh -batch -hostkey $hostkey -l root -pwfile $pwTmp $vps2 $cmd
Remove-Item $pwTmp -Force
