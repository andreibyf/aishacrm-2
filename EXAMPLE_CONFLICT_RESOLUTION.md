# Example: Resolving a Merge Conflict

This is a step-by-step walkthrough of resolving a common merge conflict scenario.

## Scenario

You're trying to pull the `chore/codeql-ignore-functions` branch but get:

```bash
$ git pull --tags origin chore/codeql-ignore-functions
error: Pulling is not possible because you have unmerged files.
hint: Fix them up in the work tree, and then use 'git add/rm <file>'
hint: as appropriate to mark resolution and make a commit.
fatal: Exiting because of an unresolved conflict.
```

## Solution Steps

### Step 1: Assess the Situation

First, check what's actually happening:

```bash
git status
```

**Example output:**
```
On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  (use "git add <file>..." to mark resolution)
    both modified:   README.md
    both modified:   package.json
```

### Step 2: Choose Your Approach

You have three main options:

#### Option A: Start Fresh (Easiest)
If you don't care about your local changes:

```bash
# Abort the merge
git merge --abort

# Clean your working directory
git reset --hard HEAD
git clean -fd

# Now try the pull again
git pull origin chore/codeql-ignore-functions
```

#### Option B: Accept All Their Changes
If you want everything from the remote branch:

```bash
# Accept their version for all conflicts
git checkout --theirs .
git add .
git commit -m "Resolved conflicts by accepting incoming changes"
```

#### Option C: Resolve Manually
If you need to carefully merge changes:

```bash
# Continue to Step 3
```

### Step 3: Manual Conflict Resolution

If you chose Option C, let's resolve conflicts manually.

#### View Conflicting Files

```bash
# List files with conflicts
git diff --name-only --diff-filter=U
```

**Example output:**
```
README.md
package.json
```

#### Open a Conflicting File

Open `README.md` in your editor. You'll see conflict markers:

```markdown
# Aisha CRM

<<<<<<< HEAD
**Your Independent CRM System** - Built with React
=======
**Your Independent CRM System** - Built with React + Vite
>>>>>>> chore/codeql-ignore-functions

## Features
```

The parts are:
- `<<<<<<< HEAD` - Your local version starts here
- `=======` - Separator between versions
- `>>>>>>> chore/codeql-ignore-functions` - Their version ends here

#### Resolve the Conflict

Edit the file to keep what you want. Remove the conflict markers:

**Before:**
```markdown
<<<<<<< HEAD
**Your Independent CRM System** - Built with React
=======
**Your Independent CRM System** - Built with React + Vite
>>>>>>> chore/codeql-ignore-functions
```

**After (keeping both):**
```markdown
**Your Independent CRM System** - Built with React + Vite
```

#### Mark as Resolved

```bash
# Stage the resolved file
git add README.md

# Check status
git status
```

**Output:**
```
On branch main
All conflicts fixed but you are still merging.
  (use "git commit" to conclude merge)

Changes to be committed:
    modified:   README.md
    modified:   package.json (still has conflicts)
```

#### Repeat for All Conflicting Files

Resolve `package.json` the same way:

```bash
# Edit package.json
# Remove conflict markers
# Save file

# Stage it
git add package.json
```

### Step 4: Complete the Merge

Once all conflicts are resolved:

```bash
# Check that all conflicts are resolved
git status

# Should show: "All conflicts fixed but you are still merging"

# Complete the merge
git commit -m "Resolved merge conflicts between main and chore/codeql-ignore-functions"
```

### Step 5: Verify

```bash
# Check that everything is clean
git status

# View the result
git log --oneline -3

# Test your application
npm run dev
```

## Using the Cleanup Script

Instead of manual steps, you can use our helper script:

```bash
# PowerShell
.\cleanup-branches.ps1

# Bash
./cleanup-branches.sh
```

The script will:
1. Detect the merge conflict
2. Ask if you want to abort
3. Clean up the repository
4. Help you start fresh

## Prevention Tips

### 1. Always Pull Before Starting Work

```bash
git pull origin main
```

### 2. Commit or Stash Before Pulling

```bash
# Option A: Commit your work
git add .
git commit -m "WIP: My changes"
git pull origin main

# Option B: Stash your work
git stash
git pull origin main
git stash pop
```

### 3. Use Feature Branches

```bash
# Create a new branch for your work
git checkout -b feature/my-feature

# Work on your feature
git add .
git commit -m "Add my feature"

# When ready to merge
git checkout main
git pull origin main
git merge feature/my-feature
```

### 4. Keep Your Branch Updated

```bash
# While on your feature branch
git fetch origin
git merge origin/main

# Or with rebase (cleaner)
git rebase origin/main
```

## Common Mistakes to Avoid

### ❌ Don't Do This:

```bash
# Pulling with uncommitted changes
git pull  # BAD if you have local changes
```

### ✅ Do This Instead:

```bash
# Stash first, then pull
git stash
git pull
git stash pop
```

### ❌ Don't Do This:

```bash
# Committing conflict markers
git add .
git commit -m "Fixed conflicts"  # Without actually removing <<<< ==== >>>>
```

### ✅ Do This Instead:

```bash
# Remove all conflict markers first
# Then stage and commit
git add <file>
git commit -m "Resolved conflicts in <file>"
```

## Getting Help

If you're stuck:

1. **Check the guides:**
   - [GIT_CONFLICT_RESOLUTION.md](./GIT_CONFLICT_RESOLUTION.md) - Comprehensive guide
   - [GIT_QUICK_REFERENCE.md](./GIT_QUICK_REFERENCE.md) - Quick commands

2. **Run the cleanup script:**
   ```bash
   .\cleanup-branches.ps1  # PowerShell
   ./cleanup-branches.sh   # Bash
   ```

3. **Emergency reset (last resort):**
   ```bash
   # ⚠️ WARNING: Loses all local changes!
   git fetch origin
   git reset --hard origin/main
   git clean -fd
   ```

4. **Check reflog (if you deleted something important):**
   ```bash
   git reflog
   git checkout -b recovery <commit-hash>
   ```

## Real-World Example

Let's say you have this conflict in `package.json`:

```json
{
  "name": "aishacrm",
<<<<<<< HEAD
  "version": "1.0.0",
=======
  "version": "1.1.0",
>>>>>>> chore/codeql-ignore-functions
  "scripts": {
    "dev": "vite"
  }
}
```

**Resolution steps:**

1. Decide which version number to keep (or both if semantic)
2. Remove conflict markers
3. Save file
4. Stage and commit

**Result:**
```json
{
  "name": "aishacrm",
  "version": "1.1.0",
  "scripts": {
    "dev": "vite"
  }
}
```

```bash
git add package.json
git commit -m "Resolved version conflict, using 1.1.0"
```

---

**Remember:** Git rarely loses committed data. When in doubt, create a backup branch before trying destructive operations:

```bash
git branch backup-$(date +%Y%m%d-%H%M%S)
```
