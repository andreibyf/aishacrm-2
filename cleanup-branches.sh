#!/bin/bash
# Branch Cleanup Helper Script
# Helps clean up local and remote branches safely

# Note: Not using 'set -e' to allow graceful handling of expected failures

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo -e "${CYAN}=== Git Branch Cleanup Helper ===${NC}"
echo ""

# Function to prompt for yes/no
confirm() {
    local message=$1
    read -p "$message (y/n) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository!${NC}"
    exit 1
fi

# Get current branch
current_branch=$(git branch --show-current)
echo -e "${GREEN}Current branch: $current_branch${NC}"
echo ""

# Detect default branch (main, master, etc.)
default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
if [ -z "$default_branch" ]; then
    # Fallback to common names if symbolic-ref fails
    if git show-ref --verify --quiet refs/remotes/origin/main; then
        default_branch="main"
    elif git show-ref --verify --quiet refs/remotes/origin/master; then
        default_branch="master"
    else
        default_branch="main"  # Last resort default
    fi
fi
echo -e "${GREEN}Default branch: $default_branch${NC}"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes!${NC}"
    git status --short
    echo ""
    
    if confirm "Do you want to stash these changes?"; then
        echo -e "${CYAN}Stashing changes...${NC}"
        git stash push -m "Cleanup script auto-stash $(date '+%Y-%m-%d %H:%M:%S')"
        echo -e "${GREEN}✓ Changes stashed. Use 'git stash pop' to restore them.${NC}"
        echo ""
    fi
fi

# Check for merge conflicts
if git ls-files -u | grep -q .; then
    echo -e "${RED}❌ Active merge conflicts detected:${NC}"
    git diff --name-only --diff-filter=U | while read -r file; do
        echo -e "${YELLOW}  $file${NC}"
    done
    echo ""
    
    if confirm "Do you want to abort the merge?"; then
        echo -e "${CYAN}Aborting merge...${NC}"
        git merge --abort
        echo -e "${GREEN}✓ Merge aborted.${NC}"
    else
        echo -e "${YELLOW}Please resolve conflicts manually. See GIT_CONFLICT_RESOLUTION.md for help.${NC}"
        exit 0
    fi
    echo ""
fi

# Show local branches
echo -e "${CYAN}=== Local Branches ===${NC}"
while IFS= read -r line; do
    if [[ $line == \** ]]; then
        echo -e "${GREEN}$line${NC}"
    else
        echo -e "  $line"
    fi
done < <(git branch)
echo ""

# Offer to delete merged branches
echo -e "${CYAN}=== Branches Merged into $default_branch ===${NC}"
merged_branches=$(git branch --merged "$default_branch" | grep -v "^\*" | grep -v "$default_branch" | sed 's/^[[:space:]]*//')
if [ -n "$merged_branches" ]; then
    echo "$merged_branches" | while read -r branch; do
        echo -e "${GRAY}  $branch${NC}"
    done
    echo ""
    
    if confirm "Delete these merged branches?"; then
        echo "$merged_branches" | while read -r branch; do
            echo -e "${YELLOW}Deleting $branch...${NC}"
            if git branch -d "$branch" 2>/dev/null; then
                echo -e "${GREEN}✓ Deleted $branch${NC}"
            else
                echo -e "${RED}✗ Failed to delete $branch${NC}"
            fi
        done
    fi
    echo ""
else
    echo -e "${GRAY}  No merged branches found.${NC}"
    echo ""
fi

# Show branches that might be stale
echo -e "${CYAN}=== Copilot Branches (may be stale) ===${NC}"
copilot_branches=$(git branch | grep "copilot/" | grep -v "^\*" | sed 's/^[[:space:]]*//')
if [ -n "$copilot_branches" ]; then
    echo "$copilot_branches" | while read -r branch; do
        echo -e "${GRAY}  $branch${NC}"
    done
    echo ""
    
    if confirm "Delete all copilot/* branches (except current)?"; then
        echo "$copilot_branches" | while read -r branch; do
            echo -e "${YELLOW}Deleting $branch...${NC}"
            if git branch -D "$branch" 2>/dev/null; then
                echo -e "${GREEN}✓ Deleted $branch${NC}"
            else
                echo -e "${RED}✗ Failed to delete $branch${NC}"
            fi
        done
    fi
    echo ""
else
    echo -e "${GRAY}  No copilot branches found.${NC}"
    echo ""
fi

# Prune remote references
echo -e "${CYAN}=== Remote Branch Cleanup ===${NC}"
if confirm "Prune stale remote-tracking branches?"; then
    echo -e "${CYAN}Pruning remote references...${NC}"
    git fetch --prune
    git remote prune origin
    echo -e "${GREEN}✓ Remote references pruned.${NC}"
fi
echo ""

# Clean untracked files
untracked_files=$(git ls-files --others --exclude-standard)
if [ -n "$untracked_files" ]; then
    echo -e "${CYAN}=== Untracked Files ===${NC}"
    echo "$untracked_files" | head -10 | while read -r file; do
        echo -e "${GRAY}  $file${NC}"
    done
    untracked_count=$(echo "$untracked_files" | wc -l)
    if [ "$untracked_count" -gt 10 ]; then
        echo -e "${GRAY}  ... and $((untracked_count - 10)) more${NC}"
    fi
    echo ""
    
    if confirm "Remove all untracked files?"; then
        echo -e "${YELLOW}⚠️  This will permanently delete untracked files!${NC}"
        if confirm "Are you sure?"; then
            git clean -fd
            echo -e "${GREEN}✓ Untracked files removed.${NC}"
        fi
    fi
    echo ""
fi

# Final status
echo -e "${CYAN}=== Final Status ===${NC}"
git status
echo ""

echo -e "${GREEN}=== Cleanup Complete ===${NC}"
echo -e "${CYAN}Current branch: $current_branch${NC}"
echo -e "${CYAN}Remaining local branches:${NC}"
git branch
echo ""

echo -e "${BLUE}💡 Tip: See GIT_CONFLICT_RESOLUTION.md for more git help!${NC}"
