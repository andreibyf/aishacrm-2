@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set MARKER=%REPO%\scripts\run-rolegate-only-out.txt
set NODE="C:\Program Files\nodejs\node.exe"
cd /d %REPO%
%NODE% --test --test-name-pattern="Role gate" backend/__tests__/routes/templates.test.js > %MARKER% 2>&1
echo EXIT=%ERRORLEVEL% >> %MARKER%
