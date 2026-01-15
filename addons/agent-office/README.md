# Agent Office Add-on (Option 2: Sidecar + Event Bus + Viz)

## What this is
An add-on that visualizes AiSHA "office roles" by subscribing to telemetry events. The core app only writes NDJSON telemetry logs (best-effort). A sidecar publishes events to an event bus (Redpanda/Kafka by default), and the `office-viz` service provides an SSE stream and a minimal UI.

## Enable core telemetry
Set in your core backend container:

- `TELEMETRY_ENABLED=true`
- `TELEMETRY_LOG_PATH=/var/log/aisha/telemetry.ndjson`

Mount the **same named volume** as `aisha_telemetry` at `/var/log/aisha` in the core container.

## Run add-on services
From this folder:

```bash
docker compose -f docker-compose.agent-office.yml up -d --build
```

Then open:
- `http://localhost:4010` (basic event tap UI)

## Next steps
- Replace the minimal UI with an animated "office workers" canvas (PixiJS recommended).
- Add a recorder/indexer if you want long-run replay beyond the in-memory buffer.
- Emit more granular events: task_started, handoff, tool_call_started, tool_call_finished, etc.
