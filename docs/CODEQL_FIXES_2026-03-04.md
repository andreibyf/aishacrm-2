# CodeQL Security Fixes — March 4, 2026

## Fixes Applied

### 1. #636 — Weak crypto in cacheManager.js (HIGH → FIXED)

**File:** `backend/lib/cacheManager.js:73`
**Fix:** Replaced `crypto.createHash('md5')` with `crypto.createHash('sha256')` for cache key generation.
**Risk:** Low (MD5 was only used for cache key hashing, not security), but trivial to fix.

### 2. #333, #438 — Clear-text logging of API key prefix in ai.js (HIGH → FIXED)

**Files:** `backend/routes/ai.js:983` and `ai.js:3150`
**Fix:** Removed `resolvedKeyPrefix: apiKey ? apiKey.substring(0, 7) : 'none'` from both logger.debug calls. The remaining fields (`resolvedKeyExists`, `resolvedKeyLength`) still provide debugging value without leaking key material.

### 3. #637 — Clear-text logging in uuidValidator.js (HIGH → FIXED)

**File:** `backend/lib/uuidValidator.js:45`
**Fix:** Changed `console.warn` from logging the full rejected value `"${value}"` to only logging its length: `(length=${String(value).length})`.

### 4. #638 — Clear-text logging in create-admin.js (HIGH → FIXED)

**File:** `backend/scripts/seeds/create-admin.js:88` (and lines 158, 217)
**Fix:** All three `console.log` lines that printed the admin email now redact it: `ADMIN_EMAIL.replace(/(.{2}).*(@.*)/, '$1***$2')` → shows `ad***@example.com`.

### 5. #635 — Externally-controlled format string in conversations.js (HIGH → FIXED)

**File:** `src/api/conversations.js:41`
**Fix:** Replaced template literal `console.log(\`...\${tenantId}...\`)`with structured`console.debug('[...] Creating conversation', { tenantId, ... })` to avoid user-controlled values in format strings.

### 6. #107, #108 — Clear-text logging in supabase-db.js (HIGH → FIXED)

**File:** `backend/lib/supabase-db.js:192, 204`
**Fix:** Removed `console.log` statements that dumped WHERE conditions with parameter values. Removed the UPDATE operation log that printed column names. These were debug-only logs that exposed query parameters containing tenant data.

### 7. #110 — Incomplete multi-character sanitization in validation.js (HIGH → FIXED)

**File:** `src/utils/validation.js:112`
**Fix:** Replaced single-pass `input.replace(/<[^>]*>/g, '')` with iterative loop that repeats until no more tags remain, preventing bypass via nested tags like `<scr<script>ipt>`.

### 8. #72 — Incomplete URL scheme check in BrandingSettings.jsx (HIGH → FIXED)

**File:** `src/components/settings/BrandingSettings.jsx:330`
**Fix:** Added `isSafeImageUrl()` helper that validates URLs are `http:`, `https:`, or `data:image/` before rendering in `<img src={...}>`. Applied to all three image preview locations (header logo, footer logo, global footer logo).

### 9. #73 — DOM text reinterpreted as HTML in BrandingSettings.jsx (HIGH → FIXED)

**File:** `src/components/settings/BrandingSettings.jsx:319`
**Fix:** Added `sanitizeLegalHtmlForDisplay()` helper that strips `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>` tags and removes `on*` event handler attributes and `javascript:` URLs before rendering. The inline sanitizer in `handleGlobalFooterSave` was replaced with this centralized helper so save-time and display-time code use a single, consistent implementation.

---

## Alerts Triaged as Non-Issues (Dismiss with Note)

| Alert                      | File                           | Reason                                                                               |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| #111 Missing CSRF          | initMiddleware.js:22           | Cookie-based JWT with SameSite + CORS origin checking provides equivalent protection |
| #106 Missing rate limiting | initMiddleware.js:348          | express-rate-limit + IDR middleware already provide rate limiting                    |
| #90 Resource exhaustion    | intrusionDetection.js:341      | In-memory Map; traffic levels make this theoretical                                  |
| #88, #89 URL substring     | productionSafetyGuard.js:80-81 | Checks `DATABASE_URL` env var, not user input                                        |
| #84-87 URL substring       | testing.test.js                | Test files only                                                                      |
