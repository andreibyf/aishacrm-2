@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set MARKER=%REPO%\scripts\verify-day3-out.txt
set NODE="C:\Program Files\nodejs\node.exe"
cd /d %REPO%
> %MARKER% echo === node --check ===
%NODE% --check backend/server.js >> %MARKER% 2>&1
echo SERVER=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/routes/public-sign.js >> %MARKER% 2>&1
echo PUBLIC_SIGN=%ERRORLEVEL% >> %MARKER%
%NODE% --check backend/middleware/rateLimiter.js >> %MARKER% 2>&1
echo RATE=%ERRORLEVEL% >> %MARKER%

>> %MARKER% echo === public-sign.test.js ===
%NODE% --test backend/__tests__/routes/public-sign.test.js > %TEMP%\day3-public-sign.txt 2>&1
echo PUBLIC_SIGN_TEST=%ERRORLEVEL% >> %MARKER%
type %TEMP%\day3-public-sign.txt | findstr /R /C:"^ℹ tests" /C:"^ℹ pass" /C:"^ℹ fail" >> %MARKER%

>> %MARKER% echo === regression: templates + submissions + email helper ===
%NODE% --test backend/__tests__/routes/templates.test.js backend/__tests__/routes/submissions.test.js backend/__tests__/lib/buildSigningRequestEmail.test.js > %TEMP%\day3-regression.txt 2>&1
echo REGRESSION=%ERRORLEVEL% >> %MARKER%
type %TEMP%\day3-regression.txt | findstr /R /C:"^ℹ tests" /C:"^ℹ pass" /C:"^ℹ fail" >> %MARKER%

>> %MARKER% echo === done ===
