# 4VD-37 review: verify the guard's NEW fail-loud paths work
# Strategy: invoke the guard with a deliberately-wrong DB container name,
# confirm exit code != 0 + user.err logged + drift NOT silently treated as healthy.
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

# Make a copy of the guard with a bad container name so we don't disturb the real timer
$cmd = @'
set +e

echo "=== 1) Sanity: real guard runs cleanly (state is healthy) ==="
/usr/local/bin/coolify-auto-deploy-drift-guard.sh
echo "    real-guard rc=$?"
echo ""

echo "=== 2) Simulated fail-mode: copy of guard pointing at bogus container ==="
sed 's/coolify-db/coolify-db-DOES-NOT-EXIST/g' /usr/local/bin/coolify-auto-deploy-drift-guard.sh > /tmp/test-guard-fail.sh
chmod +x /tmp/test-guard-fail.sh

# Capture stderr+stdout AND the exit code separately
TEST_OUT=$(/tmp/test-guard-fail.sh 2>&1)
TEST_RC=$?
echo "    fail-mode rc=$TEST_RC (expected: != 0)"
echo "    stderr/stdout from guard (truncated):"
echo "$TEST_OUT" | head -10 | sed 's/^/        /'
echo ""

echo "=== 3) Verify user.err entry landed in journalctl ==="
journalctl -t coolify-drift-guard -p err -n 5 --no-pager --since "1 minute ago" | tail -10
echo ""

echo "=== 4) Verify /var/log/coolify-drift-guard.log got the GUARD CHECK FAILED entry ==="
tail -5 /var/log/coolify-drift-guard.log
echo ""

echo "=== 5) Verify state is STILL healthy on real apps (failure didn't corrupt anything) ==="
docker exec coolify-db psql -U coolify -d coolify -c \
    "SELECT application_id, is_auto_deploy_enabled FROM application_settings
     WHERE application_id IN (12,13,15,19) ORDER BY application_id;"
echo ""

echo "=== 6) Cleanup test artifact ==="
rm -f /tmp/test-guard-fail.sh
echo "    /tmp/test-guard-fail.sh removed"

echo ""
echo "=== PASS criteria ==="
echo "  - Step 1 rc=0 (real guard works on healthy state)"
echo "  - Step 2 rc=1 (fail-mode exits non-zero, NOT 0)"
echo "  - Step 3 shows a 'GUARD CHECK FAILED' line at err priority"
echo "  - Step 4 shows the same line in /var/log"
echo "  - Step 5 shows all 4 rows still f (real state preserved)"
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/verify-drift-failmode.sh'
Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
