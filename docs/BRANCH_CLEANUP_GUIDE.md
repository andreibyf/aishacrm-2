# Branch Cleanup Guide

This guide explains how to clean up stale merged branches in the repository.

## Background

The repository has two branch cleanup mechanisms:

1. **Automatic Cleanup** (since PR #203, Feb 17, 2026)
   - Automatically deletes branches when PRs are merged
   - Runs via GitHub Actions workflow `cleanup-merged-branches.yml`
   - Only applies to branches merged AFTER Feb 17, 2026

2. **Manual Cleanup** (this guide)
   - One-time cleanup for branches merged BEFORE the auto-delete workflow
   - Must be triggered manually
   - Safe with dry-run mode

## Quick Start: Clean Up Stale Branches

### Step 1: Preview (Dry Run - Recommended First)

1. Go to **Actions** tab in GitHub
2. Select **Manual Stale Branch Cleanup** workflow
3. Click **Run workflow** button
4. Configure inputs:
   - `dry_run`: **true** (preview only)
   - `target_branch`: **main** (or leave default)
   - `skip_branches`: (optional, comma-separated list)
5. Click **Run workflow**
6. Wait for completion (~1-2 minutes)
7. Review the workflow summary to see which branches would be deleted

### Step 2: Delete Branches (Live Mode)

⚠️ **Warning**: This will permanently delete merged branches from GitHub!

1. After reviewing the dry-run results, if satisfied:
2. Go to **Actions** → **Manual Stale Branch Cleanup**
3. Click **Run workflow**
4. Configure inputs:
   - `dry_run`: **false** (live deletion)
   - `target_branch`: **main**
   - `skip_branches`: (add any branches you want to preserve)
5. Click **Run workflow**
6. Wait for completion
7. Review the summary to confirm deletions

## Workflow Inputs

### dry_run (required)
- **Type**: Boolean
- **Default**: `true`
- **Description**: When `true`, only previews what would be deleted. When `false`, actually deletes branches.
- **Recommendation**: Always run with `true` first to preview changes.

### target_branch (optional)
- **Type**: String
- **Default**: `main`
- **Description**: The branch to check merges against. Only branches fully merged into this branch will be deleted.
- **Example**: `main`, `develop`, `production`

### skip_branches (optional)
- **Type**: String (comma-separated)
- **Default**: (empty)
- **Description**: Additional branches to protect from deletion, beyond the default protected list.
- **Example**: `feature/important,experimental-branch`

## Protected Branches

The following branches are **always** protected and will never be deleted:

- `main`
- `master`
- `develop`
- `production`
- `staging`
- The `target_branch` (if different from above)
- Any branches listed in `skip_branches` input

## How It Works

### Merge Detection

A branch is considered "merged" if the GitHub API comparison shows:

- **Status: "identical"** - Branch has exact same commits as target
- **Status: "behind"** - Target branch has all commits from the branch

Branches with status "ahead" or "diverged" are **NOT** deleted (they have unmerged commits).

### Branch Processing

1. Fetch all remote branches (with pagination for large repos)
2. Filter out protected branches
3. For each candidate branch:
   - Compare with target branch using GitHub API
   - Classify as merged/unmerged/error
4. In dry-run mode: Display what would be deleted
5. In live mode: Delete merged branches

### Safety Features

- ✅ Default dry-run mode prevents accidental deletions
- ✅ Protected branches list
- ✅ Merge status verification before deletion
- ✅ Detailed logging and summary
- ✅ Error handling (continues if one branch fails)
- ✅ Pagination support for large repositories

## Workflow Summary

After running the workflow, you'll see a detailed summary including:

### Summary Section
- Total branches found
- Protected branches (skipped)
- Candidates checked
- Merged branches count
- Unmerged branches count (skipped)
- Errors count

### Merged Branches Section
Lists all merged branches with:
- ✅ Successfully deleted (live mode)
- ❌ Failed to delete with error (live mode)
- 🧪 Would delete (dry-run mode)

### Unmerged Branches Section
Lists branches with unmerged commits that were skipped:
- Branch name
- Comparison status (ahead/diverged)
- Number of commits ahead/behind

### Errors Section
Lists any branches that couldn't be checked due to errors.

## Example Scenarios

### Scenario 1: Clean up all merged copilot branches

```
# Step 1: Dry run preview
Inputs:
- dry_run: true
- target_branch: main
- skip_branches: (empty)

# Review results, then:

# Step 2: Delete
Inputs:
- dry_run: false
- target_branch: main
- skip_branches: (empty)
```

### Scenario 2: Clean up but preserve specific branches

```
Inputs:
- dry_run: false
- target_branch: main
- skip_branches: copilot/important-feature,experimental-ai
```

### Scenario 3: Clean up branches merged into develop

```
Inputs:
- dry_run: false
- target_branch: develop
- skip_branches: (empty)
```

## Local Cleanup Scripts

For local branch cleanup (your local git repository), use these scripts:

### Linux/Mac
```bash
./scripts/maintenance/cleanup-branches.sh
```

### Windows PowerShell
```powershell
.\scripts\maintenance\cleanup-branches.ps1
```

These scripts provide interactive prompts for:
- Deleting local merged branches
- Pruning remote tracking branches
- Cleaning untracked files
- Handling merge conflicts

## Troubleshooting

### Workflow fails with "Resource not accessible by integration"
- Ensure the workflow has `contents: write` permission
- Check repository settings → Actions → General → Workflow permissions

### Branch marked as unmerged but I know it's merged
- Check if there are any additional commits on the branch after merge
- Verify the branch was merged via PR (not cherry-picked)
- Try comparing manually: GitHub → Compare → `main...branch-name`

### Want to restore a deleted branch
1. Find the commit SHA from PR or Actions logs
2. Create new branch: `git checkout -b branch-name <commit-sha>`
3. Push: `git push origin branch-name`

### Too many branches to review in dry-run
- Use pagination in the workflow logs
- Filter by prefix using `skip_branches` to exclude certain patterns
- Run multiple times with different `target_branch` values

## Best Practices

1. **Always dry-run first**: Never skip the preview step
2. **Review the summary**: Check the list of branches to be deleted
3. **Preserve important work**: Use `skip_branches` for any branch you might need
4. **Regular cleanups**: Run this workflow periodically (monthly/quarterly)
5. **Coordinate with team**: Announce before running to avoid surprises

## Related Documentation

- [cleanup-merged-branches.yml](../.github/workflows/cleanup-merged-branches.yml) - Automatic cleanup workflow
- [scripts/maintenance/cleanup-branches.sh](../scripts/maintenance/cleanup-branches.sh) - Local cleanup script
- [GitHub Actions Docs](https://docs.github.com/en/actions) - General workflow documentation

## Support

If you encounter issues or have questions:

1. Check the workflow run logs in GitHub Actions
2. Review the summary for error details
3. Verify branch protection settings
4. Contact the repository maintainers

---

**Last Updated**: Feb 19, 2026
**Related PR**: #203 (Auto-delete workflow implementation)
