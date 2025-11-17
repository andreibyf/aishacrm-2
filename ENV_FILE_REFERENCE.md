# Environment Variables Summary

## n8n Integration

- `N8N_BASE_URL`: Base URL for your n8n instance. Example: `http://localhost:5678` (or `http://n8n:5678` when using a compose network).
- `N8N_API_KEY` (optional): API key used if n8n Public API is enabled. Adds header `X-N8N-API-KEY` on proxy requests.
- `N8N_BASIC_AUTH_USER` and `N8N_BASIC_AUTH_PASSWORD` (optional): If set, backend will send Basic Auth for legacy `/rest` endpoints. Pair this with enabling basic auth on the n8n service.

Backend exposes:
- `GET /api/integrations/n8n/workflows` — Lists workflows from n8n (supports Public API and legacy `/rest`).
- `GET /api/integrations/n8n/workflows/:id` — Retrieves a single workflow.
- `GET /api/integrations/n8n/health` — Checks reachability of the n8n service.

Setup notes:
- Public API: Generate a Personal API Key in n8n (User Profile) and set `N8N_API_KEY`.
- Legacy `/rest`: Enable Basic Auth on the n8n service and set `N8N_BASIC_AUTH_USER`/`N8N_BASIC_AUTH_PASSWORD` in `backend/.env`.

Set these in `backend/.env` and rebuild the backend container.
