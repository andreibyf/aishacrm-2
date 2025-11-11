#!/usr/bin/env pwsh
<#+
.SYNOPSIS
    Clear test/dummy data from the CRM (Docker backend on port 4001)
.DESCRIPTION
    Removes data while preserving tenant structure, users, and employees.
    Targets the Dockerized backend at http://localhost:4001
.PARAMETER TenantId
    Specific tenant to clean (optional - cleans all if not specified)
.PARAMETER KeepTenants
    If set, keeps tenant records but deletes their data
.PARAMETER DeleteTenants
    If set, deletes tenants AND all their data (use with caution!)
.EXAMPLE
    .\clear-test-data-docker.ps1 -KeepTenants
    Deletes data but keeps tenant records (Docker backend)
#>

param(
    [string]$TenantId,
    [switch]$KeepTenants,
    [switch]$DeleteTenants
)

$ErrorActionPreference = "Stop"
$BaseUrl = 'http://localhost:4001'

Write-Host "`n╔═══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Clear Test Data Utility (Docker: 4001)       ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Validate flags
if ($KeepTenants -and $DeleteTenants) {
    Write-Host "❌ Cannot use both -KeepTenants and -DeleteTenants" -ForegroundColor Red
    exit 1
}

if (-not $KeepTenants -and -not $DeleteTenants) {
    Write-Host "ℹ  No action specified. Choose one:" -ForegroundColor Yellow
    Write-Host "   -KeepTenants     Delete data but keep tenants" -ForegroundColor Gray
    Write-Host "   -DeleteTenants   Delete tenants AND all data" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Example: .\clear-test-data-docker.ps1 -KeepTenants" -ForegroundColor White
    exit 0
}

# Check if backend is running
try {
    $null = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 3 -ErrorAction Stop
} catch {
    Write-Host "❌ Backend server is not running on $BaseUrl!" -ForegroundColor Red
    Write-Host "   Start it with Docker: docker-compose up -d --build" -ForegroundColor Yellow
    exit 1
}

# Get tenants
Write-Host "🔍 Fetching tenants..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/tenants" -Method GET
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

Write-Host "   Entities to clear: Activities, Opportunities, Contacts, Leads" -ForegroundColor Gray
Write-Host ""
$confirm = Read-Host "Continue? (yes/NO)"
if ($confirm -ne 'yes') {
    Write-Host "Cancelled." -ForegroundColor Gray
    exit 0
}

Write-Host ""

# Clear data for each tenant
# ONLY core components per latest requirement: Activities, Opportunities, Contacts, Leads
# (Accounts, Users, Tenants, Employees are preserved)
$entities = @('activities', 'opportunities', 'contacts', 'leads')
$totalDeleted = 0

foreach ($tenant in $tenants) {
    Write-Host "Processing: $($tenant.name) [$($tenant.tenant_id)]" -ForegroundColor Cyan

    foreach ($entity in $entities) {
        try {
            # Get up to 1000 items per tenant
            $listUrl = "$BaseUrl/api/$entity`?tenant_id=$($tenant.tenant_id)&limit=1000"
            $listResponse = Invoke-RestMethod -Uri $listUrl -Method GET -ErrorAction Stop

            $items = $null
            if ($listResponse.data -and $listResponse.data.$entity) {
                $items = $listResponse.data.$entity
            } elseif ($listResponse.data -is [array]) {
                $items = $listResponse.data
            } elseif ($listResponse -is [array]) {
                $items = $listResponse
            }

            if ($items -and $items.Count -gt 0) {
                Write-Host "  • Deleting $($items.Count) $entity..." -ForegroundColor Gray -NoNewline

                $deleted = 0
                foreach ($item in $items) {
                    try {
                        $deleteUrl = "$BaseUrl/api/$entity/$($item.id)?tenant_id=$($tenant.tenant_id)"
                        $null = Invoke-RestMethod -Uri $deleteUrl -Method DELETE -ErrorAction Stop
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

    if ($DeleteTenants) {
        Write-Host "  • Deleting tenant..." -ForegroundColor Gray -NoNewline
        try {
            $null = Invoke-RestMethod -Uri "$BaseUrl/api/tenants/$($tenant.id)" -Method DELETE -ErrorAction Stop
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

Write-Host "✓ Ready for fresh data entry!" -ForegroundColor Green
Write-Host "  Kept: users, tenants, employees (no deletion performed)" -ForegroundColor Gray
Write-Host ""