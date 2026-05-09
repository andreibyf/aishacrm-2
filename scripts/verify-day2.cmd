@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set MARKER=%REPO%\scripts\verify-day2-out.txt
set NODE="C:\Program Files\nodejs\node.exe"
cd /d %REPO%

> %MARKER% echo === node --check (backend) ===
%NODE% --check backend/server.js >> %MARKER% 2>&1
echo SERVER=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/routes/submissions.js >> %MARKER% 2>&1
echo SUBMISSIONS=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/lib/buildSigningRequestEmail.js >> %MARKER% 2>&1
echo EMAIL_HELPER=%ERRORLEVEL% >> %MARKER%
%NODE% --check src/components/signing/useSigningSessions.js >> %MARKER% 2>&1
echo USE_HOOK=%ERRORLEVEL% >> %MARKER%

>> %MARKER% echo === backend regression ===
%NODE% --test backend/__tests__/routes/templates.test.js backend/__tests__/routes/submissions.test.js backend/__tests__/lib/buildSigningRequestEmail.test.js > %TEMP%\verify-day2-tests.txt 2>&1
echo BACKEND_TESTS=%ERRORLEVEL% >> %MARKER%
type %TEMP%\verify-day2-tests.txt | findstr /R /C:"^# tests" /C:"^# pass" /C:"^# fail" /C:"^ℹ" >> %MARKER%

>> %MARKER% echo === done ===
