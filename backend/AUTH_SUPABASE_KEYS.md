# Supabase Key Usage & Auth Fallback Strategy

Last updated: 2025-11-25

## Key Types (Legacy vs Current)

| Purpose | Legacy Name | Current Name | Safe for Browser | Bypasses RLS | Notes |
|---------|-------------|--------------|------------------|--------------|-------|
| Public queries under RLS | `anon` | Publishable key (`sb_publishable_...`) | Yes (RLS enforced) | No | Recommended for frontend & limited backend reads under RLS |
| Privileged access | `service_role` | Secret key | No | Yes | Must never ship to browser; grants unrestricted access |

Supabase has shifted guidance: prefer **Publishable** instead of legacy `anon`, and **Secret** instead of `service_role`. Our environment intentionally **does not provide** a Secret / service-role key to the backend for production.

## Current Backend Auth Behavior

We now support bearer-based and cookie-based auth without requiring the Secret / service-role key:

1. Middleware (`authenticate.js`):
   - Attempts service-role client if key present (preferred for full JWT verification).
   - Falls back to publishable (anon) client for `auth.getUser(bearer)`—Supabase still validates signature.
   - Final enrichment fallback: lightweight `jwt.decode` (no signature verify) ONLY to attach basic claims if upstream enrichment failed.
2. Refresh route (`auth.js`):
   - Same fallback order (service-role → publishable) for `auth.getUser`.
   - Issues signed `aisha_access` cookie with limited payload: `sub`, `email`, `role`, `tenant_id`, and source table.

## Why Publishable-Only Is Acceptable Here

- All data reads after auth are filtered via RLS policies on Postgres tables (enforced by Supabase using the publishable key).
- We only perform lookups by `email` in `users` or `employees`—no privileged bulk access.
- No write operations rely on bypassing RLS; application-level authorization remains intact.
- The access cookie is signed server-side (our secret), independent of Supabase key privileges.

## Security Considerations & Mitigations

| Concern | Mitigation | Future Improvement |
|---------|------------|--------------------|
| Lack of server-side key for deeper user management | Limit operations to identity enrichment and role extraction | Introduce JWKS-based JWT verification to avoid `jwt.decode` fallback |
| Potential misuse of unverified decode fallback | Only used when both admin and anon enrichment fail; does NOT grant elevated scopes | Add explicit flag `DEGRADED_AUTH=true` + logging + automatic deny of mutation endpoints |
| Email-based lookup collisions | Email column is unique in `users` and `employees` | Add defensive check ensuring exactly one match |
| Replay of access cookie | Short TTL (15m) + user role verification per request | Consider rotating cookie secret periodically |

## Recommended Next Steps (Optional)

- Implement Supabase JWKS signature verification for bearer tokens when publishable key path is used (removes need for service-role key and eliminates decode fallback).
- Add a startup log: `Auth mode: publishable-only (degraded verification)` when service-role / secret key absent.
- Centralize auth diagnostics behind `AUTH_DEBUG` flag with structured log objects.
- Consider rate limiting refresh endpoint calls per IP/email to reduce token abuse surface.

## No Frontend Impact

All changes are backend-only; frontend continues sending bearer tokens and receiving `aisha_access` cookies. No header modifications or port changes were introduced.

## Degraded Mode Definition

"Degraded" means: absence of Secret key causes us to rely on publishable key for `auth.getUser`. If even that fails unexpectedly for a valid bearer token, we attach minimal token claims via decode for downstream logging/diagnostics—but treat authorization conservatively (no expansion of privileges).

## Summary

We intentionally operate with ONLY the publishable Supabase key in production. The backend now gracefully handles this constraint, maintaining secure, RLS-bound access while avoiding exposure of privileged credentials. Service-role / Secret key remains optional for expanded administrative capabilities but is not required for the current authentication flow.
