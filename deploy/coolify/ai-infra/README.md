# ai-infra (rare-change, infrastructure tier)

**Services:** `ollama`, `litellm`

**Change cadence:** rare. Bumped only when image versions roll, models change,
or `litellm_config.yaml` is rewritten. Separate from Braid (`ai-runtime`)
because those components evolve on different timelines.

## Current state — manual confirmation needed before Coolify cutover

- **Ollama** today runs as a **standalone Dockhand-managed container**
  (`aishacrm-ollama`) on the prod VPS, outside any repo compose. This file
  captures the intended Coolify definition. Do **not** apply this compose on
  top of the live container without:
  1. Stopping the standalone container cleanly
  2. Preserving the `ollama_data` volume (contains pulled model weights)
  3. Confirming the new container binds the same volume so models don't
     re-download
- **LiteLLM** today is defined in the root `docker-compose.prod.yml`. That
  definition remains authoritative until Coolify cuts over.

## Consumers

| Consumer                 | Domain    | Variable                        |
| ------------------------ | --------- | ------------------------------- |
| `aishacrm-backend`       | aisha-app | `LITELLM_BASE_URL` (→ litellm)  |
| `aishacrm-backend` (dev) | aisha-app | `LOCAL_LLM_BASE_URL` (→ ollama) |

In prod, PEP uses Groq (not Ollama) — see `PEP_LLM_PROVIDER=groq` on the
backend. Ollama is used for local-LLM summaries (`SUMMARY_LLM_MODEL`).

## Model preload

The entrypoint currently pulls `llama3.2:3b` and `qwen2.5-coder:3b`. Production
has historically run `llama3.1:8b` per Doppler `SUMMARY_LLM_MODEL`. If migrating,
either:

- Update the entrypoint to preload `llama3.1:8b`, or
- Run `ollama pull llama3.1:8b` as a Coolify post-start hook

The pulled-model volume `ollama_data` is the canonical cache and must be
preserved across container replacements.

## Memory

The container is capped at **8GB** to match the current Dockhand deployment.
Increase if loading larger models.
