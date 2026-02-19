#!/usr/bin/env bash
set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
TASK_DIR="$REPO_ROOT/tasks"
MAIN_BRANCH="main"

cd "$REPO_ROOT"

BRANCH="$(git branch --show-current)"
TASK_FILE="$TASK_DIR/$BRANCH.md"

# If not on a task branch, try to find a FAILED task
if [ ! -f "$TASK_FILE" ]; then
  FAILED_TASK=$(grep -l "^FAILED$" "$TASK_DIR"/*.md 2>/dev/null | head -n1 || true)

  if [ -z "$FAILED_TASK" ]; then
    echo "❌ No FAILED task found."
    exit 1
  fi

  BRANCH=$(basename "$FAILED_TASK" .md)
  TASK_FILE="$FAILED_TASK"

  echo "🔁 Switching to failed task branch: $BRANCH"
  git switch "$BRANCH"
fi

CURRENT_STATUS=$(grep -m1 "^## Status" -A1 "$TASK_FILE" | tail -n1 | tr -d '\r')

if [ "$CURRENT_STATUS" != "FAILED" ]; then
  echo "❌ Task is not in FAILED state."
  exit 1
fi

# Reset status → EXECUTING
sed -i 's/^FAILED$/EXECUTING/' "$TASK_FILE"

echo "✅ Task moved FAILED → EXECUTING"

# Open task and plan if VS Code is available
if command -v code >/dev/null 2>&1; then
  code "$TASK_FILE" 2>/dev/null || true
  [ -f "$REPO_ROOT/PLAN.md" ] && code "$REPO_ROOT/PLAN.md" 2>/dev/null || true
fi

echo
echo "🚀 Ready for execution on branch: $BRANCH"
