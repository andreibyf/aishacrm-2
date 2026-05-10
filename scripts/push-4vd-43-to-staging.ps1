# push-4vd-43-to-staging.ps1
#
# Stages today's 4VD-43 day 4b polish + signing activity fixes onto the
# current feature branch, fast-forwards them onto main, and pushes main
# to trigger the existing deploy-staging.yml GitHub Action (which fires
# the Coolify webhooks for staging-app-fast and staging-backend-heavy).
#
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/push-4vd-43-to-staging.ps1
#
# Pauses for confirmation before the main push so Dre can eyeball the
# diff and abort if anything looks off.
#
# ASCII-only on purpose: PowerShell 5.1 on Windows reads .ps1 files
# without a BOM as Windows-1252, which mangles UTF-8 chars like em-dash
# and breaks the parser.

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "    FAIL: $msg" -ForegroundColor Red; exit 1 }

# ---- Locate repo root ------------------------------------------------------
$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { Fail "Not inside a git working tree." }
Set-Location $repoRoot

# ---- Capture starting branch so we can return at the end ------------------
$startBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
Step "Current branch: $startBranch"
if ($startBranch -eq 'main') {
  Fail "You are already on main. This script expects a feature branch with the day-4b work."
}

# ---- Sanity: there should be uncommitted day-4b work to push --------------
$status = & git status --short
if (-not $status) {
  Step "Working tree clean -- checking if feature branch has commits ahead of origin/main"
  $aheadCount = (& git rev-list --count "origin/main..HEAD").Trim()
  if ($aheadCount -eq '0') {
    Fail "Nothing to push: working tree clean AND no commits ahead of origin/main."
  }
  Ok "Branch is $aheadCount commit(s) ahead of origin/main; will skip add/commit and go straight to push."
  $skipCommit = $true
} else {
  Ok "Found uncommitted changes:"
  Write-Host $status
  $skipCommit = $false
}

# ---- Stage + commit (only if there's uncommitted work) --------------------
if (-not $skipCommit) {
  Step "Staging the 4VD-43 day 4b files"

  # Be specific to avoid sweeping in unrelated local edits.
  $files = @(
    'src/pages/SignPage.jsx',
    'src/pages/__tests__/SignPage.smoke.test.jsx',
    'backend/lib/signingActivityTracker.js',
    'backend/routes/submissions.js',
    'backend/__tests__/lib/signingActivityTracker.test.js',
    'backend/migrations/167_sync_activities_related_name.sql',
    'scripts/push-4vd-43-to-staging.ps1',
    'CHANGELOG.md'
  )
  foreach ($f in $files) {
    if (Test-Path $f) {
      & git add -- $f
      Ok "git add $f"
    } else {
      Write-Host "    (skip - file not present): $f" -ForegroundColor DarkYellow
    }
  }

  Step "Showing staged diff stats"
  & git diff --cached --stat

  # Single-quoted here-string: no interpolation, no escape processing,
  # safe across encoding quirks.
  $msg = @'
4VD-43 day 4b polish + signing activity fixes

SignPage:
- Layout: bypass global body .mx-auto / .container / max-w-* important
  rule by using inline styles for the 768px main and 720px PDF page-div.
- NEXT-field pointer (badge + Jump button + filled-state check), walks
  ALL fillable fields in reading order rather than required-only.
- Tab order fix: render fields per page sorted by (page, y, x) so DOM
  order matches visual reading order.
- Date input: replaced native input type=date with a typed text input
  (MM/DD/YYYY placeholder) -- native picker traps Tab focus internally.
- Browser scroll-restoration override (history.scrollRestoration=manual
  + scrollTo(0,0) inside useLayoutEffect) so refresh always lands at top.
- Smoke-test asserts the source cannot re-introduce the offending
  classes or the native date input.

Signing activity tracker:
- Fix FK violation on activities.assigned_to (it FKs to employees.id
  not users.id). Resolve req.user.email to employees.id via tenant-
  scoped ilike lookup; fall back to NULL when no match. Stash user_id
  + email in metadata for audit.
- Fix calling-convention bug on resolveRelatedEntityFields: was being
  called with an object literal, helper takes positional args. Result:
  every signing activity row had related_name=null, timeline rendered
  generic "View Lead" fallback instead of the entity name.
- New unit test suite covers FK resolution, missing-employee fallback,
  empty-email skip, and related_name composition for lead/account.

Migration 167 (already applied to dev + staging via apply_migration MCP):
- AFTER UPDATE triggers on leads/contacts/accounts/opportunities that
  propagate name + email changes into every activity row referencing
  the entity. WHEN clauses limit firing to actual rename events.
  SECURITY DEFINER + explicit tenant_id filter for tenant isolation.

Out of scope (follow-ups):
- bizdev_sources sync: its display name lives in company_name not
  first_name/last_name; resolveRelatedEntityFields.js is also miswired
  for that entity. Both fixes belong together.
- Day 5 (pdf-lib stamping + Certificate of Completion + Type-signature
  + signed-PDF download endpoint + recipient auto-email): bundled
  scope pinned on Linear 4VD-43.
'@

  Step "Committing"
  & git commit -m $msg
  if ($LASTEXITCODE -ne 0) { Fail "git commit failed." }
  $newSha = (& git rev-parse HEAD).Trim().Substring(0,12)
  Ok "Committed as $newSha"
}

