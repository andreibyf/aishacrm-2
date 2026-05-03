# Local Dev Quickstart

Updated: 2026-05-02

Goal: clone, install, run, and hit `/api/system/health` in under 10 minutes.
For anything deeper, see [DEVELOPER_MANUAL.md](./DEVELOPER_MANUAL.md).

> Port conflict warning: Docker mode (4000/4001) and local-dev mode (5173/3001) cannot run at the same time if both expose the same backend instance — pick one. The two modes are mutually exclusive for a given session.

---

## 1. Prerequisites

Install once. Versions matter — Node 22 is required.

```bash
# Windows (PowerShell, via scoop/winget)
winget install OpenJS.NodeJS.LTS         # Node 22+
winget install Docker.DockerDesktop
winget install Git.Git
scoop install doppler                    # or: https://docs.doppler.com/docs/install-cli
```

---

## 2. Clone + install

The canonical remote is Gitea. GitHub is a read-only mirror.

```bash
git clone https://gitea.aishacrm.com/aishacrm/aishacrm-2.git
cd aishacrm-2
npm install
cd backend && npm install && cd ..
cp .env.example .env && cp backend/.env.example backend/.env
```

Git Credential Manager will prompt once and cache your Gitea token in Windows Credential Manager.

---

## 3. Configure Doppler

Auth, point at the personal dev config, write the token into both `.env` files.

```bash
doppler login
doppler setup --project aishacrm --config dev_personal --no-interactive
doppler configure get token --plain >> .env && doppler configure get token --plain >> backend/.env
```

`dev_personal` overrides `aishacrm/dev`. Don't edit `dev` directly — it's locked shared baseline.

---

## 4. Run (pick one mode)

### Mode A: Local dev (recommended for iteration — fast HMR, nodemon)

Two terminals.

```bash
# Terminal 1 — frontend on http://localhost:5173
npm run dev

# Terminal 2 — backend on http://localhost:3001
cd backend && npm run dev
```

### Mode B: Docker (production-like)

```bash
docker compose up -d --build
docker compose ps
```

Frontend at `http://localhost:4000`, backend at `http://localhost:4001`. Brings up redis-memory, redis-cache, braid-mcp-server, and litellm alongside.

---

## 5. Smoke test

```bash
# Local-dev mode
curl http://localhost:3001/api/system/health

# Docker mode
curl http://localhost:4001/api/system/health
```

Expected: HTTP 200 with JSON `{ "status": "ok", ... }`. If you see this, you're done.

---

## 6. Pre-push tests

Husky runs `backend/scripts/run-tests-precheck.sh` (~480 deterministic tests, <90s, no service dependencies) on every `git push`. The hook prefers the `aishacrm-backend` Docker container; if it's not running, it runs on the host.

```bash
# Run manually anytime
cd backend && npm run test:precheck

# Skip the hook for a one-off push (use sparingly)
git push --no-verify

# Or override the tier (don't make this default)
BACKEND_TESTS=skip git push
```

Heavier tiers (`safe`, `full`) need `docker compose up -d backend` first.

---

## 7. Common issues

| Symptom                              | Fix                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `EADDRINUSE :3001` / `:5173`         | `Get-NetTCPConnection -LocalPort 3001 \| % { Stop-Process -Id $_.OwningProcess -Force }`                         |
| `doppler: not authenticated`         | `doppler login` then `doppler setup --project aishacrm --config dev_personal`                                    |
| Backend 500s on Redis calls          | Docker mode requires `docker compose up -d redis-memory redis-cache`; local-dev needs Docker Desktop running     |
| Wrong Supabase data                  | Dev points at `nrtrjsatmsosslxwlmoj.supabase.co` (preview). Staging is `bjedfowimuwbcnruwcdj` — don't cross them |
| `DOPPLER_TOKEN missing` in container | Ensure token is in `.env` AND `backend/.env`; rebuild: `docker compose up -d --build backend`                    |

---

## What's not in this doc

- Architecture, Braid DSL, AI engine internals → [DEVELOPER_MANUAL.md](./DEVELOPER_MANUAL.md)
- Migrations, RLS, schema reference → [DATABASE_GUIDE.md](./DATABASE_GUIDE.md), [DATABASE_REFERENCE.md](../reference/DATABASE_REFERENCE.md)
- Deployment, Coolify, VPS topology → [DEPLOYMENT_AND_OPS](../admin-guides/) and [ADMIN_GUIDE.md](../admin-guides/ADMIN_GUIDE.md)
- Operational procedures, migration workflow, lessons learned → [COPILOT_PLAYBOOK.md](./COPILOT_PLAYBOOK.md)
