#!/bin/bash
# Script to commit and push mobile-responsive changes
cd /c/Users/andre/Documents/GitHub/aishacrm-2

LOG=/c/Users/andre/Documents/GitHub/aishacrm-2/scripts/push-log.txt

echo "=== Git Push Script ===" > "$LOG"
echo "Date: $(date)" >> "$LOG"
echo "" >> "$LOG"

# Check current branch
echo "Branch: $(git branch --show-current)" >> "$LOG"
echo "Status:" >> "$LOG"
git status -s >> "$LOG" 2>&1
echo "" >> "$LOG"

# Stage all changes
git add -A >> "$LOG" 2>&1
echo "Staged all changes" >> "$LOG"

# Commit (skip hooks to avoid terminal interaction issues)
git commit -m "feat(mobile): make header and AiSHA sidebar mobile-responsive

- Header: responsive padding, overflow-x-auto for controls, hide TenantSwitcher/EmployeeScopeFilter/NotificationPanel on small screens
- AiSidebar: full-width (100vw/100dvh) on screens < 1024px, responsive inner padding
- AiAssistantLauncher: hide text labels on mobile, show avatar-only
- UserNav: add compact prop for avatar-only mode on xs breakpoints
- vitest.config: fix React plugin per workspace, switch pool to threads
- Tests: add missing React import for AiSidebar test files" >> "$LOG" 2>&1
echo "" >> "$LOG"
echo "Commit exit code: $?" >> "$LOG"

# Push to remote
git push origin HEAD >> "$LOG" 2>&1
echo "" >> "$LOG"
echo "Push exit code: $?" >> "$LOG"

echo "" >> "$LOG"
echo "=== Done ===" >> "$LOG"
