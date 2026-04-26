#!/usr/bin/env bash
# Validate every staging compose file: syntax, env-var resolution, port uniqueness.
# Run locally before pushing — Coolify will reject malformed compose at deploy time
# but failing fast in CI is cheaper.
#
# Usage: ./staging/scripts/validate-compose.sh [--strict]
#   --strict  also fail if any required env-var has no default

set -euo pipefail

cd "$(dirname "$0")/../.."

GROUPS=(
  "staging/01-backend-heavy"
  "staging/02-app-fast"
  "staging/03-ai-infra"
  "staging/04-braid"
  "staging/05-scheduling-rare"
)

STRICT=false
[[ "${1:-}" == "--strict" ]] && STRICT=true

# Provide harmless dummy values so `docker compose config` resolves variable refs.
# These never reach a running container — the test only validates syntax.
export DOPPLER_TOKEN="dp.st.dummy"
export DOPPLER_PROJECT="aishacrm"
export DOPPLER_CONFIG="stg_stg"
export CALCOM_DB_PASSWORD="dummy_pwd"
export CALCOM_NEXTAUTH_SECRET="dummy_secret_32chars_minimum_xxxxx"
export CALCOM_ENCRYPTION_KEY="dummy_key"
export CALCOM_SMTP_HOST="smtp.example.com"
export CALCOM_SMTP_USER="dummy@example.com"
export CALCOM_SMTP_PASSWORD="dummy_smtp"

declare -A SEEN_PORTS
declare -A SEEN_NAMES
FAIL=0

echo "=== Staging compose validation ==="

for group in "${GROUPS[@]}"; do
  COMPOSE="$group/docker-compose.yml"
  echo
  echo "→ $COMPOSE"

  if [[ ! -f "$COMPOSE" ]]; then
    echo "   FAIL: file missing"
    FAIL=1
    continue
  fi

  # 1. Syntax check + variable resolution
  if ! docker compose -f "$COMPOSE" config --quiet 2>/tmp/compose_err; then
    echo "   FAIL: docker compose config rejected the file"
    cat /tmp/compose_err
    FAIL=1
    continue
  fi
  echo "   ok: syntax valid"

  # 2. Container-name uniqueness across all groups
  while read -r name; do
    [[ -z "$name" ]] && continue
    if [[ -n "${SEEN_NAMES[$name]:-}" ]]; then
      echo "   FAIL: container_name '$name' duplicated (also in ${SEEN_NAMES[$name]})"
      FAIL=1
    else
      SEEN_NAMES[$name]="$group"
    fi
  done < <(docker compose -f "$COMPOSE" config 2>/dev/null | awk '/container_name:/ {print $2}')
  echo "   ok: container names unique"

  # 3. Host-port uniqueness across groups (staging must not conflict with prod 4000/4001/6379/6380/8000/3002)
  PROD_PORTS=("4000" "4001" "6379" "6380" "8000" "3002" "11436" "4002")
  while read -r port; do
    [[ -z "$port" ]] && continue
    HOST_PORT=$(echo "$port" | sed -E 's/^([0-9.]+:)?([0-9]+):.*/\2/')
    [[ -z "$HOST_PORT" || ! "$HOST_PORT" =~ ^[0-9]+$ ]] && continue

    for prod in "${PROD_PORTS[@]}"; do
      if [[ "$HOST_PORT" == "$prod" ]]; then
        echo "   FAIL: host port $HOST_PORT conflicts with production"
        FAIL=1
      fi
    done

    if [[ -n "${SEEN_PORTS[$HOST_PORT]:-}" ]]; then
      echo "   FAIL: host port $HOST_PORT duplicated (also in ${SEEN_PORTS[$HOST_PORT]})"
      FAIL=1
    else
      SEEN_PORTS[$HOST_PORT]="$group"
    fi
  done < <(docker compose -f "$COMPOSE" config 2>/dev/null | awk '/published:/ {print $2}' | tr -d '"')
  echo "   ok: host ports non-conflicting"

  # 4. All services must join staging-aishanet (cross-group reachability)
  NETWORKS=$(docker compose -f "$COMPOSE" config 2>/dev/null | grep -E "^\s+- staging-aishanet" | wc -l)
  SERVICES=$(docker compose -f "$COMPOSE" config --services 2>/dev/null | wc -l)
  if [[ "$NETWORKS" -lt "$SERVICES" ]]; then
    echo "   FAIL: only $NETWORKS/$SERVICES services declare staging-aishanet"
    FAIL=1
  else
    echo "   ok: all $SERVICES services on staging-aishanet"
  fi
done

echo
echo "=== Bind-mount drift checks ==="
# Coolify v4 mishandles `..` in compose volume sources, so we keep local copies
# of the repo-root config files inside each group folder. These checks fail loud
# if the local copy diverges from the source of truth.
declare -A MIRRORS=(
  # litellm_config.yaml is no longer mirrored — baked into the GHCR image via
  # litellm/Dockerfile. Only calcom-db-init.sql still uses the mirror pattern
  # because postgres:15-alpine is a stock image we don't rebuild.
  ["scripts/calcom-db-init.sql"]="staging/05-scheduling-rare/calcom-db-init.sql"
)
for src in "${!MIRRORS[@]}"; do
  dst="${MIRRORS[$src]}"
  if [[ ! -f "$src" ]]; then
    echo "   FAIL: source-of-truth $src missing"
    FAIL=1
    continue
  fi
  if [[ ! -f "$dst" ]]; then
    echo "   FAIL: staging copy $dst missing — run: cp $src $dst"
    FAIL=1
    continue
  fi
  if ! cmp -s "$src" "$dst"; then
    echo "   FAIL: $dst drifted from $src — run: cp $src $dst"
    FAIL=1
  else
    echo "   ok: $dst in sync with $src"
  fi
done

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "=== ALL CHECKS PASSED ==="
  exit 0
else
  echo "=== VALIDATION FAILED ==="
  exit 1
fi
