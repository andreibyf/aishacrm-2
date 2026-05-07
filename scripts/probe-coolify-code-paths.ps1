# 4VD-37 final: read the Coolify PHP code paths that touch is_auto_deploy_enabled
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

# Coolify uses sh, not bash. Use sh -c.
$cmd = @'
echo "=== ApplicationSetting.php — full file (~150 lines) ==="
docker exec coolify sh -c "cat /var/www/html/app/Models/ApplicationSetting.php"
echo ""

echo "=== Application.php — lines mentioning auto_deploy ==="
docker exec coolify sh -c "grep -n 'auto_deploy\|ApplicationSetting' /var/www/html/app/Models/Application.php | head -40"
echo ""

echo "=== Livewire Advanced.php — lines mentioning auto_deploy ==="
docker exec coolify sh -c "grep -n -A3 -B1 'auto_deploy' /var/www/html/app/Livewire/Project/Application/Advanced.php | head -60"
echo ""

echo "=== ApplicationsController.php — lines mentioning auto_deploy ==="
docker exec coolify sh -c "grep -n -A3 -B1 'auto_deploy' /var/www/html/app/Http/Controllers/Api/ApplicationsController.php | head -80"
echo ""

echo "=== Search for ANY observer or boot method touching application_settings ==="
docker exec coolify sh -c "grep -rln 'application_settings\|ApplicationSetting::' /var/www/html/app/Observers /var/www/html/app/Providers /var/www/html/app/Listeners /var/www/html/app/Console 2>/dev/null"
echo ""

echo "=== Search for code that WRITES is_auto_deploy_enabled ==="
docker exec coolify sh -c "grep -rln 'is_auto_deploy_enabled' /var/www/html/app /var/www/html/database/seeders 2>/dev/null"
echo ""
echo "-- And the actual lines (with file:line:context) --"
docker exec coolify sh -c "grep -rn 'is_auto_deploy_enabled' /var/www/html/app /var/www/html/database 2>/dev/null | head -40"
echo ""

echo "=== Check 2024_07_18 migration that touches application_settings (custom_name + may have other defaults) ==="
docker exec coolify sh -c "cat /var/www/html/database/migrations/2024_07_18_110424_create_application_settings_is_preserve_repository_enabled.php"
echo ""

echo "=== Check ORIGINAL 2023 migration for default value of is_auto_deploy_enabled ==="
docker exec coolify sh -c "grep -A2 -B1 'is_auto_deploy' /var/www/html/database/migrations/2023_03_27_081717_create_application_settings_table.php"
echo ""

echo "=== Coolify changelogs directory — read recent versions ==="
docker exec coolify sh -c "ls /var/www/html/changelogs/ 2>/dev/null | tail -20"
echo "---"
echo "-- Recent changelog content (look for auto_deploy mention) --"
docker exec coolify sh -c "grep -rl 'auto_deploy\|is_auto_deploy_enabled' /var/www/html/changelogs/ 2>/dev/null | head -5"
echo ""

echo "=== If git repo present, show recent log of ApplicationSetting.php — UNLIKELY in container ==="
docker exec coolify sh -c "cd /var/www/html && git log --oneline -10 -- app/Models/ApplicationSetting.php 2>/dev/null || echo '(no git in container)'"
'@

$tmpScript = [System.IO.Path]::GetTempFileName() + '.sh'
[System.IO.File]::WriteAllText($tmpScript, $cmd, [System.Text.UTF8Encoding]::new($false))
$remote = '/tmp/probe-code-paths.sh'
Start-Process -FilePath $pscp -ArgumentList @('-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$tmpScript,"${vps2}:${remote}") -PassThru -NoNewWindow -Wait | Out-Null
Remove-Item $tmpScript -ErrorAction SilentlyContinue

$so = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath $plink -ArgumentList @('-ssh','-batch','-l','root','-pwfile',$pwTmp,'-hostkey',$hostkey,$vps2,"sh $remote; rm -f $remote") -RedirectStandardOutput $so -PassThru -NoNewWindow -Wait | Out-Null
Get-Content $so -Raw | Write-Host
Remove-Item $so,$pwTmp -ErrorAction SilentlyContinue
