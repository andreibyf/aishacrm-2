@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set MARKER=%REPO%\scripts\post-append-check-out.txt
set GIT="C:\Program Files\Git\cmd\git.exe"
cd /d %REPO%
> %MARKER% echo === branch ===
%GIT% rev-parse --abbrev-ref HEAD >> %MARKER% 2>&1
%GIT% rev-parse HEAD >> %MARKER% 2>&1
>> %MARKER% echo === log -3 ===
%GIT% log --oneline -3 >> %MARKER% 2>&1
>> %MARKER% echo === uncommitted ===
%GIT% status --short >> %MARKER% 2>&1
>> %MARKER% echo === HEAD subject + stat ===
%GIT% log -1 --pretty=format:"%%H %%s" >> %MARKER% 2>&1
>> %MARKER% echo.
%GIT% show --stat HEAD --format= >> %MARKER% 2>&1
>> %MARKER% echo === done ===
