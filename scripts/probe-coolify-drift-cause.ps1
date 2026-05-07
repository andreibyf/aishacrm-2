# 4VD-37: Identify what flipped is_auto_deploy_enabled=true on apps 12,13,15,19
# between 4VD-24 enforcement (~2026-05-06) and the 2026-05-07 incident.
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

echo "=== H1: Coolify version + image timestamps ==="
echo "-- /data/coolify/source/.env (COOLIFY_VERSION etc) --"
grep -E '^(COOLIFY_VERSION|REGISTRY|RELEASE)' /data/coolify/source/.env 2>/dev/null | head -10
echo ""
echo "-- coolify image tags (when pulled) --"
docker images coolify/coolify --format 'table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.ID}}' 2>/dev/null | head -5
echo ""
echo "-- coolify-realtime image (also auto-updated) --"
docker images | grep -E 'coolify' | head -5
echo ""

echo "=== H1: Recent migrations on coolify DB (last 7 days) ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT migration, batch
FROM migrations
WHERE migration LIKE '2026_05%'
   OR migration LIKE '2026_04%'
ORDER BY id DESC
LIMIT 30;
" 2>&1
echo ""

echo "=== H1: Total migrations rows + max batch ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT COUNT(*) AS total_migrations, MAX(batch) AS max_batch
FROM migrations;
" 2>&1
echo ""

echo "=== H2: applications.updated_at vs application_settings.updated_at ==="
echo "(If UI save touched both rows, applications.updated_at will be near the drift time)"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT a.id, a.name,
       a.created_at  AS app_created,
       a.updated_at  AS app_updated,
       s.updated_at  AS settings_updated,
       s.is_auto_deploy_enabled AS auto_deploy_now,
       s.watch_paths IS NOT NULL AS has_watch_paths
FROM applications a
LEFT JOIN application_settings s ON s.application_id = a.id
WHERE a.id IN (12, 13, 15, 19)
ORDER BY a.id;
" 2>&1
echo ""

echo "=== H2: activity_log / audit table — does Coolify track changes? ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND (table_name ILIKE '%activity%' OR table_name ILIKE '%audit%' OR table_name ILIKE '%log%' OR table_name ILIKE '%history%')
ORDER BY table_name;
" 2>&1
echo ""

echo "=== H2: If activity_log exists, recent rows touching application_settings ==="
docker exec coolify-db psql -U coolify -d coolify -c "
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='activity_log') THEN
    RAISE NOTICE 'activity_log present, dumping recent rows';
  ELSE
    RAISE NOTICE 'activity_log NOT present';
  END IF;
END\$\$;
" 2>&1

# If activity_log exists, dump it directly
docker exec coolify-db psql -U coolify -d coolify -t -A -c "
SELECT to_jsonb(t) FROM (
  SELECT id, log_name, description, subject_type, subject_id, causer_type, causer_id, created_at
  FROM activity_log
  WHERE created_at > NOW() - INTERVAL '4 days'
    AND (description ILIKE '%auto_deploy%' OR description ILIKE '%setting%'
         OR subject_type ILIKE '%setting%' OR subject_type ILIKE '%application%')
  ORDER BY created_at DESC
  LIMIT 50
) t;
" 2>/dev/null | head -50
echo ""

echo "=== H1/H4: Deployment-queue history — was there a double-fire pattern BEFORE May 7? ==="
echo "(If May 6 also showed pairs, drift happened earlier than we think)"
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, application_id, status, force_rebuild, is_webhook,
       LEFT(commit, 8) AS sha, created_at,
       LEAD(created_at) OVER (PARTITION BY application_id ORDER BY id) - created_at AS gap_to_next
FROM application_deployment_queues
WHERE created_at > NOW() - INTERVAL '4 days'
ORDER BY id DESC
LIMIT 30;
" 2>&1
echo ""

echo "=== H3: applications source config — did anyone change git_repository, git_branch, custom_docker_run_options? ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, name, git_repository, git_branch, watch_paths,
       LEFT(custom_docker_run_options, 80) AS docker_opts_head,
       updated_at
FROM applications
WHERE id IN (12, 13, 15, 19)
ORDER BY id;
" 2>&1
echo ""

echo "=== H1: Coolify autoupdate scheduler — when does it run? ==="
echo "-- last-modified on key Coolify files (changes if upgraded) --"
ls -la /data/coolify/source/.env /data/coolify/source/docker-compose.yml 2>/dev/null
echo ""
echo "-- coolify container start time (if recently restarted, it was upgraded) --"
docker inspect coolify --format '{{.State.StartedAt}} -- image {{.Image}}' 2>/dev/null
echo ""
echo "-- /data/coolify git history if it's a checkout --"
cd /data/coolify/source 2>/dev/null && git log --oneline -10 2>/dev/null || echo "(not a git checkout)"
echo ""

echo "=== H1: Coolify scheduled tasks (autoupdate runs as a scheduler job) ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT id, name, frequency, last_run_at, status
FROM scheduled_tasks
ORDER BY id DESC
LIMIT 20;
" 2>&1
echo ""

echo "=== H1: scheduled_task_executions — last 50 runs ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT scheduled_task_id, status, created_at, EXTRACT(EPOCH FROM updated_at - created_at)::int AS dur_s
FROM scheduled_task_executions
WHERE created_at > NOW() - INTERVAL '4 days'
ORDER BY id DESC
LIMIT 30;
" 2>&1
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/probe-drift-cause.sh'
Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
