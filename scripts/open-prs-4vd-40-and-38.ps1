# open-prs-4vd-40-and-38.ps1
# Bundles 4VD-40 + 4VD-38 work into two PRs.
# Builds CHANGELOG + DATABASE_REFERENCE deltas at runtime from HEAD (avoids
# stashing large bundle files). Uses Start-Process with redirected output
# because Desktop Commander's spawned PowerShell strips PATH and gh.exe
# stdout isn't captured by the &-operator.

$logPath = Join-Path $PSScriptRoot 'driver.log'
"=== run @ $(Get-Date -Format 'HH:mm:ss.fff') ===" | Set-Content -Encoding ascii -Path $logPath

function Log {
    param([string]$msg)
    "[{0:HH:mm:ss.fff}] {1}" -f (Get-Date), $msg | Add-Content -Encoding ascii -Path $logPath
}

$GIT = 'C:\Program Files\Git\cmd\git.exe'
$GH  = 'C:\Program Files\GitHub CLI\gh.exe'

function Invoke-Tool {
    param(
        [Parameter(Mandatory)][string]$Exe,
        [Parameter(Mandatory)][string[]]$ArgsList,
        [string]$Label
    )
    if (-not $Label) { $Label = (Split-Path -Leaf $Exe) }
    Log ("RUN: $Label " + ($ArgsList -join ' '))
    $tmpOut = [IO.Path]::GetTempFileName()
    $tmpErr = [IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $Exe -ArgumentList $ArgsList `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $tmpOut `
            -RedirectStandardError  $tmpErr
        $rc = $p.ExitCode
        $stdout = Get-Content $tmpOut -ErrorAction SilentlyContinue
        $stderr = Get-Content $tmpErr -ErrorAction SilentlyContinue
        foreach ($l in $stdout) { Log "    out: $l" }
        foreach ($l in $stderr) { Log "    err: $l" }
        Log "    rc=$rc"
        if ($rc -ne 0) {
            throw ("$Label " + ($ArgsList -join ' ') + " failed (rc=$rc): " + ($stderr -join ' '))
        }
        return $stdout
    }
    finally {
        Remove-Item -Force $tmpOut, $tmpErr -ErrorAction SilentlyContinue
    }
}

function Run-Git { param([string[]]$ArgsList) Invoke-Tool -Exe $GIT -ArgsList $ArgsList -Label 'git' }
function Run-Gh  { param([string[]]$ArgsList) Invoke-Tool -Exe $GH  -ArgsList $ArgsList -Label 'gh'  }

# Build the per-branch CHANGELOG content from HEAD CHANGELOG + a snippet file.
# Branch A: insert entry as first bullet under "### Added" of [Unreleased].
# Branch B: insert a new "### Security" section above "### Added" with the entry.
function Build-Changelog {
    param(
        [Parameter(Mandatory)][ValidateSet('A','B')][string]$Variant,
        [Parameter(Mandatory)][string]$EntryFile,
        [Parameter(Mandatory)][string]$OutPath
    )
    $head = (Run-Git @('show','HEAD:CHANGELOG.md')) -join "`n"
    if (-not $head) { throw "could not read HEAD:CHANGELOG.md" }
    $entry = Get-Content -Raw -Path $EntryFile
    $entry = $entry.TrimEnd() + "`n"

    $anchor = "## [Unreleased]`n`n### Added`n`n"
    if ($head -notmatch [regex]::Escape($anchor)) { throw "CHANGELOG anchor not found" }

    if ($Variant -eq 'A') {
        $replacement = $anchor + $entry + "`n"
    }
    else {
        $replacement = "## [Unreleased]`n`n### Security`n`n" + $entry + "`n### Added`n`n"
    }
    $new = [regex]::Replace($head, [regex]::Escape($anchor), { param($m) $replacement }, 1)
    [System.IO.File]::WriteAllText($OutPath, $new, [System.Text.Encoding]::UTF8)
}

