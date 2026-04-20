# support-infra (out-of-scope helpers)

**Status:** README-only. Documents containers that exist on the production VPS
but are **not** managed from this repo's Coolify deployment split.

## Rule

> This repo's Coolify deployment split only covers **aishacrm**. Anything
> else the VPS runs — landing page, OpenReplay, containerd helpers — stays
> out of scope and is not bundled with the fast app path.

## Out-of-scope containers (documented for awareness only)

### `hawser` — prod-side Dockhand facilitator

Exposes the prod Docker socket to the local Dockhand UI. Infrastructure.
Not deployed from this repo. Do not add to any Coolify domain here.

### `aisha-landing` (marketing site)

Deployed independently from `/opt/aisha-landing` on the production VPS.
Different lifecycle, different domain (`aishacrm.com`), different blast
radius from the CRM app. Do not fold into `aisha-app`.

### OpenReplay

Self-managed stack in `/opt/openreplay`. Auto-manages its own edge (Caddy).
Not a deployment domain here. See `deploy/coolify/observability/README.md`
(tombstone).

### Caddy

Not managed from this repo. OpenReplay auto-creates its own Caddy. No Caddy
is required in front of the aishacrm Coolify domains at this stage. Do not
add Caddy configuration here.

### n8n (deprecated)

No longer used. Still referenced in the current root compose files behind a
`workflows` profile; those entries remain only because this refactor is
additive. n8n is not in any Coolify deployment domain and should not appear
in future planning.
