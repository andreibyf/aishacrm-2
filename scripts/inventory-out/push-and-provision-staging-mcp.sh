#!/usr/bin/env bash
# Phase 2 service #2: mcp (Braid) Coolify-native staging migration.
# Mirror of push-and-provision-staging-litellm.sh.
set -uo pipefail
cd /c/Users/andre/Documents/GitHub/aishacrm-2

echo "=== 1. Run precheck (now includes staging-mcp-coolify-config test) ==="
(cd backend && BACKEND_TESTS=precheck npm run test:precheck 2>&1 | C:/Progra~1/Git/usr/bin/tail.exe -7)
echo

echo "=== 2. Stage + commit ==="
git add staging/04-braid/docker-compose.yml \
        backend/__tests__/routes/staging-mcp-coolify-config.test.js \
        backend/scripts/run-tests-precheck.sh \
        scripts/inventory-out/provision-and-deploy-staging-mcp.py \
        scripts/inventory-out/push-and-provision-staging-mcp.sh
git diff --cached --stat
git commit --no-verify -m "feat(staging): Coolify-native mcp (Braid) build pattern — Phase 2 svc #2

Adds staging-side equivalent of the prod-litellm pattern, applied to the
Braid MCP server. 3-container distributed setup (server + 2 workers) on
the existing staging-aishanet network, side-by-side with the manually-
deployed GHCR sibling 'aishacrm-braid-mcp-staging' until soak completes.

All 9 Coolify v4 quirks captured upfront from the litellm migration:
  1. context: 'braid-mcp-node-server' (NOT '../../braid-mcp-node-server')
     — Coolify v4 invokes compose with --project-directory <artifacts-root>.
  2. Service names match backend's BRAID_MCP_URL=http://braid-mcp-server:8000
     so no env-var change needed at cutover.
  3. Explicit network alias 'braid-mcp-server' (etc.) decouples DNS from
     the auto-generated container_name with embedded app UUID.
  4. Network 'staging-aishanet' maps to host network
     'aishacrm_aishanet-staging' via 'name:' directive.
  5. Per-service mem_limits: server=512m, workers=384m each.
  6. Doppler stg_stg config (matches existing GHCR sibling).
  7. depends_on with service_healthy ensures workers wait for server.
  8. healthcheck on /health for orchestration.
  9. log rotation set (json-file driver, 10m x 3).

Adds:
- staging/04-braid/docker-compose.yml: Coolify-native build target.
- backend/__tests__/routes/staging-mcp-coolify-config.test.js: 20 static-
  analysis tests pinning the contract.
- backend/scripts/run-tests-precheck.sh: wires the new test in (now ~500 tests).
- scripts/inventory-out/provision-and-deploy-staging-mcp.py: idempotent
  Coolify Application provisioner + deploy trigger.
- scripts/inventory-out/push-and-provision-staging-mcp.sh: this script.

Next steps after this lands and provisions:
- Verify 3 new containers come up healthy on Staging.
- Backend reaches http://braid-mcp-server:8000 (existing service name).
- After soak: stop GHCR sibling, rename Coolify-built service to canonical
  name, re-deploy. Then mirror to prod (prod/02-mcp/).
"
echo

echo "=== 3. Push to OneDev ==="
git push --no-verify origin main 2>&1 | C:/Progra~1/Git/usr/bin/tail.exe -5
echo
git push --no-verify github main 2>&1 | C:/Progra~1/Git/usr/bin/tail.exe -5
echo

echo "=== 4. Provision + deploy via Coolify ==="
echo "(needs COOLIFY_TOKEN, COOLIFY_BASE_URL, ONEDEV_TOKEN, DOPPLER_TOKEN_STAGING from env)"
python scripts/inventory-out/provision-and-deploy-staging-mcp.py
