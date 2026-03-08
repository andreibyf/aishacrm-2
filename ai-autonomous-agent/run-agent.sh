#!/usr/bin/env bash
set -euo pipefail

BASE="ai-autonomous-agent"
CONFIG="$BASE/config.json"

if [ ! -f "$CONFIG" ]; then
  echo "Missing $CONFIG — copy config.example.json and adjust settings."
  exit 1
fi

MODEL=$(jq -r .model $CONFIG)
SLEEP=$(jq -r .sleep_seconds $CONFIG)
MAX=$(jq -r .max_iterations $CONFIG)

echo "Starting AiSHA autonomous improvement loop"
echo "Model: $MODEL"

ITER=0

while true
do
  ITER=$((ITER+1))
  if [ "$ITER" -gt "$MAX" ]; then
    echo "Reached max iterations"
    exit 0
  fi

  echo ""
  echo "Iteration $ITER"

  node $BASE/scripts/collect-signals.js
  node $BASE/scripts/pick-target.js $BASE/state/candidates.json >/dev/null

  TARGET=$(cat $BASE/state/target.txt)
  SUBSYSTEM=$(cat $BASE/state/subsystem.txt)

  if [ -z "$TARGET" ]; then
    echo "No target found."
    sleep $SLEEP
    continue
  fi

  echo "Target file:"
  echo "$TARGET"
  echo "Subsystem detected: $SUBSYSTEM"
  echo "Running Codex orchestration..."

  node $BASE/scripts/codex-orchestrator.js

  echo "Running tests..."

  case "$SUBSYSTEM" in
    AISHA_CHAT)
      TEST_COMMAND="npm run test:aisha"
      ;;
    CRM)
      TEST_COMMAND="npm run test:crm"
      ;;
    CARE)
      TEST_COMMAND="npm run test:care"
      ;;
    REPORTS)
      TEST_COMMAND="npm run test:reports"
      ;;
    WORKFLOWS)
      TEST_COMMAND="npm run test:workflows"
      ;;
    INTEGRATIONS)
      TEST_COMMAND="npm run test:integrations"
      ;;
    PLATFORM)
      TEST_COMMAND="npm run test:platform"
      ;;
    *)
      TEST_COMMAND="npm run test"
      ;;
  esac

  if eval "$TEST_COMMAND"; then
    echo "Tests passed"
  else
    echo "Tests failed. Reverting..."
    if [ -z "$(git status --porcelain)" ]; then
      echo "Working tree already clean — nothing to revert."
    else
      git stash push -m "aisha-agent-revert-iter-$ITER"
      echo "Changes stashed as aisha-agent-revert-iter-$ITER"
    fi
  fi

  echo "Sleeping $SLEEP seconds"
  sleep $SLEEP

done

