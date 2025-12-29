#!/bin/sh
# Docker entrypoint for backend container with Doppler support

set -e

if [ -n "$DOPPLER_TOKEN" ]; then
  echo "[ENTRYPOINT] Starting backend with Doppler (project: ${DOPPLER_PROJECT:-aishacrm}, config: ${DOPPLER_CONFIG:-dev})"
  exec doppler run --token "$DOPPLER_TOKEN" --project "${DOPPLER_PROJECT:-aishacrm}" --config "${DOPPLER_CONFIG:-dev}" -- node server.js
else
  echo "[ENTRYPOINT] WARNING: DOPPLER_TOKEN not set, running without Doppler"
  exec node server.js
fi
