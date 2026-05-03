# Supabase Dev Branch Reset

When the `aishacrm-dev` Supabase preview branch needs to be reset (corrupt
data, schema drift from staging parent, fresh starting point for testing).
Recreates the branch and reseeds the minimum needed to log in locally.

## Prerequisites

- Supabase dashboard access for the staging project (`bjedfowimuwbcnruwcdj`)
- Doppler write access to `aishacrm/dev_personal`
- The dev branch service role key (Supabase doesn't expose this via API —
  must be copied from dashboard)

## 1. Delete the old branch

In Supabase dashboard:
1. Open the staging project (`bjedfowimuwbcnruwcdj`)
2. Top of sidebar → branch picker → `aishacrm-dev`
3. Settings → "Delete branch"

## 2. Create a fresh branch

In the same dashboard:
1. Branch picker → "Create new branch"
2. Name: `aishacrm-dev`, persistent: yes, with_data: false
3. Wait for status `FUNCTIONS_DEPLOYED` (5-10 min)
4. Note the new project_ref (changes each time a branch is recreated)

## 3. Pull the new branch's keys

In Supabase dashboard → branch → Settings → API:
- Copy `anon` JWT key
- Copy `service_role` secret (Reveal first)
- Copy publishable key (`sb_publishable_...`)

## 4. Update Doppler

Run from your shell:

```sh
doppler secrets set \
  SUPABASE_URL="https://<new-project-ref>.supabase.co" \
  SUPABASE_ANON_KEY="<new-anon-jwt>" \
  SUPABASE_SERVICE_ROLE_KEY="<new-service-role>" \
  SUPABASE_PUBLISHABLE_KEY="<new-publishable>" \
  VITE_SUPABASE_URL="https://<new-project-ref>.supabase.co" \
  VITE_SUPABASE_ANON_KEY="<new-anon-jwt>" \
  VITE_SUPABASE_PUBLISHABLE_KEY="<new-publishable>" \
  --project ${DOPPLER_PROJECT} --config dev_personal
```

## 5. Update .env (mirror Doppler — required for compose interpolation)

Edit `${AISHA_REPO}/.env` — replace the Supabase block with new values.
Then verify compose still resolves cleanly:

```sh
cd ${AISHA_REPO}
docker compose config --quiet && echo "OK"
```

## 6. Seed tenant + superadmin

In the Supabase dashboard SQL editor for the dev branch, paste:

```sql
-- Dev branch seed: tenant + superadmin user
INSERT INTO public.tenant (id, name, status, created_at)
VALUES ('759a83e8-7340-4482-a586-cd2d049fb0b5', 'Dev Local Tenant', 'active', NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

INSERT INTO public.tenant (id, name, status, created_at)
VALUES ('a11dfb63-4b18-4eb8-872e-747af2e37c46', 'System Tenant', 'active', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '214086c9-a8a9-4cde-87cc-f64152cf209c',
  'authenticated', 'authenticated',
  'abyfield@4vdataconsulting.com',
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
  '214086c9-a8a9-4cde-87cc-f64152cf209c',
  jsonb_build_object(
    'sub', '214086c9-a8a9-4cde-87cc-f64152cf209c',
    'email', 'abyfield@4vdataconsulting.com',
    'email_verified', true
  ),
  'email',
  '214086c9-a8a9-4cde-87cc-f64152cf209c',
  NOW(), NOW(), NOW()
)
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.users (
  id, email, tenant_id, role, status,
  first_name, last_name,
  perm_notes_anywhere, perm_all_records, perm_reports, perm_employees, perm_settings,
  metadata, nav_permissions, created_at, updated_at
)
VALUES (
  '214086c9-a8a9-4cde-87cc-f64152cf209c',
  'abyfield@4vdataconsulting.com',
  '759a83e8-7340-4482-a586-cd2d049fb0b5',
  'superadmin', 'active',
  'Andrei', 'Byfield',
  TRUE, TRUE, TRUE, TRUE, TRUE,
  '{}'::jsonb, '{}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  tenant_id = EXCLUDED.tenant_id,
  status = EXCLUDED.status,
  updated_at = NOW();

SELECT 'tenant' AS table_name, COUNT(*) AS rows FROM public.tenant
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users
UNION ALL SELECT 'auth.identities', COUNT(*) FROM auth.identities
UNION ALL SELECT 'public.users', COUNT(*) FROM public.users;
```

Verify counts: tenant=2, auth.users=1, auth.identities=1, public.users=1.

## 7. Test the keys directly

```sh
ANON=$(doppler secrets get SUPABASE_ANON_KEY --plain --project ${DOPPLER_PROJECT} --config dev_personal)
NEW_URL=$(doppler secrets get SUPABASE_URL --plain --project ${DOPPLER_PROJECT} --config dev_personal)
curl -sS -X POST \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email":"abyfield@4vdataconsulting.com","password":"Test1234!"}' \
  "$NEW_URL/auth/v1/token?grant_type=password" | head -c 200
```

Should return JSON with `access_token`. If `"Invalid API key"`, the keys
don't match the URL — re-check Doppler values against Supabase dashboard.

## 8. Rebuild local containers + verify login

```sh
cd ${AISHA_REPO}
docker compose down
docker compose build --no-cache frontend
docker compose up -d
docker compose exec frontend sh -c "cat /app/dist/env-config.js | head -3"
```

Then login at `localhost:4000` with `abyfield@4vdataconsulting.com` /
`Test1234!`.
