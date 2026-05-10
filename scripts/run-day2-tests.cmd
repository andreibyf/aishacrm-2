@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set MARKER=%REPO%\scripts\run-day2-tests-out.txt
set NODE="C:\Program Files\nodejs\node.exe"
cd /d %REPO%

> %MARKER% echo === node --check ===
%NODE% --check backend/server.js >> %MARKER% 2>&1
echo SERVER_EXIT=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/routes/submissions.js >> %MARKER% 2>&1
echo SUBMISSIONS_EXIT=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/lib/buildSigningRequestEmail.js >> %MARKER% 2>&1
echo EMAIL_HELPER_EXIT=%ERRORLEVEL% >> %MARKER%

>> %MARKER% echo === buildSigningRequestEmail.test.js ===
%NODE% --test backend/__tests__/lib/buildSigningRequestEmail.test.js >> %MARKER% 2>&1
echo EMAIL_TEST_EXIT=%ERRORLEVEL% >> %MARKER%

>> %MARKER% echo === submissions.test.js ===
%NODE% --test backend/__tests__/routes/submissions.test.js >> %MARKER% 2>&1
echo SUBMISSIONS_TEST_EXIT=%ERRORLEVEL% >> %MARKER%

>> %MARKER% echo === templates.test.js (regression) ===
%NODE% --test backend/__tests__/routes/templates.test.js >> %MARKER% 2>&1
echo TEMPLATES_TEST_EXIT=%ERRORLEVEL% >> %MARKER%

>> %MARKER% echo === done ===
