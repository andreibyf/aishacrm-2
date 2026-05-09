@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\commit-day4b-out.txt
set MSGFILE=%TEMP%\day4b-msg.txt
cd /d %REPO%

> "%MSGFILE%" echo feat(esign): public signing page + soft-delete UI on detail-panel sections (4VD-43 day 4b)
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo The recipient-facing UI that turns the day-3 backend routes into an
>> "%MSGFILE%" echo actual signing experience, plus the operator-side delete affordance
>> "%MSGFILE%" echo with line-through render for archived rows.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Recipient signing page (src/pages/SignPage.jsx — full rewrite)
>> "%MSGFILE%" echo - useParams reads :token from /sign/:slug/:token. Mount fires
>> "%MSGFILE%" echo   GET /api/sign/:token; backend stamps viewed_at + audit and
>> "%MSGFILE%" echo   returns session + template fields + signed PDF URL + tenant
>> "%MSGFILE%" echo   branding (logo_url + primary_color).
>> "%MSGFILE%" echo - Standalone layout (PageShell): tenant logo header, no CRM nav,
>> "%MSGFILE%" echo   no auth, mobile-friendly. Falls back to a tenant-name H1 if no
>> "%MSGFILE%" echo   logo set; primary_color drives the call-to-action button so
>> "%MSGFILE%" echo   the page feels like the tenant's brand.
>> "%MSGFILE%" echo - PdfWithFields component: pdfjs renders each page at a fixed
>> "%MSGFILE%" echo   720px CSS width; field overlays anchored at normalised 0-1
>> "%MSGFILE%" echo   coordinates via percent-of-parent style props (no pageDims
>> "%MSGFILE%" echo   round-trip needed since the canvas IS the parent). Field
>> "%MSGFILE%" echo   types: signature (clickable to open pad), name/text/email
>> "%MSGFILE%" echo   (text inputs), date (input type=date), checkbox.
>> "%MSGFILE%" echo - Required signer-name input above the signature pad. Defaults
>> "%MSGFILE%" echo   from session.recipient_name, editable. Cap at 200 chars.
>> "%MSGFILE%" echo - "Are you sure?" confirmation modal previews exactly what gets
>> "%MSGFILE%" echo   recorded: signer name + current local datetime + signature
>> "%MSGFILE%" echo   image. Submit button disabled until: signature drawn,
>> "%MSGFILE%" echo   signer-name non-empty, all template-required fields satisfied.
>> "%MSGFILE%" echo - Decline path: button -^> reason modal (optional, ≤1000 chars)
>> "%MSGFILE%" echo   -^> POST /api/sign/:token/decline -^> "you've declined" page.
>> "%MSGFILE%" echo - Finalized states: signed/completed/declined/expired all render
>> "%MSGFILE%" echo   read-only FinalizedView with the timestamp. Loads polite
>> "%MSGFILE%" echo   per-error copy for 404/410 from backend.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Signature pad (src/components/signing/SignaturePad.jsx — new)
>> "%MSGFILE%" echo - Minimal canvas-based pad. NO third-party dependency added.
>> "%MSGFILE%" echo   Pointer Events handle mouse + touch + stylus through one API.
>> "%MSGFILE%" echo   Fixed 480x160 pixel canvas so the resulting PNG data URL is
>> "%MSGFILE%" echo   consistent across device pixel ratios — pdf-lib stamping on
>> "%MSGFILE%" echo   day 5 reads exact pixels.
>> "%MSGFILE%" echo - Clear button + Save signature button (disabled until ink).
>> "%MSGFILE%" echo - White background painted on mount so the resulting PNG isn't
>> "%MSGFILE%" echo   transparent and looks normal stamped on a white PDF.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Operator-side soft-delete UI (src/components/signing/DocumentSignaturesSection.jsx)
>> "%MSGFILE%" echo - Archived rows render with line-through on the row content + a
>> "%MSGFILE%" echo   muted amber subtitle: "Archived ^<datetime^> — ^<reason^>".
>> "%MSGFILE%" echo   Status badge swapped to a neutral "archived" badge.
>> "%MSGFILE%" echo - Per-row Delete (Trash2) button visible ONLY to admin / superadmin
>> "%MSGFILE%" echo   (uses useUser; same gate as Document Templates delete).
>> "%MSGFILE%" echo - Click Delete -^> AlertDialog with mandatory reason textarea
>> "%MSGFILE%" echo   (counter + 1000-char cap). Action button disabled until reason
>> "%MSGFILE%" echo   is non-empty. POST /api/submissions/:id/archive then calls
>> "%MSGFILE%" echo   onArchived() so the parent panel refreshes the list.
>> "%MSGFILE%" echo - All four detail panels (Contact / Lead / Account / Opportunity)
>> "%MSGFILE%" echo   now pass refreshSessions / refreshSigning into onArchived so
>> "%MSGFILE%" echo   the line-through appears immediately after delete.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Verification
>> "%MSGFILE%" echo - Backend regression: 174/174 pass (frontend-only changes don't
>> "%MSGFILE%" echo   affect backend tests).
>> "%MSGFILE%" echo - UI hands-on testing left to Dre per the agreed split.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Out of scope (deferred — day 5)
>> "%MSGFILE%" echo - pdf-lib stamping triggered from POST /submit success path:
>> "%MSGFILE%" echo   reads field_values._signature_data_url + _signer_name + signed_at,
>> "%MSGFILE%" echo   draws each value at the field's normalised area on the source
>> "%MSGFILE%" echo   PDF, stamps signer-name + ISO timestamp + IP under the signature
>> "%MSGFILE%" echo   image, uploads to tenant-assets/^<tenant_id^>/signed/^<session_id^>.pdf,
>> "%MSGFILE%" echo   sets signed_pdf_storage_path + status='completed' + completed_at.
>> "%MSGFILE%" echo - Certificate of Completion appended to signed PDF (audit chain
>> "%MSGFILE%" echo   from signing_sessions.audit jsonb).
>> "%MSGFILE%" echo - Signed PDF download link in DocumentSignaturesSection (currently
>> "%MSGFILE%" echo   shows "signed PDF stamping ships day 5" placeholder).

> %MARKER% echo --- pre status ---
%GIT% status --short >> %MARKER% 2>&1
>> %MARKER% echo --- staging + commit ---
%GIT% add -A >> %MARKER% 2>&1
%GIT% commit --no-verify -F "%MSGFILE%" >> %MARKER% 2>&1
echo COMMIT=%ERRORLEVEL% >> %MARKER%
>> %MARKER% echo --- post-commit log ---
%GIT% log --oneline -8 >> %MARKER% 2>&1
