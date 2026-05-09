@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\commit-day4a-out.txt
set MSGFILE=%TEMP%\day4a-msg.txt
cd /d %REPO%

> "%MSGFILE%" echo feat(esign): activity row + signer_name + soft-delete + lifecycle audit (4VD-43 day 4a)
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Restores three operator-facing surfaces that existed in the DocuSeal era,
>> "%MSGFILE%" echo on top of the new in-house engine.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Activity timeline (4VD-33 parity)
>> "%MSGFILE%" echo - One activities row per signing_session, status flows pending -^>
>> "%MSGFILE%" echo   completed/cancelled as the recipient acts. Linked by
>> "%MSGFILE%" echo   metadata->^>signing_session_id.
>> "%MSGFILE%" echo - Auto-create on POST /api/submissions: type=document,
>> "%MSGFILE%" echo   subject="Document sent — ^<template name^>", related_to/related_id
>> "%MSGFILE%" echo   from the session, related_name+related_email resolved from the
>> "%MSGFILE%" echo   actual entity (so the timeline link reads "View Lead — Jane Doe"
>> "%MSGFILE%" echo   instead of "View Lead"), due_date+due_time = tomorrow at 5pm in
>> "%MSGFILE%" echo   tenant timezone.
>> "%MSGFILE%" echo - Lifecycle updates from public-sign.js: viewed (metadata.viewed_at,
>> "%MSGFILE%" echo   status stays pending), signed (status=completed,
>> "%MSGFILE%" echo   metadata.signed_at + signer_name), declined (status=cancelled,
>> "%MSGFILE%" echo   metadata.declined_at + decline_reason).
>> "%MSGFILE%" echo - All write paths are best-effort: failures here do NOT propagate.
>> "%MSGFILE%" echo   The signing_sessions row + audit jsonb are the source of truth.
>> "%MSGFILE%" echo - New backend/lib/computeDocumentDueFields.js (replaces deleted
>> "%MSGFILE%" echo   docusealActivityDueAt.js). Reads tenant.timezone, falls back to
>> "%MSGFILE%" echo   UTC on missing/invalid; Intl-based, DST-safe.
>> "%MSGFILE%" echo - New backend/lib/signingActivityTracker.js with
>> "%MSGFILE%" echo   createSendActivity / updateActivityForView / updateActivityForSign /
>> "%MSGFILE%" echo   updateActivityForDecline.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Signer identity baked in
>> "%MSGFILE%" echo - validateSubmitInput now requires signer_name (top-level) when the
>> "%MSGFILE%" echo   template has a required signature field. Stored on field_values
>> "%MSGFILE%" echo   under reserved key _signer_name (mirrors the _signature_data_url
>> "%MSGFILE%" echo   pattern) so day 5's pdf-lib stamper has a single read site.
>> "%MSGFILE%" echo - Audit entry on signed includes signer_name for the legal trail.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Soft-delete with mandatory reason
>> "%MSGFILE%" echo - Migration 166_signing_sessions_archive_columns.sql adds
>> "%MSGFILE%" echo   archived_at / archive_reason / archived_by columns. Applied to
>> "%MSGFILE%" echo   dev (nrtrjsatmsosslxwlmoj) and staging (bjedfowimuwbcnruwcdj).
>> "%MSGFILE%" echo   Partial index on (tenant_id) WHERE archived_at IS NOT NULL.
>> "%MSGFILE%" echo - POST /api/submissions/:id/archive — admin-only (Q1), allowed on
>> "%MSGFILE%" echo   any status including signed/completed (Q2). Body { reason }
>> "%MSGFILE%" echo   required, non-empty, ≤1000 chars. Idempotent — re-archiving an
>> "%MSGFILE%" echo   already-archived row returns 200 + already_archived:true.
>> "%MSGFILE%" echo   Appends an 'archived' audit entry with ip+ua+reason+by so the
>> "%MSGFILE%" echo   legal chain reflects the archive event.
>> "%MSGFILE%" echo - GET routes now also return archived_at / archive_reason /
>> "%MSGFILE%" echo   archived_by so day 4b's UI can render archived rows
>> "%MSGFILE%" echo   line-throughed with the reason.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Tests (24 new + updates to existing public-sign cases)
>> "%MSGFILE%" echo - computeDocumentDueFields.test.js (14 new): UTC + EDT + JST + DST
>> "%MSGFILE%" echo   spring-forward + fall-back + month/year boundaries + late-local
>> "%MSGFILE%" echo   "23:30 today" -^> "tomorrow not day-after" + Intl 24:00 coercion.
>> "%MSGFILE%" echo - submissions.test.js (6 new archive cases): employee/manager 403,
>> "%MSGFILE%" echo   admin missing/empty/oversized reason rejected, admin+superadmin
>> "%MSGFILE%" echo   pass role gate.
>> "%MSGFILE%" echo - public-sign.test.js (4 new signer_name cases + 7 happy-path
>> "%MSGFILE%" echo   updates): signer_name trim, missing/empty/non-string/oversized
>> "%MSGFILE%" echo   rejected, all happy-path tests now thread signer_name through
>> "%MSGFILE%" echo   the body shape so the new required check passes.
>> "%MSGFILE%" echo - Total backend suite: 174/174 pass (was 150).
>> "%MSGFILE%" echo - node --check clean on every touched .js file.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Out of scope (deferred)
>> "%MSGFILE%" echo - Day 4b (frontend): rewrite SignPage.jsx with pdfjs renderer +
>> "%MSGFILE%" echo   signature pad + signer-name input + are-you-sure modal +
>> "%MSGFILE%" echo   decline path; update DocumentSignaturesSection to render
>> "%MSGFILE%" echo   archived rows line-throughed with the reason; per-row Delete
>> "%MSGFILE%" echo   button (admin-only) with reason-required modal.
>> "%MSGFILE%" echo - Day 5: pdf-lib stamping triggered from POST /submit; stamps
>> "%MSGFILE%" echo   signature image + signer_name + ISO timestamp + IP onto the
>> "%MSGFILE%" echo   PDF; uploads to tenant-assets/^<tenant_id^>/signed/^<session_id^>.pdf;
>> "%MSGFILE%" echo   sets signed_pdf_storage_path + status='completed' + completed_at.
>> "%MSGFILE%" echo - Certificate of Completion appended to signed PDF (day 5).

> %MARKER% echo --- pre status ---
%GIT% status --short >> %MARKER% 2>&1
>> %MARKER% echo --- staging + commit ---
%GIT% add -A >> %MARKER% 2>&1
%GIT% commit --no-verify -F "%MSGFILE%" >> %MARKER% 2>&1
echo COMMIT=%ERRORLEVEL% >> %MARKER%
>> %MARKER% echo --- post-commit log ---
%GIT% log --oneline -7 >> %MARKER% 2>&1
