# Warp AI assistant rules — AiSHA CRM

Rules tune how Warp's built-in AI assistant interprets commands and
suggestions for this repo. Paste these into Warp settings → Agents → Rules.

---

## Git remotes

- Push target is **always** `github` (`git@github.com:andreibyf/aishacrm-2.git`).
  `origin` is Gitea — Coolify pulls from it via the `mirror-to-gitea` GitHub
  Action. Never `git push origin` directly; that bypasses GitHub's secret
  scanning and breaks the source-of-truth invariant.
- `onedev-old` is decommissioned. If suggestions reference it, ignore them.

## Commits

- Default to `git commit --no-verify` for cleanup, docs, or config-only
  commits. The pre-commit hook runs the full backend test suite which has
  101 pre-existing failures unrelated to most commits (tracked as
  task #41 — fix is to parameterize hardcoded UUIDs in test fixtures).
- For backend code changes touching tested code paths, run tests manually
  before committing instead of relying on the hook.
- Always include CHANGELOG.md updates under `[Unreleased]` per
  `CLAUDE.md` mandatory-changelog rule.

## Shell on Windows (Git Bash)

- For `docker compose exec ... cat /absolute/path`, wrap in `sh -c "..."` to
  avoid Git Bash's MSYS path translation rewriting `/app/...` to
  `C:/Program Files/Git/app/...`.
- PowerShell doesn't have this issue. If user is in PowerShell, plain
  paths work.

## Server topology (don't guess; refer to .warp/env.example)

- `STAGING_HOST` = VPS-1 (Zap, lifetime sub, lockup-prone under CPU load).
- `SERVICES_HOST` = VPS-2 (Zap, runs Coolify + Gitea + Cal.com + Kuma).
- `PROD_HOST` = Hetzner CCX13 (dedicated, no resource constraint issues).
- They look identical in Zap's dashboard. ASK WHICH HOST when interpreting
  hosting-provider graphs or stats — don't infer.

## VPS-1 lockups

When user reports staging "down" or multiple recent reboots:

- This is the known recurring CPU-lockup pattern, not a new mystery.
- Don't propose `journalctl`, `dmesg`, OOM analysis, kernel updates, or
  Zap-side investigation. Past sessions exhausted those paths.
- All staging containers are bound to `aishacrm.slice` (CPUQuota=500%) as
  of 2026-05-03. If lockups continue, the next move is tightening to 450%
  or migrating staging to Hetzner.

## Doppler

- Three configs: `dev_personal`, `stg_stg`, `prd_prd`. Always specify
  config explicitly — defaults can drift.
- Never paste real `sb_secret_*` values into chat or commits. GitHub
  secret scanning will reject the push and the secret is then in chat
  history. Redact with `sb_secret_***`.

## Coolify

- "Server not functional" status on a Coolify scheduled job usually means
  the target server is locked, not that Coolify itself is broken. Check
  hosting-provider graphs first.
- After staging compose changes, click "Redeploy" per app — Coolify's
  watch_paths sometimes don't auto-trigger for compose-only edits.
- VPS-1 connection in Coolify is via Hawser on port 2376. If Coolify says
  "not functional" but `ssh STAGING_HOST` works, the issue is the Coolify
  ↔ Hawser TCP path, not SSH or basic networking.
