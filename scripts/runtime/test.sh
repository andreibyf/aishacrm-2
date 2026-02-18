if [ "$QUIET" = "--quiet" ]; then
  docker compose exec backend node --test $TEST_FILES >/dev/null
else
  docker compose exec backend node --test $TEST_FILES
fi
