# 4VD-37 final forensic: dump JSONB properties on the 8 upgrade-window activity rows + check
# any seeder / console / job that mass-writes is_auto_deploy_enabled
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
echo "=== 8 upgrade-window activity_log rows: full JSONB properties ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, log_name, event, batch_uuid,
       subject_type, subject_id, causer_type, causer_id,
       properties::text AS props,
       created_at
FROM activity_log
WHERE id IN (52,53,54,55,56,57,58,59);
"
echo ""

echo "=== ALL activity_log rows in upgrade boot window (broader: 03:00 - 04:30) ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, log_name, event, properties::text AS props, created_at
FROM activity_log
WHERE created_at BETWEEN '2026-05-06 03:00:00' AND '2026-05-06 04:30:00';
"
echo ""

echo "=== Coolify console commands that touch application_settings ==="
docker exec coolify sh -c "grep -rln 'application_settings\|ApplicationSetting' /var/www/html/app/Console 2>/dev/null"
echo "---"
echo "-- And the lines --"
docker exec coolify sh -c "grep -rn 'is_auto_deploy_enabled\|update.*ApplicationSetting' /var/www/html/app/Console 2>/dev/null | head -20"
echo ""

echo "=== Coolify Jobs that touch ApplicationSetting ==="
docker exec coolify sh -c "grep -rln 'ApplicationSetting' /var/www/html/app/Jobs 2>/dev/null | head -10"
echo "---"
docker exec coolify sh -c "grep -rn 'is_auto_deploy_enabled' /var/www/html/app/Jobs 2>/dev/null | head -10"
echo ""

echo "=== Application.php — context around line 323 (the ::create call) ==="
docker exec coolify sh -c "sed -n '300,360p' /var/www/html/app/Models/Application.php"
echo ""

echo "=== Git command: scan for ApplicationSetting::updateOrCreate or DB::table('application_settings') ==="
docker exec coolify sh -c "grep -rn 'ApplicationSetting::\|application_settings' /var/www/html/app /var/www/html/database/seeders 2>/dev/null | grep -vE ':\s*(\\*|//)' | head -30"
echo ""

echo "=== Recent jobs table — anything that ran during the upgrade window? ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT COUNT(*) AS jobs_during_upgrade
FROM jobs;
" 2>&1
echo "---"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, queue, payload::text AS payload, created_at
FROM failed_jobs
WHERE failed_at > '2026-05-06 03:00:00'
   OR failed_at IS NULL AND id > 0
ORDER BY id DESC
LIMIT 5;
" 2>&1
echo ""

echo "=== AuthServiceProvider.php (only file that grep'd in Providers) ==="
docker exec coolify sh -c "grep -n 'ApplicationSetting\|application_settings' /var/www/html/app/Providers/AuthServiceProvider.php"
echo ""

echo "=== Boot/AppServiceProvider for any model::observe registration ==="
docker exec coolify sh -c "ls /var/www/html/app/Providers/"
echo "---"
docker exec coolify sh -c "grep -l 'observe\|observer\|booted\|boot()' /var/www/html/app/Providers/*.php 2>/dev/null"
echo "---"
docker exec coolify sh -c "grep -A2 -B1 'ApplicationSetting\|Application::' /var/www/html/app/Providers/AppServiceProvider.php 2>/dev/null | head -30"
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/probe-final-forensic.sh'
Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"sh $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
