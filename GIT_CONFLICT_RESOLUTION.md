# Git Conflict Resolution Guide

## Problem
When trying to pull a branch (e.g., `chore/codeql-ignore-functions`), you encounter:
```
error: Pulling is not possible because you have unmerged files.
hint: Fix them up in the work tree, and then use 'git add/rm <file>'
hint: as appropriate to mark resolution and make a commit.
fatal: Exiting because of an unresolved conflict.
```

## Quick Fix

### Option 1: Abort the Merge (Start Fresh)
If you want to abandon the merge and start over:

```bash
# Abort any merge in progress
git merge --abort

# Or reset to clean state
git reset --hard HEAD

# Clean untracked files
git clean -fd

# Now you can pull again
git pull --tags origin chore/codeql-ignore-functions
```

### Option 2: Resolve Conflicts
If you want to keep your changes and resolve conflicts:

```bash
# Check which files have conflicts
git status

# View conflicting files
git diff --name-only --diff-filter=U

# For each conflicting file, edit and resolve markers:
# <<<<<<< HEAD
# Your changes
# =======
# Incoming changes
# >>>>>>> branch-name

# After resolving, stage the files
git add <resolved-file>

# Complete the merge
git commit -m "Resolved merge conflicts"
```

### Option 3: Use Theirs (Accept All Incoming Changes)
If you want to completely accept the incoming branch's version:

```bash
# For specific files
git checkout --theirs <file>
git add <file>

# Or for all conflicts
git checkout --theirs .
git add .
git commit -m "Accepted incoming changes"
```

### Option 4: Use Ours (Keep Your Changes)
If you want to keep your local version:

```bash
# For specific files
git checkout --ours <file>
git add <file>

# Or for all conflicts
git checkout --ours .
git add .
git commit -m "Kept local changes"
```

## Branch Cleanup

### List All Branches
```bash
# Local branches
git branch

# Remote branches
git branch -r

# All branches
git branch -a
```

### Delete Local Branches
```bash
# Delete merged branch (safe)
git branch -d branch-name

# Force delete (even if not merged)
git branch -D branch-name

# Delete multiple branches
git branch -D copilot/branch1 copilot/branch2
```

### Delete Remote Branches
```bash
# Delete remote branch
git push origin --delete branch-name

# Or using the colon syntax
git push origin :branch-name
```

### Prune Stale Remote References
```bash
# Remove references to deleted remote branches
git fetch --prune
git remote prune origin
```

## Preventing Conflicts

### Best Practices
1. **Pull before making changes**: Always sync before starting work
   ```bash
   git pull origin main
   ```

2. **Commit or stash before pulling**: Don't pull with uncommitted changes
   ```bash
   git stash
   git pull
   git stash pop
   ```

3. **Use rebase for cleaner history** (advanced):
   ```bash
   git pull --rebase origin main
   ```

4. **Check status frequently**:
   ```bash
   git status
   ```

## Common Scenarios

### Scenario 1: "I just want to get the latest code"
```bash
git fetch origin
git reset --hard origin/main
```
⚠️ **Warning**: This discards all local changes!

### Scenario 2: "I have local changes I want to keep"
```bash
git stash
git pull origin main
git stash pop
# Resolve any conflicts in stashed changes
```

### Scenario 3: "My branch is way behind main"
```bash
git checkout my-branch
git fetch origin
git rebase origin/main
# Resolve conflicts as they appear
```

### Scenario 4: "I messed everything up, start over"
```bash
# Save your work first (optional)
git stash

# Reset to match remote exactly
git fetch origin
git reset --hard origin/main

# If you stashed, decide later
git stash list
git stash pop  # or git stash drop
```

## Using the Cleanup Script

A helper script `cleanup-branches.ps1` is available in the repository:

```powershell
# Run the cleanup script
.\cleanup-branches.ps1

# Or on Unix/Mac
bash cleanup-branches.sh
```

This script will:
- Show all local branches
- Help you delete stale branches
- Prune remote references
- Clean up your git workspace

## Need More Help?

1. Check current state: `git status`
2. View recent commits: `git log --oneline -10`
3. See branch relationships: `git log --oneline --graph --all -20`
4. Get out of trouble: `git reflog` (shows history of HEAD positions)
5. **Step-by-step walkthrough**: See [EXAMPLE_CONFLICT_RESOLUTION.md](./EXAMPLE_CONFLICT_RESOLUTION.md)
6. **Quick commands**: See [GIT_QUICK_REFERENCE.md](./GIT_QUICK_REFERENCE.md)

## Emergency Recovery

If you accidentally deleted important changes:

```bash
# Find your lost commit
git reflog

# Create a branch from that commit
git checkout -b recovery-branch <commit-hash>
```

Remember: Git rarely loses data permanently if you've committed it!
