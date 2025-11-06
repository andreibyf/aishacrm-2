#!/usr/bin/env pwsh
# Branch Cleanup Helper Script
# Helps clean up local and remote branches safely

Write-Host "=== Git Branch Cleanup Helper ===" -ForegroundColor Cyan
Write-Host ""

# Function to show colored output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Function to prompt for yes/no
function Get-Confirmation {
    param([string]$Message)
    $response = Read-Host "$Message (y/n)"
    return $response -eq 'y' -or $response -eq 'Y'
}

# Check if we're in a git repository
try {
    git rev-parse --git-dir 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "Error: Not in a git repository!" "Red"
        exit 1
    }
} catch {
    Write-ColorOutput "Error: Not in a git repository!" "Red"
    exit 1
}

# Get current branch
$currentBranch = git branch --show-current
Write-ColorOutput "Current branch: $currentBranch" "Green"
Write-Host ""

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-ColorOutput "⚠️  Warning: You have uncommitted changes!" "Yellow"
    git status --short
    Write-Host ""
    
    if (Get-Confirmation "Do you want to stash these changes?") {
        Write-ColorOutput "Stashing changes..." "Cyan"
        git stash save "Cleanup script auto-stash $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        Write-ColorOutput "✓ Changes stashed. Use 'git stash pop' to restore them." "Green"
        Write-Host ""
    }
}

# Check for merge conflicts
$conflicts = git diff --name-only --diff-filter=U
if ($conflicts) {
    Write-ColorOutput "❌ Active merge conflicts detected:" "Red"
    Write-ColorOutput $conflicts "Yellow"
    Write-Host ""
    
    if (Get-Confirmation "Do you want to abort the merge?") {
        Write-ColorOutput "Aborting merge..." "Cyan"
        git merge --abort
        Write-ColorOutput "✓ Merge aborted." "Green"
    } else {
        Write-ColorOutput "Please resolve conflicts manually. See GIT_CONFLICT_RESOLUTION.md for help." "Yellow"
        exit 0
    }
    Write-Host ""
}

# Show local branches
Write-ColorOutput "=== Local Branches ===" "Cyan"
$localBranches = git branch --format="%(refname:short)|%(upstream:short)" | ForEach-Object {
    $parts = $_ -split '\|'
    [PSCustomObject]@{
        Branch = $parts[0]
        Upstream = if ($parts[1]) { $parts[1] } else { "(no upstream)" }
        IsCurrent = $parts[0] -eq $currentBranch
    }
}

foreach ($branch in $localBranches) {
    $marker = if ($branch.IsCurrent) { "*" } else { " " }
    $color = if ($branch.IsCurrent) { "Green" } else { "White" }
    Write-Host "$marker $($branch.Branch)" -ForegroundColor $color -NoNewline
    Write-Host " → $($branch.Upstream)" -ForegroundColor Gray
}
Write-Host ""

# Offer to delete merged branches
$mergedBranches = git branch --merged main | Where-Object { 
    $_.Trim() -ne "main" -and 
    $_.Trim() -ne "*main" -and 
    $_.Trim() -ne $currentBranch -and
    $_.Trim() -ne "*$currentBranch"
} | ForEach-Object { $_.Trim() }

if ($mergedBranches) {
    Write-ColorOutput "=== Branches Merged into Main ===" "Cyan"
    $mergedBranches | ForEach-Object { Write-ColorOutput "  $_" "Gray" }
    Write-Host ""
    
    if (Get-Confirmation "Delete these merged branches?") {
        foreach ($branch in $mergedBranches) {
            Write-ColorOutput "Deleting $branch..." "Yellow"
            git branch -d $branch
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "✓ Deleted $branch" "Green"
            } else {
                Write-ColorOutput "✗ Failed to delete $branch" "Red"
            }
        }
    }
    Write-Host ""
}

# Show branches that might be stale
Write-ColorOutput "=== Copilot Branches (may be stale) ===" "Cyan"
$copilotBranches = $localBranches | Where-Object { 
    $_.Branch -like "copilot/*" -and 
    -not $_.IsCurrent 
}

if ($copilotBranches) {
    $copilotBranches | ForEach-Object { 
        Write-ColorOutput "  $($_.Branch) → $($_.Upstream)" "Gray" 
    }
    Write-Host ""
    
    if (Get-Confirmation "Delete all copilot/* branches (except current)?") {
        foreach ($branch in $copilotBranches) {
            Write-ColorOutput "Deleting $($branch.Branch)..." "Yellow"
            git branch -D $($branch.Branch)
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "✓ Deleted $($branch.Branch)" "Green"
            } else {
                Write-ColorOutput "✗ Failed to delete $($branch.Branch)" "Red"
            }
        }
    }
    Write-Host ""
} else {
    Write-ColorOutput "  No copilot branches found." "Gray"
    Write-Host ""
}

# Prune remote references
Write-ColorOutput "=== Remote Branch Cleanup ===" "Cyan"
if (Get-Confirmation "Prune stale remote-tracking branches?") {
    Write-ColorOutput "Pruning remote references..." "Cyan"
    git fetch --prune
    git remote prune origin
    Write-ColorOutput "✓ Remote references pruned." "Green"
}
Write-Host ""

# Clean untracked files
$untrackedFiles = git ls-files --others --exclude-standard
if ($untrackedFiles) {
    Write-ColorOutput "=== Untracked Files ===" "Cyan"
    $untrackedFiles | Select-Object -First 10 | ForEach-Object { 
        Write-ColorOutput "  $_" "Gray" 
    }
    if ($untrackedFiles.Count -gt 10) {
        Write-ColorOutput "  ... and $($untrackedFiles.Count - 10) more" "Gray"
    }
    Write-Host ""
    
    if (Get-Confirmation "Remove all untracked files?") {
        Write-ColorOutput "⚠️  This will permanently delete untracked files!" "Yellow"
        if (Get-Confirmation "Are you sure?") {
            git clean -fd
            Write-ColorOutput "✓ Untracked files removed." "Green"
        }
    }
    Write-Host ""
}

# Final status
Write-ColorOutput "=== Final Status ===" "Cyan"
git status
Write-Host ""

Write-ColorOutput "=== Cleanup Complete ===" "Green"
Write-ColorOutput "Current branch: $currentBranch" "Cyan"
Write-ColorOutput "Remaining local branches:" "Cyan"
git branch
Write-Host ""

Write-ColorOutput "💡 Tip: See GIT_CONFLICT_RESOLUTION.md for more git help!" "Blue"
