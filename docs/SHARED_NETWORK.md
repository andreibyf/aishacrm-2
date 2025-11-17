# Shared Network: `aishanet`

This repo uses a user-defined Docker bridge network named `aishanet` to let multiple Compose stacks communicate by stable service names.

Why
- Keep core app (frontend/backend/redis/n8n) and the MCP server in separate repos/stacks
- Enable direct container-to-container access without exposing extra ports
- Avoid host-specific addresses (works on any machine/VM)

What it gives you
- Backend can reach MCP by service name: `http://braid-mcp-node-server:8000`
- MCP can reach backend and redis via host-mapped ports or by joining the same network
- System Health dashboard probes MCP via the shared network first for reliability

How to use
1) Core stack creates the network (fixed name):
   ```powershell
   cd <repo-root>
   docker compose up -d --build
   ```
   This creates `aishanet` once.

2) MCP stack joins the same network:
   - In `braid-mcp-node-server/docker-compose.yml`:
     ```yaml
     networks:
       - aishanet
     
     networks:
       aishanet:
         external: true
     ```
   - Start it:
     ```powershell
     cd braid-mcp-node-server
     docker compose up -d --remove-orphans
     ```

3) Backend configuration
- `backend/.env`:
  ```env
  BRAID_MCP_URL=http://braid-mcp-node-server:8000
  MCP_NODE_HEALTH_URL=http://braid-mcp-node-server:8000/health
  ```
- No other host-specific URLs needed.

4) Health checks
- MCP health (host): `http://localhost:8000/health`
- Container-to-container (from backend): `http://braid-mcp-node-server:8000/health`
- Dashboard endpoint: `GET /api/system/containers-status`

Optional (legacy tile)
- The dashboard can show a deprecated `mcp-legacy` tile for debugging. It is hidden by default.
- To show it temporarily set in backend env:
  ```env
  SHOW_LEGACY_MCP=true
  ```
  Then restart backend.

Notes
- The network is created once and reused by both stacks.
- If you rebuild or move hosts, just bring up the core stack first so `aishanet` exists.
- You can still override MCP targets per environment using the same env vars.
