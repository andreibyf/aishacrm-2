#!/usr/bin/env bash
# coolify-deploy-staging.sh
#
# Manually fire Coolify deploy webhooks for staging-app-fast and
# staging-backend-heavy. Use when deploy-staging.yml (GitHub Actions)
# fails to trigger on a push — symptom: origin/main updated but
# Coolify queue empty for the new SHA.
#
# Reads COOLIFY_BASE_URL + COOLIFY_DEPLOY_TOKEN from .env. Both apps
# are queued in parallel (Coolify serializes the actual build on the
# VPS-1 CPU cap).
#
# Run from the repo root:
#   bash scripts/coolify-deploy-staging.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$REPO_ROOT" ]] || { echo "Not inside a git working tree." >&2; exit 1; }
cd "$REPO_ROOT"

# Parse .env (handles quoted values; matches the PowerShell script's logic).
ENV_FILE="$REPO_ROOT/.env"
[[ -f "$ENV_FILE" ]] || { echo ".env not found at $ENV_FILE" >&2; exit 1; }

extract() {
  local key="$1"
  awk -F= -v k="$key" '
    $1 == k {
      sub(/^[^=]*=/, "")
      gsub(/^[ \t]+|[ \t]+$/, "")
      gsub(/^"|"$/, "")
      gsub(/^'\''|'\''$/, "")
      print
      exit
    }
  ' "$ENV_FILE"
}

BASE="$(extract COOLIFY_BASE_URL)"
TOKEN="$(extract COOLIFY_DEPLOY_TOKEN)"
[[ -n "$BASE" ]] || BASE='https://deploy.aishacrm.com'
[[ -n "$TOKEN" ]] || { echo "COOLIFY_DEPLOY_TOKEN missing from .env" >&2; exit 1; }

# Application UUIDs (from .github/workflows/deploy-staging.yml).
APP_FAST_UUID='di7ko49ikfd2mz8yh0q7id8q'
BACKEND_HEAVY_UUID='d24ro1fqm0zyl7pd72g6snd2'

fire() {
  local name="$1" uuid="$2"
  echo
  echo ">>> Firing deploy for $name ($uuid)"
  local resp
  resp="$(curl -sS -X POST \
    -H "Authorization: Bearer $TOKEN" \
    --max-time 30 \
    "$BASE/api/v1/deploy?uuid=$uuid&force=false")"
  echo "$resp"
  # Pull deployment_uuid for follow-up polling.
  local deploy_uuid
  deploy_uuid="$(printf '%s' "$resp" | grep -o '"deployment_uuid":"[^"]*"' | head -1 | sed 's/.*:"\(.*\)"/\1/')"
  if [[ -n "$deploy_uuid" ]]; then
    echo "    deployment_uuid=$deploy_uuid"
    echo "    poll: curl -H 'Authorization: Bearer \$TOKEN' $BASE/api/v1/deployments/$deploy_uuid"
  fi
}

fire 'staging-app-fast'      "$APP_FAST_UUID"
fire 'staging-backend-heavy' "$BACKEND_HEAVY_UUID"

echo
echo ">>> Both deploys queued. Coolify will serialize builds on VPS-1's CPU cap."
echo "    Watch via:"
echo "    bash scripts/check-deploy.sh   # if exists; otherwise:"
echo "    curl -H 'Authorization: Bearer \$TOKEN' $BASE/api/v1/deployments/<deployment_uuid>"
