# 4VD-37 review #2: prove the installer actually fails when the guard does NOT
# correct drift. Sabotage path: deploy a broken guard (UPDATE WHERE 1=0), induce
# drift, run the installer's self-test logic, confirm it exits 1.
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

echo "=== 1) Sabotage: build a broken guard that detects drift but UPDATE matches no rows ==="
sed 's|application_id IN (${STAGING_IDS}) AND is_auto_deploy_enabled = true$|application_id IN (-1) AND is_auto_deploy_enabled = true|' \
    /usr/local/bin/coolify-auto-deploy-drift-guard.sh > /tmp/broken-guard.sh
chmod +x /tmp/broken-guard.sh
echo "    /tmp/broken-guard.sh has UPDATE pinned to non-existent app_id (-1)"
echo ""

echo "=== 2) Induce drift on app 13 ==="
docker exec coolify-db psql -U coolify -d coolify -c \
    "UPDATE application_settings SET is_auto_deploy_enabled = true WHERE application_id = 13 RETURNING application_id, is_auto_deploy_enabled;"
echo ""

echo "=== 3) Run broken guard. Expect: detection fires, log says CORRECTION FAILED (because RETURNING returns 0 rows) — but actually no, UPDATE WHERE id IN (-1) succeeds with 0 rows, no error ==="
/tmp/broken-guard.sh
echo "    broken-guard rc=$? (note: 0 because UPDATE succeeded with 0 rows)"
echo ""

echo "=== 4) Run the installer's HARD ASSERTION block (extracted as standalone) ==="
# This is the same logic the installer runs at the end — a regression in the
# real guard would let this assertion FAIL the installer.
ASSERT_RC=0
ASSERT_OUT=$(docker exec coolify-db psql -U coolify -d coolify -t -A -c \
    "SELECT application_id || ':' || is_auto_deploy_enabled
     FROM application_settings
     WHERE application_id IN (12,13,15,19)
     ORDER BY application_id;" 2>&1) || ASSERT_RC=$?

echo "    Verification query rc=${ASSERT_RC}"
echo "    Output:"
echo "${ASSERT_OUT}" | sed 's/^/      /'
echo ""

# Same CRLF-safe normalization as the installer's hard assertion.
ASSERT_OUT_NORM=$(echo "${ASSERT_OUT}" | tr -d '\r')
DRIFTED_ROWS=$(echo "${ASSERT_OUT_NORM}" | grep -v ':false$' || true)
ROW_COUNT=$(echo "${ASSERT_OUT_NORM}" | grep -c ':' || true)

echo "    DRIFTED_ROWS count: $(echo "${DRIFTED_ROWS}" | grep -c ':' || echo 0)"
echo "    ROW_COUNT: ${ROW_COUNT}"

if [[ -n "${DRIFTED_ROWS}" ]] || [[ "${ROW_COUNT}" -ne 4 ]]; then
    echo ""
    echo "    PASS (assertion correctly DETECTED regression):"
    echo "      Expected exit 1 from installer."
    echo "      Drifted rows still found:"
    echo "${DRIFTED_ROWS}" | sed 's/^/        /'
    ASSERTION_RESULT="PASS"
else
    echo ""
    echo "    FAIL (assertion missed regression):"
    echo "      All 4 rows are :f, but the broken guard didn'\''t actually correct anything."
    ASSERTION_RESULT="FAIL"
fi
echo ""

echo "=== 5) Cleanup: restore correct state via REAL guard ==="
/usr/local/bin/coolify-auto-deploy-drift-guard.sh
docker exec coolify-db psql -U coolify -d coolify -c \
    "SELECT application_id, is_auto_deploy_enabled FROM application_settings
     WHERE application_id IN (12,13,15,19) ORDER BY application_id;"

rm -f /tmp/broken-guard.sh
echo ""
echo "=== Sabotage test result: ${ASSERTION_RESULT} ==="
echo "(PASS = installer would correctly exit 1 on a broken guard)"
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/verify-installer-sabotage.sh'
Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
