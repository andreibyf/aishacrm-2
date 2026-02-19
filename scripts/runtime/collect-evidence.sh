#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

OUT=".care-runtime-evidence.md"
: > "$OUT"

echo "## 🧪 Backend Test Evidence" >> "$OUT"

START=$(date +%s)
TEST_OUTPUT=$(scripts/runtime/test.sh 2>&1 || true)
END=$(date +%s)

DURATION=$((END - START))

echo "Duration: ${DURATION}s" >> "$OUT"

echo '```' >> "$OUT"
echo "$TEST_OUTPUT" | tail -n 40 >> "$OUT"
echo '```' >> "$OUT"

# --------------------------------
# Container resource snapshot
# --------------------------------

echo "" >> "$OUT"
echo "## 📦 Container Resources" >> "$OUT"

docker stats --no-stream \
  --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
  | grep -E "backend|redis" >> "$OUT" || echo "docker stats unavailable" >> "$OUT"

# --------------------------------
# Git diff scope
# --------------------------------

echo "" >> "$OUT"
echo "## 🔍 Changed Files" >> "$OUT"
git diff --name-only main...HEAD >> "$OUT"

# --------------------------------
# Commit trace
# --------------------------------

echo "" >> "$OUT"
echo "## 🧠 Last Commits" >> "$OUT"
git --no-pager log -5 --oneline >> "$OUT"

# --------------------------------
# AI token + cost delta (if logs exist)
# --------------------------------

LOG_FILE="backend/logs/ai-usage.log"

echo "" >> "$OUT"
echo "## 💰 AI Cost Delta" >> "$OUT"

if [ -f "$LOG_FILE" ]; then

  TOKENS=$(grep -o '"total_tokens":[0-9]*' "$LOG_FILE" | cut -d: -f2 | paste -sd+ | bc)
  COST=$(awk "BEGIN { printf \"%.4f\", $TOKENS * 0.000002 }")

  echo "Tokens used: $TOKENS" >> "$OUT"
  echo "Estimated cost: \$$COST" >> "$OUT"

else
  echo "No AI usage log found" >> "$OUT"
fi

echo "$OUT"
