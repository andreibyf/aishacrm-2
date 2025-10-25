#!/usr/bin/env pwsh
# AI-SHA CRM Status Check Script
# Shows status of all services

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI-SHA CRM - Service Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Database: Supabase Cloud (remote)" -ForegroundColor Cyan
Write-Host ""

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
    return $connection
}

# Check Backend
Write-Host "Backend (port 3001):" -ForegroundColor Yellow
if (Test-Port -Port 3001) {
    Write-Host "  ✓ Running" -ForegroundColor Green
    Write-Host "  URL: http://localhost:3001" -ForegroundColor White
} else {
    Write-Host "  ❌ Not running" -ForegroundColor Red
}

# Check Frontend
Write-Host "`nFrontend (port 5173):" -ForegroundColor Yellow
if (Test-Port -Port 5173) {
    Write-Host "  ✓ Running" -ForegroundColor Green
    Write-Host "  URL: http://localhost:5173" -ForegroundColor White
} else {
    Write-Host "  ❌ Not running" -ForegroundColor Red
}

# Node processes
Write-Host "`nNode.js Processes:" -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "  Count: $($nodeProcesses.Count)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ None running" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host ""
