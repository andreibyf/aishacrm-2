@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set NODE="C:\Program Files\nodejs\node.exe"
set MARKER=%REPO%\scripts\verify-day4a-out.txt
cd /d %REPO%

> %MARKER% echo === node --check ===
%NODE% --check backend/server.js >> %MARKER% 2>&1
echo SERVER=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/routes/submissions.js >> %MARKER% 2>&1
echo SUBMISSIONS=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/routes/public-sign.js >> %MARKER% 2>&1
echo PUBLIC_SIGN=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/lib/computeDocumentDueFields.js >> %MARKER% 2>&1
echo DUE_FIELDS=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/lib/signingActivityTracker.js >> %MARKER% 2>&1
echo TRACKER=%ERRORLEVEL% >> %MARKER%

>> %MARKER% echo === full backend regression ===
%NODE% --test backend/__tests__/routes/templates.test.js backend/__tests__/routes/submissions.test.js backend/__tests__/routes/public-sign.test.js backend/__tests__/lib/buildSigningRequestEmail.test.js backend/__tests__/lib/computeDocumentDueFields.test.js > %TEMP%\day4a-regression.txt 2>&1
echo REGRESSION=%ERRORLEVEL% >> %MARKER%
type %TEMP%\day4a-regression.txt | findstr /R /C:"^ℹ" >> %MARKER%

>> %MARKER% echo === done ===
