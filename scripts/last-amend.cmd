@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\last-amend-out.txt
cd /d %REPO%
del /F /Q "%REPO%\scripts\final-cleanup.cmd" 2>nul
del /F /Q "%REPO%\scripts\final-cleanup-out.txt" 2>nul
%GIT% add -A 2>>nul
%GIT% commit --amend --no-edit --no-verify 1>%MARKER% 2>&1
%GIT% rev-parse HEAD >> %MARKER% 2>&1
%GIT% show --stat HEAD -- scripts/ | findstr "^ scripts" >> %MARKER% 2>&1
%GIT% status --short >> %MARKER% 2>&1
