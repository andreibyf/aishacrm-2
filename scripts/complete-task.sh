#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TASK_DIR="$REPO_ROOT/tasks"

cd "$REPO_ROOT"

BRANCH="$(git branch --show-current)"
TASK_FILE="$TASK_DIR/$BRANCH.md"

if [ ! -f "$TASK_FILE" ]; then
  echo "❌ No task file for current branch: $BRANCH"
  exit 1
fi

# Update status
awk '
BEGIN {found=0}
/^## Status/ {print; getline; print "DONE"; found=1; next}
{print}
END {if(!found) print "## Status\nDONE"}
' "$TASK_FILE" > "$TASK_FILE.tmp"

mv "$TASK_FILE.tmp" "$TASK_FILE"

echo "✅ Task marked DONE: $BRANCH"
