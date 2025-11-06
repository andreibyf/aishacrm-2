# Git Quick Reference Card

## 🆘 Having Merge Conflicts?

### Most Common Solution
```bash
# Abort the merge and start fresh
git merge --abort
git reset --hard HEAD
git pull origin <branch-name>
```

### Quick Fix for "Can't Pull" Error
```bash
# Option 1: Start completely fresh (loses local changes)
git fetch origin
git reset --hard origin/main

# Option 2: Save your work first
git stash
git pull origin main
git stash pop
```

## 🧹 Branch Cleanup

### Automated Cleanup
```bash
# PowerShell
.\cleanup-branches.ps1

# Bash/Linux/Mac
./cleanup-branches.sh
```

### Manual Cleanup
```bash
# Delete merged local branches
git branch --merged main | grep -v "main" | xargs git branch -d

# Delete specific branch
git branch -D branch-name

# Prune remote references
git fetch --prune
git remote prune origin
```

## 📊 Check Your Status

### What's Going On?
```bash
# Current status
git status

# See all branches
git branch -a

# View recent commits
git log --oneline --graph --all -10

# Check for conflicts
git diff --name-only --diff-filter=U
```

## 🔄 Syncing with Remote

### Update Your Branch
```bash
# Simple update
git pull origin main

# With rebase (cleaner history)
git pull --rebase origin main

# Just fetch, don't merge yet
git fetch origin
```

## 💾 Save Your Work

### Stashing
```bash
# Save current changes
git stash

# List stashes
git stash list

# Restore last stash
git stash pop

# Restore specific stash
git stash apply stash@{0}

# Delete a stash
git stash drop stash@{0}
```

## 🚨 Emergency Recovery

### Undo Last Commit (Keep Changes)
```bash
git reset --soft HEAD~1
```

### Undo Last Commit (Discard Changes)
```bash
git reset --hard HEAD~1
```

### Recover Deleted Branch/Commit
```bash
# Find the commit
git reflog

# Create branch from it
git checkout -b recovered-branch <commit-hash>
```

### Discard All Local Changes
```bash
# ⚠️ WARNING: This cannot be undone!
git reset --hard HEAD
git clean -fd
```

## 🎯 Common Workflows

### Feature Branch Workflow
```bash
# Create and switch to new branch
git checkout -b feature/my-feature

# Make changes, then commit
git add .
git commit -m "Add my feature"

# Push to remote
git push origin feature/my-feature

# Update from main
git checkout main
git pull origin main
git checkout feature/my-feature
git merge main
```

### Fix Merge Conflicts
```bash
# When you see conflicts
git status  # See conflicted files

# Edit files to resolve conflicts (remove markers)
# Then:
git add <resolved-file>
git commit -m "Resolved merge conflicts"
```

### Clean Slate Reset
```bash
# ⚠️ Nuclear option - destroys all local changes
git fetch origin
git checkout main
git reset --hard origin/main
git clean -fd
```

## 📖 Need More Help?

- **Detailed Guide**: See `GIT_CONFLICT_RESOLUTION.md`
- **Cleanup Script**: Run `.\cleanup-branches.ps1` or `./cleanup-branches.sh`
- **Development Guide**: See `DEV_QUICK_START.md`
- **Terminal Rules**: See `TERMINAL_RULES.md`

## 🔍 Diagnostic Commands

```bash
# Where am I?
git branch --show-current

# What changed?
git status
git diff

# What's different from main?
git diff main

# Who changed what?
git blame <file>

# When did this happen?
git log --since="2 days ago" --oneline

# Is something stuck?
git fsck
```

## ⚙️ Configuration Tips

### Set Your Identity
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Useful Aliases
```bash
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
```

### Better Diff
```bash
git config --global diff.tool vimdiff
git config --global merge.tool vimdiff
```

---

**💡 Pro Tip**: Before any destructive operation (like `reset --hard`), create a backup branch:
```bash
git branch backup-$(date +%Y%m%d-%H%M%S)
```
