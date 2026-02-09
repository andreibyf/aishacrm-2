@echo off
REM Quick Python installer for Windows
REM Downloads and installs Python 3.11 with PATH configuration

echo ========================================
echo Python 3.11 Installation for Reranker
echo ========================================
echo.

REM Check if Python is already installed
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Python is already installed!
    python --version
    echo.
    echo You can now run: .continue\reranker\start-reranker.bat
    pause
    exit /b 0
)

echo Python not found. Installing Python 3.11...
echo.
echo This will:
echo 1. Download Python 3.11 installer
echo 2. Install with "Add to PATH" enabled
echo 3. Configure pip
echo.
echo Press any key to start installation...
pause > nul

REM Download Python installer
echo Downloading Python 3.11 installer...
powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe' -OutFile '%TEMP%\python-installer.exe'"

echo.
echo Starting Python installation...
echo IMPORTANT: The installer will open - installation will proceed automatically
echo.

REM Run installer with options:
REM /quiet = silent install
REM InstallAllUsers=0 = current user only
REM PrependPath=1 = add to PATH
REM Include_pip=1 = install pip
"%TEMP%\python-installer.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1

echo.
echo Waiting for installation to complete...
timeout /t 30 /nobreak > nul

REM Refresh PATH
echo Refreshing environment...
powershell -Command "refreshenv" 2>nul

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Close and reopen this terminal
echo 2. Run: python --version (to verify)
echo 3. Run: .continue\reranker\start-reranker.bat
echo.
pause
