@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set MARKER=%REPO%\scripts\run-templates-test-out.txt
set NODE="C:\Program Files\nodejs\node.exe"
cd /d %REPO%

> %MARKER% echo === node --check route ===
%NODE% --check backend/routes/templates.js >> %MARKER% 2>&1
>> %MARKER% echo EXIT_CHECK=%ERRORLEVEL%

>> %MARKER% echo === node --check server.js ===
%NODE% --check backend/server.js >> %MARKER% 2>&1
>> %MARKER% echo EXIT_CHECK=%ERRORLEVEL%

>> %MARKER% echo === templates.test.js ===
%NODE% --test --test-reporter=tap backend/__tests__/routes/templates.test.js >> %MARKER% 2>&1
>> %MARKER% echo EXIT_TEST=%ERRORLEVEL%

>> %MARKER% echo === done ===