# Apply the 4VD-40 edits to docs/reference/DATABASE_REFERENCE.md (working tree).
function Apply-DatabaseReferenceEdits {
    $file = 'docs\reference\DATABASE_REFERENCE.md'
    $text = [System.IO.File]::ReadAllText($file)

    # 1. Bump last-updated date
    $text = $text -replace '> Last updated: 2026-04-02', '> Last updated: 2026-05-07'

    # 2. Add staging row + bump prod table count 88 -> 89
    $oldEnvTable = "| Environment | Supabase Project ID    | Branch         | Tables | Postgres |`r`n| ----------- | ---------------------- | -------------- | ------ | -------- |`r`n| **Prod**    | ``ehjlenywplgyiahgxkfj`` | ``main``         | 88     | 17.6.1   |`r`n| **Dev**     | ``efzqxjpfewkrgpdootte`` | ``aishacrm-dev`` | 89     | 17.x     |"
    $newEnvTable = "| Environment | Supabase Project ID    | Branch         | Tables | Postgres |`r`n| ----------- | ---------------------- | -------------- | ------ | -------- |`r`n| **Prod**    | ``ehjlenywplgyiahgxkfj`` | ``main``         | 89     | 17.6.1   |`r`n| **Staging** | ``bjedfowimuwbcnruwcdj`` | ``staging``      | 89     | 17.x     |`r`n| **Dev**     | ``efzqxjpfewkrgpdootte`` | ``aishacrm-dev`` | 89     | 17.x     |"
    if ($text.Contains($oldEnvTable)) {
        $text = $text.Replace($oldEnvTable, $newEnvTable)
    } else {
        # File may use LF endings; try LF variant
        $oldLf = $oldEnvTable.Replace("`r`n","`n")
        $newLf = $newEnvTable.Replace("`r`n","`n")
        if ($text.Contains($oldLf)) {
            $text = $text.Replace($oldLf, $newLf)
        } else {
            throw "DATABASE_REFERENCE.md envs table anchor not found"
        }
    }

    # 3. Add slug to tenant columns + post-table note
    $oldTenant = "#### ``tenant```r`n`r`n``id``, ``tenant_id``, ``name``, ``status``, ``domain``, ``country``, ``industry``, ``major_city``, ``business_model``, ``geographic_focus``, ``subscription_tier``, ``display_order``, ``elevenlabs_agent_id``, ``branding_settings``, ``metadata``, ``created_at``, ``updated_at``"
    $newTenant = "#### ``tenant```r`n`r`n``id``, ``tenant_id``, ``name``, ``slug``, ``status``, ``domain``, ``country``, ``industry``, ``major_city``, ``business_model``, ``geographic_focus``, ``subscription_tier``, ``display_order``, ``elevenlabs_agent_id``, ``branding_settings``, ``metadata``, ``created_at``, ``updated_at```r`n`r`n> **``slug``** (added 2026-05-07, mig 161): URL-safe identifier for white-label public routes (first user: ``/sign/<slug>/<token>`` per 4VD-7). NOT NULL, UNIQUE, CHECK ``^[a-z0-9](-?[a-z0-9])+`$`` and length 2..64. Backfilled from ``name`` lowercased + non-alphanumeric -> hyphen, with collision suffixing."
    if ($text.Contains($oldTenant)) {
        $text = $text.Replace($oldTenant, $newTenant)
    } else {
        $oldLf = $oldTenant.Replace("`r`n","`n")
        $newLf = $newTenant.Replace("`r`n","`n")
        if ($text.Contains($oldLf)) {
            $text = $text.Replace($oldLf, $newLf)
        } else {
            throw "DATABASE_REFERENCE.md tenant block anchor not found"
        }
    }

    [System.IO.File]::WriteAllText($file, $text, [System.Text.Encoding]::UTF8)
}

