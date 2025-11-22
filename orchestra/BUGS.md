# AiSHA CRM – Bug Register

This file tracks known issues. PLAN.md selects which bugs are currently in scope.

---

## Authentication

### BUG-AUTH-001 – Supabase credential misconfiguration

**Status:** Open  
**Priority:** High  
**Area:** Frontend auth / env config

**Symptoms:**
- Console warnings about missing Supabase credentials.
- App silently falling back to “Local Dev Mode” when it shouldn’t.

**Suspected Causes:**
- `.env` missing or misconfigured:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Incorrect environment loading in Vite.

**Notes:**
- Fix must not alter overall auth architecture, only configuration and initialization.

---

### BUG-AUTH-002 – Valid users getting “Invalid login credentials”

**Status:** Open  
**Priority:** High  
**Area:** Auth endpoints / User.signIn

**Symptoms:**
- User exists in Supabase Auth and database.
- Correct email/password still returns “Invalid login credentials”.
- Sometimes works in Supabase dashboard but not in CRM UI.

**Suspected Causes:**
- Misalignment between Supabase auth and CRM `employees` / `users` tables.
- Incorrect error handling or mapping in `User.signIn` (frontend) or `/auth/login` (backend).

**Notes:**
- Focus on mapping, error handling, and auth flow.
- No feature-level changes (MFA, OAuth, etc.) in this bug.

---

### BUG-AUTH-003 – “User logged in but UI not recognizing session”

**Status:** Open  
**Priority:** High  
**Area:** Session handling / User.me()

**Symptoms:**
- Supabase shows active session.
- UI redirects to login or shows as logged out.
- `User.me()` returns null or incomplete user object.

**Suspected Causes:**
- Broken mapping from Supabase user → CRM user model.
- Session not stored/read correctly from localStorage or cookies.
- Tenant or permissions not attached correctly to user object.

**Notes:**
- Fix must ensure:
  - Session survives refresh.
  - Tenant and permissions are loaded for the current user.

---

### BUG-AUTH-004 – CRM access not enforced after login

**Status:** Open  
**Priority:** Medium  
**Area:** Post-login validation / permissions

**Symptoms:**
- User without `crm_access` can still reach parts of the app.
- Inactive/suspended users are not consistently blocked.

**Suspected Causes:**
- Missing check on:
  - `permissions` JSONB (`crm_access` flag).
  - `status` field (active/inactive).
- Frontend routing or guards not fully enforcing backend decisions.

**Notes:**
- Fix should be limited to guard logic and checks.
- No redesign of the permissions model in this bugfix.

---

## Other Known Issues (Parking Lot)

Add non-auth bugs here; do not work on them unless they are pulled into PLAN.md.

### BUG-GEN-001 – Stale activity stats after bulk changes

**Status:** Backlog  
**Area:** Backend stats + Redis cache

Short description:
- Activity stats widget sometimes shows outdated counts after bulk update/delete operations.

---

### BUG-CAMP-001 – Rare double-send in campaign worker

**Status:** Backlog  
**Area:** Campaign worker / advisory locks / idempotency

Short description:
- Under restart or multi-instance scenarios, some contacts occasionally receive duplicate campaign messages.
