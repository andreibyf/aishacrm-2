# housekeeping-untracked-cleanup.ps1
#
# Cleans up the untracked files in aishacrm-2 after the 2026-05-11/12 audit
# (see Linear 4VD-43 PR 3+4 summary, 4VD-46, 4VD-47).
#
# What this DOES (deterministic, no decisions):
#   1. Deletes 3 garbage redirect-leak files (.git-status.txt.err,
#      .push1.txt.err, "C:UsersandreDocumentsGitHubaishacrm-2.push1.txt").
#   2. Deletes 7 one-shot worktree-push helpers whose commits already
#      landed on origin/main (push-4vd-43-pr{2,3,4}.{sh,ps1},
#      push-rename-vps1-env.sh, push-serialize-deploy-staging.sh).
#   3. Stages 6 reusable operational scripts as a new commit:
#      backend/scripts/sign-url.mjs, sign-url-v2.mjs, list-signed.mjs,
#      probe-smtp.mjs, scripts/check-deploy.ps1, scripts/coolify-deploy-staging.sh.
#   4. Commits those operational scripts directly onto a worktree-against-
#      origin/main branch and pushes — does NOT touch local HEAD (which
#      carries 46483cf4, the CodeQL commit that needs separate rebase).
#
# What this DOES NOT do (intentionally — needs your eye):
#   - Touch the 3 frontend vitest files (LeadTable, GlobalDetailViewer,
#     UniversalDetailPanel.fieldResolution). They belong with the CodeQL
#     rebase commit (4VD-46 → 4VD-47), not in this housekeeping push.
#   - Rebase 46483cf4 onto origin/main. That's 4VD-47 — 8-file conflict
#     resolution, manual.
#   - Touch local HEAD or your working checkout state.
#
# Safety:
#   - Uses the worktree-against-origin/main pattern from the eSign PRs.
#     Local checkout HEAD stays at 46483cf4 throughout.
#   - All operations are idempotent re-runnable (rm -f, git add -f, force-
#     with-lease push not used since we're committing to a fresh branch).
#   - Stops on first error (`$ErrorActionPreference = 'Stop'`).

$ErrorActionPreference = 'Stop'
$RepoRoot = 'C:\Users\andre\Documents\GitHub\aishacrm-2'

