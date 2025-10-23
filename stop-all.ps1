#!/usr/bin/env pwsh
# AI-SHA CRM Complete Shutdown Script
# Stops frontend, backend, and Docker containers

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI-SHA CRM - Shutdown" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Stop Node processes (frontend & backend)
Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Stop-Process -Name node -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ Node.js processes stopped" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No Node.js processes running" -ForegroundColor Yellow
}

# Ask about Docker containers
Write-Host "`nStop Docker containers? (y/N): " -ForegroundColor Yellow -NoNewline
$stopDocker = Read-Host

if ($stopDocker -eq 'y') {
    Write-Host "Stopping Docker containers..." -ForegroundColor Yellow
    docker-compose down
    Write-Host "  ✓ Docker containers stopped" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Keeping Docker containers running" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ✓ Shutdown complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
