@echo off
REM Create Windows Task Scheduler entry to auto-start reranker on login

echo Creating auto-start task for Continue.dev Reranker...
echo.

REM Create the scheduled task using schtasks
schtasks /Create /TN "Continue.dev Reranker" ^
  /TR "C:\Users\andre\Documents\GitHub\aishacrm-2\.continue\reranker\start-reranker.bat" ^
  /SC ONLOGON ^
  /RL HIGHEST ^
  /F

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Auto-start task created successfully!
    echo.
    echo The reranker will now start automatically when you log in to Windows.
    echo.
    echo To manage the task:
    echo   - Open Task Scheduler (taskschd.msc)
    echo   - Look for "Continue.dev Reranker"
    echo.
    echo To remove auto-start:
    echo   schtasks /Delete /TN "Continue.dev Reranker" /F
) else (
    echo.
    echo ❌ Failed to create task. Please run this script as Administrator.
    echo Right-click → "Run as administrator"
)

echo.
pause
