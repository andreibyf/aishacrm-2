#!/usr/bin/env bash
set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
TASK_DIR="$REPO_ROOT/tasks"
MAIN_BRANCH="main"

cd "$REPO_ROOT"

BRANCH="$(git branch --show-current)"
TASK_FILE="$TASK_DIR/$BRANCH.md"

echo
echo "🧠 CURRENT TASK"
echo "────────────────────────────────────────"

if [ ! -f "$TASK_FILE" ]; then
  echo "❌ No task mapped to current branch: $BRANCH"
  exit 1
fi

TITLE=$(sed -n '2p' "$TASK_FILE")
STATUS=$(grep -m1 "^## Status" -A1 "$TASK_FILE" | tail -n1 | tr -d '\r')
UPDATED=$(date -r "$TASK_FILE" +"%Y-%m-%d %H:%M")

echo "Title   : $TITLE"
echo "Branch  : $BRANCH"
echo "Status  : $STATUS"
echo "Updated : $UPDATED"

echo
echo "📦 Last commits on this branch"
git --no-pager log -5 --oneline

echo
echo "🔀 Merge state vs $MAIN_BRANCH"

if git branch --merged "$MAIN_BRANCH" | grep -q "$BRANCH"; then
  echo "✔ Merged into $MAIN_BRANCH"
else
  echo "✖ Not merged"
fi

echo
echo "🧪 Vitest status (affected tests, devcontainer)"

if "$REPO_ROOT/scripts/runtime/test.sh" >/dev/null 2>&1; then
  echo "✔ Tests passing"
else
  echo "❌ Tests failing"
fi

echo
echo "⚡ Next actions"

case "$STATUS" in
  PLANNED)
    echo "→ Run: ./scripts/start-task.sh"
    ;;
  EXECUTING)
    echo "→ Implement with Copilot"
    echo "→ git push"
    ;;
  FAILED)
    echo "→ Run: ./scripts/retry-task.sh"
    ;;
  DONE)
    echo "→ Task complete"
    ;;
  *)
    echo "→ No guidance"
    ;;
esac

echo
