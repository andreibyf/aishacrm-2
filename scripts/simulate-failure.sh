#!/usr/bin/env bash
set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
TASK_DIR="$REPO_ROOT/tasks"
BRANCH="$(git branch --show-current)"
TASK_FILE="$TASK_DIR/$BRANCH.md"

if [ ! -f "$TASK_FILE" ]; then
  echo "❌ No task file found for current branch: $BRANCH"
  exit 1
fi

sed -i 's/^EXECUTING$/FAILED/' "$TASK_FILE" 2>/dev/null || true
sed -i 's/^PLANNED$/FAILED/' "$TASK_FILE" 2>/dev/null || true

echo "⚠️ Simulated failure → task marked FAILED"