try {
    Log "git path test: $(Test-Path $GIT)"
    Log "gh  path test: $(Test-Path $GH)"
    if (-not (Test-Path $GIT)) { throw "git.exe not at $GIT" }
    if (-not (Test-Path $GH))  { throw "gh.exe not at $GH" }

    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
    Set-Location $repoRoot
    Log "repoRoot=$repoRoot"

    Run-Gh  @('auth', 'status')

    $branchA = 'abyfield/4vd-40-prod-docuseal-migrations'
    $branchB = 'abyfield/4vd-38-audit-capability-gate'

    $bundle = Join-Path $repoRoot 'scripts\.4vd-pr-bundle'
    foreach ($f in @('entry-4vd-40.md','entry-4vd-38.md','gitignore.snap','commit-msg-A.txt','commit-msg-B.txt')) {
        $p = Join-Path $bundle $f
        if (-not (Test-Path $p)) { throw "missing: $p" }
    }
    if (-not (Test-Path 'backend\__tests__\braid\registry-policy-integration.test.js')) {
        throw "missing: backend\__tests__\braid\registry-policy-integration.test.js"
    }
    Log "bundle OK"

    $current = ((Run-Git @('rev-parse', '--abbrev-ref', 'HEAD')) -join '').Trim()

    # Recovery: if a previous run left us on a feature branch, return to main.
    # NO `git clean` - that's how we destroyed the bundle last time.
    if ($current -eq $branchA -or $current -eq $branchB) {
        Log "Currently on $current from a previous run. Resetting back to main."
        Invoke-Tool -Exe $GIT -ArgsList @('reset','--hard','HEAD') -Label 'git'
        Run-Git @('switch', 'main')
        Invoke-Tool -Exe $GIT -ArgsList @('branch','-D',$current) -Label 'git'
        $current = 'main'
    }

    if ($current -ne 'main') { throw "not on main (currently $current)" }

    Run-Git @('fetch', 'github', 'main')

    # ============================================================
    # Branch A: 4VD-40
    # ============================================================
    Log "=== Branch A: $branchA ==="
    Run-Git @('switch', '-c', $branchA)

    Apply-DatabaseReferenceEdits
    Build-Changelog -Variant 'A' -EntryFile (Join-Path $bundle 'entry-4vd-40.md') -OutPath (Join-Path $repoRoot 'CHANGELOG.md')
    Log "files generated for branch A"

    Run-Git @('add', 'docs/reference/DATABASE_REFERENCE.md', 'CHANGELOG.md')
    $msgFileA = Join-Path $bundle 'commit-msg-A.txt'
    Run-Git @('commit', '-F', $msgFileA)
    Run-Git @('push', '-u', 'github', $branchA)

    $bodyA = Join-Path $repoRoot 'scripts\pr-4vd-40-body.md'
    Run-Gh @(
        'pr','create',
        '--repo','andreibyf/aishacrm-2',
        '--base','main',
        '--head',$branchA,
        '--title','docs(prod): DocuSeal migrations 159/160/161 applied to prod (4VD-40)',
        '--body-file',$bodyA
    )

    # ============================================================
    # Branch B: 4VD-38
    # ============================================================
    Log "=== Branch B: $branchB ==="
    # Reset working tree changes from branch A's commit, switch back to main, branch B
    Run-Git @('switch', 'main')
    Run-Git @('switch', '-c', $branchB)

    # Copy gitignore.snap -> .gitignore
    Copy-Item -Force (Join-Path $bundle 'gitignore.snap') '.gitignore'
    # backend/__tests__/braid/registry-policy-integration.test.js already exists in working tree (untracked)
    # Build CHANGELOG with 4VD-38 entry as new Security section
    Build-Changelog -Variant 'B' -EntryFile (Join-Path $bundle 'entry-4vd-38.md') -OutPath (Join-Path $repoRoot 'CHANGELOG.md')
    Log "files generated for branch B"

    Run-Git @('add', '.gitignore', 'CHANGELOG.md', 'backend/__tests__/braid/registry-policy-integration.test.js')
    $msgFileB = Join-Path $bundle 'commit-msg-B.txt'
    Run-Git @('commit', '-F', $msgFileB)
    Run-Git @('push', '-u', 'github', $branchB)

    $bodyB = Join-Path $repoRoot 'scripts\pr-4vd-38-body.md'
    Run-Gh @(
        'pr','create',
        '--repo','andreibyf/aishacrm-2',
        '--base','main',
        '--head',$branchB,
        '--title','test(braid): pin .braid @policy <-> TOOL_REGISTRY parity (4VD-38)',
        '--body-file',$bodyB
    )

    Run-Git @('switch', 'main')

    Log "=== DONE - both PRs opened ==="
}
catch {
    Log "ERROR: $_"
    Log $_.ScriptStackTrace
    exit 1
}
