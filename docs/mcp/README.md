# MCP Server (Braid) — Runbook & Hardening

This document explains how to run and harden the local `braid-mcp-node-server` used by AiSHA CRM, and describes the audit logging we added so MCP actions that mutate data are recorded to `audit_log`.

## Purpose
- The MCP server exposes a single endpoint `/mcp/run` that accepts `BraidRequestEnvelope` batches and routes actions to adapters (e.g., `crm` adapter).
- We keep a self-hosted MCP server for production-sensitive operations to retain control over secrets, audit, and RLS enforcement.

## Files of interest
- `braid-mcp-node-server/src/server.ts` — HTTP server and entrypoint
- `braid-mcp-node-server/src/braid/adapters/crm.ts` — CRM adapter (calls backend or Supabase)
- `braid-mcp-node-server/src/lib/supabase.ts` — Supabase client helper
- `braid-mcp-node-server/docker-compose.yml` — Docker profile for running the MCP server

## Security & Hardening (recommended)
1. Secrets
   - Store `SUPABASE_SERVICE_ROLE_KEY` and `CRM_BACKEND_URL` in your secrets manager (Azure Key Vault, AWS Secrets Manager, or GitHub Actions secrets).
   - Do NOT place service role keys in frontend-accessible env files.

2. Least privilege
   - The MCP server should run with only the privileges it needs. Prefer a dedicated service-role key with minimum scopes for audit insertion and admin operations.
   - For developer convenience, use a separate dev Supabase project with reduced privileges.

3. Audit logging
   - The CRM adapter now writes a minimal audit row for `POST`, `PUT`, and `DELETE` actions to the `audit_log` table.
   - Audit row fields: `action`, `table_name`, `record_id`, `actor_id`, `request_id`, `payload`, `metadata`.
   - Audit insertion is non-blocking: failures do not stop MCP responses, but are logged.

4. Rate limiting and allow-listing
   - Run the MCP server behind a gateway that enforces rate limits (100 req/min default) and allow-lists the trusted clients if necessary.

5. Monitoring
   - Monitor MCP server logs and supabase `audit_log` entries.
   - Hook the MCP server to your centralized logging (Sentry/Datadog) for error alerts.

## Running locally (development)

Use the included Docker Compose or run with Node.

Using Docker Compose (recommended):

```powershell
# From repository root
docker compose -f braid-mcp-node-server/docker-compose.yml up --build
```

Using Node (local):

```powershell
cd braid-mcp-node-server
npm ci
# Provide env vars in a .env file or export in terminal
# Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY), CRM_BACKEND_URL
npm run dev
```

## Running in production
- Deploy the Docker image from `braid-mcp-node-server/Dockerfile` to your container platform.
- Use a secrets manager for `SUPABASE_SERVICE_ROLE_KEY` and ensure `CRM_BACKEND_URL` points to your internal backend.
- Expose only the necessary host/port and put MCP behind an API gateway with authentication.

## Developer convenience: proxy read requests to Supabase
- If you want faster developer workflows, enable `USE_DIRECT_SUPABASE_ACCESS=true` in env. This lets the CRM adapter perform read-only `supabase-js` queries for search operations.
- Only use this in dev or with a read-only key.

## Next improvements (optional)
- Add explicit request tracing fields to `audit_log` (e.g., trace_id) and correlate with application logs.
- Add a `schema_migrations` table to track applied MCP database changes.
- Provide a small management UI for viewing recent MCP activity and audit rows.

---

If you want, I can now:
- Add a Docker Compose override to run MCP in a `dev` profile with a dev Supabase project (Option A)
- Or create a small PoC that demonstrates safe remote MCP read-only usage against a dev Supabase project (Option B)

Which should I do next? (We can continue hardening and documenting, or run a dev PoC.)

## Developer run scripts (added)

### Dev Docker Compose

A `docker-compose.dev.yml` file is provided at `braid-mcp-node-server/docker-compose.dev.yml` to run a local development instance of the MCP server that mounts the repository and picks up env vars from a `.env` file in the `braid-mcp-node-server` folder.

From the repository root run:

```powershell
docker compose -f braid-mcp-node-server/docker-compose.dev.yml up --build
```

