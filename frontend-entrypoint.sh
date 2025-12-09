#!/usr/bin/env sh
set -e

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
