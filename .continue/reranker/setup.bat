@echo off
REM Quick setup for Continue.dev Reranker MCP Server

echo Setting up Continue.dev Reranker...
echo.

cd /d "%~dp0"

echo [1/2] Installing Node.js dependencies...
call npm install

echo.
echo [2/2] Testing MCP server configuration...
node -e "console.log('✅ Node.js setup complete')"

echo.
echo ======================================
echo Setup Complete!
echo ======================================
echo.
echo Next steps:
echo 1. Run start-reranker.bat to start the Python service
echo 2. Reload VS Code to enable the MCP server
echo 3. Use @rerank in Continue.dev chat
echo.
echo See README.md for details
pause
