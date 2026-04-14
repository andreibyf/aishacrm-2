#!/usr/bin/env sh
set -e

# Save Docker-provided env vars BEFORE Doppler can overwrite them.
# These are set in docker-compose.yml and are correct for the deployment context
# (e.g. localhost:4001 for local dev, prod URL for production).
# Doppler may contain internal Docker network addresses (http://backend:4001)
# which are unreachable from the browser.
DOCKER_VITE_AISHACRM_BACKEND_URL="${VITE_AISHACRM_BACKEND_URL}"
DOCKER_VITE_SUPABASE_URL="${VITE_SUPABASE_URL}"
DOCKER_VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY}"
DOCKER_VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY}"
DOCKER_VITE_SYSTEM_TENANT_ID="${VITE_SYSTEM_TENANT_ID}"
DOCKER_VITE_CALCOM_URL="${VITE_CALCOM_URL}"
DOCKER_VITE_OPENREPLAY_PROJECT_KEY="${VITE_OPENREPLAY_PROJECT_KEY}"
DOCKER_VITE_OPENREPLAY_INGEST_POINT="${VITE_OPENREPLAY_INGEST_POINT}"
DOCKER_VITE_OPENREPLAY_DASHBOARD_URL="${VITE_OPENREPLAY_DASHBOARD_URL}"

# Fetch secrets from Doppler if token is available
if [ -n "$DOPPLER_TOKEN" ]; then
  echo "Fetching frontend secrets from Doppler..."
  # Pull only required keys explicitly.
  # This avoids eval/parsing failures when any unrelated secret contains shell-sensitive characters.
  set_secret_from_doppler() {
    key="$1"
    value="$(doppler secrets get "$key" --plain --token "$DOPPLER_TOKEN" --project "${DOPPLER_PROJECT:-aishacrm}" --config "${DOPPLER_CONFIG:-prd_prd}" 2>/dev/null || true)"
    if [ -n "$value" ]; then
      export "${key}=${value}"
      return 0
    fi
    return 1
  }

  # Core browser/runtime values
  set_secret_from_doppler "VITE_SUPABASE_URL" || true
  set_secret_from_doppler "VITE_SUPABASE_ANON_KEY" || true
  set_secret_from_doppler "VITE_SUPABASE_PUBLISHABLE_KEY" || true
  set_secret_from_doppler "VITE_AISHACRM_BACKEND_URL" || true
  set_secret_from_doppler "VITE_SYSTEM_TENANT_ID" || true
  set_secret_from_doppler "VITE_CALCOM_URL" || true

  # OpenReplay runtime values (optional)
  set_secret_from_doppler "VITE_OPENREPLAY_PROJECT_KEY" || true
  set_secret_from_doppler "VITE_OPENREPLAY_INGEST_POINT" || true
  set_secret_from_doppler "VITE_OPENREPLAY_DASHBOARD_URL" || true
  # Backward compatibility: some Doppler configs may still use non-VITE names
  set_secret_from_doppler "OPENREPLAY_PROJECT_KEY" || true
  set_secret_from_doppler "OPENREPLAY_INGEST_POINT" || true
  set_secret_from_doppler "OPENREPLAY_DASHBOARD_URL" || true

  # Misc optional runtime tuning
  set_secret_from_doppler "VITE_USER_HEARTBEAT_INTERVAL_MS" || true

  echo "Doppler secrets loaded successfully"
else
  echo "WARNING: DOPPLER_TOKEN not set, using environment variables directly"
fi

# Restore Docker-provided overrides for browser-facing variables.
# Docker compose values MUST win because the browser needs host-reachable URLs,
# not Docker-internal network names like http://backend:4001.
if [ -n "$DOCKER_VITE_AISHACRM_BACKEND_URL" ]; then
  VITE_AISHACRM_BACKEND_URL="$DOCKER_VITE_AISHACRM_BACKEND_URL"
fi
if [ -n "$DOCKER_VITE_SUPABASE_URL" ]; then
  VITE_SUPABASE_URL="$DOCKER_VITE_SUPABASE_URL"
fi
if [ -n "$DOCKER_VITE_SUPABASE_ANON_KEY" ]; then
  VITE_SUPABASE_ANON_KEY="$DOCKER_VITE_SUPABASE_ANON_KEY"
fi
if [ -n "$DOCKER_VITE_SUPABASE_PUBLISHABLE_KEY" ]; then
  VITE_SUPABASE_PUBLISHABLE_KEY="$DOCKER_VITE_SUPABASE_PUBLISHABLE_KEY"
