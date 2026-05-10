-- Dev playground seed for backend integration tests.
--
-- The 44 test files under backend/__tests__ that hit Supabase directly
-- (not mocked) reference fixtures from backend/__tests__/testConstants.js:
-- a tenant + admin user + 6 employees + 2 teams + memberships with
-- deterministic UUIDs. Without these rows present, INSERT-then-read tests
-- fail with FK violations or null-data; cascade-delete and
-- relationship-traversal tests then fail with "Cannot read properties of
-- null (reading 'id')".
--
-- 2026-05-08: re-homed from the original Dev Playground tenant
-- (b62b764d-...) onto the seeded Dev Local Tenant (759a83e8-...) so the
-- canonical TENANT_ID set by .env (TEST_TENANT_ID=759a83e8-...) and the
-- admin user from supabase-dev-branch-reset.md (214086c9-...) are all in
-- the same tenant. The old playground tenant row is left in place but no
-- longer carries any seeded children — safe to GC later.
--
-- The slug column on public.tenant became NOT NULL in a recent staging
-- migration; this seed now supplies it ('dev-local-tenant') so a fresh
-- branch reset doesn't fail the tenant INSERT.
--
-- Apply on the dev branch Supabase project (nrtrjsatmsosslxwlmoj) after
-- any branch reset. Idempotent via ON CONFLICT — safe to re-run.
--
-- Usage:
--   psql "$(doppler secrets get DATABASE_URL --plain --project aishacrm --config dev_personal)" -f dev-playground-seed.sql
--
-- Or via Supabase SQL editor for the aishacrm-dev branch.

-- 1) Dev Local Tenant — canonical test tenant going forward.
INSERT INTO public.tenant (id, tenant_id, name, slug, status)
VALUES (
  '759a83e8-7340-4482-a586-cd2d049fb0b5',
  '759a83e8-7340-4482-a586-cd2d049fb0b5',
  'Dev Local Tenant',
  'dev-local-tenant',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  status = EXCLUDED.status;

-- 2) Legacy admin user `andre.devplayground@aishacrm.test` (UUID 04d1b289-...)
-- kept so backwards-compat tests that import ADMIN_USER_ANDRE from
-- testConstants.js continue to find it. The "real" superadmin
-- `abyfield@4vdataconsulting.com` (UUID 214086c9-...) is seeded by
-- .warp/notebooks/supabase-dev-branch-reset.md §7 — separate concern.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '04d1b289-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'andre.devplayground@aishacrm.test',
  crypt('Test1234!', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  FALSE, '', '', '', ''
)
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  updated_at = NOW();

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
VALUES (
  gen_random_uuid(),
  '04d1b289-0000-0000-0000-000000000001',
  jsonb_build_object(
    'sub', '04d1b289-0000-0000-0000-000000000001',
    'email', 'andre.devplayground@aishacrm.test',
    'email_verified', true
  ),
  'email',
  '04d1b289-0000-0000-0000-000000000001',
  NOW(), NOW(), NOW()
)
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.users (
  id, email, tenant_id, role, status,
  first_name, last_name,
  perm_notes_anywhere, perm_all_records, perm_reports, perm_employees, perm_settings,
  metadata, nav_permissions
)
VALUES (
  '04d1b289-0000-0000-0000-000000000001',
  'andre.devplayground@aishacrm.test',
  '759a83e8-7340-4482-a586-cd2d049fb0b5',
  'admin', 'active',
  'Andre', 'Playground',
  TRUE, TRUE, TRUE, TRUE, TRUE,
  '{}'::jsonb, '{}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  role = EXCLUDED.role,
  updated_at = NOW();

-- 3) 6 employees (Sarah=director, Mike+Jane=managers, Tom+Amy+Bob=employees)
INSERT INTO public.employees (id, tenant_id, first_name, last_name, email, role, status, is_test_data) VALUES
  ('aa000001-0000-0000-0000-000000000001', '759a83e8-7340-4482-a586-cd2d049fb0b5', 'Sarah', 'Director',  'sarah@aishacrm.test', 'director', 'active', true),
  ('aa000001-0000-0000-0000-000000000002', '759a83e8-7340-4482-a586-cd2d049fb0b5', 'Mike',  'ManagerA',  'mike@aishacrm.test',  'manager',  'active', true),
  ('aa000001-0000-0000-0000-000000000003', '759a83e8-7340-4482-a586-cd2d049fb0b5', 'Jane',  'ManagerB',  'jane@aishacrm.test',  'manager',  'active', true),
  ('aa000001-0000-0000-0000-000000000004', '759a83e8-7340-4482-a586-cd2d049fb0b5', 'Tom',   'RepA1',     'tom@aishacrm.test',   'employee', 'active', true),
  ('aa000001-0000-0000-0000-000000000005', '759a83e8-7340-4482-a586-cd2d049fb0b5', 'Amy',   'RepA2',     'amy@aishacrm.test',   'employee', 'active', true),
  ('aa000001-0000-0000-0000-000000000006', '759a83e8-7340-4482-a586-cd2d049fb0b5', 'Bob',   'RepB1',     'bob@aishacrm.test',   'employee', 'active', true)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role;

