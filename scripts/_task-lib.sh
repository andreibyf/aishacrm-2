#!/usr/bin/env bash

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
TASK_DIR="$REPO_ROOT/tasks"
MAIN_BRANCH="main"

current_branch() {
  git branch --show-current
}

task_file_from_branch() {
  echo "$TASK_DIR/$1.md"
}

set_status() {
  FILE="$1"
  STATUS="$2"
  sed -i "s/^PLANNED\|^EXECUTING\|^FAILED\|^BLOCKED\|^DONE$/$STATUS/" "$FILE" 2>/dev/null || true
}
