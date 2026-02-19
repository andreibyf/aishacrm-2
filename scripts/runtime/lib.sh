#!/usr/bin/env bash

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
TASK_DIR="$REPO_ROOT/tasks"
MAIN_BRANCH="main"

current_branch() {
  git branch --show-current
}
