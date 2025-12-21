#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Purge ALL data in the local Postgres database but keep the specified Superadmin user.

.DESCRIPTION
  - Truncates all public tables except 'users' (CASCADE)
  - Deletes all rows from 'users' EXCEPT the provided email
  - Does NOT touch Supabase Auth (auth.users) – your auth record remains

.PARAMETER Email
  Email of the Superadmin to preserve (required)

.EXAMPLE
  .\reset-keep-superadmin.ps1 -Email "abyfield@4bdataconsulting.com"

#>

param(
  [Parameter(Mandatory=$true)][string]$Email
)

$ErrorActionPreference = 'Stop'

Write-Host ""; Write-Host "Reset DB (keep Superadmin): $Email" -ForegroundColor Cyan

# Terminal rule: verify directory
Write-Host "Current Directory:" (Get-Location) -ForegroundColor DarkGray

# Ensure Node is available
try { node --version | Out-Null } catch { Write-Host "Node.js is required to run this script" -ForegroundColor Red; exit 1 }

$env:DATABASE_URL = $env:DATABASE_URL
if (-not $env:DATABASE_URL) {
  # Default to local docker Postgres
  $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/aishacrm"
}

Write-Host "Using DATABASE_URL=$($env:DATABASE_URL)" -ForegroundColor DarkGray

$confirm = Read-Host "Type 'DELETE ALL EXCEPT ME' to confirm"
if ($confirm -ne 'DELETE ALL EXCEPT ME') { Write-Host "Cancelled." -ForegroundColor Yellow; exit 0 }

node .\backend\scripts\purge-preserve-superadmin.js --email="$Email" --yes

if ($LASTEXITCODE -eq 0) {
  Write-Host "\n✓ Done. Only $Email remains in public.users" -ForegroundColor Green
  Write-Host "Supabase Auth user was not modified." -ForegroundColor DarkGray
} else {
  Write-Host "\n✗ Operation failed." -ForegroundColor Red
}
