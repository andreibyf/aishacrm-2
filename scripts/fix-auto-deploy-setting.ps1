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
set -e

echo "=== BEFORE: current is_auto_deploy_enabled state ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT a.id, a.name, s.is_auto_deploy_enabled
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
echo "=== APPLY: UPDATE application_settings SET is_auto_deploy_enabled = false ==="
docker exec coolify-db psql -U coolify -d coolify -c "
UPDATE application_settings
SET is_auto_deploy_enabled = false, updated_at = NOW()
WHERE application_id IN (12, 13, 15, 19)
RETURNING application_id, is_auto_deploy_enabled;
"

echo ""
echo "=== AFTER: verify state is now false ==="
docker exec coolify-db psql -U coolify -d coolify -c "
SELECT a.id, a.name, s.is_auto_deploy_enabled, s.updated_at
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
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/fix-auto-deploy.sh'

Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"bash $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
