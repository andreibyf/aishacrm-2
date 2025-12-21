# Tenant Identifiers (UUID-first)

This document explains the project's tenant identifier policy and how adapters and MCP should resolve tenants.

Summary
- The platform uses UUIDs as the canonical `tenants.id` value across backend and frontend.
- Legacy short slugs or `tenant_id` values may exist on older records; adapters should prefer `tenants.id` (UUID) when possible.

Why UUID-first
- UUIDs are globally unique and avoid collisions when syncing or importing tenants.
- Role-level security (RLS) policies and joins are written against `tenants.id`.

Lookup guidance for developers
- When accepting a tenant identifier from an external caller (CLI, tests, or local scripts):
  - First try to resolve the value as a `tenants.id` (UUID).
  - If no row found, fall back to matching `tenants.tenant_id` (legacy slug) or other tenant columns.

Example: resolving in Node.js (supabase-js)
```js
// Attempt by id first, then by tenant_id
const { data: byId } = await supa.from('tenants').select('id').eq('id', candidate).limit(1);
if (byId && byId.length) return byId[0].id;
const { data: bySlug } = await supa.from('tenants').select('id').eq('tenant_id', candidate).limit(1);
if (bySlug && bySlug.length) return bySlug[0].id;
```

Migration notes
- If you add or change tenant identifier columns, ensure migrations preserve UUID values and update RLS policies that reference the tenant identifier.

References
- `backend/migrations/052_tenant_identifiers.sql` — historical migration demonstrating tenant id changes.
- `braid-mcp-node-server/scripts/test-mcp-audit.js` — test harness that resolves TENANT_ID (accepts UUID or slug).

If you'd like, I can add a small helper module `src/lib/tenants.js` that centralizes tenant resolution logic for MCP/adapters.
