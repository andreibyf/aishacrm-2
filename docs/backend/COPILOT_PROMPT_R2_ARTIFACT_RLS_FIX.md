## Copilot Objective: Fix artifact_refs security + validate R2 artifact plumbing

### Why this must be fixed
The current `public.artifact_refs` RLS policy incorrectly grants `authenticated` **full access** (`for all`, `using true`, `with check true`).
That means any logged-in user could query/insert/update artifact pointer rows (and potentially cross-tenant) if they can reach the table through Supabase.
Even if the backend endpoints tenant-filter correctly, leaving the table open is a security foot-gun and defeats the purpose of tenant isolation.

**artifact_refs is intended to be backend-only** because:
- It contains pointers to AI artifacts (transcripts/traces/memory/tool payloads) stored in R2.
- These pointers can be used to locate and fetch sensitive AI data.
- Client-side access is unnecessary for the product and increases attack surface.

### Required change
Update the migration `backend/migrations/107_artifact_refs.sql` so that:
1) RLS remains enabled.
2) Table privileges are revoked from `anon` and `authenticated`.
3) The policy `"Backend service has full access to artifact_refs"` applies to **service_role only**.
4) The migration is idempotent: if the unsafe policy exists, drop it and recreate the safe one.

### After applying the patch
1) Re-run the updated SQL in Supabase (SQL editor) to replace the policy.
2) Confirm the backend R2 artifact endpoints still work:
   - `GET /api/storage/r2/check`
   - `POST /api/storage/artifacts`
   - `GET /api/storage/artifacts/:id`

### Verification steps (SQL)
Run these in Supabase to confirm:
- `select * from pg_policies where tablename='artifact_refs';` (policy should target service_role only)
- Confirm grants:
  - `select grantee, privilege_type from information_schema.role_table_grants where table_name='artifact_refs';`
  - authenticated should not have SELECT/INSERT/UPDATE/DELETE.

### Note about tenant isolation
Tenant isolation for artifacts should be enforced at the API layer (server-side) by always querying artifact_refs with `tenant_id = currentTenant`.
Do NOT introduce client-side queries to artifact_refs.
