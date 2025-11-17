#!/bin/sh
set -e
REQUIRED="SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY CRM_BACKEND_URL"
MISSING=""
for v in $REQUIRED; do
  if [ -z "$(printenv $v)" ]; then
    MISSING="$MISSING $v"
  fi
done
if [ -n "$MISSING" ]; then
  echo "[ENTRYPOINT] Missing required env vars:$MISSING"
  if [ "$NODE_ENV" = "production" ]; then
    echo "[ENTRYPOINT] Exiting because required env vars missing in production."
    exit 1
  else
    echo "[ENTRYPOINT] Continuing (dev mode)."
  fi
fi
exec "$@"
