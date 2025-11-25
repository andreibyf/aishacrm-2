# AiSHA CRM – Wave Log

Chronological record of orchestration waves (for audit and debugging).

---

## Template

Use this structure for each wave:

### Wave ID: WAVE-YYYYMMDD-XXX
**Date:** YYYY-MM-DD  
**Type:** bugfix | feature  
**Goal ID:** e.g. BUG-AUTH-002  
**Title:** Short description

**Scope Summary:**
- Area(s): backend | frontend | tests | infra
- Files touched (high level)
- Changes strictly within scope? yes/no

**Root Cause (if known):**
- 1–3 sentences explaining the actual cause.

**Changes:**
- Backend:
  - `backend/...` (1–2 bullet points)
- Frontend:
  - `src/...` (1–2 bullet points)
- Tests:
  - `tests/...` (what was added/updated)

**Diff Stats (approx):**
- Files changed: #
- Lines added: #
- Lines removed: #

**Validation:**
- Tests run: which scripts
- Result: pass/fail
- Manual checks performed: list

**Risk / Follow-ups:**
- Known risks or edge cases.
- Follow-up tasks (if any).

---

## Example – Auth Wave

### Wave ID: WAVE-20251122-AUTH-001
**Date:** 2025-11-22  
**Type:** bugfix  
**Goal ID:** BUG-AUTH-002  
**Title:** Fix “Invalid login credentials” for valid Supabase users

**Scope Summary:**
- Areas: backend auth route, frontend `User.signIn`, tests.
- Files touched:
  - `backend/routes/auth.js`
  - `src/api/entities.js` (User.signIn)
  - `tests/auth/login.test.ts`
- Scope respected: yes (no new features, only bugfix + tests).

**Root Cause:**
- Backend returned a generic 401 for all auth errors.
- Frontend treated any non-200 response as “invalid credentials”, even when Supabase was returning a different error for locked/suspended users.

**Changes:**
- Backend:
  - Normalized Supabase auth errors into structured JSON with reason codes.
- Frontend:
  - Updated `User.signIn` to handle reason codes correctly and surface proper messages.
- Tests:
  - Added regression test covering a valid user login and incorrect password scenario.

**Diff Stats (approx):**
- Files changed: 3  
- Lines added: 60  
- Lines removed: 20  

**Validation:**
- Tests run:
  - `pnpm test auth`
- Result:
  - All new and existing auth tests passing.
- Manual checks:
  - Valid user can sign in.
  - Invalid password returns proper error.
  - Suspended user correctly blocked.

**Risk / Follow-ups:**
- Risk: Other parts of the UI may still assume old error shape.
- Follow-up:
  - Audit all consumers of auth error messages (tracked under BUG-AUTH-005 if needed).

---

### WAVE-20251125-AUTH-COMPLETE
Task ID: BUG-AUTH-001 through BUG-AUTH-005  
Title: Comprehensive Auth & Password Reset Flow Fixes  

Summary:
Fixed multiple authentication and password reset issues affecting user access and session management. Addressed Supabase credential misconfiguration, invalid login credential errors, session recognition problems, CRM access enforcement, and password reset redirect flow. Added E2E test coverage for password recovery flow.

Root Cause:
- BUG-AUTH-001: Missing or misconfigured Supabase environment variables causing silent fallback to local dev mode
- BUG-AUTH-002: Generic 401 error handling masking specific auth failures; poor mapping between Supabase auth errors and CRM responses
- BUG-AUTH-003: Session state not properly synchronized between Supabase session and CRM user context
- BUG-AUTH-004: Missing enforcement of `crm_access` flag and user status checks at guard/routing level
- BUG-AUTH-005: Password reset token handling redirecting to login instead of new password page; improper redirect URL configuration

Files Affected:
- backend/routes/auth.js
- backend/lib/supabaseAuth.js
- src/api/entities.js
- src/contexts/AuthContext.jsx
- src/pages/Login.jsx
- src/pages/ResetPassword.jsx
- tests/e2e/password-recovery.spec.ts
- backend/middleware/authCookie.js
- src/utils/auditLog.js
- Plus 21 files for lint cleanup (unused variables removed)

Outcome:
Full resolution

Notes:
- Password recovery E2E test added (password-recovery.spec.ts); currently skipped due to missing SUPABASE_SERVICE_ROLE_KEY but will auto-enable once configured
- Auth error handling now provides structured responses with reason codes
- Session persistence validated across page refresh and navigation
- CRM access guards now properly enforce permissions and user status
- Lint warnings across codebase eliminated (21 files cleaned)
- All changes maintain existing auth architecture; no breaking changes to API contracts
