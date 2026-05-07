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
set +e

echo "================================================================"
echo "== H1: Why TWO deployment rows for one push? (id 198 + 199)   =="
echo "================================================================"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, deployment_uuid, application_id, server_id, status,
       force_rebuild, is_webhook, restart_only, only_this_server,
       LEFT(commit, 8) AS commit_short,
       created_at, updated_at,
       EXTRACT(EPOCH FROM updated_at - created_at)::int AS lifetime_seconds
FROM application_deployment_queues
WHERE id IN (198, 199);
"

echo ""
echo "================================================================"
echo "== H1b: Last 8 deployments (look for double-fire pattern)     =="
echo "================================================================"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, application_id, status, force_rebuild, is_webhook, restart_only,
       LEFT(commit, 8) AS sha, created_at,
       EXTRACT(EPOCH FROM created_at - LAG(created_at) OVER (ORDER BY created_at))::int AS gap_from_prev_seconds
FROM application_deployment_queues
ORDER BY created_at DESC
LIMIT 12;
"

echo ""
echo "================================================================"
echo "== H2: auto_deploy_enabled per app (4VD-24 set this to false) =="
echo "================================================================"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT a.id, a.uuid, a.name, s.is_auto_deploy_enabled,
       a.watch_paths IS NOT NULL AS has_watch_paths,
       LENGTH(a.watch_paths) AS watch_paths_chars
FROM applications a
LEFT JOIN application_settings s ON s.application_id = a.id
WHERE a.uuid IN (
  'di7ko49ikfd2mz8yh0q7id8q',
  'd24ro1fqm0zyl7pd72g6snd2',
  'tw8zmua5jyzwnhh1oxw15kkm',
  'zsy5fsbw9hccxvoznkbpy1il'
)
ORDER BY a.id;
"

echo ""
echo "================================================================"
echo "== H3: watch_paths content per staging app                    =="
echo "================================================================"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT name, watch_paths
FROM applications
WHERE uuid IN (
  'di7ko49ikfd2mz8yh0q7id8q',
  'd24ro1fqm0zyl7pd72g6snd2',
  'tw8zmua5jyzwnhh1oxw15kkm',
  'zsy5fsbw9hccxvoznkbpy1il'
)
ORDER BY name;
"

echo ""
echo "================================================================"
echo "== H4: limits_cpus / limits_memory per staging app            =="
echo "================================================================"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT name, limits_cpus, limits_memory, limits_cpu_shares, limits_cpuset
FROM applications
WHERE uuid IN (
  'di7ko49ikfd2mz8yh0q7id8q',
  'd24ro1fqm0zyl7pd72g6snd2',
  'tw8zmua5jyzwnhh1oxw15kkm',
  'zsy5fsbw9hccxvoznkbpy1il'
)
ORDER BY name;
"

echo ""
echo "================================================================"
echo "== H5: All deployment-related columns to find the double-fire =="
echo "================================================================"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, application_id, deployment_uuid, force_rebuild, restart_only, only_this_server, is_webhook, server_id, LEFT(commit, 8) AS sha, status, created_at
FROM application_deployment_queues
WHERE id IN (198, 199);
"
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/probe-controls.sh'

Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
