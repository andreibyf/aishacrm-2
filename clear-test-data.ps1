#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clear test/dummy data from the CRM
.DESCRIPTION
    Removes test data while preserving tenant structure and user accounts
.PARAMETER TenantId
    Specific tenant to clean (optional - cleans all if not specified)
.PARAMETER KeepTenants
    If set, keeps tenant records but deletes their data
.PARAMETER DeleteTenants
    If set, deletes tenants AND all their data (use with caution!)
.EXAMPLE
    .\clear-test-data.ps1 -KeepTenants
    Deletes all data but keeps tenant records
.EXAMPLE
    .\clear-test-data.ps1 -TenantId "testing-tenant" -KeepTenants
    Deletes data only for testing-tenant
.EXAMPLE
    .\clear-test-data.ps1 -DeleteTenants
    Deletes ALL tenants and their data (fresh start)
#>

param(
    [string]$TenantId,
    [switch]$KeepTenants,
    [switch]$DeleteTenants
)

$ErrorActionPreference = "Stop"

Write-Host "`n╔═══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Clear Test Data Utility                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Validate flags
if ($KeepTenants -and $DeleteTenants) {
    Write-Host "❌ Cannot use both -KeepTenants and -DeleteTenants" -ForegroundColor Red
    exit 1
}

if (-not $KeepTenants -and -not $DeleteTenants) {
    Write-Host "⚠  No action specified. Choose one:" -ForegroundColor Yellow
    Write-Host "   -KeepTenants     Delete data but keep tenants" -ForegroundColor Gray
    Write-Host "   -DeleteTenants   Delete tenants AND all data" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Example: .\clear-test-data.ps1 -KeepTenants" -ForegroundColor White
    exit 0
}

# Check if backend is running
try {
    $null = Invoke-RestMethod -Uri 'http://localhost:3001/health' -TimeoutSec 2 -ErrorAction Stop
} catch {
    Write-Host "❌ Backend server is not running!" -ForegroundColor Red
    Write-Host "   Start it with: .\start-all.ps1" -ForegroundColor Yellow
    exit 1
}

# Get tenants
Write-Host "🔍 Fetching tenants..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3001/api/tenants' -Method GET
    $tenants = $response.data.tenants
    
    if ($TenantId) {
        $tenants = $tenants | Where-Object { $_.tenant_id -eq $TenantId }
        if ($tenants.Count -eq 0) {
            Write-Host "❌ Tenant not found: $TenantId" -ForegroundColor Red
            exit 1
        }
    } else {
        # Exclude "No Client" (tenant_id = 'none')
        $tenants = $tenants | Where-Object { $_.tenant_id -ne 'none' }
    }
    
    Write-Host "Found $($tenants.Count) tenant(s) to process:" -ForegroundColor Green
    $tenants | ForEach-Object {
        Write-Host "  • $($_.name) [$($_.tenant_id)]" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "❌ Error fetching tenants: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($tenants.Count -eq 0) {
    Write-Host "ℹ  No tenants to process" -ForegroundColor Yellow
    exit 0
}

# Confirm action
if ($DeleteTenants) {
    Write-Host "⚠  WARNING: This will DELETE tenants and ALL their data!" -ForegroundColor Red
} else {
    Write-Host "ℹ  This will delete data but keep tenant records" -ForegroundColor Yellow
}

Write-Host "   Entities to clear: Contacts, Leads, Accounts, Opportunities, Activities" -ForegroundColor Gray
Write-Host ""
$confirm = Read-Host "Continue? (yes/NO)"
if ($confirm -ne 'yes') {
    Write-Host "Cancelled." -ForegroundColor Gray
    exit 0
}

Write-Host ""

# Clear data for each tenant
$entities = @('contacts', 'leads', 'accounts', 'opportunities', 'activities')
$totalDeleted = 0

foreach ($tenant in $tenants) {
    Write-Host "Processing: $($tenant.name)" -ForegroundColor Cyan
    
    foreach ($entity in $entities) {
        try {
            # Get count first
            $listUrl = "http://localhost:3001/api/$entity`?tenant_id=$($tenant.tenant_id)&limit=1000"
            $listResponse = Invoke-RestMethod -Uri $listUrl -Method GET
            
            $items = $null
            if ($listResponse.data -and $listResponse.data.$entity) {
                $items = $listResponse.data.$entity
            } elseif ($listResponse.data -is [array]) {
                $items = $listResponse.data
            }
            
            if ($items -and $items.Count -gt 0) {
                Write-Host "  • Deleting $($items.Count) $entity..." -ForegroundColor Gray -NoNewline
                
                $deleted = 0
                foreach ($item in $items) {
                    try {
                        $deleteUrl = "http://localhost:3001/api/$entity/$($item.id)?tenant_id=$($tenant.tenant_id)"
                        $null = Invoke-RestMethod -Uri $deleteUrl -Method DELETE
                        $deleted++
                    } catch {
                        # Continue on error
                    }
                }
                
                Write-Host " ✓ Deleted $deleted" -ForegroundColor Green
                $totalDeleted += $deleted
            } else {
                Write-Host "  • $entity`: 0 records" -ForegroundColor DarkGray
            }
        } catch {
            Write-Host "  • $entity`: Error - $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    # Delete tenant if requested
    if ($DeleteTenants) {
        Write-Host "  • Deleting tenant..." -ForegroundColor Gray -NoNewline
        try {
            $null = Invoke-RestMethod -Uri "http://localhost:3001/api/tenants/$($tenant.id)" -Method DELETE
            Write-Host " ✓ Deleted" -ForegroundColor Green
        } catch {
            Write-Host " ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
}

# Summary
Write-Host "╔═══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              Cleanup Complete                 ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║ Total records deleted: $(($totalDeleted.ToString()).PadLeft(21)) ║" -ForegroundColor White
if ($DeleteTenants) {
    Write-Host "║ Tenants deleted: $(($tenants.Count.ToString()).PadLeft(27)) ║" -ForegroundColor White
} else {
    Write-Host "║ Tenants preserved: $(($tenants.Count.ToString()).PadLeft(25)) ║" -ForegroundColor White
}
Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

if ($KeepTenants) {
    Write-Host "✓ Ready for fresh data entry!" -ForegroundColor Green
    Write-Host "  Tenants are still available in the system" -ForegroundColor Gray
} else {
    Write-Host "✓ Fresh start - all test data removed!" -ForegroundColor Green
}

Write-Host ""
