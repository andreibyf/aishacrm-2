# Agent Office Add-on (Option 2: Sidecar + Event Bus + Viz)

## What this is
An **observability tool** that visualizes AiSHA agent work in real-time. When users click "Ask AiSHA" buttons on entity profiles (Contacts, Accounts, Leads, Opportunities), the Ops Manager routes tasks to specialist agents (Sales Manager, Project Manager, etc.) who execute them behind the scenes using Braid tools. The office visualization shows these agents as animated characters picking up tasks, working on them, and completing them.

**This is NOT the primary user interface** — it's a developer/admin tool for watching agent activity.

### How it works
1. User clicks "Ask AiSHA" on a Contact/Account/Lead profile
2. User types a task (e.g., "Draft follow-up email", "Analyze pipeline")
3. Ops Manager routes to appropriate agent (Sales Manager, Project Manager, etc.)
4. Agent executes using allowed tools from their toolkit
5. Office visualization at `http://localhost:4010` shows the agent workflow in real-time

### Technical Implementation
The core app only writes NDJSON telemetry logs (best-effort). A sidecar publishes events to an event bus (Redpanda/Kafka by default), and the `office-viz` service provides an SSE stream and animated UI.

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
