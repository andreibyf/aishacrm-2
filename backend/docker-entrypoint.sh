#!/bin/sh
# Docker entrypoint for backend container with Doppler support

set -e

if [ -n "$DOPPLER_TOKEN" ]; then
  echo "[ENTRYPOINT] Starting backend with Doppler (project: ${DOPPLER_PROJECT:-aishacrm}, config: ${DOPPLER_CONFIG:-dev})"
  
  # Download ALL secrets to a file WITHOUT quotes
  doppler secrets download --no-file --format env-no-quotes --token "$DOPPLER_TOKEN" --project "${DOPPLER_PROJECT:-aishacrm}" --config "${DOPPLER_CONFIG:-dev}" > /tmp/.env
  
  echo "[ENTRYPOINT] Doppler secrets downloaded to /tmp/.env"
  
  # Export all variables from the env file (set -a before sourcing)
  set -a
  . /tmp/.env
  set +a
  
  echo "[ENTRYPOINT] GitHub secrets loaded: GH_TOKEN=${GH_TOKEN:0:20}..."
  
  # Use exec to replace shell with node process
  exec node server.js
else
  echo "[ENTRYPOINT] WARNING: DOPPLER_TOKEN not set, running without Doppler"
  exec node server.js
fi
