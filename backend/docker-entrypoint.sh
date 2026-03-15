#!/bin/sh
# Docker entrypoint for backend container with Doppler support

set -e

if [ "$#" -eq 0 ]; then
  set -- node server.js
fi

if [ -n "$DOPPLER_TOKEN" ]; then
  echo "[ENTRYPOINT] Starting backend with Doppler (project: ${DOPPLER_PROJECT:-aishacrm}, config: ${DOPPLER_CONFIG:-prd_prd})"
  
  # Use 'doppler run' to inject secrets directly into the node process
  # This ensures all Doppler secrets are available as environment variables
  exec doppler run --token "$DOPPLER_TOKEN" --project "${DOPPLER_PROJECT:-aishacrm}" --config "${DOPPLER_CONFIG:-prd_prd}" -- "$@"
else
  echo "[ENTRYPOINT] WARNING: DOPPLER_TOKEN not set, running without Doppler"
  exec "$@"
fi
