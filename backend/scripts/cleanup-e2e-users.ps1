# Cleanup E2E Test Users via API
# Removes any test users created during E2E runs that weren't properly cleaned up.
# 
# Targets users with email patterns:
#   - audit.test.*@example.com (legacy)
#   - e2e.temp.*@playwright.test (current)
#   - *@playwright.test
#
# Usage:
#   .\backend\scripts\cleanup-e2e-users.ps1
#   .\backend\scripts\cleanup-e2e-users.ps1 -DryRun  # Preview only
#   .\backend\scripts\cleanup-e2e-users.ps1 -BackendUrl "http://localhost:3001"

param(
    [switch]$DryRun,
    [string]$BackendUrl = "http://localhost:3001"
)

Write-Host "🧹 E2E Test User Cleanup" -ForegroundColor Cyan
Write-Host "========================`n"

if ($DryRun) {
    Write-Host "⚠️  DRY RUN MODE - No changes will be made`n" -ForegroundColor Yellow
}

# Fetch all users
Write-Host "Fetching users from: $BackendUrl/api/users" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/users?limit=100" -Method Get -ErrorAction Stop
    $users = $response.data.users
    Write-Host "✅ Found $($users.Count) total users`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Error fetching users: $_" -ForegroundColor Red
    Write-Host "`nMake sure the backend server is running on $BackendUrl" -ForegroundColor Yellow
    exit 1
}

# Filter for E2E test users
$testPatterns = @(
    'audit.test.*@example.com',
    'e2e.temp.*@playwright.test',
    '*@playwright.test'
)

$testUsers = $users | Where-Object {
    $email = $_.email
    $matchesPattern = $false
    foreach ($pattern in $testPatterns) {
        if ($email -like $pattern) {
            $matchesPattern = $true
            break
        }
    }
    $matchesPattern -or 
    $_.tenant_id -like 'e2e-test-tenant-*' -or 
    $_.tenant_id -eq 'test-tenant' -or
    $_.metadata.is_e2e_test_data -eq $true
}

if ($testUsers.Count -eq 0) {
    Write-Host "✅ No E2E test users found. Database is clean!" -ForegroundColor Green
    exit 0
}

Write-Host "Found $($testUsers.Count) E2E test user(s):`n" -ForegroundColor Yellow

$index = 1
foreach ($user in $testUsers) {
    Write-Host "$index. $($user.email)" -ForegroundColor White
    Write-Host "   ID: $($user.id)" -ForegroundColor Gray
    Write-Host "   Name: $($user.first_name) $($user.last_name)" -ForegroundColor Gray
    Write-Host "   Role: $($user.role)" -ForegroundColor Gray
    Write-Host "   Tenant: $(if ($user.tenant_id) { $user.tenant_id } else { '(global)' })" -ForegroundColor Gray
    Write-Host "   Created: $($user.created_at)" -ForegroundColor Gray
    Write-Host ""
    $index++
}

if ($DryRun) {
    Write-Host "⚠️  DRY RUN: Would delete these users. Run without -DryRun to execute." -ForegroundColor Yellow
    exit 0
}

# Prompt for confirmation
Write-Host "⚠️  WARNING: This will permanently delete these users." -ForegroundColor Red
$confirm = Read-Host "Type 'yes' to continue or press Enter to cancel"

if ($confirm -ne 'yes') {
    Write-Host "`n❌ Cancelled by user" -ForegroundColor Yellow
    exit 0
}

# Delete users
Write-Host "`nDeleting users..." -ForegroundColor Cyan
$deletedCount = 0
$failedCount = 0

foreach ($user in $testUsers) {
    try {
        $null = Invoke-RestMethod -Uri "$BackendUrl/api/users/$($user.id)" -Method Delete -ErrorAction Stop
        Write-Host "✅ Deleted: $($user.email) ($($user.id))" -ForegroundColor Green
        $deletedCount++
    } catch {
        Write-Host "❌ Failed to delete $($user.email): $_" -ForegroundColor Red
        $failedCount++
    }
}

Write-Host "`n========================" -ForegroundColor Cyan
Write-Host "✅ Deleted: $deletedCount user(s)" -ForegroundColor Green
if ($failedCount -gt 0) {
    Write-Host "❌ Failed: $failedCount user(s)" -ForegroundColor Red
}
Write-Host "🧹 Cleanup complete!" -ForegroundColor Cyan