-- 4) 2 teams
INSERT INTO public.teams (id, tenant_id, name, description, is_active) VALUES
  ('bb000001-0000-0000-0000-000000000001', '759a83e8-7340-4482-a586-cd2d049fb0b5', 'Sales Team A', 'Dev Local Team A', true),
  ('bb000001-0000-0000-0000-000000000002', '759a83e8-7340-4482-a586-cd2d049fb0b5', 'Sales Team B', 'Dev Local Team B', true)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  name = EXCLUDED.name;

-- 5) Team memberships
-- Topology (per backend/__tests__/ai/aiTeamContext.test.js):
--   Team A: Sarah(director), Mike(manager), Tom(member), Amy(member)
--   Team B: Sarah(director), Jane(manager), Bob(member)
DELETE FROM public.team_members WHERE team_id IN (
  'bb000001-0000-0000-0000-000000000001',
  'bb000001-0000-0000-0000-000000000002'
);
INSERT INTO public.team_members (team_id, employee_id, role) VALUES
  ('bb000001-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 'director'),
  ('bb000001-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000002', 'manager'),
  ('bb000001-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000004', 'member'),
  ('bb000001-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000005', 'member'),
  ('bb000001-0000-0000-0000-000000000002', 'aa000001-0000-0000-0000-000000000001', 'director'),
  ('bb000001-0000-0000-0000-000000000002', 'aa000001-0000-0000-0000-000000000003', 'manager'),
  ('bb000001-0000-0000-0000-000000000002', 'aa000001-0000-0000-0000-000000000006', 'member');

-- 6) Cal.com integration row for the test tenant.
-- backend/__tests__/routes/calcom-sync.test.js's before() hook reads
-- tenant_integrations[type=calcom, is_active=true] for TEST_TENANT_ID and
-- self-heals its config from the live calcom-db EventType row, but it does
-- NOT create the row when missing — it throws "Missing active Cal.com tenant
-- integration for test tenant", which cancels all 11 child tests in the
-- pushActivityToCalcom / removeActivityFromCalcom / pullCalcomBookings
-- suites. Seed an empty-config row so the test's UPDATE path is exercised
-- on first run and the suite stays green across branch resets.
DELETE FROM public.tenant_integrations
 WHERE tenant_id = '759a83e8-7340-4482-a586-cd2d049fb0b5'
   AND integration_type = 'calcom'
   AND integration_name = 'Cal.com (test fixture)';
INSERT INTO public.tenant_integrations (
  tenant_id, integration_type, integration_name, is_active,
  api_credentials, config, sync_status
)
VALUES (
  '759a83e8-7340-4482-a586-cd2d049fb0b5',
  'calcom',
  'Cal.com (test fixture)',
  true,
  '{}'::jsonb,
  '{}'::jsonb,
  'pending'
);
