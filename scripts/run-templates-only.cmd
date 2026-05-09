@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set MARKER=%REPO%\scripts\run-templates-only-out.txt
set NODE="C:\Program Files\nodejs\node.exe"
cd /d %REPO%
%NODE% --test backend/__tests__/routes/templates.test.js > %MARKER% 2>&1
echo EXIT=%ERRORLEVEL% >> %MARKER%
