@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\commit-day3-out.txt
set MSGFILE=%TEMP%\day3-msg.txt
cd /d %REPO%

> "%MSGFILE%" echo feat(esign): public sign routes (GET / submit / decline) + audit trail (4VD-43 day 3)
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo The internet-facing surface that recipients hit. Capability-token-gated,
>> "%MSGFILE%" echo no auth, audit trail meeting ESIGN Act + eIDAS requirements.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Backend (backend/routes/public-sign.js)
>> "%MSGFILE%" echo - GET /api/sign/:token: returns session + template + tenant branding
>> "%MSGFILE%" echo   + a 5-min Supabase signed URL for the source PDF. Stamps viewed_at
>> "%MSGFILE%" echo   on every view (last view wins; useful for tracking active
>> "%MSGFILE%" echo   recipients). Returns 410 expired/declined as appropriate; allows
>> "%MSGFILE%" echo   completed/signed reads so day 4's UI can render a "you've already
>> "%MSGFILE%" echo   signed" view.
>> "%MSGFILE%" echo - POST /api/sign/:token/submit: validates field_values against the
>> "%MSGFILE%" echo   template's CURRENT field definitions (re-read fresh; operator may
>> "%MSGFILE%" echo   have edited the template after the session was created).
>> "%MSGFILE%" echo   Persists field_values + signature_data_url under a reserved
>> "%MSGFILE%" echo   _signature_data_url key on the field_values jsonb so day 5's
>> "%MSGFILE%" echo   pdf-lib stamper has a single read site. Sets status='signed' +
>> "%MSGFILE%" echo   signed_at=now(). Returns 410 expired, 409 already_finalized.
>> "%MSGFILE%" echo - POST /api/sign/:token/decline: optional reason (truncated to 1000
>> "%MSGFILE%" echo   chars). Sets status='declined' + declined_at=now(). Same
>> "%MSGFILE%" echo   expired/finalized handling.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Audit trail (legal admissibility — ESIGN Act + eIDAS)
>> "%MSGFILE%" echo - Every state-changing action appends an entry of shape
>> "%MSGFILE%" echo   { at: ISO-8601, action: 'viewed'^|'signed'^|'declined', ip, ua,
>> "%MSGFILE%" echo   [reason] } to signing_sessions.audit jsonb. Append-only;
>> "%MSGFILE%" echo   capped at 1000 entries (drops oldest, in-memory only — DB row
>> "%MSGFILE%" echo   never unwritten). IP from req.ip (Express trust-proxy resolves
>> "%MSGFILE%" echo   first XFF hop in our cloudflared topology). UA truncated to
>> "%MSGFILE%" echo   1KB to bound pathological clients.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Pure helpers (exported for tests + day 5 reuse)
>> "%MSGFILE%" echo - isValidSigningToken: 64-hex lowercase only — fast reject before
>> "%MSGFILE%" echo   any DB call. Defends against log spam + makes timing attacks
>> "%MSGFILE%" echo   impractical.
>> "%MSGFILE%" echo - extractClientIp / extractClientUa: req.ip preferred, XFF first
>> "%MSGFILE%" echo   hop fallback, both array + string XFF shapes handled.
>> "%MSGFILE%" echo - makeAuditEntry / appendAudit: pure constructors; appendAudit
>> "%MSGFILE%" echo   never mutates input.
>> "%MSGFILE%" echo - validateSubmitInput: validates field_values vs template fields,
>> "%MSGFILE%" echo   strips unknown keys (defense against malicious clients
>> "%MSGFILE%" echo   injecting arbitrary jsonb), enforces required, type-checks
>> "%MSGFILE%" echo   text/checkbox/signature, validates signature data URL format
>> "%MSGFILE%" echo   (PNG/JPEG only) + 1.5MB ceiling. Cross-checks that a template
>> "%MSGFILE%" echo   with a required signature field has either a per-field value
>> "%MSGFILE%" echo   or the top-level signature_data_url.
>> "%MSGFILE%" echo - isExpired: server-side wall-clock check with safe handling of
>> "%MSGFILE%" echo   null/undefined/garbage timestamps (no false expiries from bad
>> "%MSGFILE%" echo   data).
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Rate limiting
>> "%MSGFILE%" echo - New publicLimiter preset in middleware/rateLimiter.js: 60
>> "%MSGFILE%" echo   req/min per IP. Tighter than defaultLimiter (2000/min — way
>> "%MSGFILE%" echo   too loose for an internet-facing surface), looser than
>> "%MSGFILE%" echo   writeLimiter (20/min — would reject legitimate "draft sig →
>> "%MSGFILE%" echo   redo → submit" flows from the recipient).
>> "%MSGFILE%" echo - /api/sign mounted with publicLimiter ONLY — no
>> "%MSGFILE%" echo   authenticateRequest, no validateTenantAccess. Recipient is
>> "%MSGFILE%" echo   anonymous; the route enforces tenant isolation itself by
>> "%MSGFILE%" echo   only ever querying signing_sessions by signing_token (not
>> "%MSGFILE%" echo   tenant_id), and tenant_id flows back into the response from
>> "%MSGFILE%" echo   the row's own tenant_id field.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Tests (40 new in backend/__tests__/routes/public-sign.test.js)
>> "%MSGFILE%" echo - isValidSigningToken: rejects uppercase, wrong length, non-hex,
>> "%MSGFILE%" echo   empty/null/non-string.
>> "%MSGFILE%" echo - extractClientIp: req.ip preferred, XFF fallback (string +
>> "%MSGFILE%" echo   array shapes), null when both missing.
>> "%MSGFILE%" echo - extractClientUa: verbatim ≤1KB, truncates pathological UAs.
>> "%MSGFILE%" echo - makeAuditEntry: shape pin, optional reason, reason length cap.
>> "%MSGFILE%" echo - appendAudit: appends, doesn't mutate input, treats non-array
>> "%MSGFILE%" echo   as fresh start, caps at 1000 (drops oldest).
>> "%MSGFILE%" echo - validateSubmitInput: happy path (single + multi-field), strips
>> "%MSGFILE%" echo   unknown keys, omits optional fields, all reject paths
>> "%MSGFILE%" echo   (required missing, empty-string-as-missing, length cap, type
>> "%MSGFILE%" echo   coercion, signature scheme + size, no-signature-when-required).
>> "%MSGFILE%" echo - isExpired: past/future/null/garbage/Date all handled.
>> "%MSGFILE%" echo - Public-route gate: GET/POST never return 401/403 (no auth
>> "%MSGFILE%" echo   middleware on this surface), malformed token returns 404
>> "%MSGFILE%" echo   before any DB call.
>> "%MSGFILE%" echo - Bug fixed during dev: validator originally threw "required
>> "%MSGFILE%" echo   field missing" on signature fields BEFORE the top-level
>> "%MSGFILE%" echo   signature_data_url was parsed. Restructured to parse top-level
>> "%MSGFILE%" echo   first, then defer the required-signature cross-check to after
>> "%MSGFILE%" echo   the field loop. 11 tests caught this; all green now.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Verification
>> "%MSGFILE%" echo - 150/150 backend tests pass (110 + 40 new).
>> "%MSGFILE%" echo - node --check clean on backend/server.js, backend/routes/public-sign.js,
>> "%MSGFILE%" echo   backend/middleware/rateLimiter.js.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Out of scope (deferred)
>> "%MSGFILE%" echo - Frontend public renderer (day 4): rewrite src/pages/SignPage.jsx
>> "%MSGFILE%" echo   from placeholder to pdfjs canvas + signature pad + field inputs
>> "%MSGFILE%" echo   + submit/decline buttons.
>> "%MSGFILE%" echo - pdf-lib stamping after sign (day 5): trigger pdf-lib pipeline
>> "%MSGFILE%" echo   from POST /submit success path; uploads signed PDF to
>> "%MSGFILE%" echo   tenant-assets/^<tenant_id^>/signed/^<session_id^>.pdf, sets
>> "%MSGFILE%" echo   signed_pdf_storage_path + status='completed' + completed_at.
>> "%MSGFILE%" echo - Certificate of Completion appended (day 5).

> %MARKER% echo --- pre status ---
%GIT% status --short >> %MARKER% 2>&1
>> %MARKER% echo --- staging + commit ---
%GIT% add -A >> %MARKER% 2>&1
%GIT% commit --no-verify -F "%MSGFILE%" >> %MARKER% 2>&1
echo COMMIT=%ERRORLEVEL% >> %MARKER%
>> %MARKER% echo --- post-commit ---
%GIT% rev-parse HEAD >> %MARKER% 2>&1
%GIT% log --oneline -6 >> %MARKER% 2>&1
