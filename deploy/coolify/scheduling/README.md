# scheduling (Cal.com tier)

**Services:** `calcom`, `calcom-db`

**Change cadence:** mid — upgraded when a new Cal.com image is vetted, SMTP
changes, or encryption keys rotate. Not tied to app release tags.

## Caddy note

**Caddy is not included in this compose.** No Caddy configuration files exist
anywhere in the repo. If `scheduler.aishacrm.com` is fronted by Caddy on the
VPS, that config is maintained out-of-band and should stay that way until
someone commits it deliberately. See `docs/deployment/coolify-migration.md`.

## DB isolation

Cal.com uses its own Postgres (`aishacrm-calcom-db`), **not** Supabase. Sharing
the AiSHA Supabase DB is unsupported — Cal.com's raw Prisma connections
conflict with RLS. Do not point `DATABASE_URL` at Supabase.

## Image pinning

The Cal.com image is pinned to a digest that mirrors the current
`docker-compose.prod.yml` (2026-04-07 known-good). To upgrade, follow the
verification path already documented in that file: confirm `Host` table,
`_user_eventtype`, and `ALLOWED_HOSTNAMES` handling after the bump.

## `ALLOWED_HOSTNAMES` gotcha

Cal.com parses it as `JSON.parse(\`[${ALLOWED_HOSTNAMES}]\`)`. The value must
include surrounding double-quotes, i.e. `"scheduler.aishacrm.com"`, not
`scheduler.aishacrm.com`.

## Init script path

`calcom-db` mounts `../../../scripts/calcom-db-init.sql` (repo root). If Coolify
launches this compose with the folder itself as build context rather than the
repo root, the bind-mount path will need updating. This is one of the
manual-confirmation items in the migration doc.

## Consumers

| Consumer            | Domain    | Variable                                                                                                      |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `aishacrm-backend`  | aisha-app | `CALCOM_DB_URL` (reads Cal.com DB for booking integrations), `CALCOM_WEBHOOK_BACKEND_URL` (internal callback) |
| `aishacrm-frontend` | aisha-app | `VITE_CALCOM_URL` (browser-facing)                                                                            |
