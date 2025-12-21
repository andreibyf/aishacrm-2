# Admin Setup (create-admin script)

This document describes safe ways to run the `create-admin.js` script inside Docker (or locally) so you can create or update the initial `superadmin` user.

Location of script (in the running container):

`/app/scripts/create-admin.js`

Important environment variables (do NOT commit these values into source control):

- `SUPABASE_URL` - your Supabase project URL (e.g. `https://<project>.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` - the Supabase service_role key (secret)
- `ADMIN_EMAIL` - email address to create (or update)
- `ADMIN_PASSWORD` - password for the admin user

Notes
- The script requires the Supabase *service_role* key (not the anon/public key) to create/update users.
- Always validate with `--dry-run` before making changes.
- For non-interactive runs (CI or automation), include `--yes` to skip the interactive confirmation.

1) Dry-run inside the running backend container (recommended first step)

PowerShell (on VPS):

```powershell
cd C:\path\to\deployment    # optional: where your compose file lives
docker compose -f docker-compose.prod.yml ps
docker exec -it aishacrm-backend node /app/scripts/create-admin.js --dry-run
```

If the backend container already has the correct env values in its `.env`, the dry-run will show what would happen.

2) Run with explicit args (when container does NOT have env vars set)

```powershell
docker exec -it aishacrm-backend node /app/scripts/create-admin.js \
  --email admin@example.com \
  --password 'Secur3P@ss!' \
  --supabase-url 'https://yourproject.supabase.co' \
  --service-key 'your_service_role_key' \
  --dry-run
```

3) Create/update non-interactively (careful — this performs changes)

```powershell
docker exec -it aishacrm-backend node /app/scripts/create-admin.js \
  --email admin@example.com \
  --password 'Secur3P@ss!' \
  --supabase-url 'https://yourproject.supabase.co' \
  --service-key 'your_service_role_key' \
  --yes
```

4) Alternative: run using `docker compose run` to inject env vars for a one-off run

```powershell
docker compose -f docker-compose.prod.yml run --rm -e SUPABASE_SERVICE_ROLE_KEY='your_service_role_key' backend \
  node /app/scripts/create-admin.js --email admin@example.com --password 'Secur3P@ss!' --supabase-url 'https://yourproject.supabase.co' --yes
```

5) Alternative: run a standalone container (from the same image) with env injection

```powershell
docker run --rm -e SUPABASE_SERVICE_ROLE_KEY='your_service_role_key' \
  ghcr.io/OWNER/REPO-backend:v1.0.7 \
  node /app/scripts/create-admin.js --email admin@example.com --password 'Secur3P@ss!' --supabase-url 'https://yourproject.supabase.co' --yes
```

Replace `ghcr.io/OWNER/REPO-backend:v1.0.7` with the correct backend image reference used in your deployment.

6) Verify results & inspect logs

Tail backend logs to see the script output and any server-side messages:

```powershell
docker compose -f docker-compose.prod.yml logs -f backend
# or, if you prefer docker logs with container name:
docker logs -f aishacrm-backend
```

7) Deploying the corrected frontend image (after CI publishes a new image)

Pull and restart frontend only (no downtime for backend):

```powershell
docker compose -f docker-compose.prod.yml pull frontend
docker compose -f docker-compose.prod.yml up -d --no-deps frontend
```

Verify the in-image `dist` contains the real Supabase URL (replace `yourproject`):

```powershell
# Inspect dist inside the running frontend container
docker exec -it aishacrm-frontend grep -R "yourproject.supabase.co" /app/dist || echo "not found"
```

If `grep` is not available, you can copy files out and inspect them, or use `docker exec` with `cat` and PowerShell `Select-String` on the host.

Security recommendations
- Do not store the `service_role` key in SCM or share it via chat.
- Use ephemeral shell history or remove commands containing secrets from your shell history.
- Prefer injecting the service key into the running backend container via `docker-compose` secrets or a secure vault.

Troubleshooting
- If the script fails to insert into `users` table, check RLS policies — the script uses the service role key but RLS on the `users` table may still require ownership or explicit bypass.
- If the frontend still shows the placeholder Supabase values, the frontend image was built without VITE build args; ensure repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in GitHub Actions and trigger a new release build.

Questions? If you'd like, I can add a small `README` snippet to the repo root that documents the GH Actions secret names and the exact `docker` commands you should run on your VPS.
