#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$REPO_ROOT" ] && exit 0

PLAN_FILE="$REPO_ROOT/PLAN.md"
TASK_DIR="$REPO_ROOT/tasks"
BRANCH="$(git branch --show-current)"
TASK_FILE="$TASK_DIR/$BRANCH.md"

# Nothing to do if no PLAN
[ -f "$PLAN_FILE" ] || exit 0

COMMIT_MSG_FILE="$1"
COMMIT_MSG="$(cat "$COMMIT_MSG_FILE")"

# Extract step number from commit message
STEP=$(echo "$COMMIT_MSG" | grep -oiE 'step[[:space:]]+[0-9]+' | grep -oE '[0-9]+' | head -n1)

[ -z "${STEP:-}" ] && exit 0

echo "🧠 CARE auto-progress → completing step $STEP"

TMP_FILE=$(mktemp)

awk -v step="$STEP" '
{
  if ($0 ~ "^- \\[ \\] "step"\\.") {
    sub("\\[ \\]", "[x]")
  }
  print
}
' "$PLAN_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$PLAN_FILE"

echo "✔ PLAN.md updated"

# -------------------------------------------------
# Detect if CARE plan is fully complete
# -------------------------------------------------

TOTAL=$(grep -E '^- \[[ x]\] [0-9]+\.' "$PLAN_FILE" | wc -l | tr -d ' ')
DONE=$(grep -E '^- \[x\] [0-9]+\.' "$PLAN_FILE" | wc -l | tr -d ' ')

if [ "$TOTAL" -gt 0 ] && [ "$TOTAL" = "$DONE" ]; then

  echo "🏁 CARE plan complete"

  if [ -f "$TASK_FILE" ]; then

    TMP_TASK=$(mktemp)

    awk '
    BEGIN { done=0 }
    /^## Status/ { print; getline; print "DONE"; done=1; next }
    { print }
    END {
      if(done==0){
        print ""
        print "## Status"
        print "DONE"
      }
    }
    ' "$TASK_FILE" > "$TMP_TASK"

    mv "$TMP_TASK" "$TASK_FILE"

    echo "🎯 Task marked DONE → $BRANCH"

    "$REPO_ROOT/scripts/runtime/auto-pr.sh"

  fi
fi
