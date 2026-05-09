@echo off
set REPO=C:\Users\andre\Documents\GitHub\aishacrm-2
set GIT="C:\Program Files\Git\cmd\git.exe"
set MARKER=%REPO%\scripts\confirm-rename-out.txt
cd /d %REPO%

> %MARKER% echo === HEAD branch ===
%GIT% rev-parse --abbrev-ref HEAD >> %MARKER% 2>&1
>> %MARKER% echo === HEAD commit ===
%GIT% rev-parse HEAD >> %MARKER% 2>&1
>> %MARKER% echo === all abyfield branches ===
%GIT% branch --list "abyfield/*" >> %MARKER% 2>&1
>> %MARKER% echo === any branch with docuseal ===
%GIT% for-each-ref --format="%%(refname:short)" refs/heads | findstr /I docuseal >> %MARKER% 2>&1
>> %MARKER% echo === uncommitted ===
%GIT% status --short >> %MARKER% 2>&1
>> %MARKER% echo === done ===
