#!/bin/sh
# run-tests-safe.sh — Run backend tests in sequential groups to avoid
# Node.js test runner deserialization bugs under high concurrency.
#
# Each group runs as its own `node --test` process (concurrent within the group),
# but groups execute one after another. Exits with non-zero if any group fails.
#
# Run from the backend/ directory:
#   sh scripts/run-tests-safe.sh              # default: localhost:3001
#   BACKEND_URL=http://localhost:4001 sh scripts/run-tests-safe.sh   # Docker
#
# POSIX sh compatible (works on Alpine/Docker, Git Bash, WSL).

export NODE_ENV=test
TIMEOUT=120000
REPORTER=tap
FAIL_COUNT=0
GROUP_COUNT=0
TOTAL_PASS=0
TOTAL_FAIL=0

run_group() {
  label="$1"
  shift

  # Collect matching files (glob may produce literal non-existent paths)
  files=""
  file_count=0
  for f in "$@"; do
    if [ -e "$f" ]; then
      files="$files $f"
      file_count=$((file_count + 1))
    fi
  done

  if [ "$file_count" -eq 0 ]; then
    return 0
  fi

  GROUP_COUNT=$((GROUP_COUNT + 1))
  echo ""
  echo "==========================================================="
  echo "  Group ${GROUP_COUNT}: ${label} (${file_count} files)"
  echo "==========================================================="

  # shellcheck disable=SC2086
  if output=$(node --test --test-force-exit --test-timeout="${TIMEOUT}" --test-reporter "${REPORTER}" $files 2>&1); then
    # Extract pass/fail counts from TAP output
    g_pass=$(echo "$output" | grep "^# pass" | tail -1 | awk '{print $3}')
    g_fail=$(echo "$output" | grep "^# fail" | tail -1 | awk '{print $3}')
    g_pass=${g_pass:-0}
    g_fail=${g_fail:-0}
    TOTAL_PASS=$((TOTAL_PASS + g_pass))
    TOTAL_FAIL=$((TOTAL_FAIL + g_fail))
    echo "  OK ${label}: ${g_pass} passed, ${g_fail} failed"
  else
    g_pass=$(echo "$output" | grep "^# pass" | tail -1 | awk '{print $3}')
    g_fail=$(echo "$output" | grep "^# fail" | tail -1 | awk '{print $3}')
    g_pass=${g_pass:-0}
    g_fail=${g_fail:-0}
    TOTAL_PASS=$((TOTAL_PASS + g_pass))
    TOTAL_FAIL=$((TOTAL_FAIL + g_fail))
    echo "  FAIL ${label}: ${g_pass} passed, ${g_fail} failed"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    # Show failures for debugging
    echo "$output" | grep -A 5 "not ok" | head -30
  fi
}

# ── Groups (ordered: fast unit tests first, heavy integration last) ──

# 1. Pure unit tests (no DB, no HTTP)
run_group "middleware"   __tests__/middleware/*.test.js
run_group "utils"        __tests__/utils/*.test.js
run_group "schema"       __tests__/schema/*.test.js
run_group "validation"   __tests__/validation/*.test.js
run_group "lib"          __tests__/lib/*.test.js

# 2. CARE engine tests
run_group "care"         lib/care/*.test.js lib/care/__tests__/*.test.js

# 3. Service layer
run_group "services"     __tests__/services/*.test.js

# 4. Workers
run_group "workers"      __tests__/workers/*.test.js

# 5. Auth
run_group "auth"         __tests__/auth/*.test.js

# 6. AI / Braid
run_group "ai"           __tests__/ai/*.test.js
run_group "braid"        __tests__/braid/*.test.js

# 7. Phase tests
run_group "phase3"       __tests__/phase3/*.test.js
run_group "phase6"       __tests__/phase6/*.test.js

# 8. System
run_group "system"       __tests__/system/*.test.js

# 9. Integration
run_group "integration"  __tests__/integration/*.test.js

# 10. Routes (largest group — 65 files, runs last)
run_group "routes"       __tests__/routes/*.test.js

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "==========================================================="
echo "  Total: ${TOTAL_PASS} passed, ${TOTAL_FAIL} failed (${GROUP_COUNT} groups)"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "  RESULT: ALL ${GROUP_COUNT} GROUPS PASSED"
else
  echo "  RESULT: ${FAIL_COUNT}/${GROUP_COUNT} GROUPS FAILED"
fi
echo "==========================================================="

exit "$FAIL_COUNT"
