#!/usr/bin/env bash
# Post-deploy smoke tests. Run from the App VPS (or any host that can reach staging-aishanet)
# after each Coolify deploy phase. Fails loud if any expected container is missing or unhealthy.
#
# Usage:
#   ./post-deploy-check.sh phase1   # Redis only
#   ./post-deploy-check.sh phase2   # adds backend
#   ./post-deploy-check.sh full     # all 5 groups expected up

set -euo pipefail

PHASE="${1:-full}"

# Each entry: container_name|expected_state|optional_http_check
PHASE1=(
  "staging-aishacrm-redis-memory|healthy|"
  "staging-aishacrm-redis-cache|healthy|"
)

PHASE2=(
  "${PHASE1[@]}"
  "staging-aishacrm-backend|healthy|http://staging-aishacrm-backend:3001/health"
)

FULL=(
  "${PHASE2[@]}"
  "staging-aishacrm-frontend|healthy|http://staging-aishacrm-frontend:3000/"
  "staging-aishacrm-comms|healthy|"
  "staging-aishacrm-litellm|healthy|"
  "staging-aishacrm-ollama|healthy|"
  "staging-braid-mcp-server|healthy|http://staging-braid-mcp-server:8000/health"
  "staging-braid-mcp-1|healthy|"
  "staging-braid-mcp-2|healthy|"
  "staging-aishacrm-calcom-db|healthy|"
  "staging-aishacrm-calcom|healthy|"
)

case "$PHASE" in
  phase1) TARGETS=("${PHASE1[@]}") ;;
  phase2) TARGETS=("${PHASE2[@]}") ;;
  full)   TARGETS=("${FULL[@]}") ;;
  *) echo "Unknown phase: $PHASE (expected phase1|phase2|full)"; exit 2 ;;
esac

FAIL=0
echo "=== Post-deploy check: $PHASE ==="

# Confirm staging-aishanet exists
if ! docker network inspect staging-aishanet >/dev/null 2>&1; then
  echo "FAIL: staging-aishanet network missing. Create with: docker network create staging-aishanet"
  exit 1
fi
echo "ok: staging-aishanet network present"

for entry in "${TARGETS[@]}"; do
  IFS='|' read -r name expected http <<< "$entry"

  # Container existence + health
  STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo "missing")
  if [[ "$STATUS" != "$expected" ]]; then
    echo "FAIL: $name is $STATUS (expected $expected)"
    docker logs --tail=30 "$name" 2>/dev/null || true
    FAIL=1
    continue
  fi
  echo "ok: $name $STATUS"

  # Optional HTTP probe via a throwaway curl container on the same network
  if [[ -n "$http" ]]; then
    if ! docker run --rm --network staging-aishanet curlimages/curl:8.6.0 -fsS --max-time 10 "$http" >/dev/null 2>&1; then
      echo "FAIL: $name HTTP probe $http unreachable"
      FAIL=1
    else
      echo "ok: $name HTTP probe $http"
    fi
  fi
done

# Redis ping (always run for phase1+)
echo "→ Redis ping checks"
if ! docker exec staging-aishacrm-redis-memory redis-cli ping | grep -q PONG; then
  echo "FAIL: redis-memory not responding"
  FAIL=1
else
  echo "ok: redis-memory PONG"
fi
if ! docker exec staging-aishacrm-redis-cache redis-cli ping | grep -q PONG; then
  echo "FAIL: redis-cache not responding"
  FAIL=1
else
  echo "ok: redis-cache PONG"
fi

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "=== $PHASE PASSED ==="
  exit 0
else
  echo "=== $PHASE FAILED ==="
  exit 1
fi
