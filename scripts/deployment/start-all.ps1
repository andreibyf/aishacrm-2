#!/usr/bin/env pwsh
# AI-SHA CRM Complete Startup Script
# Starts backend and frontend using Supabase Cloud database.
# Docker is optional (for local dev/testing only) and OFF by default.

[CmdletBinding()]
param(
    [switch]$UseDocker,       # Opt-in: start local Docker services (DB/Supabase) for testing
    [switch]$SkipDbCheck      # Skip DB connectivity check
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI-SHA CRM - Full Stack Startup" -ForegroundColor Cyan
Write-Host "  Database: Supabase Cloud (remote)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
    return $connection
}

# Function to check if Docker is running
function Test-Docker {
    try {
        docker ps > $null 2>&1
        return $?
    } catch {
        return $false
    }
}

# Step 1: Docker (optional)
Write-Host "Step 1: Docker (optional)" -ForegroundColor Yellow
if ($UseDocker) {
    if (-not (Test-Docker)) {
        Write-Host "  ❌ Docker is not running. Start Docker Desktop or omit -UseDocker." -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Docker is running" -ForegroundColor Green
} else {
    Write-Host "  ⏭ Skipping Docker (not requested)." -ForegroundColor Yellow
}

# Step 2: Start Docker containers (only if requested)
if ($UseDocker) {
    Write-Host "`nStep 2: Checking Docker containers..." -ForegroundColor Yellow
    $postgresContainer = docker ps --filter "name=ai-sha-crm-copy-c872be53-db-1" --format "{{.Names}}"
    $supabaseContainer = docker ps --filter "name=ai-sha-crm-copy-c872be53-supabase-1" --format "{{.Names}}"

    if (-not $postgresContainer -or -not $supabaseContainer) {
        Write-Host "  Starting Docker containers..." -ForegroundColor Cyan
        docker-compose up -d
        Start-Sleep -Seconds 5
        Write-Host "  ✓ Docker containers started" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Docker containers already running" -ForegroundColor Green
    }
}

# Step 3: Check PostgreSQL connection (basic, can be skipped)
Write-Host "`nStep 3: Checking PostgreSQL..." -ForegroundColor Yellow
if ($SkipDbCheck) {
    Write-Host "  ⏭ Skipping DB connectivity check." -ForegroundColor Yellow
} else {
    # Try default local port first; backend will use DATABASE_URL if different
    if (Test-Port -Port 5432) {
        Write-Host "  ✓ PostgreSQL is accessible on port 5432 (or using cloud DB)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ PostgreSQL not accessible on localhost:5432. If you're using a cloud DB (e.g., Supabase), this is OK." -ForegroundColor Yellow
    }
}

# Step 4: Start Backend
Write-Host "`nStep 4: Checking Backend..." -ForegroundColor Yellow
if (Test-Port -Port 3001) {
    Write-Host "  ⚠ Backend already running on port 3001" -ForegroundColor Yellow
    $restart = Read-Host "  Restart backend? (y/N)"
    if ($restart -eq 'y') {
        Write-Host "  Stopping existing backend..." -ForegroundColor Cyan
        Stop-Process -Name node -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    } else {
        Write-Host "  Keeping existing backend running" -ForegroundColor Green
        $backendRunning = $true
    }
}

if (-not $backendRunning) {
    Write-Host "  Starting backend server in dev mode (auto-restart)..." -ForegroundColor Cyan
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; npm run dev"
    Start-Sleep -Seconds 3
    
    if (Test-Port -Port 3001) {
        Write-Host "  ✓ Backend started on port 3001 (watch mode enabled)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Backend failed to start" -ForegroundColor Red
        exit 1
    }
}

# Step 5: Start Frontend
Write-Host "`nStep 5: Checking Frontend..." -ForegroundColor Yellow
if (Test-Port -Port 5173) {
    Write-Host "  ⚠ Frontend already running on port 5173" -ForegroundColor Yellow
    $restart = Read-Host "  Restart frontend? (y/N)"
    if ($restart -eq 'y') {
        Write-Host "  Stopping existing frontend..." -ForegroundColor Cyan
        Stop-Process -Name node -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    } else {
        Write-Host "  Keeping existing frontend running" -ForegroundColor Green
        $frontendRunning = $true
    }
}

if (-not $frontendRunning) {
    Write-Host "  Starting frontend server..." -ForegroundColor Cyan
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev"
    Start-Sleep -Seconds 5
    
    if (Test-Port -Port 5173) {
        Write-Host "  ✓ Frontend started on port 5173" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Frontend failed to start" -ForegroundColor Red
        exit 1
    }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  🚀 All Services Running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor White
Write-Host "  Backend:   http://localhost:3001" -ForegroundColor White
if ($UseDocker) {
    Write-Host "  Database:  localhost:5432" -ForegroundColor White
    Write-Host "  Supabase:  http://localhost:8000" -ForegroundColor White
} else {
    Write-Host "  Database:  Using configured DATABASE_URL (no Docker)" -ForegroundColor White
}
Write-Host ""
Write-Host "  Press Ctrl+C in terminal windows to stop services" -ForegroundColor Yellow
Write-Host ""
