#!/bin/sh
set -e

if [ -n "$DOPPLER_TOKEN" ]; then
  echo "[LITELLM ENTRYPOINT] Starting with Doppler (project: ${DOPPLER_PROJECT:-aishacrm}, config: ${DOPPLER_CONFIG:-dev_personal})"
  DOPPLER_PROJECT_NAME="${DOPPLER_PROJECT:-aishacrm}"
  DOPPLER_CONFIG_NAME="${DOPPLER_CONFIG:-dev_personal}"

  set_secret_if_present() {
    secret_name="$1"
    secret_value="$(doppler secrets get "$secret_name" --plain --token "$DOPPLER_TOKEN" --project "$DOPPLER_PROJECT_NAME" --config "$DOPPLER_CONFIG_NAME" || true)"
    if [ -n "$secret_value" ]; then
      export "$secret_name=$secret_value"
    fi
  }

  set_secret_if_present "LITELLM_MASTER_KEY"
  set_secret_if_present "OPENAI_API_KEY"
  set_secret_if_present "ANTHROPIC_API_KEY"
  set_secret_if_present "GROQ_API_KEY"
else
  echo "[LITELLM ENTRYPOINT] WARNING: DOPPLER_TOKEN not set, starting without Doppler secrets"
fi

exec litellm --config /app/config.yaml --port 4000 --host 0.0.0.0
