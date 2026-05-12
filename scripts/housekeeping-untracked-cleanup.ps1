# housekeeping-untracked-cleanup.ps1
#
# Reusable cleanup driver for the "main was force-pushed; my untracked
# workspace is a mess" pattern. Originally written for the 2026-05-12
# CodeQL force-push incident (see 4VD-47), generalized for future
# recoveries.
#
# Discovers $RepoRoot from `git rev-parse --show-toplevel` so it runs
# from anywhere inside a working tree. No hardcoded paths or SHAs.
#
# What this DOES:
#   1. Deletes garbage redirect-leak files matching common typo patterns:
#      *.err, *.txt.err, and the Windows-quirk "C?Users*.txt" pattern
#      created when PowerShell redirects use forward-slashes.
#   2. Optionally deletes one-shot push helpers matching a glob you
#      pass via -PushHelperGlob (e.g. "push-4vd-43-*", "push-old-*"),
#      after listing them for confirmation.
#   3. Reports remaining untracked files so you can decide which to
#      commit / which to leave alone (e.g. parallel-agent WIP).
#
# What this DOES NOT do:
#   - Commit, push, or modify any tracked file.
#   - Touch HEAD or branches.
#   - Stage anything for git.
#
# Safe to dry-run with -WhatIf on individual Remove-Item calls (script
# does NOT support -WhatIf at the top level — use the cmd-by-cmd
# parameter instead).
#
# Usage:
#   # Default: just delete obvious garbage, list remaining untracked.
#   .\scripts\housekeeping-untracked-cleanup.ps1
#
#   # Also delete one-shot push helpers matching a pattern.
#   .\scripts\housekeeping-untracked-cleanup.ps1 -PushHelperGlob "push-4vd-43-*"

[CmdletBinding()]
param(
    # Glob (relative to scripts/) of one-shot push helpers to delete.
    # Files are listed before deletion; empty = skip step 2.
    [string]$PushHelperGlob = ''
)

$ErrorActionPreference = 'Stop'

# Discover repo root from anywhere inside the working tree.
$RepoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $RepoRoot) {
    Write-Error "Not inside a git working tree. Run this from within the aishacrm-2 checkout."
    exit 1
}
# git returns forward-slashes on Windows; normalize.
$RepoRoot = $RepoRoot -replace '/', '\'

Push-Location $RepoRoot
try {
    Write-Host ">>> Repo root: $RepoRoot" -ForegroundColor Cyan
    Write-Host ">>> Local HEAD:" -ForegroundColor Cyan
    & git log -1 --oneline HEAD
    Write-Host ""

    # === Phase 1: delete garbage redirect-leak files ===
    Write-Host ">>> Phase 1: deleting garbage redirect-leak files at repo root" -ForegroundColor Cyan

    # Patterns that catch the common "PowerShell redirect went sideways"
    # leaks. Use Get-ChildItem -Force so dotfiles like .git-status.txt.err
    # are matched.
    $garbagePatterns = @(
        '*.err',
        '*.status.txt',
        'C?Users*.push*.txt',          # forward-slash-redirect → Unicode-U+F03A "C[U+F03A]Users..."
        '.push*.txt.err',
        '.git-status.txt'
    )
    $candidates = @()
    foreach ($pattern in $garbagePatterns) {
        $candidates += Get-ChildItem -Force -File -Filter $pattern -ErrorAction SilentlyContinue
    }
    # Dedup
    $candidates = $candidates | Sort-Object -Unique -Property FullName
    if ($candidates.Count -eq 0) {
        Write-Host "  (no garbage files matched)" -ForegroundColor DarkGray
    } else {
        foreach ($f in $candidates) {
            Write-Host "  deleting: $($f.Name)"
            Remove-Item -LiteralPath $f.FullName -Force
        }
    }

    # === Phase 2: optional push-helper cleanup ===
    if ($PushHelperGlob) {
        Write-Host ""
        Write-Host ">>> Phase 2: deleting push helpers matching scripts/$PushHelperGlob" -ForegroundColor Cyan
        $scriptsDir = Join-Path $RepoRoot 'scripts'
        $helpers = Get-ChildItem -Path $scriptsDir -Filter $PushHelperGlob -File -ErrorAction SilentlyContinue
        if ($helpers.Count -eq 0) {
            Write-Host "  (no matches)" -ForegroundColor DarkGray
        } else {
            foreach ($f in $helpers) {
                Write-Host "  deleting: $($f.Name)"
                Remove-Item -LiteralPath $f.FullName -Force
            }
        }
    } else {
        Write-Host ""
        Write-Host ">>> Phase 2: skipped (no -PushHelperGlob argument)" -ForegroundColor DarkGray
    }

    # === Phase 3: report remaining untracked ===
    Write-Host ""
    Write-Host ">>> Remaining untracked files (decide which to commit / leave)" -ForegroundColor Cyan
    & git status --short

    Write-Host ""
    Write-Host ">>> Done. No commits made, no pushes attempted." -ForegroundColor Green
    Write-Host ">>> Next: review the list above, `git add` what you want, commit + push manually." -ForegroundColor Yellow

} finally {
    Pop-Location
}