Ensure you set the following environment variables in `braid-mcp-node-server/.env` (or export them in your shell):

- `SUPABASE_URL` - dev Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - dev service role key (keep secret)
- `CRM_BACKEND_URL` - backend URL for dev (e.g. `http://host.docker.internal:4001`)
- `USE_DIRECT_SUPABASE_ACCESS` - set to `true` for read-only direct supabase reads (dev only)

### Test audit insertion

A test script is available at `braid-mcp-node-server/scripts/test-mcp-audit.js`. It sends a sample `BraidRequestEnvelope` to the local `/mcp/run` endpoint and then queries Supabase `audit_log` for the `request_id` to verify the audit insertion.

Run it from the `braid-mcp-node-server` folder (after installing dependencies):

```powershell
cd braid-mcp-node-server
npm ci
# Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in environment
npm run test-audit
```

The script will fail if it cannot find `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`, or if no audit row is found for the generated `request_id`.

Use this script to validate end-to-end behavior in your dev environment before enabling MCP in staging/production.

## DB migration & CI

- Migration: `backend/migrations/053_add_audit_log_request_id.sql` — adds a `request_id text` column and indexes on `tenant_id, user_email, request_id, created_at`.

- Apply the migration with your usual migration tool or via `psql` against your Supabase/Postgres instance. Example using `psql`:

```powershell
# From repository root (replace connection string as appropriate)
psql "${env:DATABASE_URL}" -f backend/migrations/053_add_audit_log_request_id.sql
```

- CI workflow: `.github/workflows/mcp-audit-test.yml` — manual or PR-triggered job that:
   - installs dependencies in `braid-mcp-node-server`, starts the MCP server, and runs `scripts/test-mcp-audit.js`.
   - Requires repository secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

To add the secrets in GitHub: `Settings` → `Secrets` → `Actions` → `New repository secret`.

Note: The workflow starts the MCP server inside the runner for the test; it uses `SUPABASE_SERVICE_ROLE_KEY` so ensure the key points to a safe dev Supabase project and does not contain production data.

 - Optional migration-run secrets (for dev-only workflows):
    - `DATABASE_URL` — optional Postgres connection string for the dev database. If provided with `RUN_MIGRATIONS=true`, the CI workflow will apply `backend/migrations/053_add_audit_log_request_id.sql` before running the tests.
    - `RUN_MIGRATIONS` — set to `true` to enable applying migrations from the runner (only for disposable/dev projects).
 - Auto-create tenant option (dev/CI only):
    - `AUTO_CREATE_TENANT` — when set to `true` (or when the runner sets `CI=true`), the test script will attempt to create a minimal tenant row in the Supabase project if no tenant exists or if `TENANT_ID` cannot be resolved. Only enable this for disposable/dev projects.
    - `AUTO_CREATE_TENANT_SLUG` — optional slug to use when auto-creating the tenant (defaults to `auto-tenant-<timestamp>`).
    - `AUTO_CREATE_TENANT_NAME` — optional name to use for the auto-created tenant.
Required repository secrets (set in `Settings → Secrets → Actions`):
- `SUPABASE_URL` — your dev Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key for the dev Supabase project (keep secret)

Optional but recommended:
- `TENANT_ID` — a tenant UUID or slug to use for the test. If omitted, the test attempts to auto-detect a tenant row in the Supabase project.

Important safety notes:
- Use a dedicated dev Supabase project — do NOT point these secrets at production data. The workflow runs with the service-role key and can modify data.
- If the Supabase `audit_log` table is missing the `request_id` column, the test will fail and report that the migration `backend/migrations/053_add_audit_log_request_id.sql` should be applied.

To trigger the workflow manually:
1. Add the required secrets to the repository.
2. Go to the `Actions` tab → `MCP Audit Test` → `Run workflow` → select branch → click `Run workflow`.

The workflow waits for `http://localhost:8000` to be available before running the test. If the server doesn't start in time, the job will fail with a helpful message.

## Redaction policy

- The adapter now redacts commonly sensitive keys (matches: `email`, `ssn`, `social_security`, `phone`, `card`, `creditcard`, `password`, `pwd`) before writing the `changes` JSON into `audit_log`. If you need a stricter policy, we can extend the redaction list or add per-tenant exceptions.
