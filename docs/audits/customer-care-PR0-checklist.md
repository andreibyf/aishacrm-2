# Customer C.A.R.E. v1 – PR0 Implementation Checklist (Kill Switch + Shadow Mode)

**PR0 goal:** Introduce **global kill switch + shadow mode scaffolding** with **zero runtime behavior change**.

This PR MUST NOT:
- send any outbound messages
- create any new user-facing activities/notifications
- change existing workflows

This PR MUST:
- add configuration defaults
- add a single helper for future gates
- add a minimal logging stub for future C.A.R.E. actions (optional but recommended)

---

## 0) Pre-flight

- Create branch:
  - `copilot/customer-care-pr0-kill-switch`

- Confirm current environment file patterns (examples):
  - `.env`, `.env.example`, `.env.from-doppler`, `docker-compose*.yml`

---

## 1) Files to Add (new)

### 1.1 Add config helper

**Add:** `backend/lib/care/careConfig.ts`

**Purpose:** Central place to read C.A.R.E. env flags.

**Minimum API:**
- `getCareAutonomyEnabled(): boolean`
- `getCareShadowModeEnabled(): boolean`

**Behavior:**
- Default values must be safe:
  - autonomy **false**
  - shadow mode **true**

---

### 1.2 Add gate helper (canonical)

**Add:** `backend/lib/care/isCareAutonomyEnabled.ts`

**Minimum API:**
- `isCareAutonomyEnabled(): boolean`

**Rule:**
- returns true **only if**:
  - `CARE_AUTONOMY_ENABLED === true`
  - `CARE_SHADOW_MODE === false`

---

### 1.3 (Optional) Add shadow audit logger stub

**Add (optional):** `backend/lib/care/careShadowLog.ts`

**Purpose:** Provide a standardized log call for “would have acted” events.

**Minimum API:**
- `logCareShadow(event: { type: string; tenant_id?: string; entity_type?: string; entity_id?: string; reason?: string; meta?: any })`

**Rule:**
- Must not write DB
- Must not emit user-facing notifications
- Can log to existing logger only

---

## 2) Files to Modify (existing)

### 2.1 Add env defaults to the repo

Choose ONE (based on what your repo already uses):

**Option A (recommended):** modify `.env.example`

Add lines:
- `CARE_AUTONOMY_ENABLED=false`
- `CARE_SHADOW_MODE=true`

**Option B:** modify `.env.from-doppler` (only if this is checked-in and used)

Add lines:
- `CARE_AUTONOMY_ENABLED=false`
- `CARE_SHADOW_MODE=true`

**Acceptance:** defaults are present for local/dev.

---

### 2.2 Docker compose pass-through (only if needed)

Search your compose files for backend env pass-through patterns.

If your backend container uses `env_file:` only, you may not need changes.

If it uses `environment:` explicitly, add:
- `CARE_AUTONOMY_ENABLED=${CARE_AUTONOMY_ENABLED:-false}`
- `CARE_SHADOW_MODE=${CARE_SHADOW_MODE:-true}`

**Files typically affected:**
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`

**Rule:** do not change existing env behavior; only add defaults.

---

### 2.3 Add a no-op import smoke point (optional)

If you want to ensure the helper is wired and compile-time safe, add a **no-op** import to an always-loaded module.

Candidates:
- `backend/server.js`
- `backend/index.js`
- `backend/app.js`

Add a single line (no behavior change):
- `import './lib/care/isCareAutonomyEnabled.js'` (or TS equivalent compiled path)

Only do this if your build system requires explicit inclusion.

---

## 3) Exact Diffs (copy/paste guidance)

### 3.1 `.env.example`

Add at the end:
- `CARE_AUTONOMY_ENABLED=false`
- `CARE_SHADOW_MODE=true`

---

### 3.2 `backend/lib/care/careConfig.ts`

Implement:
- Read env strings
- Normalize boolean values (`'true'|'1'|'yes'`)
- Safe defaults

---

### 3.3 `backend/lib/care/isCareAutonomyEnabled.ts`

Implement:
- `return getCareAutonomyEnabled() && !getCareShadowModeEnabled()`

---

## 4) Tests (recommended, minimal)

If you have a test framework in backend (jest/vitest), add:

**Add:** `backend/lib/care/isCareAutonomyEnabled.test.ts`

Cases:
1) defaults (unset env) => false
2) autonomy=true, shadow=true => false
3) autonomy=true, shadow=false => true
4) autonomy=false, shadow=false => false

If no tests exist, add a lightweight runtime assertion in dev only (optional).

---

## 5) Verification Steps (must do)

1) Start backend with no env set:
- `isCareAutonomyEnabled()` must be **false**

2) Start backend with:
- `CARE_AUTONOMY_ENABLED=true`
- `CARE_SHADOW_MODE=true`

Result:
- must still be **false**

3) Start backend with:
- `CARE_AUTONOMY_ENABLED=true`
- `CARE_SHADOW_MODE=false`

Result:
- must be **true**

4) Confirm no additional outbound actions occurred:
- no new messages
- no new scheduled meetings
- no new workflow executions

---

## 6) Commit Content

PR0 should include ONLY:
- New helper files under `backend/lib/care/`
- Env defaults in `.env.example` (and compose pass-through only if required)
- Optional minimal tests

Nothing else.

---

## 7) PR Title & Description

**Title:** `Customer C.A.R.E. PR0: Add kill switch + shadow mode flags`

**Description:**
- Adds env flags `CARE_AUTONOMY_ENABLED` and `CARE_SHADOW_MODE` with safe defaults
- Adds `isCareAutonomyEnabled()` helper
- No runtime behavior changes

---

End.

