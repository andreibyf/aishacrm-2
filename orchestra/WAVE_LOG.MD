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
