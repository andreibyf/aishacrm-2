#!/usr/bin/env pwsh
# CI Lint Check: Prevent accidental ai_campaign references in active code
# This script ensures the legacy singular table name doesn't creep back into
# backend routes, frontend code, or new migrations (outside approved comments).
#
# Usage: .\scripts\lint-check-ai-campaign.ps1
# Exit code 0 = pass, 1 = fail (CI can use this)

Write-Host "🔍 Checking for accidental ai_campaign references..." -ForegroundColor Cyan

$excludePaths = @(
    "backend/migrations/009_complete_schema.sql",
    "backend/migrations/010_complete_rls_policies.sql",
    "backend/migrations/011_enable_rls.sql",
    "backend/migrations/023_comprehensive_rls_security.sql",
    "backend/migrations/032_normalize_foreign_keys.sql",
    "backend/migrations/035_consolidate_ai_campaigns.sql",
    "backend/migrations/036_cleanup_ai_campaign_residue.sql",
    "backend/test-ai-campaigns.js",
    "supabase/migrations/*.sql",
    "*.md",
    "eslint-results.json",
    "dist/**"
)

$foundIssues = $false
$rootPath = Split-Path -Parent $PSScriptRoot

# Build exclusion regex
$excludePattern = ($excludePaths | ForEach-Object {
    $_ -replace '\*\*', '.*' -replace '\*', '[^/\\]*' -replace '\.', '\.'
}) -join '|'

# Search for ai_campaign (case-insensitive, not in comments or approved files)
$matches = Get-ChildItem -Path $rootPath -Recurse -Include *.js,*.jsx,*.ts,*.tsx,*.sql -File | 
    Where-Object { 
        $relativePath = $_.FullName.Substring($rootPath.Length + 1).Replace('\', '/')
        $relativePath -notmatch $excludePattern
    } |
    Select-String -Pattern '\bai_campaign\b' -CaseSensitive:$false |
    Where-Object {
        # Filter out lines that are comments
        $line = $_.Line.Trim()
        -not ($line -match '^--' -or $line -match '^//' -or $line -match '^\*' -or $line -match '^/\*')
    }

if ($matches) {
    Write-Host "❌ Found disallowed ai_campaign references:" -ForegroundColor Red
    $matches | ForEach-Object {
        $relativePath = $_.Path.Substring($rootPath.Length + 1)
        Write-Host "  $relativePath`:$($_.LineNumber): $($_.Line.Trim())" -ForegroundColor Yellow
    }
    $foundIssues = $true
}

if ($foundIssues) {
    Write-Host "`n❌ FAIL: Legacy ai_campaign references found in active code." -ForegroundColor Red
    Write-Host "   The singular table was consolidated into ai_campaigns by migration 035." -ForegroundColor Yellow
    Write-Host "   Please use 'ai_campaigns' (plural) instead." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✅ PASS: No disallowed ai_campaign references found." -ForegroundColor Green
    exit 0
}
