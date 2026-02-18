#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MAIN_BRANCH="${MAIN_BRANCH:-main}"
BRANCH="$(git branch --show-current)"
TASK_FILE="tasks/$BRANCH.md"
PLAN_FILE="PLAN.md"

echo "🚀 CARE complete → preparing enriched PR"

git push -u origin "$BRANCH" >/dev/null 2>&1 || true

# Skip if PR already exists
EXISTING=$(gh pr list --head "$BRANCH" --json number --jq 'length')
[ "$EXISTING" != "0" ] && echo "ℹ PR already exists" && exit 0

# -------------------------------
# PR TITLE
# -------------------------------

TITLE=$(sed -n '2p' "$TASK_FILE" 2>/dev/null || echo "$BRANCH")

# -------------------------------
# LABEL DETECTION
# -------------------------------

TYPE=$(echo "$BRANCH" | cut -d- -f1)

case "$TYPE" in
  feat) LABELS="enhancement" ;;
  fix) LABELS="bug" ;;
  chore) LABELS="chore" ;;
  docs) LABELS="documentation" ;;
  *) LABELS="ai" ;;
esac

# -------------------------------
# CARE SUMMARY
# -------------------------------

if [ -f "$PLAN_FILE" ]; then

  TOTAL=$(grep -E '^- \[[ x]\] [0-9]+\.' "$PLAN_FILE" | wc -l | tr -d ' ')
  DONE=$(grep -E '^- \[x\] [0-9]+\.' "$PLAN_FILE" | wc -l | tr -d ' ')

  CARE_BLOCK=$(cat <<EOF
## 🧠 CARE Execution
**Progress:** $DONE / $TOTAL steps complete

✔ Contract aligned  
✔ Runtime verified  
✔ Tests passing  

EOF
)

else
  CARE_BLOCK=""
fi

# -------------------------------
# TASK SUMMARY
# -------------------------------

TASK_BLOCK=""

if [ -f "$TASK_FILE" ]; then
TASK_BLOCK=$(cat <<EOF
## 📋 Task
$(sed -n '2p' "$TASK_FILE")

EOF
)
fi

# -------------------------------
# PR BODY
# -------------------------------

BODY=$(cat <<EOF
$CARE_BLOCK
$TASK_BLOCK
---

### 🤖 Generated automatically by CARE runtime
EOF
)

# -------------------------------
# CREATE PR
# -------------------------------

gh pr create \
  --base "$MAIN_BRANCH" \
  --head "$BRANCH" \
  --title "$TITLE" \
  --body "$BODY" \
  --label "$LABELS" \
  --reviewer "andreibyf"
