#!/usr/bin/env bash
set -e
source "$(git rev-parse --show-toplevel)/scripts/_task-lib.sh"

CURRENT_BRANCH=$(current_branch)
FILE=$(task_file_from_branch "$CURRENT_BRANCH")

# If on a task branch → EXECUTING (only if not FAILED or DONE)
if [ -f "$FILE" ] && [ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]; then
  CURRENT_STATUS=$(grep -m1 "^## Status" -A1 "$FILE" | tail -n1 | tr -d '\r')

  if [[ "$CURRENT_STATUS" != "FAILED" && "$CURRENT_STATUS" != "DONE" ]]; then
    sed -i 's/^PLANNED$/EXECUTING/' "$FILE" 2>/dev/null || true
  fi

  exit 0
fi


# If on main → mark merged tasks DONE
if [ "$CURRENT_BRANCH" = "$MAIN_BRANCH" ]; then
  for file in "$TASK_DIR"/*.md; do
    BRANCH=$(grep -m1 "^## Branch" -A1 "$file" | tail -n1 | tr -d '\r')
    git show-ref --verify --quiet "refs/heads/$BRANCH" && continue
    set_status "$file" DONE
  done
fi
