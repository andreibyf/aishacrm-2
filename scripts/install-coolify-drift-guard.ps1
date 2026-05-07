# 4VD-37 fix: install a systemd-timer drift guard on VPS-2 that asserts
# is_auto_deploy_enabled=false on staging apps 12,13,15,19 every 5 minutes.
# Logs corrections to /var/log/coolify-drift-guard.log and journalctl.
$ErrorActionPreference = 'Stop'
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
set -e

# ---- 1. Drift-guard script ----
cat > /usr/local/bin/coolify-auto-deploy-drift-guard.sh <<'GUARD'
#!/bin/bash
# 4VD-37 drift guard: asserts is_auto_deploy_enabled=false on staging apps
# (ids 12, 13, 15, 19). Logs every correction to /var/log and journalctl.
# Idempotent: a no-op if state is already correct.
set -euo pipefail

readonly LOG=/var/log/coolify-drift-guard.log
readonly STAGING_IDS='12,13,15,19'
readonly TS="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

# Find drifted rows. Capture stdout AND stderr together, check exit code separately.
# Errors here (DB container down, renamed, auth failure, schema drift) MUST be reported
# loudly — silently dropping stderr would let the guard report "healthy" when broken.
# NOTE on `|| SQL_RC=$?`: a bare `var=$(failing-cmd)` would trip `set -e` and abort the
# script BEFORE the rc check below could log the error. The `|| ...` branch keeps `set -e`
# happy on the failure path. SQL_RC defaults to 0 when the command succeeds.
SQL_RC=0
SQL_OUT=$(docker exec coolify-db psql -U coolify -d coolify -t -A -c \
    "SELECT application_id FROM application_settings
     WHERE application_id IN (${STAGING_IDS}) AND is_auto_deploy_enabled = true;" 2>&1) || SQL_RC=$?

# Fail loud on infra problems. The whole point of this timer is outage prevention —
# a non-functional guard is itself a critical alert, not a no-op.
if [[ $SQL_RC -ne 0 ]]; then
    ERR_MSG="${TS} GUARD CHECK FAILED (rc=${SQL_RC}): ${SQL_OUT}"
    echo "${ERR_MSG}" | tee -a "${LOG}" >&2
    logger -t coolify-drift-guard -p user.err "${ERR_MSG}"
    exit 1
fi

DRIFTED="${SQL_OUT}"

# Only treat empty result as healthy when SQL_RC was 0 above.
if [[ -z "${DRIFTED}" ]]; then
    # Healthy state, exit silently. No log noise.
    exit 0
fi

# Drift detected: correct it and log loudly.
DRIFTED_LIST=$(echo "${DRIFTED}" | tr '\n' ',' | sed 's/,$//')
MSG="${TS} DRIFT DETECTED: app(s) [${DRIFTED_LIST}] had is_auto_deploy_enabled=true. Forcing to false."
echo "${MSG}" | tee -a "${LOG}"
logger -t coolify-drift-guard -p user.warning "${MSG}"

UPDATE_RC=0
UPDATE_OUT=$(docker exec coolify-db psql -U coolify -d coolify -c \
    "UPDATE application_settings
     SET is_auto_deploy_enabled = false, updated_at = NOW()
     WHERE application_id IN (${STAGING_IDS}) AND is_auto_deploy_enabled = true
     RETURNING application_id;" 2>&1) || UPDATE_RC=$?
echo "${UPDATE_OUT}" | tee -a "${LOG}"

# Correction itself must succeed too — otherwise we logged "DRIFT DETECTED"
# but never fixed it, which leaves staging in the bad state until the next tick.
if [[ $UPDATE_RC -ne 0 ]]; then
    FAIL_MSG="${TS} DRIFT CORRECTION FAILED (rc=${UPDATE_RC}) for apps [${DRIFTED_LIST}]: ${UPDATE_OUT}"
    echo "${FAIL_MSG}" | tee -a "${LOG}" >&2
    logger -t coolify-drift-guard -p user.err "${FAIL_MSG}"
    exit 1
fi

CONFIRM_MSG="${TS} DRIFT CORRECTED for apps [${DRIFTED_LIST}]"
echo "${CONFIRM_MSG}" | tee -a "${LOG}"
logger -t coolify-drift-guard -p user.notice "${CONFIRM_MSG}"
GUARD
chmod 755 /usr/local/bin/coolify-auto-deploy-drift-guard.sh
echo "[install] Created /usr/local/bin/coolify-auto-deploy-drift-guard.sh"

# Pre-create log file with permissions
touch /var/log/coolify-drift-guard.log
chmod 644 /var/log/coolify-drift-guard.log

# ---- 2. systemd service unit ----
cat > /etc/systemd/system/coolify-drift-guard.service <<'SERVICE'
[Unit]
Description=Coolify auto_deploy drift guard (4VD-37)
Documentation=https://linear.app/4vdataconsulting/issue/4VD-37
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/coolify-auto-deploy-drift-guard.sh
StandardOutput=journal
StandardError=journal
SERVICE
echo "[install] Created /etc/systemd/system/coolify-drift-guard.service"

# ---- 3. systemd timer unit (every 5 minutes, also at boot) ----
cat > /etc/systemd/system/coolify-drift-guard.timer <<'TIMER'
[Unit]
Description=Run Coolify drift guard every 5 minutes (4VD-37)
Documentation=https://linear.app/4vdataconsulting/issue/4VD-37

[Timer]
# Run 1 minute after boot, then every 5 minutes
OnBootSec=1min
OnUnitActiveSec=5min
AccuracySec=10s
Unit=coolify-drift-guard.service
Persistent=true

[Install]
WantedBy=timers.target
TIMER
echo "[install] Created /etc/systemd/system/coolify-drift-guard.timer"

# ---- 4. Reload, enable, start ----
systemctl daemon-reload
systemctl enable --now coolify-drift-guard.timer

# ---- 5. Run once immediately to verify it works (no-op if state correct) ----
echo ""
echo "=== Running guard once to validate (should be no-op since we just patched at 18:40) ==="
/usr/local/bin/coolify-auto-deploy-drift-guard.sh
echo "(silence above = healthy state, drift guard verified)"

echo ""
echo "=== Timer status ==="
systemctl status coolify-drift-guard.timer --no-pager | head -15
echo ""
echo "=== Next 3 scheduled fires ==="
systemctl list-timers coolify-drift-guard.timer --no-pager

echo ""
echo "=== Test correction: temporarily set drift, then run guard, then verify cleanup ==="
docker exec coolify-db psql -U coolify -d coolify -c \
    "UPDATE application_settings SET is_auto_deploy_enabled = true WHERE application_id = 13 RETURNING application_id, is_auto_deploy_enabled;"
echo "-- Drift induced on app 13. Running guard manually --"
/usr/local/bin/coolify-auto-deploy-drift-guard.sh
echo ""
echo "-- Final state (all 4 should be false) --"
docker exec coolify-db psql -U coolify -d coolify -c \
    "SELECT application_id, is_auto_deploy_enabled, updated_at
     FROM application_settings WHERE application_id IN (12,13,15,19) ORDER BY application_id;"

echo ""
echo "=== Drift guard log so far ==="
tail -20 /var/log/coolify-drift-guard.log 2>/dev/null || echo "(log file not yet populated)"
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/install-drift-guard.sh'
Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
