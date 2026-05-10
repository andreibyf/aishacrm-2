@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set NODE="C:\Program Files\nodejs\node.exe"
set MARKER=%REPO%\scripts\verify-day4b-out.txt
cd /d %REPO%
> %MARKER% echo === backend regression (no frontend changes affect it) ===
%NODE% --test backend/__tests__/routes/templates.test.js backend/__tests__/routes/submissions.test.js backend/__tests__/routes/public-sign.test.js backend/__tests__/lib/buildSigningRequestEmail.test.js backend/__tests__/lib/computeDocumentDueFields.test.js > %TEMP%\day4b-regression.txt 2>&1
echo EXIT=%ERRORLEVEL% >> %MARKER%
type %TEMP%\day4b-regression.txt | findstr /R /C:"^ℹ" >> %MARKER%
