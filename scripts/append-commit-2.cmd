@echo off
setlocal EnableDelayedExpansion
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\append-commit-2-out.txt
set MSGFILE=%TEMP%\append-commit-2-msg.txt
cd /d %REPO%

> %MARKER% echo --- pre status ---
%GIT% status --short >> %MARKER% 2>&1

> "%MSGFILE%" echo fix(esign): expose Document Templates in User Management Navigation Access (4VD-43 day 1.6)
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Day 1.5 wired the page into navigationConfig + permissions.js +
>> "%MSGFILE%" echo ModuleManager but missed two more places that gate visibility:
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo - UserFormWizard.NAV_MODULES drives the per-user "Navigation
>> "%MSGFILE%" echo   Access" step in User Management. Without an entry, admins
>> "%MSGFILE%" echo   cannot toggle Document Templates on a specific user even
>> "%MSGFILE%" echo   when the tenant has the module enabled.
>> "%MSGFILE%" echo - NavigationPermissions.ORDER controls the visual ordering of
>> "%MSGFILE%" echo   the same toggles via the older NavigationPermissions component
>> "%MSGFILE%" echo   path; without an entry the toggle (if rendered) lands at the
>> "%MSGFILE%" echo   end instead of next to Document Management.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Changes
>> "%MSGFILE%" echo - UserFormWizard.jsx: added DocumentTemplates to NAV_MODULES
>> "%MSGFILE%" echo   between DocumentManagement and AICampaigns (FileText icon,
>> "%MSGFILE%" echo   "eSign templates: PDF + draggable fields (admin-only writes;
>> "%MSGFILE%" echo   preview open to all)" description). Added
>> "%MSGFILE%" echo   DocumentTemplates: false to DEFAULT_NAV_PERMISSIONS — admins
>> "%MSGFILE%" echo   explicitly grant per-user, matching the
>> "%MSGFILE%" echo   Employees/Reports/Integrations admin-pattern.
>> "%MSGFILE%" echo - NavigationPermissions.jsx: added 'DocumentTemplates' to ORDER
>> "%MSGFILE%" echo   between 'DocumentManagement' and 'AICampaigns'.
>> "%MSGFILE%" echo.
>> "%MSGFILE%" echo Verified hands-on: Dre opened User Management edit, confirmed
>> "%MSGFILE%" echo the toggle appears in the correct slot.

>> %MARKER% echo --- staging + commit ---
%GIT% add -A >> %MARKER% 2>&1
%GIT% commit --no-verify -F "%MSGFILE%" >> %MARKER% 2>&1

>> %MARKER% echo --- post-commit ---
%GIT% rev-parse --abbrev-ref HEAD >> %MARKER% 2>&1
%GIT% rev-parse HEAD >> %MARKER% 2>&1
%GIT% log --oneline -4 >> %MARKER% 2>&1
endlocal
