@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\rename-branch-out.txt
set NEW=abyfield/4vd-43-esign-engine-day-1
cd /d %REPO%

> %MARKER% echo === before ===
%GIT% rev-parse --abbrev-ref HEAD >> %MARKER% 2>&1
%GIT% branch --list "abyfield/*" >> %MARKER% 2>&1

>> %MARKER% echo === rename ===
%GIT% branch -m %NEW% >> %MARKER% 2>&1

>> %MARKER% echo === after ===
%GIT% rev-parse --abbrev-ref HEAD >> %MARKER% 2>&1
%GIT% branch --list "abyfield/*" >> %MARKER% 2>&1
%GIT% log -1 --pretty=format:"%%H %%s" >> %MARKER% 2>&1
>> %MARKER% echo.
>> %MARKER% echo === done ===
