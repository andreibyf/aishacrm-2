## What

Records that Supabase migrations **159** (`docuseal_submissions` table + RLS), **160** (`supabase_storage_path` column), and **161** (`tenant.slug`) have been applied to **prod** (`ehjlenywplgyiahgxkfj`) so prod is now schema-equivalent to staging.

The migration SQL files (`backend/migrations/{159,160,161}_*.sql`) already existed in the repo from staging work. This PR is the in-repo record that they've been applied to prod, plus a `DATABASE_REFERENCE.md` update reflecting the new column inventory.

## Why

Prod was 3 migrations behind staging - anything calling `from('docuseal_submissions')` or selecting `tenant.slug` against prod would 404 silently. The next prod backend deploy that includes the DocuSeal routes would have hit this.

## How

Applied via Supabase `apply_migration` MCP against project `ehjlenywplgyiahgxkfj`, exact bodies copied from the in-repo migration files:

1. `apply_159_docuseal_integration` -> table + 4 RLS policies + 3 indexes + `updated_at` trigger
2. `apply_160_docuseal_supabase_storage_path` -> nullable TEXT column for the signed-PDF mirror
3. `apply_161_tenant_slug` -> NOT NULL + UNIQUE + format CHECK, deterministic backfill from `tenant.name`

Followed by `NOTIFY pgrst, 'reload schema'` per the migration runbook.

## Verification (already executed against prod)

- `to_regclass('public.docuseal_submissions')` returns `docuseal_submissions`
- Column count on `docuseal_submissions`: 23
- `supabase_storage_path` column exists
- `tenant.slug` column exists
- 5 indexes on `docuseal_submissions` (PK + 3 explicit + UNIQUE)
- 4 RLS policies on `docuseal_submissions` (select / insert / update / delete)
- 7 / 7 tenants slugged
- Backfilled slugs (sample): `4v-data-consulting`, `client-playgorund`, `dfit-factor`, `g-o-d-assets-llc`, `labor-depot`, `local-development-tenant`, `team-realtor` (the `client-playgorund` typo is faithful to `tenant.name`)

REST verification from sandbox was blocked by the workspace network allowlist (Supabase host not on the allowlist) - SQL verification suffices since schema/RLS/index existence is the contract; the REST surface gets exercised on the next prod backend deploy.

## Diff

- `docs/reference/DATABASE_REFERENCE.md` - staging row added to environments table (was missing); prod table count 88 -> 89; `slug` added to `tenant` columns with the CHECK + backfill rationale; last-updated 2026-04-02 -> 2026-05-07.
- `CHANGELOG.md` - Unreleased / Added entry.

## No code changes

This PR is documentation-only. The actual schema change is already live on prod and recorded in Supabase's migration history.

## Linear

Closes 4VD-40.
