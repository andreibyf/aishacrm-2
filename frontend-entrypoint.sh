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

# Fetch secrets from Doppler if token is available
if [ -n "$DOPPLER_TOKEN" ]; then
  echo "Fetching frontend secrets from Doppler..."
  # Export Doppler secrets as environment variables
  # Use doppler run with --command to set env vars in the current shell context
  eval "$(doppler secrets download --no-file --format env --token $DOPPLER_TOKEN --project ${DOPPLER_PROJECT:-aishacrm} --config ${DOPPLER_CONFIG:-prd_prd})"
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
cat > /app/dist/env-config.js << EOF
window._env_ = {
  VITE_SUPABASE_URL: "${VITE_SUPABASE_URL}",
  VITE_SUPABASE_ANON_KEY: "${VITE_SUPABASE_ANON_KEY}",
  VITE_SUPABASE_PUBLISHABLE_KEY: "${VITE_SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_ANON_KEY}}",
  VITE_AISHACRM_BACKEND_URL: "${VITE_AISHACRM_BACKEND_URL}",
  VITE_CURRENT_BRANCH: "${VITE_CURRENT_BRANCH:-main}",
  VITE_SYSTEM_TENANT_ID: "${VITE_SYSTEM_TENANT_ID}",
  VITE_USER_HEARTBEAT_INTERVAL_MS: "${VITE_USER_HEARTBEAT_INTERVAL_MS:-90000}",
  VITE_APP_BUILD_VERSION: "${VITE_APP_BUILD_VERSION}"
};
EOF

: "${FRONTEND_PORT:=3000}"

# Start static server
exec sh -c "serve -s dist -l ${FRONTEND_PORT}"
