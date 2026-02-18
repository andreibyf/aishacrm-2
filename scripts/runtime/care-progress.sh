#!/usr/bin/env bash
set -euo pipefail

PLAN_FILE="$1"

TOTAL=$(grep -E '^- \[[ x]\] [0-9]+\.' "$PLAN_FILE" | wc -l | tr -d ' ')
DONE=$(grep -E '^- \[x\] [0-9]+\.' "$PLAN_FILE" | wc -l | tr -d ' ')

NEXT_LINE=$(grep -E '^- \[ \] [0-9]+\.' "$PLAN_FILE" | head -n1)

NEXT_STEP=$(echo "$NEXT_LINE" | sed -E 's/^- \[ \] ([0-9]+)\. (.*)/\1/')
NEXT_TITLE=$(echo "$NEXT_LINE" | sed -E 's/^- \[ \] ([0-9]+)\. //')

echo "$DONE|$TOTAL|$NEXT_STEP|$NEXT_TITLE"
