#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clear ALL data from ALL tenants in Supabase database
.DESCRIPTION
    This script deletes ALL records from contacts, leads, accounts, opportunities, 
    and activities tables - regardless of tenant_id. This is a NUCLEAR option.
.PARAMETER Force
    Skip confirmation prompt
.EXAMPLE
    .\clear-all-data.ps1
    .\clear-all-data.ps1 -Force
#>

param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ANSI color codes
$Red = "`e[91m"
$Green = "`e[92m"
$Yellow = "`e[93m"
$Cyan = "`e[96m"
$Reset = "`e[0m"

$BackendUrl = "http://localhost:3001"

Write-Host ""
Write-Host "${Red}╔════════════════════════════════════════════════════════════╗${Reset}"
Write-Host "${Red}║  ⚠️  NUCLEAR OPTION: DELETE ALL DATA FROM SUPABASE       ║${Reset}"
Write-Host "${Red}╚════════════════════════════════════════════════════════════╝${Reset}"
Write-Host ""

# Check backend connectivity
try {
    $health = Invoke-RestMethod "$BackendUrl/health" -ErrorAction Stop
    if ($health.status -ne "ok") {
        throw "Backend is not healthy"
    }
} catch {
    Write-Host "${Red}✗ Backend not accessible at $BackendUrl${Reset}" -ForegroundColor Red
    Write-Host "  Make sure the backend is running: ${Cyan}cd backend && npm run dev${Reset}"
    exit 1
}

Write-Host "${Green}✓ Backend connected${Reset}"
Write-Host ""

# Confirmation
if (-not $Force) {
    Write-Host "${Yellow}This will DELETE ALL DATA from:${Reset}"
    Write-Host "  • contacts"
    Write-Host "  • leads"
    Write-Host "  • accounts"
    Write-Host "  • opportunities"
    Write-Host "  • activities"
    Write-Host ""
    Write-Host "${Yellow}For ALL tenants (including demo-tenant, local-tenant-001, etc.)${Reset}"
    Write-Host ""
    $confirmation = Read-Host "Type 'DELETE ALL' to confirm"
    
    if ($confirmation -ne "DELETE ALL") {
        Write-Host "${Yellow}Cancelled.${Reset}"
        exit 0
    }
}

Write-Host ""
Write-Host "${Cyan}Starting deletion process...${Reset}"
Write-Host ""

$totalDeleted = 0

# Function to delete all records from a table
function Delete-AllFromTable {
    param(
        [string]$TableName,
        [string]$Endpoint
    )
    
    Write-Host "Processing: ${Cyan}$TableName${Reset}"
    
    try {
        # First, get count of all records
        $response = Invoke-RestMethod "$BackendUrl/api/$Endpoint`?limit=1" -ErrorAction Stop
        $total = $response.total
        
        if ($total -eq 0) {
            Write-Host "  ${Yellow}→${Reset} 0 records (already empty)"
            return 0
        }
        
        Write-Host "  ${Yellow}→${Reset} Found $total records"
        
        # Get all record IDs in batches
        $limit = 1000
        $offset = 0
        $deleted = 0
        
        while ($offset -lt $total) {
            $batch = Invoke-RestMethod "$BackendUrl/api/$Endpoint`?limit=$limit&offset=$offset" -ErrorAction Stop
            
            if ($batch.records -and $batch.records.Count -gt 0) {
                foreach ($record in $batch.records) {
                    try {
                        $id = $record.id
                        Invoke-RestMethod "$BackendUrl/api/$Endpoint/$id" -Method DELETE -ErrorAction Stop | Out-Null
                        $deleted++
                        
                        # Progress indicator
                        if ($deleted % 10 -eq 0) {
                            Write-Host "  ${Yellow}→${Reset} Deleted $deleted / $total" -NoNewline
                            Write-Host "`r" -NoNewline
                        }
                    } catch {
                        Write-Host ""
                        Write-Host "  ${Red}✗${Reset} Failed to delete record $id : $_" -ForegroundColor Red
                    }
                }
            }
            
            $offset += $limit
        }
        
        Write-Host "  ${Green}✓${Reset} Deleted $deleted records"
        return $deleted
        
    } catch {
        Write-Host "  ${Red}✗${Reset} Error: $_" -ForegroundColor Red
        return 0
    }
}

# Delete from each table
$contactsDeleted = Delete-AllFromTable "contacts" "contacts"
$totalDeleted += $contactsDeleted

$leadsDeleted = Delete-AllFromTable "leads" "leads"
$totalDeleted += $leadsDeleted

$accountsDeleted = Delete-AllFromTable "accounts" "accounts"
$totalDeleted += $accountsDeleted

$oppsDeleted = Delete-AllFromTable "opportunities" "opportunities"
$totalDeleted += $oppsDeleted

$activitiesDeleted = Delete-AllFromTable "activities" "activities"
$totalDeleted += $activitiesDeleted

Write-Host ""
Write-Host "${Green}╔════════════════════════════════════════════════════════════╗${Reset}"
Write-Host "${Green}║  ✓ CLEANUP COMPLETE                                      ║${Reset}"
Write-Host "${Green}╚════════════════════════════════════════════════════════════╝${Reset}"
Write-Host ""
Write-Host "Total records deleted: ${Green}$totalDeleted${Reset}"
Write-Host ""
Write-Host "Summary:"
Write-Host "  • Contacts:      $contactsDeleted"
Write-Host "  • Leads:         $leadsDeleted"
Write-Host "  • Accounts:      $accountsDeleted"
Write-Host "  • Opportunities: $oppsDeleted"
Write-Host "  • Activities:    $activitiesDeleted"
Write-Host ""
