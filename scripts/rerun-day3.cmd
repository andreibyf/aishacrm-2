@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set NODE="C:\Program Files\nodejs\node.exe"
set MARKER=%REPO%\scripts\rerun-day3-out.txt
cd /d %REPO%
%NODE% --test backend/__tests__/routes/public-sign.test.js > %MARKER% 2>&1
echo EXIT=%ERRORLEVEL% >> %MARKER%
