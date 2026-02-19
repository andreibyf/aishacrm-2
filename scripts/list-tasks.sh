#!/usr/bin/env bash
set -e
source "$(git rev-parse --show-toplevel)/scripts/_task-lib.sh"

"$REPO_ROOT/scripts/task-status.sh" 2>/dev/null || true

CURRENT_BRANCH=$(current_branch)

echo
echo "🗂  AiSHA Tasks"
echo "🔧 Current branch: $CURRENT_BRANCH"
echo

[ ! -d "$TASK_DIR" ] && echo "No tasks directory found." && exit 0

shopt -s nullglob
FILES=("$TASK_DIR"/*.md)

[ ${#FILES[@]} -eq 0 ] && echo "No tasks yet." && exit 0

printf "%-3s %-18s | %-10s | %-30s | %s\n" "" "Last Update" "Status" "File" "Title"
printf -- "---------------------------------------------------------------------------------------------\n"

for file in "${FILES[@]}"; do
  TITLE=$(sed -n '2p' "$file")
  STATUS=$(grep -m1 "^## Status" -A1 "$file" | tail -n1)
  BRANCH=$(grep -m1 "^## Branch" -A1 "$file" | tail -n1)
  DATE=$(date -r "$file" +"%Y-%m-%d %H:%M")
  NAME=$(basename "$file")

  PREFIX=" "
  [ "$BRANCH" = "$CURRENT_BRANCH" ] && PREFIX="👉"

  printf "%-3s %-18s | %-10s | %-30s | %s\n" \
    "$PREFIX" "$DATE" "$STATUS" "$NAME" "$TITLE"
done

echo
