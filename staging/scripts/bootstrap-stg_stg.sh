#!/usr/bin/env bash
# One-shot bootstrap: create the Doppler stg_stg config, clone all prd_prd
# secrets into it, apply staging-specific overrides, rotate Cal.com secrets,
# and mint a stg_stg-scoped service token for Coolify.
#
# WHY THIS IS A LOCAL SCRIPT, NOT IN-AGENT:
#   The DOPPLER_TOKEN in the repo's .env is a SERVICE token (dp.st.*) scoped
#   read-only to prd_prd — it cannot create configs or write secrets to other
#   configs. Workplace writes require a personal token (dp.pt.*) belonging to
#   a Doppler workplace admin. The Doppler CLI's `doppler login` flow gives
#   you that automatically.
#
# PREREQUISITES (one-time):
#   brew install dopplerhq/cli/doppler        # macOS
#   # or: scoop install doppler                # Windows
#   doppler login                              # opens browser, stores ~/.doppler/.doppler.yaml
#   # confirm you can read prd_prd:
#   doppler secrets --project aishacrm --config prd_prd | head -3
#
# USAGE:
#   ./staging/scripts/bootstrap-stg_stg.sh
#
# IDEMPOTENT: safe to re-run. Existing stg_stg secrets get overwritten with
# fresh prd_prd values; Cal.com secrets are rotated only if --rotate-calcom is
# passed (they're regenerated each run otherwise → would invalidate live sessions).

set -euo pipefail

PROJECT="aishacrm"
SOURCE_CONFIG="prd_prd"
TARGET_CONFIG="stg_stg"
SOURCE_ENV="prd"          # parent environment of prd_prd
TARGET_ENV="stg"          # parent environment for stg_stg

ROTATE_CALCOM=false
[[ "${1:-}" == "--rotate-calcom" ]] && ROTATE_CALCOM=true

command -v doppler >/dev/null || { echo "FAIL: doppler CLI not installed (https://docs.doppler.com/docs/install-cli)"; exit 1; }
command -v jq      >/dev/null || { echo "FAIL: jq not installed"; exit 1; }
command -v openssl >/dev/null || { echo "FAIL: openssl not installed"; exit 1; }

echo "=== 1. Verify Doppler auth + workplace access ==="
WHOAMI=$(doppler me --json 2>/dev/null || true)
if [[ -z "$WHOAMI" ]]; then
  echo "FAIL: not logged in. Run: doppler login"
  exit 1
fi
echo "Logged in as: $(echo "$WHOAMI" | jq -r '.email // .name')"

# Sanity: confirm we can read prd_prd (otherwise the rest is pointless)
if ! doppler secrets --project "$PROJECT" --config "$SOURCE_CONFIG" --only-names >/dev/null 2>&1; then
  echo "FAIL: cannot read $PROJECT/$SOURCE_CONFIG. Need workplace admin or read access on prd."
  exit 1
fi
echo "ok: can read $SOURCE_CONFIG"

echo
echo "=== 2. Create $TARGET_CONFIG (if missing) ==="
if doppler configs --project "$PROJECT" --json | jq -e --arg c "$TARGET_CONFIG" '.[] | select(.name == $c)' >/dev/null; then
  echo "ok: $TARGET_CONFIG already exists — secrets will be OVERWRITTEN"
else
  doppler configs create "$TARGET_CONFIG" --project "$PROJECT" --environment "$TARGET_ENV"
  echo "ok: created $TARGET_CONFIG in environment $TARGET_ENV"
fi

echo
echo "=== 3. Clone all secrets prd_prd → stg_stg ==="
# Pull every secret name + raw value from source (resolved, not referenced)
SECRETS_JSON=$(doppler secrets download --project "$PROJECT" --config "$SOURCE_CONFIG" --format json --no-file)
SECRET_COUNT=$(echo "$SECRETS_JSON" | jq 'keys | length')
echo "Source secret count: $SECRET_COUNT"

# Skip Doppler's own meta keys — they're auto-managed per config.
SKIP_KEYS='DOPPLER_PROJECT DOPPLER_CONFIG DOPPLER_ENVIRONMENT'

# Build a single bulk-set payload to avoid N round-trips.
# `doppler secrets set` accepts multiple KEY=VALUE pairs.
TMP_BATCH=$(mktemp)
trap 'rm -f "$TMP_BATCH"' EXIT
echo "$SECRETS_JSON" | jq -r --arg skip "$SKIP_KEYS" '
  ($skip | split(" ")) as $skiplist
  | to_entries[]
  | select(.key as $k | $skiplist | index($k) | not)
  | "\(.key)=\(.value)"
' > "$TMP_BATCH"

PUSH_COUNT=$(wc -l < "$TMP_BATCH" | tr -d ' ')
echo "Pushing $PUSH_COUNT secrets to $TARGET_CONFIG (excluding meta keys)…"

