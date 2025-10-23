#!/usr/bin/env pwsh
# AI-SHA CRM Complete Startup Script
# Starts Docker containers, backend, and frontend

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI-SHA CRM - Full Stack Startup" -ForegroundColor Cyan
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

# Step 1: Check Docker
Write-Host "Step 1: Checking Docker..." -ForegroundColor Yellow
if (-not (Test-Docker)) {
    Write-Host "  ❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Docker is running" -ForegroundColor Green

# Step 2: Start Docker containers
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

# Step 3: Check PostgreSQL connection
Write-Host "`nStep 3: Checking PostgreSQL..." -ForegroundColor Yellow
if (Test-Port -Port 5432) {
    Write-Host "  ✓ PostgreSQL is accessible on port 5432" -ForegroundColor Green
} else {
    Write-Host "  ❌ PostgreSQL is not accessible" -ForegroundColor Red
    exit 1
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
    Write-Host "  Starting backend server..." -ForegroundColor Cyan
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; node server.js"
    Start-Sleep -Seconds 3
    
    if (Test-Port -Port 3001) {
        Write-Host "  ✓ Backend started on port 3001" -ForegroundColor Green
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
Write-Host "  Database:  localhost:5432" -ForegroundColor White
Write-Host "  Supabase:  http://localhost:8000" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C in terminal windows to stop services" -ForegroundColor Yellow
Write-Host ""
