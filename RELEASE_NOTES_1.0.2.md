# Release 1.0.2

Date: 2025-11-18

## Summary
Adds explicit Supabase auth session termination during logout to prevent silent session rehydration after redirect. Builds on 1.0.1 (rate limit test-mode overrides + `/api/users/heartbeat`).

## Changes
- fix(auth): Call `User.signOut()` (or fallback `supabase.auth.signOut()`) in `handleLogout` prior to backend cookie clearing.
- Ensures local Supabase access/refresh tokens are invalidated client-side.
- Maintains existing audit logging and cleanup (chat/agent context, localStorage keys).

## Deployment Notes
1. Tag `v1.0.2` after merging to `main`.
2. In production environment `.env` adjust:
   - Set `NODE_ENV=production`.
   - Set `ALLOW_PRODUCTION_WRITES=false` unless intentional.
   - Remove or set `E2E_TEST_MODE=false`.
   - Reduce `RATE_LIMIT_MAX` from test value (`100000`) to realistic threshold (e.g. `1000`).
   - Remove/rotate any tokens committed for DEV (e.g., `GITHUB_TOKEN`, `N8N_API_KEY`) and inject via secret manager.
   - Update `ALLOWED_ORIGINS` to actual production domains only.
3. Rebuild & restart containers: `docker compose -f docker-compose.prod.yml up -d --build`.
4. Verify logout behavior: user session cleared, landing page unauthenticated, no residual Supabase session.

## Verification Checklist
- [ ] Click avatar → Sign out → Redirect to `/` unauthenticated.
- [ ] Subsequent API calls without re-login return 401.
- [ ] Audit log contains `logout` entry for user.
- [ ] LocalStorage keys for chat/agent context removed.

## Rollback
Revert commit containing logout change (`fix(auth): ensure Supabase auth session cleared on logout`) and redeploy; previous behavior may leave Supabase session tokens intact.

## Security Considerations
Explicit sign-out minimizes stale token exposure in shared browser contexts. Ensure production removes test-mode flags to avoid unintended rate limit bypass or relaxed email validation.
