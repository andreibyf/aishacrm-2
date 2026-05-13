# CI/CD Pre-Push Pipeline

**Hook:** `.husky/pre-push` (v4.9.4)
**Trigger:** every `git push` — runs locally before the remote receives anything
**Skip (emergency only):** `git push --no-verify`

---

## Overview

Four sequential checks run before your push lands. A failure in any step blocks the push and exits with a non-zero code. All steps are designed to be fast on the common-case path (only changed files, not the full tree).

```
[1/4] ESLint      → changed JS/TS files only  (full fallback >200 files)
[2/4] Vite build  → full production build
[3/4] Vitest      → affected frontend tests   (full fallback >50 src files)
[4/4] Backend     → precheck tier by default  (configurable via env var)
```

---

## Step 1 — ESLint (changed files only)

Diffs `origin/main..HEAD` for `.js .jsx .ts .tsx` files.

| Files changed | Behaviour |
|---|---|
| 0 | Skip — "No JS/TS files changed" |
| 1–200 | `eslint --max-warnings 9999` on changed files only via `git diff -z \| xargs -0` (shell-injection safe) |
| >200 | Full `npm run lint -- --max-warnings 9999` |

Push is blocked on any lint error.

---

## Step 2 — Vite Build

```sh
npm run build:ci
```

Full production build. Catches type errors, bad imports, and tree-shaking failures that ESLint misses. Push is blocked on build failure.

---

## Step 3 — Vitest (frontend tests)

Scope is determined by `src/**` file changes vs `origin/main`.

| `src/` files changed | Mode |
|---|---|
| 0 | Skip entirely |
| 1–50 | `vitest run --changed origin/main` — affected tests only |
| >50 | Full suite |

**Pool selection:** controlled by `vitest.config.ts` — `vmForks` on Windows, `threads` on Linux/Mac. The hook does **not** pass `--pool`; the config is the source of truth.

**Timeout:** 300s safety net. If Vitest times out and the JSON report shows `numFailedTests:0` + `numFailedTestSuites:0`, the push is allowed through.

**Runner bootstrap retry:** If Vitest fails with `failed to find the runner` or `Timeout starting.*runner`, the hook retries once with `--maxWorkers=1` (full suite, no `--changed` flag). A second failure blocks the push.

**Pass condition:** `numFailedTests === 0` AND `numFailedTestSuites === 0` in the JSON reporter output. A non-zero exit code alone is not enough to block — the hook inspects the JSON.

---

## Step 4 — Backend Tests

Controlled by the `BACKEND_TESTS` environment variable (default: `precheck`).

| `BACKEND_TESTS=` | What runs | Needs services? |
|---|---|---|
| `precheck` *(default)* | Curated deterministic subset (~90s) | No |
| `safe` | 16 grouped runs | Yes (Supabase + Redis) |
| `full` | ~2,300 tests (`npm test`) | Yes (all services) |
| `skip` | Nothing | — |

Override example:
```sh
BACKEND_TESTS=full git push
```

**Execution target:**
- If `aishacrm-backend` Docker container is running → `docker exec aishacrm-backend <cmd>`
- Otherwise → falls back to `cd backend && npm run test:precheck` on host (precheck only; `safe`/`full` require services)

**Full-suite flake handling:** if `BACKEND_TESTS=full` fails, the hook retries once (Node.js IPC fluke workaround), then falls back to `test:safe` before blocking.

---

## Precheck Suite (`backend/scripts/run-tests-precheck.sh`)

The `precheck` tier runs five groups — all deterministic, no live services required:

| Group | Test files |
|---|---|
| `middleware` | `__tests__/middleware/*.test.js` |
| `utils` | `__tests__/utils/*.test.js` |
| `lib` | `__tests__/lib/*.test.js` |
| `braid` | `__tests__/braid/*.test.js` |
| `deploy-config` | 8 selected `__tests__/routes/*-config.test.js` (compose static analysis) |

The 8 `deploy-config` files pinned in the script:
- `calcom-vps2-deploy-config.test.js`
- `staging-services-calcom-config.test.js`
- `staging-services-litellm-config.test.js`
- `staging-mcp-coolify-config.test.js`
- `staging-backend-heavy-config.test.js`
- `staging-app-fast-config.test.js`
- `prod-compose-mem-limits.test.js`
- `prod-litellm-coolify-config.test.js`

**Excluded from precheck** (require live DB/Redis/LLM/HTTP):
schema, validation, care, services, workers, auth, ai, integration, full routes (~65 files).

---

## Remotes & push policy

**Always push to `github` only.** Never push to `origin` (Gitea) directly.

```
git push github main
```

The `mirror-to-gitea` GitHub Action (`.github/workflows/mirror-to-gitea.yml`) automatically force-pushes `main` to Gitea after every GitHub push. Coolify watches Gitea and triggers deploys from there.

| Remote | URL | Role |
|---|---|---|
| `github` | `git@github.com:andreibyf/aishacrm-2.git` | **Source of truth** — push here |
| `origin` | `gitea.aishacrm.com/aishacrm/aishacrm-2.git` | Mirror — populated by GitHub Action |

Pushing to `origin` directly bypasses GitHub's secret scanning and breaks the source-of-truth invariant. The pre-push hook runs against `origin/main` for diffs — that's a read; the push target is still `github`.

---

## Key Files

| File | Purpose |
|---|---|
| `.husky/pre-push` | Hook entry point |
| `backend/scripts/run-tests-precheck.sh` | Precheck group definitions |
| `vitest.config.ts` | Pool selection (`vmForks` on Windows, `threads` on *nix) |
