#!/usr/bin/env sh
set -e

# Auto-detect version from Docker image label if VITE_APP_BUILD_VERSION not set
if [ -z "$VITE_APP_BUILD_VERSION" ] || [ "$VITE_APP_BUILD_VERSION" = "dev-local" ]; then
  # Try to extract version from image metadata (set during GitHub Actions build)
  IMAGE_VERSION=$(cat /app/VERSION 2>/dev/null || echo "")
  if [ -n "$IMAGE_VERSION" ]; then
    VITE_APP_BUILD_VERSION="$IMAGE_VERSION"
  else
    VITE_APP_BUILD_VERSION="dev-local"
  fi
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

: "${PORT:=3000}"

# Start static server
exec sh -c "serve -s dist -l ${PORT}"
