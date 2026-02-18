#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$REPO_ROOT" ] && { echo "❌ Not inside a git repo"; exit 1; }

TASK_DIR="$REPO_ROOT/tasks"
MAIN_BRANCH="main"
PLAN_FILE="$REPO_ROOT/PLAN.md"

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

if git merge-base --is-ancestor "$BRANCH" "$MAIN_BRANCH"; then
  echo "✔ Merged into $MAIN_BRANCH"
else
  echo "✖ Not merged"
fi

# --------------------------------------------------
# CARE PROGRESS
# --------------------------------------------------

if [ -f "$PLAN_FILE" ]; then

  IFS="|" read DONE TOTAL NEXT_NUM NEXT_TITLE < \
    <("$REPO_ROOT/scripts/runtime/care-progress.sh" "$PLAN_FILE")

  echo
  echo "📋 CARE Progress"
  echo "Progress : $DONE / $TOTAL"

  if [ "$TOTAL" -gt 0 ]; then
    PERCENT=$((DONE * 100 / TOTAL))
    FILLED=$((PERCENT / 5))
    EMPTY=$((20 - FILLED))

    BAR=$(printf "%0.s█" $(seq 1 $FILLED))
    SPACE=$(printf "%0.s░" $(seq 1 $EMPTY))

    echo "[$BAR$SPACE] $PERCENT%"
  fi

  if [ -n "${NEXT_NUM:-}" ]; then
    echo "Next step: $NEXT_NUM → $NEXT_TITLE"
  else
    echo "✔ All steps complete"
  fi
fi

# --------------------------------------------------
# BACKEND RUNTIME CONTRACT (AUTHORITATIVE)
# --------------------------------------------------

echo
echo "🧪 Backend contract status (authoritative)"

if "$REPO_ROOT/scripts/runtime/test.sh"; then
  echo "✔ Backend runtime healthy"
  TEST_STATUS="PASS"
else
  echo "❌ Backend runtime failing"
  TEST_STATUS="FAIL"
fi

# --------------------------------------------------
# NEXT ACTIONS
# --------------------------------------------------

echo
echo "⚡ Next actions"

case "$STATUS" in

  PLANNED)
    echo "→ Run: ./scripts/start-task.sh"
    ;;

  EXECUTING)

    if [ "${NEXT_NUM:-}" != "" ]; then
      echo "→ Implement CARE step $NEXT_NUM"
    else
      echo "→ All CARE steps implemented"
    fi

    echo "→ Commit atomic change"

    if [ "$TEST_STATUS" = "PASS" ]; then
      echo "→ git push"
    else
      echo "→ Fix backend failures before push"
    fi
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
