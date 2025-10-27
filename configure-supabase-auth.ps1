# Quick Setup Script for Supabase Auth
# Run this after getting your Supabase credentials

Write-Host "`n=== Supabase Auth Configuration ===" -ForegroundColor Cyan

# Check if .env exists
if (!(Test-Path "backend\.env")) {
    Write-Host "Creating backend\.env from template..." -ForegroundColor Yellow
    Copy-Item "backend\.env.example" "backend\.env"
}

# Prompt for credentials
Write-Host "`nEnter your Supabase credentials (from https://app.supabase.com → Settings → API):`n" -ForegroundColor Yellow

$supabaseUrl = Read-Host "Supabase Project URL (e.g., https://xxxxx.supabase.co)"
$supabaseServiceKey = Read-Host "Supabase Service Role Key (starts with eyJ...)"
$defaultPassword = Read-Host "Default password for new users (press Enter for 'Welcome2024!')"

if ([string]::IsNullOrWhiteSpace($defaultPassword)) {
    $defaultPassword = "Welcome2024!"
}

# Update .env file
$envContent = Get-Content "backend\.env" -Raw

# Add or update Supabase settings
if ($envContent -match "SUPABASE_URL=") {
    $envContent = $envContent -replace "SUPABASE_URL=.*", "SUPABASE_URL=$supabaseUrl"
} else {
    $envContent += "`nSUPABASE_URL=$supabaseUrl"
}

if ($envContent -match "SUPABASE_SERVICE_ROLE_KEY=") {
    $envContent = $envContent -replace "SUPABASE_SERVICE_ROLE_KEY=.*", "SUPABASE_SERVICE_ROLE_KEY=$supabaseServiceKey"
} else {
    $envContent += "`nSUPABASE_SERVICE_ROLE_KEY=$supabaseServiceKey"
}

if ($envContent -match "DEFAULT_USER_PASSWORD=") {
    $envContent = $envContent -replace "DEFAULT_USER_PASSWORD=.*", "DEFAULT_USER_PASSWORD=$defaultPassword"
} else {
    $envContent += "`nDEFAULT_USER_PASSWORD=$defaultPassword"
}

# Save updated .env
Set-Content "backend\.env" $envContent

Write-Host "`n✓ Configuration saved to backend\.env" -ForegroundColor Green
Write-Host "`nNow restart your backend server:" -ForegroundColor Yellow
Write-Host "  cd backend" -ForegroundColor White
Write-Host "  npm start" -ForegroundColor White
Write-Host "`nOr use the convenient script:" -ForegroundColor Yellow
Write-Host "  .\start-all.ps1" -ForegroundColor White
Write-Host ""
