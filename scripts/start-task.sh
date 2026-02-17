#!/usr/bin/env bash
set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
TASK_DIR="$REPO_ROOT/tasks"
MAIN_BRANCH="main"

cd "$REPO_ROOT"

CURRENT_BRANCH="$(git branch --show-current)"

# If already on a task branch, just mark EXECUTING
if [ -f "$TASK_DIR/$CURRENT_BRANCH.md" ]; then
  sed -i 's/^PLANNED$/EXECUTING/' "$TASK_DIR/$CURRENT_BRANCH.md" 2>/dev/null || true
  echo "▶ Already on task branch → EXECUTING"
else
  echo "🔎 Searching for PLANNED tasks..."

  mapfile -t TASKS < <(grep -l "^PLANNED$" "$TASK_DIR"/*.md 2>/dev/null || true)

  if [ ${#TASKS[@]} -eq 0 ]; then
    echo "❌ No PLANNED tasks found."
    exit 1
  fi

  if [ ${#TASKS[@]} -eq 1 ]; then
    TASK_FILE="${TASKS[0]}"
  else
    echo
    echo "Select a task to start:"
    select TASK_FILE in "${TASKS[@]}"; do
      [ -n "$TASK_FILE" ] && break
    done
  fi

  BRANCH="$(basename "$TASK_FILE" .md)"

  echo "🌿 Switching to: $BRANCH"
  git switch "$BRANCH"

  sed -i 's/^PLANNED$/EXECUTING/' "$TASK_FILE"
fi

TASK_FILE="$TASK_DIR/$(git branch --show-current).md"

echo "✅ Task is now EXECUTING"

# Open files in VS Code if available
if command -v code >/dev/null 2>&1; then
  code "$TASK_FILE" 2>/dev/null || true
  [ -f "$REPO_ROOT/PLAN.md" ] && code "$REPO_ROOT/PLAN.md" 2>/dev/null || true
fi

echo
"$REPO_ROOT/scripts/list-tasks.sh"
