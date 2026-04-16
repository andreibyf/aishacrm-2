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

  # Export saved Docker vars so they survive into the doppler run subprocess
  # (doppler run inherits the full environment; we re-apply overrides inside sh -c)
  export DOCKER_PUBLIC_SCHEDULER_URL DOCKER_VITE_CALCOM_URL DOCKER_CALCOM_PUBLIC_URL

  # Use plain sh -c (no `env VAR=val` prefix) so all Doppler-injected secrets
  # are preserved in the child environment unchanged.
  exec doppler run --token "$DOPPLER_TOKEN" --project "${DOPPLER_PROJECT:-aishacrm}" --config "${DOPPLER_CONFIG:-prd_prd}" -- \
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
      # Fallback: ensure backend startup guard has a scheduler URL even when
      # only Cal.com-facing vars are provided by Doppler.
      if [ -z "$PUBLIC_SCHEDULER_URL" ]; then
        if [ -n "$CALCOM_PUBLIC_URL" ]; then
          export PUBLIC_SCHEDULER_URL="$CALCOM_PUBLIC_URL"
        elif [ -n "$VITE_CALCOM_URL" ]; then
          export PUBLIC_SCHEDULER_URL="$VITE_CALCOM_URL"
        fi
      fi
      exec "$@"
    ' sh "$@"
else
  echo "[ENTRYPOINT] WARNING: DOPPLER_TOKEN not set, running without Doppler"
  exec "$@"
fi
