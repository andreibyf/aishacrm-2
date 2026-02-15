#!/usr/bin/env bash
set -e

TASK_FILE=$(ls tasks/*.md 2>/dev/null | head -n 1)

if [ -z "$TASK_FILE" ]; then
  echo "✅ No tasks in queue"
  exit 0
fi

TASK_NAME=$(basename "$TASK_FILE" .md | tr ' ' '-' )
BRANCH="task/$TASK_NAME"

git checkout -b "$BRANCH"

echo "🧠 Planning..."
./scripts/planning-mode.sh
read -p "Create PLAN.md then press ENTER..."

echo "🛠️ Implementing..."
./scripts/dev-mode.sh
read -p "Finish implementation then press ENTER..."

git add .
git commit -m "$TASK_NAME"

echo "🔍 Auditing..."
./scripts/planning-mode.sh
read -p "Finish audit then press ENTER..."

git push -u origin "$BRANCH"

if command -v gh &> /dev/null; then
  gh pr create --title "$TASK_NAME" --body "Automated execution with PLAN.md"
fi

echo "✅ PR ready for review"
