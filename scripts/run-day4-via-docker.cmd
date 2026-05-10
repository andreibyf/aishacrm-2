@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set MARKER=%REPO%\scripts\run-day4-via-docker-out.txt
set DOCKER="C:\Program Files\Docker\Docker\resources\bin\docker.exe"
cd /d %REPO%

> %MARKER% echo === stale docuseal-* check inside container ===
%DOCKER% exec aishacrm-backend sh -c "ls __tests__/routes/ 2>/dev/null | grep -i docuseal || echo NONE_FOUND" 1>>%MARKER% 2>&1
echo STALE_CHECK_EXIT=%ERRORLEVEL% >> %MARKER%

>> %MARKER% echo === eSign engine targeted suite ===
%DOCKER% exec aishacrm-backend node --test __tests__/routes/templates.test.js __tests__/routes/submissions.test.js __tests__/routes/public-sign.test.js __tests__/lib/buildSigningRequestEmail.test.js __tests__/lib/computeDocumentDueFields.test.js 1>>%MARKER% 2>&1
echo TARGETED_EXIT=%ERRORLEVEL% >> %MARKER%
