#!/bin/sh
# Docker entrypoint for backend container with Doppler support

set -e

if [ "$#" -eq 0 ]; then
  set -- node server.js
fi

# Preserve Docker-provided scheduler URL values so they can be restored
# after Doppler injects secrets for the child process.
DOCKER_PUBLIC_SCHEDULER_URL="${PUBLIC_SCHEDULER_URL}"
DOCKER_VITE_CALCOM_URL="${VITE_CALCOM_URL}"
DOCKER_CALCOM_PUBLIC_URL="${CALCOM_PUBLIC_URL}"

if [ -n "$DOPPLER_TOKEN" ]; then
  echo "[ENTRYPOINT] Starting backend with Doppler (project: ${DOPPLER_PROJECT:-aishacrm}, config: ${DOPPLER_CONFIG:-prd_prd})"

  # Use 'doppler run' to inject secrets, then restore selected Docker overrides
  # needed for local scheduler URL behavior in development.
  exec doppler run --token "$DOPPLER_TOKEN" --project "${DOPPLER_PROJECT:-aishacrm}" --config "${DOPPLER_CONFIG:-prd_prd}" -- \
    env \
      DOCKER_PUBLIC_SCHEDULER_URL="$DOCKER_PUBLIC_SCHEDULER_URL" \
      DOCKER_VITE_CALCOM_URL="$DOCKER_VITE_CALCOM_URL" \
      DOCKER_CALCOM_PUBLIC_URL="$DOCKER_CALCOM_PUBLIC_URL" \
      sh -c '
        if [ -n "$DOCKER_PUBLIC_SCHEDULER_URL" ]; then
          export PUBLIC_SCHEDULER_URL="$DOCKER_PUBLIC_SCHEDULER_URL"
        fi
        if [ -n "$DOCKER_VITE_CALCOM_URL" ]; then
          export VITE_CALCOM_URL="$DOCKER_VITE_CALCOM_URL"
        fi
        if [ -n "$DOCKER_CALCOM_PUBLIC_URL" ]; then
          export CALCOM_PUBLIC_URL="$DOCKER_CALCOM_PUBLIC_URL"
        fi
        exec "$@"
      ' sh "$@"
else
  echo "[ENTRYPOINT] WARNING: DOPPLER_TOKEN not set, running without Doppler"
  exec "$@"
fi