fi
if [ -n "$DOCKER_VITE_SYSTEM_TENANT_ID" ]; then
  VITE_SYSTEM_TENANT_ID="$DOCKER_VITE_SYSTEM_TENANT_ID"
fi
if [ -n "$DOCKER_VITE_CALCOM_URL" ]; then
  VITE_CALCOM_URL="$DOCKER_VITE_CALCOM_URL"
fi
if [ -n "$DOCKER_VITE_OPENREPLAY_PROJECT_KEY" ]; then
  VITE_OPENREPLAY_PROJECT_KEY="$DOCKER_VITE_OPENREPLAY_PROJECT_KEY"
fi
if [ -n "$DOCKER_VITE_OPENREPLAY_INGEST_POINT" ]; then
  VITE_OPENREPLAY_INGEST_POINT="$DOCKER_VITE_OPENREPLAY_INGEST_POINT"
fi
if [ -n "$DOCKER_VITE_OPENREPLAY_DASHBOARD_URL" ]; then
  VITE_OPENREPLAY_DASHBOARD_URL="$DOCKER_VITE_OPENREPLAY_DASHBOARD_URL"
fi

# Normalize OpenReplay env names so frontend runtime always gets VITE_* keys.
# This allows Doppler projects using OPENREPLAY_* naming to work without renaming secrets.
if [ -z "$VITE_OPENREPLAY_PROJECT_KEY" ] && [ -n "$OPENREPLAY_PROJECT_KEY" ]; then
  VITE_OPENREPLAY_PROJECT_KEY="$OPENREPLAY_PROJECT_KEY"
fi
if [ -z "$VITE_OPENREPLAY_INGEST_POINT" ] && [ -n "$OPENREPLAY_INGEST_POINT" ]; then
  VITE_OPENREPLAY_INGEST_POINT="$OPENREPLAY_INGEST_POINT"
fi
if [ -z "$VITE_OPENREPLAY_DASHBOARD_URL" ] && [ -n "$OPENREPLAY_DASHBOARD_URL" ]; then
  VITE_OPENREPLAY_DASHBOARD_URL="$OPENREPLAY_DASHBOARD_URL"
fi

# CRITICAL: Always use version baked into Docker image (/app/VERSION) as source of truth
# This file is written during build with the git tag, ensuring version matches deployed code
# Do NOT trust VITE_APP_BUILD_VERSION env var which may be stale from .env file
IMAGE_VERSION=$(cat /app/VERSION 2>/dev/null || echo "")
if [ -n "$IMAGE_VERSION" ]; then
  VITE_APP_BUILD_VERSION="$IMAGE_VERSION"
else
  # Fallback to env var only if VERSION file doesn't exist (shouldn't happen in production)
  VITE_APP_BUILD_VERSION="${VITE_APP_BUILD_VERSION:-dev-local}"
fi

# Log startup metadata so docker logs show build + boot time
START_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "frontend start | build=${VITE_APP_BUILD_VERSION} | started=${START_TS}"


# Runtime environment variable injection
# Use JSON serialization to guarantee values are escaped safely for JavaScript.
node -e "const fs=require('fs'); const env={ VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '', VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '', VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '', VITE_AISHACRM_BACKEND_URL: process.env.VITE_AISHACRM_BACKEND_URL || '', VITE_CURRENT_BRANCH: process.env.VITE_CURRENT_BRANCH || 'main', VITE_CALCOM_URL: process.env.VITE_CALCOM_URL || '', VITE_OPENREPLAY_PROJECT_KEY: process.env.VITE_OPENREPLAY_PROJECT_KEY || process.env.OPENREPLAY_PROJECT_KEY || '', VITE_OPENREPLAY_INGEST_POINT: process.env.VITE_OPENREPLAY_INGEST_POINT || process.env.OPENREPLAY_INGEST_POINT || '', VITE_OPENREPLAY_DASHBOARD_URL: process.env.VITE_OPENREPLAY_DASHBOARD_URL || process.env.OPENREPLAY_DASHBOARD_URL || '', VITE_SYSTEM_TENANT_ID: process.env.VITE_SYSTEM_TENANT_ID || '', VITE_USER_HEARTBEAT_INTERVAL_MS: process.env.VITE_USER_HEARTBEAT_INTERVAL_MS || '90000', VITE_APP_BUILD_VERSION: process.env.VITE_APP_BUILD_VERSION || '' }; fs.writeFileSync('/app/dist/env-config.js', 'window._env_ = ' + JSON.stringify(env, null, 2) + ';\\n');"

: "${FRONTEND_PORT:=3000}"

# Start static server
exec sh -c "serve -s dist -l ${FRONTEND_PORT}"
