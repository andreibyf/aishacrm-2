# Full Endpoint Testing Guide

This guide shows how to run comprehensive backend endpoint tests on demand (not just the recent additions).

## Scripts Available

- `test-all-endpoints.sh` (Linux/macOS) – Bash-based curl runner.
- `test-all-endpoints.ps1` (Windows PowerShell) – Native PowerShell runner.

Both scripts exercise a broad set of API categories and produce JSON summaries you can archive or diff.

## Prerequisites

1. Backend container running on `http://localhost:4001` (Docker default).
2. A tenant UUID you can safely use for list endpoints (e.g. a test tenant). Set in script params: `TENANT_ID` / `-TenantId`.
3. Optional auth: If endpoints require auth, set an environment variable `AISHA_API_TOKEN` (Bearer token) before running PowerShell script. Bash script currently unauthenticated; adapt by adding `-H "Authorization: Bearer $TOKEN"` to curl calls if needed.

## Windows Usage

```powershell
Get-Location
cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
# Optional: $env:AISHA_API_TOKEN="<token>"
./test-all-endpoints.ps1 -BaseUrl "http://localhost:4001" -TenantId "test-tenant-001" -OutFile "endpoint-test-results.ps1.json"
```

## Linux/macOS Usage

```bash
cd ~/Documents/GitHub/ai-sha-crm-copy-c872be53
# Optional: export TOKEN=<token>
bash test-all-endpoints.sh
```

## Output

- Bash script: `endpoint-test-results.json`
- PowerShell script: `endpoint-test-results.ps1.json`

Each contains:
```json
{
  "timestamp": "2025-11-16T12:00:00Z",
  "base_url": "http://localhost:4001",
  "tenant_id": "test-tenant-001",
  "summary": { "total": 42, "passed": 40, "failed": 2 },
  "results": [ { "method": "GET", "path": "/api/accounts?tenant_id=...", "status": 200, "result": "PASS" } ]
}
```

Status codes 200–499 are treated as responsive (PASS) to surface availability; 5xx classify as FAIL (server error). Adjust logic if you need stricter expectations (e.g., treat 4xx as FAIL).

## Extending Coverage

Add new objects to `$endpoints` in `test-all-endpoints.ps1` or new `test_endpoint` lines in the Bash script.
For write operations that require payloads, supply a minimal JSON body; prefer test tenants/data to avoid polluting production records.

## Troubleshooting 404s

- Confirm exact path matches mounted route in `backend/server.js`. Example: AI Campaigns base path is `/api/aicampaigns` (no dash, not `/api/ai/campaigns`).
- Ensure query parameters like `tenant_id` are included where required; missing tenant results in 400 or empty set rather than 404.
- A 404 with payload `{ "message": "Endpoint not found" }` indicates path spelling rather than resource absence.

## Next Improvements

- Add auth header injection for Bash variant.
- Include latency and response size metrics.
- Parallelize requests (PowerShell jobs or GNU parallel) for performance profiling.

---
Run these regularly (e.g., pre-deploy) to catch regressions across the full API surface.
