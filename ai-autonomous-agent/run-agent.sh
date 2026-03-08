#!/usr/bin/env bash
set -euo pipefail

BASE="ai-autonomous-agent"
CONFIG="$BASE/config.json"

MODEL=$(jq -r .model "$CONFIG")
SLEEP=$(jq -r .sleep_seconds "$CONFIG")
MAX=$(jq -r .max_iterations "$CONFIG")
MAX_FILES=$(jq -r .max_files_per_run "$CONFIG")
TEST_COMMAND=$(jq -r .test_command "$CONFIG")

echo "AiSHA autonomous agent starting"
echo "Model: $MODEL"

ITER=0

while true
do
  ITER=$((ITER+1))

  if [ "$ITER" -gt "$MAX" ]; then
    echo "Max iterations reached"
    exit 0
  fi

  echo "Iteration $ITER"

  node $BASE/scripts/collect-signals.js
  node $BASE/scripts/pick-target.js $BASE/state/candidates.json

  TARGETS=$(jq -r '.[].file' $BASE/state/targets.json)

  if [ -z "$TARGETS" ]; then
    echo "No targets"
    sleep "$SLEEP"
    continue
  fi

  git add -A
  git commit -m "agent checkpoint $ITER" >/dev/null 2>&1 || true

  for TARGET in $TARGETS
  do
    echo "$TARGET" > $BASE/state/target.txt

    node $BASE/scripts/risk-scan.js

    if ! node $BASE/scripts/codex-orchestrator.js; then
      git reset --hard HEAD
      continue
    fi
  done

  echo "Running tests"

  if eval "$TEST_COMMAND"; then

    rm -f $BASE/state/test-failed.txt

    if [ -n "$(git status --porcelain)" ]; then
      git add -A
      git commit -m "AiSHA autonomous refactor batch-$ITER"
    fi

  else

    touch $BASE/state/test-failed.txt
    git reset --hard HEAD

  fi

  echo "{\"iteration\":$ITER,\"time\":\"$(date)\"}" >> $BASE/state/log.json

  sleep "$SLEEP"

done