#!/bin/sh
set -e

if [ -n "$DOPPLER_TOKEN" ]; then
  echo "[ENTRYPOINT] Using Doppler for secrets injection"
  exec doppler run --project "${DOPPLER_PROJECT:-aishacrm}" --config "${DOPPLER_CONFIG:-prd}" -- "$@"
else
  echo "[ENTRYPOINT] WARNING: DOPPLER_TOKEN not set, running without Doppler"
  exec "$@"
fi
