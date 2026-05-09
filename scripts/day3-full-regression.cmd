@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set NODE="C:\Program Files\nodejs\node.exe"
set MARKER=%REPO%\scripts\day3-full-regression-out.txt
cd /d %REPO%
%NODE% --test backend/__tests__/routes/templates.test.js backend/__tests__/routes/submissions.test.js backend/__tests__/routes/public-sign.test.js backend/__tests__/lib/buildSigningRequestEmail.test.js > %MARKER% 2>&1
echo EXIT=%ERRORLEVEL% >> %MARKER%
