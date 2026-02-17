#!/usr/bin/env bash
set -e

source "$(git rev-parse --show-toplevel)/scripts/runtime/lib.sh"

cd "$REPO_ROOT"

BASE="${MAIN_BRANCH:-main}"
BRANCH=$(git branch --show-current)
CACHE_DIR="$REPO_ROOT/.git/.backend-test-cache"
CACHE_FILE="$CACHE_DIR/$BRANCH"

mkdir -p "$CACHE_DIR"

CURRENT_COMMIT=$(git rev-parse HEAD)

echo "🔍 Checking for backend impact..."

CHANGED=$(git diff --name-only "$BASE"...HEAD)
BACKEND_CHANGED=$(echo "$CHANGED" | grep '^backend/' || true)

# ✅ FAST PATH — cache hit
if [ -f "$CACHE_FILE" ]; then
  LAST_TESTED=$(cat "$CACHE_FILE")

  if [ -z "$BACKEND_CHANGED" ] && [ "$LAST_TESTED" = "$CURRENT_COMMIT" ]; then
    echo "⚡ Backend unchanged since last successful test → skipping"
    exit 0
  fi
fi

# No backend changes at all
if [ -z "$BACKEND_CHANGED" ]; then
  echo "✅ No backend changes → skipping backend tests"
  echo "$CURRENT_COMMIT" > "$CACHE_FILE"
  exit 0
fi

echo "🧠 Backend changes detected"

# Ensure backend container is running
if ! docker compose ps --status running --services | grep -q '^backend$'; then
  echo "❌ Backend container is not running"
  exit 1
fi

echo "🔎 Determining affected backend tests..."

TEST_FILES=""

while IFS= read -r file; do

  REL="${file#backend/}"

  if [[ "$REL" == __tests__/* ]]; then
    TEST_FILES="$TEST_FILES backend/$REL"
    continue
  fi

  DIR=$(dirname "$REL")
  BASE_NAME=$(basename "$REL" .js)

  CANDIDATE="backend/__tests__/$DIR/${BASE_NAME}.test.js"

  if [ -f "$CANDIDATE" ]; then
    TEST_FILES="$TEST_FILES $CANDIDATE"
  fi

done <<< "$BACKEND_CHANGED"

if [ -z "$TEST_FILES" ]; then
  echo "⚠ No direct mapping → running full backend suite"
  docker compose exec backend npm test
else
  echo "🚀 Running affected backend tests:"
  echo "$TEST_FILES"
  docker compose exec backend node --test $TEST_FILES
fi

# ✅ Update cache ONLY on success
echo "$CURRENT_COMMIT" > "$CACHE_FILE"
