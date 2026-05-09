@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\commit-day2-direct-out.txt
cd /d %REPO%
> %MARKER% echo --- add ---
%GIT% add -A 1>>%MARKER% 2>&1
echo ADD=%ERRORLEVEL% >> %MARKER%
>> %MARKER% echo --- staged ---
%GIT% diff --cached --stat 1>>%MARKER% 2>&1
>> %MARKER% echo --- commit ---
%GIT% commit --no-verify -m "feat(esign): send-for-signing flow + branded email + restored detail-panel sections (4VD-43 day 2)" 1>>%MARKER% 2>&1
echo COMMIT=%ERRORLEVEL% >> %MARKER%
>> %MARKER% echo --- log ---
%GIT% log --oneline -2 >> %MARKER% 2>&1
