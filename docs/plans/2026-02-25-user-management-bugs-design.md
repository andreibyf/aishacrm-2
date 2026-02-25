# User Management Bug Fixes Design

**Date:** 2026-02-25
**Status:** Approved
**Scope:** 3 bugs in User Management admin page

## Problems

### Bug 1: Display Name shows "Unknown User" or email
The invite endpoint stores `display_name` only in Supabase Auth metadata, not in the employee/user `metadata` column. The `GET /api/users` endpoint's `expandUserMetadata()` promotes `metadata.display_name` to top level, but it's never there. The frontend falls through to `'Unknown User'`.

### Bug 2: Tenant switch shows wrong users
`TenantSwitcher` uses `window.history.replaceState()` to update the URL. This does not trigger React Router's `useSearchParams()` hook. The User Management component depends on `urlTenantId` from `useSearchParams()`, so it never detects the tenant change.

### Bug 3: New employee doesn't appear immediately
`GET /api/users` has a 180-second server-side cache. `invalidateCache('users')` runs as pre-middleware on POST (before the user is created), creating a race condition where the re-fetch may hit stale cache.

## Design

### Fix 1: Display Name

**Backend — `expandUserMetadata()` in `users.js`:**
- After promoting metadata keys, compute `display_name` from `first_name + last_name` if not already set
- Compute `full_name` from `first_name + last_name` if not present

**Backend — invite endpoint in `users.js`:**
- Add `display_name: full_name || first_name` to the `metadata` object before inserting into users/employees table

**Backend — `/profiles` endpoint:**
- Verify it already computes display_name correctly (it does via user_profile_view transform)
- Ensure consistency with the main `GET /api/users` endpoint

### Fix 2: Tenant Switching

**Frontend — `EnhancedUserManagement.jsx`:**
- Import and use `useTenant()` context hook as primary source of tenant ID
- Add `useEffect` listening to `tenant-changed` custom event as reactive trigger
- Keep `useSearchParams` reading as fallback for deep links
- When tenant changes: clear search filters, reset pagination, call `loadData()` with new tenant ID
- Use the tenant context value as the authoritative tenant ID, not just the URL param

### Fix 3: New User Cache

**Backend — `users.js`:**
- Reduce cache TTL on `GET /api/users` from 180s to 30s
- Move `invalidateCache('users')` from route middleware to inside the handler, after successful insert

**Frontend — `EnhancedUserManagement.jsx`:**
- After successful invite, re-fetch with `_t=Date.now()` cache-busting param

## Files to Modify

| File | Changes |
|------|---------|
| `backend/routes/users.js` | expandUserMetadata, invite endpoint metadata, cache TTL, invalidateCache placement |
| `src/components/settings/EnhancedUserManagement.jsx` | Tenant context hook, event listener, cache-busting re-fetch, filter reset |
| `src/api/entities.js` | Cache-busting param support in listProfiles |
