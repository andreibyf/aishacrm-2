# Use npm test which handles glob expansion correctly inside the container.
# Override with TEST_FILES for targeted runs:
#   TEST_FILES="__tests__/ai/createSuggestionIfNew.test.js" ./scripts/runtime/test.sh

if [ -n "$TEST_FILES" ]; then
  # Targeted run: use sh -c so the container shell expands globs
  if [ "$QUIET" = "--quiet" ]; then
    docker compose exec backend sh -c "node --test --test-force-exit --test-timeout=120000 $TEST_FILES" >/dev/null
  else
    docker compose exec backend sh -c "node --test --test-force-exit --test-timeout=120000 $TEST_FILES"
  fi
else
  # Full suite: delegate to npm test (globs defined in package.json)
  if [ "$QUIET" = "--quiet" ]; then
    docker compose exec backend npm test >/dev/null
  else
    docker compose exec backend npm test
  fi
fi
