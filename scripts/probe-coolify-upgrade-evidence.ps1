# 4VD-37 follow-up: confirm Coolify upgrade as root cause
# - Dump activity_log without filter for May 5-7
# - Capture image history / labels for current coolify:latest
# - Look for any settings-reseed code path indicators
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
echo "=== activity_log: schema first ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='activity_log' ORDER BY ordinal_position;
"
echo ""

echo "=== activity_log: row count + range ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT COUNT(*) AS rows,
       MIN(created_at) AS earliest,
       MAX(created_at) AS latest
FROM activity_log;
"
echo ""

echo "=== activity_log: ALL rows touching Application or ApplicationSetting in last 4 days ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, log_name, description, subject_type, subject_id,
       causer_type, causer_id, created_at
FROM activity_log
WHERE created_at > NOW() - INTERVAL '4 days'
  AND (subject_type ILIKE '%Application%'
       OR subject_type ILIKE '%Setting%'
       OR description ILIKE '%auto_deploy%'
       OR description ILIKE '%enable%')
ORDER BY created_at DESC
LIMIT 100;
"
echo ""

echo "=== activity_log: full dump for May 6 03:00-04:00 UTC (the upgrade window) ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, log_name, description, subject_type, subject_id, created_at
FROM activity_log
WHERE created_at BETWEEN '2026-05-06 02:00:00' AND '2026-05-06 04:30:00'
ORDER BY created_at;
"
echo ""

echo "=== activity_log: any rows mentioning is_auto_deploy across whole table ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, description, subject_type, subject_id, properties::text, created_at
FROM activity_log
WHERE properties::text ILIKE '%auto_deploy%'
   OR description ILIKE '%auto_deploy%'
ORDER BY created_at DESC
LIMIT 20;
"
echo ""

echo "=== docker image history coolify:latest (top 20) ==="
docker history --no-trunc ghcr.io/coollabsio/coolify:latest --format '{{.CreatedAt}}\t{{.Size}}\t{{.CreatedBy}}' 2>/dev/null | head -20
echo ""

echo "=== docker inspect coolify image labels (version, revision) ==="
docker inspect ghcr.io/coollabsio/coolify:latest --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}
{{end}}' 2>/dev/null | grep -iE 'version|revision|coolify|build' | head -20
echo ""

echo "=== /data/coolify/source/.env: COOLIFY_VERSION + last 5 lines ==="
grep -E '^(COOLIFY_VERSION|RELEASE)' /data/coolify/source/.env 2>/dev/null
echo "---"
tail -5 /data/coolify/source/.env 2>/dev/null
echo ""

echo "=== Look for autoupdate scheduler in Coolify code ==="
docker exec coolify grep -rln "is_auto_deploy_enabled" /var/www/html/app /var/www/html/database 2>/dev/null | head -10
echo ""

echo "=== ApplicationSetting model defaults (if accessible) ==="
docker exec coolify cat /var/www/html/app/Models/ApplicationSetting.php 2>/dev/null | grep -iE 'auto_deploy|attributes|default' | head -30
echo ""

echo "=== ApplicationSetting migrations (look for default value) ==="
docker exec coolify ls /var/www/html/database/migrations/ 2>/dev/null | grep -i 'application_settings' | head -10
echo "---"
docker exec coolify bash -c "grep -l 'is_auto_deploy_enabled' /var/www/html/database/migrations/*.php 2>/dev/null | head -5" 2>/dev/null
echo ""
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/probe-upgrade-evidence.sh'
Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
