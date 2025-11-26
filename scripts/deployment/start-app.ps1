# Quick Start Script for Ai-SHA CRM
# Run this to start all services

Write-Host "🚀 Starting Ai-SHA CRM..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker Desktop is running (optional)
$dockerRunning = docker version 2>&1 | Select-String "Server:"
if ($dockerRunning) {
    Write-Host "✅ Docker Desktop is running" -ForegroundColor Green
    Write-Host "   Starting local database..." -ForegroundColor Yellow
    docker-compose up -d
    Start-Sleep -Seconds 2
} else {
    Write-Host "⚠️  Docker Desktop not running - skipping local database" -ForegroundColor Yellow
}

# Check if backend is running
$backendRunning = netstat -ano | findstr ":3001" | Select-String "LISTENING"
if ($backendRunning) {
    Write-Host "✅ Backend already running on port 3001" -ForegroundColor Green
} else {
    Write-Host "⚠️  Backend not running on port 3001" -ForegroundColor Yellow
    Write-Host "   Start backend manually: cd backend && npm start" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🌐 Starting frontend..." -ForegroundColor Yellow
Write-Host ""

# Start the frontend
npm run dev

# Note: Backend needs to be started separately in another terminal
# cd backend
# npm start