# Use --no-interactive and bulk set via stdin (one KEY=VALUE per line)
# Note: passing huge value sets via CLI args risks ARG_MAX; stdin is safer.
xargs -a "$TMP_BATCH" -d '\n' doppler secrets set \
  --project "$PROJECT" --config "$TARGET_CONFIG" --no-interactive --silent

echo "ok: cloned $PUSH_COUNT secrets"

echo
echo "=== 4. Apply staging-specific URL overrides ==="
declare -a OVERRIDES=(
  "PUBLIC_SCHEDULER_URL=https://staging-scheduler.aishacrm.com"
  "CALCOM_PUBLIC_URL=https://staging-scheduler.aishacrm.com"
  "ALLOWED_ORIGINS=https://staging-app.aishacrm.com"
  "VITE_AISHACRM_BACKEND_URL=https://staging-api.aishacrm.com"
  "VITE_CALCOM_URL=https://staging-scheduler.aishacrm.com"
  "CALCOM_ALLOWED_HOSTNAMES=\"staging-scheduler.aishacrm.com\""
  "NODE_ENV=production"
  # Telemetry off in staging (we don't want staging traffic polluting prod metrics)
  "TELEMETRY_ENABLED=false"
)
for kv in "${OVERRIDES[@]}"; do
  doppler secrets set --project "$PROJECT" --config "$TARGET_CONFIG" --no-interactive --silent "$kv"
done
echo "ok: applied ${#OVERRIDES[@]} URL/env overrides"

echo
echo "=== 5. Rotate Cal.com cryptographic secrets ==="
# CRITICAL: NEVER reuse prod Cal.com secrets in staging.
# Same NEXTAUTH_SECRET → cross-environment session forgery.
# Same ENCRYPTION_KEY → ciphertext from prod decryptable in staging and vice versa.
# Same DB password → if either env is compromised, the other DB is too.
if [[ "$ROTATE_CALCOM" == "true" ]]; then
  CALCOM_DB_PWD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)
  CALCOM_NEXTAUTH=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)
  CALCOM_ENCRYPT=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  doppler secrets set --project "$PROJECT" --config "$TARGET_CONFIG" --no-interactive --silent \
    "CALCOM_DB_PASSWORD=$CALCOM_DB_PWD" \
    "CALCOM_NEXTAUTH_SECRET=$CALCOM_NEXTAUTH" \
    "CALCOM_ENCRYPTION_KEY=$CALCOM_ENCRYPT"
  echo "ok: rotated CALCOM_DB_PASSWORD, CALCOM_NEXTAUTH_SECRET, CALCOM_ENCRYPTION_KEY"
  echo "    (secrets stored in Doppler — not printed here)"
else
  echo "skipped Cal.com rotation (re-run with --rotate-calcom on first bootstrap)"
fi

echo
echo "=== 6. Mint Coolify service token for stg_stg ==="
# Service tokens are config-scoped read-only. Coolify pastes this into
# DOPPLER_TOKEN env var on every staging resource — containers fetch their
# own secrets at startup via the entrypoint's `doppler run` wrapper.
TOKEN_NAME="coolify-staging-$(date +%Y%m%d)"
EXISTING=$(doppler service-tokens --project "$PROJECT" --config "$TARGET_CONFIG" --json 2>/dev/null \
  | jq -r --arg n "$TOKEN_NAME" '.[] | select(.name == $n) | .slug' || true)
if [[ -n "$EXISTING" ]]; then
  echo "Service token '$TOKEN_NAME' already exists — revoking and reissuing"
  doppler service-tokens revoke "$EXISTING" --project "$PROJECT" --config "$TARGET_CONFIG" --no-interactive --silent
fi
TOKEN=$(doppler service-tokens create "$TOKEN_NAME" \
  --project "$PROJECT" --config "$TARGET_CONFIG" \
  --plain --no-interactive)

echo
echo "=== DONE ==="
echo
echo "Coolify env-var values to paste into EVERY staging resource:"
echo "  DOPPLER_TOKEN=$TOKEN"
echo "  DOPPLER_PROJECT=$PROJECT"
echo "  DOPPLER_CONFIG=$TARGET_CONFIG"
echo
echo "Verify the clone landed correctly:"
echo "  doppler secrets --project $PROJECT --config $TARGET_CONFIG --only-names | wc -l"
echo "  # should report ~$SECRET_COUNT (minus 3 skipped meta keys)"
echo
echo "Compare diff against prd_prd:"
echo "  diff <(doppler secrets --project $PROJECT --config $SOURCE_CONFIG --only-names | sort) \\"
echo "       <(doppler secrets --project $PROJECT --config $TARGET_CONFIG --only-names | sort)"
