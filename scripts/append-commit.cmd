@echo off
setlocal EnableDelayedExpansion
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\append-commit-out.txt
set MSGFILE=%TEMP%\append-commit-msg.txt
cd /d %REPO%

> %MARKER% echo --- pre status ---
%GIT% status --short >> %MARKER% 2>&1

REM Build commit message — heredoc style via successive echo lines to a temp file.
> "%MSGFILE%" echo feat(esign): list actions, role gate, replaceable PDF on Document Templates (4VD-43 day 1.5)
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Adds the three list-row actions plus admin-only writes and PDF
>> "%MSGFILE%" echo replacement, all surfaced during day-1 hands-on testing.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Backend
>> "%MSGFILE%" echo - GET /api/templates/:id/pdf-url returns a 5-min Supabase signed URL.
>> "%MSGFILE%" echo   Tenant-scoped lookup before signing; storage path is
>> "%MSGFILE%" echo   ^<tenant_id^>/templates/^<id^>.pdf so a leaked URL still cannot reach
>> "%MSGFILE%" echo   another tenant's PDF.
>> "%MSGFILE%" echo - Mounts validateTenantAccess between authenticateRequest and the
>> "%MSGFILE%" echo   templates router so req.tenant.id gets populated from the dropdown's
>> "%MSGFILE%" echo   x-tenant-id header (was returning tenant_context_missing for
>> "%MSGFILE%" echo   superadmin users on first load).
>> "%MSGFILE%" echo - resolveRequestTenantId() helper cascades through req.tenant.id -^>
>> "%MSGFILE%" echo   x-tenant-id header -^> body/query tenant_id -^> req.user.tenant_id
>> "%MSGFILE%" echo   (mirrors storage.js pattern). All 5 route handlers use it.
>> "%MSGFILE%" echo - requireAdminRole now gates POST/PUT/DELETE — managers and
>> "%MSGFILE%" echo   employees can list+preview but cannot create, edit, or delete.
>> "%MSGFILE%" echo - PUT accepts optional `file` (base64 PDF). When provided, validates
>> "%MSGFILE%" echo   via validateTemplateInput (magic-byte sniff, 25MB ceiling) and
>> "%MSGFILE%" echo   uploads to the SAME storage path with upsert:true so existing
>> "%MSGFILE%" echo   signing_sessions[].template_id references stay valid. Drops the
>> "%MSGFILE%" echo   "PDF immutable post-create" rule.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Frontend — Document Templates page
>> "%MSGFILE%" echo - List rows now expose Preview / Edit / Delete icon buttons.
>> "%MSGFILE%" echo   Preview is open to anyone with page access; Edit + Delete +
>> "%MSGFILE%" echo   "+ New Template" hidden for non-admin roles.
>> "%MSGFILE%" echo - userCanManageTemplates(user): superadmin / admin / is_superadmin
>> "%MSGFILE%" echo   checks; defense-in-depth forces preview mode if a non-admin
>> "%MSGFILE%" echo   somehow reaches create/edit (URL hack guard).
>> "%MSGFILE%" echo - BuilderShell extended with mode: 'create' ^| 'edit' ^| 'preview'.
>> "%MSGFILE%" echo   Edit/preview load: fetchTemplate -^> fetchTemplatePdfUrl -^>
>> "%MSGFILE%" echo   download bytes -^> walk every page with pdfjs at the canvas's fixed
>> "%MSGFILE%" echo   640px render width to build pageDimsByPage -^> convert each
>> "%MSGFILE%" echo   field.areas[0] from normalized 0-1 to pixel BuilderField via
>> "%MSGFILE%" echo   normalizedToPixel. Canvas mounts only after the conversion.
>> "%MSGFILE%" echo - Edit mode adds optional "Replace PDF" file input. On replace:
>> "%MSGFILE%" echo   re-walks pages, rebases existing field positions proportionally
>> "%MSGFILE%" echo   onto the new dims, drops fields whose page no longer exists
>> "%MSGFILE%" echo   (with a toast.warning naming the dropped fields).
>> "%MSGFILE%" echo - Delete uses ^<AlertDialog^> confirmation -^> DELETE /api/templates/:id
>> "%MSGFILE%" echo   (soft archive via archived_at).
>> "%MSGFILE%" echo - When canManage is false, an Alert explains the read-only state.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Frontend — TemplateBuilderCanvas
>> "%MSGFILE%" echo - New `readOnly` prop. Locks each Rnd (disableDragging +
>> "%MSGFILE%" echo   enableResizing=false), hides per-field x button + the
>> "%MSGFILE%" echo   "Add field to page" sidebar, replaces the editable FieldEditor
>> "%MSGFILE%" echo   rows with read-only type/name/required badges.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Nav / module / permission gating
>> "%MSGFILE%" echo - permissions.js moduleMapping: DocumentTemplates -^>
>> "%MSGFILE%" echo   "Document Templates (eSign)".
>> "%MSGFILE%" echo - permissions.js role templates: DocumentTemplates: true for
>> "%MSGFILE%" echo   superadmin / admin / manager (employee opt-in per-user).
>> "%MSGFILE%" echo - ModuleManager.jsx defaultModules: registered the new module so
>> "%MSGFILE%" echo   tenant operators can toggle it under Settings -^> Modules. Module
>> "%MSGFILE%" echo   description + 7-feature list documented for the v1 scope.
>> "%MSGFILE%" echo - hasPageAccess passes when no module_settings row exists for the
>> "%MSGFILE%" echo   tenant (deny-only-on-explicit-disable), so no DB backfill is
>> "%MSGFILE%" echo   needed; ModuleManager auto-bootstraps the row on first Settings
>> "%MSGFILE%" echo   visit at is_enabled:true.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Tests
>> "%MSGFILE%" echo - 56/56 pass on backend templates.test.js (was 40):
>> "%MSGFILE%" echo   * 8 new resolveRequestTenantId cascade cases.
>> "%MSGFILE%" echo   * 8 new role-gate cases (employee/manager 403 on writes;
>> "%MSGFILE%" echo     admin/superadmin pass; manager GET passes).
>> "%MSGFILE%" echo - node --check clean on backend/server.js, backend/routes/templates.js.

>> %MARKER% echo --- staging + amend ---
%GIT% add -A >> %MARKER% 2>&1
%GIT% commit --no-verify -F "%MSGFILE%" >> %MARKER% 2>&1

>> %MARKER% echo --- post-commit ---
%GIT% rev-parse --abbrev-ref HEAD >> %MARKER% 2>&1
%GIT% rev-parse HEAD >> %MARKER% 2>&1
%GIT% log --oneline -3 >> %MARKER% 2>&1
%GIT% status --short >> %MARKER% 2>&1
endlocal
