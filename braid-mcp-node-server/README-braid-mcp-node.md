# Braid MCP Node.js Server (Dockerized)

This package provides a minimal Node.js + TypeScript HTTP server that exposes
a Braid v0 executor over a simple JSON API suitable for use as an AI "MCP-style"
tool server.

## Features

- Braid v0 framework included (`src/braid/*`).
- In-memory registry with a `MockAdapter` (replace with real CRM/ERP adapters).
- HTTP API:
  - `GET /health` – health check.
  - `POST /mcp/run` – execute a `BraidRequestEnvelope`.
- Dockerfile for containerized deployment.
- `docker-compose.yml` to run the service on port 8000.

## API Contract

### POST /mcp/run

**Request body:** `BraidRequestEnvelope` (JSON)

```ts
interface BraidRequestEnvelope {
  requestId: string;
  actor: {
    id: string;
    type: "user" | "agent" | "system";
    roles?: string[];
  };
  actions: BraidAction[];
  createdAt: string;
  client?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}
```

**Response body:** `BraidResponseEnvelope`

```ts
interface BraidResponseEnvelope {
  requestId: string;
  results: BraidActionResult[];
  startedAt: string;
  finishedAt: string;
  metadata?: Record<string, unknown>;
}
```

## Quickstart (local)

```bash
npm install
npm run build
npm start
# server listens on http://localhost:8000
```

Test with:

```bash
curl -X POST http://localhost:8000/mcp/run \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "demo-req-1",
    "actor": {"id": "agent:demo", "type": "agent"},
    "createdAt": "2025-01-01T00:00:00.000Z",
    "client": "demo-client",
    "channel": "agent",
    "actions": [{
      "id": "action-1",
      "verb": "read",
      "actor": {"id": "agent:demo", "type": "agent"},
      "resource": {"system": "mock", "kind": "example-entity"},
      "targetId": "123"
    }]
  }'
```

## Docker

Build and run directly:

```bash
docker build -t braid-mcp-server .
docker run -p 8000:8000 --name braid-mcp braid-mcp-server
```

Or via docker-compose:

```bash
docker-compose up --build
```

Service will be available at `http://localhost:8000`.

## Integration Notes

- Replace `MockAdapter` in `src/braid/adapters/mock.ts` with real adapters
  (e.g., `crm.ts`, `erp.ts`) and register them in `src/server.ts`.
- Wire this container into your AI stack as a remote tool endpoint.
- Add auth (API keys, JWT, mTLS, etc.) in `src/server.ts` as needed.
