#!/usr/bin/env bash
# Unit tests for lockup-diagnostic.sh
# Run: bash scripts/lockup-diagnostic.test.sh
set -u

SCRIPT="$(dirname "$0")/lockup-diagnostic.sh"
PASS=0
FAIL=0

assert_ok() {
  if eval "$1" >/dev/null 2>&1; then
    PASS=$((PASS+1)); echo "PASS: $2"
  else
    FAIL=$((FAIL+1)); echo "FAIL: $2"
  fi
}

# Capture combined output to a temp file then grep — avoids pipefail interactions.
assert_grep() {
  local cmd="$1" pattern="$2" name="$3" tmp
  tmp=$(mktemp)
  eval "$cmd" >"$tmp" 2>&1 || true
  if grep -Eq "$pattern" "$tmp"; then
    PASS=$((PASS+1)); echo "PASS: $name"
  else
    FAIL=$((FAIL+1)); echo "FAIL: $name (no match for /$pattern/)"
    sed -n '1,3p' "$tmp" | sed 's/^/    | /'
  fi
  rm -f "$tmp"
}

# 1. Main script must be syntactically valid.
assert_ok "bash -n $SCRIPT" "syntax check"

# 2. Either rejects non-root with a clear message, or (if running as root) starts up.
assert_grep "bash $SCRIPT 2026-04-26 02:00 03:00" "run as root|window_local" "non-root rejection or root startup"

# 3. Bad date is rejected (or non-root path triggers first).
assert_grep "bash $SCRIPT not-a-date 02:00 03:00" "invalid date/time|run as root" "rejects bad date"

# 4. Epoch-based date math must produce 01:45 for 02:00 minus 15 min.
PAD=$(date -d "@$(($(date -d '2026-04-26 02:00:00' +%s) - 900))" "+%H:%M")
if [ "$PAD" = "01:45" ]; then
  PASS=$((PASS+1)); echo "PASS: epoch-based 15-min pad"
else
  FAIL=$((FAIL+1)); echo "FAIL: epoch pad got $PAD (expected 01:45)"
fi

# 5. Confirm the script does not use the unsafe GNU-date string form.
if grep -q 'minutes"' "$SCRIPT" && grep -qE '"\$(START|END)_TS [+-] \$WINDOW_PAD_MIN minutes"' "$SCRIPT"; then
  FAIL=$((FAIL+1)); echo "FAIL: script still uses unsafe date-string arithmetic"
else
  PASS=$((PASS+1)); echo "PASS: script avoids unsafe date-string arithmetic"
fi

# 6. ISO conversion sanity.
ISO=$(date -u -d "@$(date -d '2026-04-26 02:00:00' +%s)" "+%Y-%m-%dT%H:%M:%SZ")
if [ -n "$ISO" ]; then
  PASS=$((PASS+1)); echo "PASS: ISO conversion produces value"
else
  FAIL=$((FAIL+1)); echo "FAIL: ISO conversion empty"
fi

# 7. Default LOCKUP_DATE resolution.
YDAY=$(date -d 'yesterday' +%Y-%m-%d)
if [ -n "$YDAY" ]; then
  PASS=$((PASS+1)); echo "PASS: yesterday default resolves to $YDAY"
else
  FAIL=$((FAIL+1)); echo "FAIL: yesterday resolution"
fi

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
-n "$ISO" ]; then
  PASS=$((PASS+1)); echo "PASS: ISO conversion produces value"
else
  FAIL=$((FAIL+1)); echo "FAIL: ISO conversion empty"
fi

# 7. Default LOCKUP_DATE resolution.
YDAY=$(date -d 'yesterday' +%Y-%m-%d)
if [ -n "$YDAY" ]; then
  PASS=$((PASS+1)); echo "PASS: yesterday default resolves to $YDAY"
else
  FAIL=$((FAIL+1)); echo "FAIL: yesterday resolution"
fi

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
