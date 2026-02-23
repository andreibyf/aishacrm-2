# Apply Fixed Test Files
# This script applies the .FIXED versions to the original test files

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Applying Fixed Test Files" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$files = @(
    @{
        Name = "leads.route.test.js"
        Fixed = "backend\__tests__\routes\leads.route.test.FIXED.js"
        Original = "backend\__tests__\routes\leads.route.test.js"
    },
    @{
        Name = "contacts.route.test.js"
        Fixed = "backend\__tests__\routes\contacts.route.test.FIXED.js"
        Original = "backend\__tests__\routes\contacts.route.test.js"
    },
    @{
        Name = "accounts.route.test.js"
        Fixed = "backend\__tests__\routes\accounts.route.test.FIXED.js"
        Original = "backend\__tests__\routes\accounts.route.test.js"
    }
)

$applied = 0
$failed = 0

foreach ($file in $files) {
    Write-Host "Processing: $($file.Name)" -ForegroundColor Yellow
    
    if (-not (Test-Path $file.Fixed)) {
        Write-Host "  [SKIP] Fixed version not found" -ForegroundColor Red
        $failed++
        continue
    }
    
    # Create backup
    $backup = "$($file.Original).backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $file.Original $backup -ErrorAction SilentlyContinue
    if ($?) {
        Write-Host "  [OK] Backup created: $backup" -ForegroundColor Gray
    }
    
    # Apply fix
    Copy-Item $file.Fixed $file.Original -Force
    if ($?) {
        Write-Host "  [OK] Fixed version applied" -ForegroundColor Green
        $applied++
    } else {
        Write-Host "  [FAIL] Could not apply fix" -ForegroundColor Red
        $failed++
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Files applied: $applied" -ForegroundColor Green
Write-Host "Files failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "1. Run tests:" -ForegroundColor Yellow
Write-Host "   docker exec aishacrm-backend npm test`n"

Write-Host "2. If tests pass, commit:" -ForegroundColor Yellow
Write-Host "   git add backend/__tests__/routes/*.js backend/__tests__/helpers/test-entity-factory.js"
Write-Host "   git commit -m 'fix: Add TestFactory to tests - proper timestamps and test flags'"
Write-Host "   git push`n"

Write-Host "3. Verify cleanup works:" -ForegroundColor Yellow
Write-Host "   node backend/scripts/cleanup-test-data.js`n"
