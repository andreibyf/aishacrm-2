#!/bin/sh
# run-tests-precheck.sh — Curated stable subset for fast pre-push feedback.
#
# Runs ONLY deterministic test groups that don't require live services
# (no Supabase, Postgres, Redis, Docker network, or external HTTP).
# Designed to surface real regressions in <90 seconds and never block
# a push because of environmental flakes.
#
# What's IN (truly deterministic, no DB / no HTTP / no env-dependent state):
#   - middleware  (Express middleware unit tests)
#   - utils       (pure helper / formatter unit tests)
#   - lib         (library-only unit tests; excludes lib/care which talks to Supabase)
#   - braid       (Braid DSL parsing/transpilation, fully in-memory)
#   - routes/*-deploy-config.test.js  (compose static-analysis — guards deploy contracts)
#
# What's OUT (run via `npm test` or `npm run test:safe` when services are up):
#   - schema      (field-parity tests hit actual API endpoints — need backend + DB)
#   - validation  (some tests open DB connections)
#   - care        (Anthropic API + Supabase RLS)
#   - services    (DB-backed service layer)
#   - workers     (Redis queues)
#   - auth        (Supabase Auth integration)
#   - ai          (LLM provider HTTP)
#   - phase3/phase6 (full-stack scenarios)
#   - system      (process / OS-level)
#   - integration (end-to-end HTTP)
#   - routes (full)  (65 files, most need DB)
#
# Usage:
#   npm run test:precheck                      # curated (this script)
#   npm run test:safe                          # 16 grouped runs (needs services)
#   npm test                                   # full suite (CI mode)

export NODE_ENV=test
TIMEOUT=60000
REPORTER=tap
FAIL_COUNT=0
GROUP_COUNT=0
TOTAL_PASS=0
TOTAL_FAIL=0

run_group() {
  label="$1"
  shift
  files=""
  file_count=0
  for f in "$@"; do
    if [ -e "$f" ]; then
      files="$files $f"
      file_count=$((file_count + 1))
    fi
  done
  if [ "$file_count" -eq 0 ]; then
    echo "  (skipped: no files match in '$label')"
    return 0
  fi
  GROUP_COUNT=$((GROUP_COUNT + 1))
  echo ""
  echo "==========================================================="
  echo "  Group ${GROUP_COUNT}: ${label} (${file_count} files)"
  echo "==========================================================="
  # shellcheck disable=SC2086
  if output=$(node --test --test-force-exit --test-timeout="${TIMEOUT}" --test-reporter "${REPORTER}" $files 2>&1); then
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
    echo "$output" | grep -A 5 "not ok" | head -30
  fi
}

run_group "middleware"  __tests__/middleware/*.test.js
run_group "utils"       __tests__/utils/*.test.js
run_group "lib"         __tests__/lib/*.test.js
run_group "braid"       __tests__/braid/*.test.js
# Compose / deploy-contract static analysis (no services needed):
run_group "deploy-config" \
    __tests__/routes/calcom-vps2-deploy-config.test.js \
    __tests__/routes/staging-services-calcom-config.test.js \
    __tests__/routes/staging-services-litellm-config.test.js \
    __tests__/routes/prod-compose-mem-limits.test.js \
    __tests__/routes/prod-litellm-coolify-config.test.js

echo ""
echo "==========================================================="
echo "  Total: ${TOTAL_PASS} passed, ${TOTAL_FAIL} failed (${GROUP_COUNT} groups)"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "  RESULT: PRECHECK PASSED (${GROUP_COUNT} groups)"
else
  echo "  RESULT: ${FAIL_COUNT}/${GROUP_COUNT} GROUPS FAILED — fix before pushing"
fi
echo "==========================================================="

exit "$FAIL_COUNT"
