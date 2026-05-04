-- Dev Playground seed for backend integration tests.
--
-- The 44 test files under backend/__tests__ that hit Supabase directly
-- (not mocked) reference fixtures from backend/__tests__/testConstants.js:
-- a Dev Playground tenant + admin user + 6 employees + 2 teams + memberships
-- with deterministic UUIDs. Without these rows present, INSERT-then-read
-- tests fail with FK violations or null-data; cascade-delete and
-- relationship-traversal tests then fail with "Cannot read properties of
-- null (reading 'id')".
--
-- Apply on the dev branch Supabase project (nrtrjsatmsosslxwlmoj) after
-- any branch reset. Idempotent via ON CONFLICT — safe to re-run.
--
-- Usage:
--   psql "$(doppler secrets get DATABASE_URL --plain --project aishacrm --config dev_personal)" -f dev-playground-seed.sql
--
-- Or via Supabase SQL editor for the aishacrm-dev branch.

-- 1) Dev Playground tenant
INSERT INTO public.tenant (id, tenant_id, name, status)
VALUES (
  'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c',
  'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c',
  'Dev Playground',
  'active'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

-- 2) Admin user Andre — auth.users + auth.identities + public.users
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
  'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c',
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
  ('aa000001-0000-0000-0000-000000000001', 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c', 'Sarah', 'Director',  'sarah@aishacrm.test', 'director', 'active', true),
  ('aa000001-0000-0000-0000-000000000002', 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c', 'Mike',  'ManagerA',  'mike@aishacrm.test',  'manager',  'active', true),
  ('aa000001-0000-0000-0000-000000000003', 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c', 'Jane',  'ManagerB',  'jane@aishacrm.test',  'manager',  'active', true),
  ('aa000001-0000-0000-0000-000000000004', 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c', 'Tom',   'RepA1',     'tom@aishacrm.test',   'employee', 'active', true),
  ('aa000001-0000-0000-0000-000000000005', 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c', 'Amy',   'RepA2',     'amy@aishacrm.test',   'employee', 'active', true),
  ('aa000001-0000-0000-0000-000000000006', 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c', 'Bob',   'RepB1',     'bob@aishacrm.test',   'employee', 'active', true)
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role;

-- 4) 2 teams
INSERT INTO public.teams (id, tenant_id, name, description, is_active) VALUES
  ('bb000001-0000-0000-0000-000000000001', 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c', 'Sales Team A', 'Dev Playground Team A', true),
  ('bb000001-0000-0000-0000-000000000002', 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c', 'Sales Team B', 'Dev Playground Team B', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

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
