#!/usr/bin/env bash
set -euo pipefail

# ===========================
#  CONFIG (update if needed)
# ===========================
CONTAINER_NAME="aishacrm-backend"
AI_KEY="${AI_KEY:-dev-internal-ai-key}"
TENANT_ID="a11dfb63-4b18-4eb8-872e-747af2e37c46"
USER_ID="11111111-1111-1111-1111-111111111111"
API_URL="http://localhost:3001/api/ai/brain-test"

cat <<'BANNER'
=====================================================
 AI-SHA CRM – Brain Verification (docker exec mode)
=====================================================
BANNER

if [[ "$AI_KEY" == "dev-internal-ai-key" ]]; then
  if [[ -n "${INTERNAL_AI_TEST_KEY:-}" ]]; then
    AI_KEY="$INTERNAL_AI_TEST_KEY"
  elif [[ -f "backend/.env" ]]; then
    extracted_key=$(sed -n 's/^[[:space:]]*INTERNAL_AI_TEST_KEY[[:space:]]*=[[:space:]]*//p' backend/.env | head -n 1 | tr -d '\r')
    if [[ -n "$extracted_key" ]]; then
      AI_KEY="$extracted_key"
    fi
  fi
fi

if [[ "$AI_KEY" == "dev-internal-ai-key" ]]; then
  echo "ERROR: INTERNAL_AI_TEST_KEY not provided. Set AI_KEY env var or backend/.env entry." >&2
  exit 1
fi

if [[ "$TENANT_ID" == "<TENANT_UUID>" ]]; then
  echo "ERROR: Replace TENANT_UUID before running." >&2
  exit 1
fi

if [[ "$USER_ID" == "<USER_UUID>" ]]; then
  echo "ERROR: Replace USER_UUID before running." >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  FORMATTER=(jq .)
elif command -v python >/dev/null 2>&1; then
  FORMATTER=(python -m json.tool)
else
  FORMATTER=(cat)
  echo "WARN: jq/python not found; showing raw JSON" >&2
fi

echo "Using container: $CONTAINER_NAME"
echo "--------------------------------"

run_curl() {
  local mode_label="$1"
  local payload="$2"
  echo ""
  echo "------------------------------------------"
  echo "[$mode_label]"
  echo "------------------------------------------"
  docker exec -i "$CONTAINER_NAME" sh -c "\
    curl -s -X POST '$API_URL' \\
      -H 'Content-Type: application/json' \\
      -H 'X-Internal-AI-Key: $AI_KEY' \\
      -d '$payload'" | "${FORMATTER[@]}"
}

run_curl "1] READ-ONLY MODE TEST" "{\"tenant_id\":\"$TENANT_ID\",\"user_id\":\"$USER_ID\",\"task_type\":\"summarize_entity\",\"mode\":\"read_only\",\"context\":{\"entity\":\"leads\"}}"

run_curl "2] PROPOSE-ACTIONS MODE TEST" "{\"tenant_id\":\"$TENANT_ID\",\"user_id\":\"$USER_ID\",\"task_type\":\"improve_followups\",\"mode\":\"propose_actions\",\"context\":{\"entity\":\"leads\",\"criteria\":\"stale_leads\"}}"

echo ""
echo "------------------------------------------"
echo "[3] APPLY MODE TEST (Expected 501)"
echo "------------------------------------------"
docker exec -i "$CONTAINER_NAME" sh -c "\
  curl -s -o /tmp/brain_apply.txt -w 'HTTP STATUS: %{http_code}\\n' \\
    -X POST '$API_URL' \\
    -H 'Content-Type: application/json' \\
    -H 'X-Internal-AI-Key: $AI_KEY' \\
    -d '{\"tenant_id\":\"$TENANT_ID\",\"user_id\":\"$USER_ID\",\"task_type\":\"update_records\",\"mode\":\"apply_allowed\",\"context\":{\"entity\":\"leads\",\"changes\":{\"status\":\"in_progress\"}}}'"

echo "Response body:"
docker exec -i "$CONTAINER_NAME" sh -c 'cat /tmp/brain_apply.txt' | "${FORMATTER[@]}"

echo ""
cat <<'FOOTER'
=====================================================
 Docker-exec Brain Verification COMPLETE
=====================================================
FOOTER
