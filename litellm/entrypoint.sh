#!/bin/sh
set -e

if [ -n "$DOPPLER_TOKEN" ]; then
  echo "[LITELLM ENTRYPOINT] Starting with Doppler (project: ${DOPPLER_PROJECT:-aishacrm}, config: ${DOPPLER_CONFIG:-dev_personal})"
  DOPPLER_PROJECT_NAME="${DOPPLER_PROJECT:-aishacrm}"
  DOPPLER_CONFIG_NAME="${DOPPLER_CONFIG:-dev_personal}"
  export LITELLM_MASTER_KEY="$(doppler secrets get LITELLM_MASTER_KEY --plain --token "$DOPPLER_TOKEN" --project "$DOPPLER_PROJECT_NAME" --config "$DOPPLER_CONFIG_NAME" || true)"
  export OPENAI_API_KEY="$(doppler secrets get OPENAI_API_KEY --plain --token "$DOPPLER_TOKEN" --project "$DOPPLER_PROJECT_NAME" --config "$DOPPLER_CONFIG_NAME" || true)"
  export ANTHROPIC_API_KEY="$(doppler secrets get ANTHROPIC_API_KEY --plain --token "$DOPPLER_TOKEN" --project "$DOPPLER_PROJECT_NAME" --config "$DOPPLER_CONFIG_NAME" || true)"
  export GROQ_API_KEY="$(doppler secrets get GROQ_API_KEY --plain --token "$DOPPLER_TOKEN" --project "$DOPPLER_PROJECT_NAME" --config "$DOPPLER_CONFIG_NAME" || true)"
else
  echo "[LITELLM ENTRYPOINT] WARNING: DOPPLER_TOKEN not set, starting without Doppler secrets"
fi

exec litellm --config /app/config.yaml --port 4000 --host 0.0.0.0