# ---- Push the feature branch ----------------------------------------------
Step "Pushing $startBranch to origin"
& git push origin $startBranch
if ($LASTEXITCODE -ne 0) { Fail "git push of feature branch failed." }
Ok "Pushed $startBranch"

# ---- Confirmation gate before touching main -------------------------------
Step "About to fast-forward main with $startBranch and push main, which triggers staging deploy"
Write-Host "    (deploy-staging.yml will fire Coolify webhooks for staging-app-fast and staging-backend-heavy)" -ForegroundColor DarkGray
$confirm = Read-Host "    Proceed? Type YES to continue, anything else aborts"
if ($confirm -ne 'YES') {
  Write-Host "    Aborted at confirmation gate. Feature branch has been pushed; main is unchanged." -ForegroundColor Yellow
  exit 0
}

# ---- Switch to main, pull, fast-forward merge, push -----------------------
Step "git checkout main"
& git checkout main
if ($LASTEXITCODE -ne 0) { Fail "Could not checkout main." }

Step "git pull --ff-only origin main"
& git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { Fail "main is not fast-forwardable from origin/main -- aborting to avoid clobbering history." }

Step "git merge --no-ff $startBranch"
& git merge --no-ff $startBranch -m "Merge $startBranch into main (4VD-43 day 4b + signing activity fixes)"
if ($LASTEXITCODE -ne 0) {
  Fail "Merge produced conflicts. Resolve them manually, then run 'git push origin main' to deploy."
}
Ok "Merged"

Step "git push origin main: triggers Deploy Staging GitHub Action"
& git push origin main
if ($LASTEXITCODE -ne 0) { Fail "git push of main failed -- staging will NOT auto-deploy." }
Ok "Pushed main"

# ---- Return to feature branch ---------------------------------------------
Step "git checkout $startBranch (returning you to your feature branch)"
& git checkout $startBranch | Out-Null

# ---- Summary --------------------------------------------------------------
$mainSha = (& git rev-parse origin/main).Trim().Substring(0,12)
Step "Done"
Ok "main is now at $mainSha"
Ok "deploy-staging.yml will fire on this push and run Coolify webhooks for the changed apps"
Write-Host ""
Write-Host "    Watch the deploy:" -ForegroundColor DarkGray
Write-Host "      https://github.com/4vdataconsulting/aishacrm/actions/workflows/deploy-staging.yml" -ForegroundColor DarkGray
Write-Host ""
Write-Host "    Or run scripts/watch-deploy.ps1 to poll the Coolify deployment status." -ForegroundColor DarkGray