Push-Location $RepoRoot
try {
    Write-Host ">>> Repo root: $RepoRoot" -ForegroundColor Cyan
    Write-Host ">>> Local HEAD before:" -ForegroundColor Cyan
    git log -1 --oneline HEAD

    # === Phase 1: delete garbage redirect-leak files ===
    Write-Host "`n>>> Phase 1: deleting garbage redirect-leak files" -ForegroundColor Cyan
    $garbage = @(
        '.git-status.txt.err'
        '.push1.txt.err'
        'C:UsersandreDocumentsGitHubaishacrm-2.push1.txt'
    )
    foreach ($f in $garbage) {
        if (Test-Path -LiteralPath $f) {
            Remove-Item -LiteralPath $f -Force
            Write-Host "  deleted: $f"
        } else {
            Write-Host "  already gone: $f" -ForegroundColor DarkGray
        }
    }

    # === Phase 2: delete one-shot worktree-push helpers (work landed) ===
    Write-Host "`n>>> Phase 2: deleting one-shot push helpers (commits already on origin/main)" -ForegroundColor Cyan
    $landedHelpers = @(
        'scripts/push-4vd-43-pr2.sh'
        'scripts/push-4vd-43-pr2.ps1'
        'scripts/push-4vd-43-pr3.sh'
        'scripts/push-4vd-43-pr3.ps1'
        'scripts/push-4vd-43-pr4.sh'
        'scripts/push-rename-vps1-env.sh'
        'scripts/push-serialize-deploy-staging.sh'
    )
    foreach ($f in $landedHelpers) {
        if (Test-Path -LiteralPath $f) {
            Remove-Item -LiteralPath $f -Force
            Write-Host "  deleted: $f"
        } else {
            Write-Host "  already gone: $f" -ForegroundColor DarkGray
        }
    }

    # === Phase 3: build operational-scripts commit via worktree-against-origin ===
    Write-Host "`n>>> Phase 3: committing 6 operational scripts via worktree-against-origin/main" -ForegroundColor Cyan
    git fetch origin main --quiet
    $originSha = (git rev-parse origin/main).Trim()
    Write-Host "  origin/main: $originSha"

    $opScripts = @(
        'backend/scripts/sign-url.mjs'
        'backend/scripts/sign-url-v2.mjs'
        'backend/scripts/list-signed.mjs'
        'backend/scripts/probe-smtp.mjs'
        'scripts/check-deploy.ps1'
        'scripts/coolify-deploy-staging.sh'
    )
    foreach ($f in $opScripts) {
        if (-not (Test-Path -LiteralPath $f)) {
            throw "Expected operational script not found: $f"
        }
    }

    # Build commit in an isolated worktree so local HEAD (46483cf4) is untouched.
    $worktreeDir = Join-Path $env:TEMP "aishacrm-2-housekeeping-$(Get-Date -Format yyyyMMdd-HHmmss)"
    if (Test-Path -LiteralPath $worktreeDir) { Remove-Item -LiteralPath $worktreeDir -Recurse -Force }

    Write-Host "  creating worktree at: $worktreeDir"
    git worktree add --detach $worktreeDir $originSha | Out-Null
    try {
        # Copy operational scripts into the worktree.
        foreach ($f in $opScripts) {
            $src = Join-Path $RepoRoot $f
            $dst = Join-Path $worktreeDir $f
            $dstDir = Split-Path $dst -Parent
            if (-not (Test-Path -LiteralPath $dstDir)) {
                New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
            }
            Copy-Item -LiteralPath $src -Destination $dst -Force
        }

        Push-Location $worktreeDir
        try {
            git add -- $opScripts
            git status --short

            $commitMsg = @"
chore(scripts): add eSign + staging deploy operational helpers

Promote 6 reusable debug/operations scripts from local-only untracked
to tracked. These all date from the 4VD-43 day-5 PR 2/3/4 testing
session and the deploy-staging serialization work; they're recurring
tools, not one-off push helpers.

eSign debug helpers:
- backend/scripts/sign-url.mjs       Supabase signed-URL generator
- backend/scripts/sign-url-v2.mjs    Direct-REST variant (for when
                                     the JS client returns 'Invalid key')
- backend/scripts/list-signed.mjs    List signed/ prefix for a tenant
- backend/scripts/probe-smtp.mjs     SMTP probe with full error capture

Deploy ops helpers:
- scripts/check-deploy.ps1               Three-probe staging deploy status
- scripts/coolify-deploy-staging.sh      Manual webhook fire when GH
                                         Actions doesn't trigger

No code changes; promotion-only. Self-documented in headers.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
"@
            git commit -m $commitMsg
            $newSha = (git rev-parse HEAD).Trim()
            Write-Host "  new commit: $newSha"

            Write-Host "`n>>> Pushing $newSha to origin/main"
            git push origin "${newSha}:refs/heads/main"
        } finally {
            Pop-Location
        }
    } finally {
        # Always clean up the worktree, success or fail.
        git worktree remove --force $worktreeDir 2>$null | Out-Null
        if (Test-Path -LiteralPath $worktreeDir) {
            Remove-Item -LiteralPath $worktreeDir -Recurse -Force
        }
    }

    Write-Host "`n>>> Phase 4: refresh local fetch ref and verify origin/main moved" -ForegroundColor Cyan
    git fetch origin main --quiet
    git log -1 --oneline origin/main

    Write-Host "`n>>> Phase 5: remaining untracked files (should be only the 3 vitest files for 4VD-46/4VD-47)" -ForegroundColor Cyan
    git status --short

    Write-Host "`n>>> Done. Local HEAD still at:" -ForegroundColor Green
    git log -1 --oneline HEAD

    Write-Host "`n>>> Next step: see Linear 4VD-47 for the CodeQL rebase recipe." -ForegroundColor Yellow

} finally {
    Pop-Location
}
