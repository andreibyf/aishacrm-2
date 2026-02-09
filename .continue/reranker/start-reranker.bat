@echo off
REM Start the Continue.dev Reranker Service

echo Starting Continue.dev Reranker Service...
echo.
echo First-time setup will download BGE model (~600MB)
echo Service will run on http://localhost:5001
echo.

cd /d "%~dp0"

REM Use full Python path (winget install location)
set PYTHON_PATH=%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe

REM Check if venv exists
if not exist "venv\" (
    echo Creating Python virtual environment...
    "%PYTHON_PATH%" -m venv venv
    echo.
)

REM Activate venv and install/upgrade dependencies
call venv\Scripts\activate.bat

echo Installing dependencies...
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo.
echo ✅ Starting reranker service...
echo Press Ctrl+C to stop
echo.

"%PYTHON_PATH%" service.py
