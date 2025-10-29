#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start Aisha CRM Independent Backend Server
.DESCRIPTION
    Starts the Node.js backend server and performs health checks
.EXAMPLE
    .\start-server.ps1
.EXAMPLE
    .\start-server.ps1 -NoHealthCheck
#>

param(
    [switch]$NoHealthCheck,
    [switch]$Foreground,
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🚀 Starting Aisha CRM Independent Backend Server..." -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if dependencies are installed
if (-not (Test-Path "$scriptDir\node_modules")) {
    Write-Host "⚠ Dependencies not found. Running npm install..." -ForegroundColor Yellow
    Set-Location $scriptDir
    npm install
}

# Check if server is already running
$existingProcess = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existingProcess) {
    Write-Host "⚠ Port $Port is already in use" -ForegroundColor Yellow
    $ownerPid = $existingProcess.OwningProcess
    $process = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "  Process: $($process.ProcessName) (PID: $ownerPid)" -ForegroundColor Gray
        $response = Read-Host "Do you want to stop it and restart? (y/N)"
        if ($response -eq 'y' -or $response -eq 'Y') {
            Stop-Process -Id $ownerPid -Force
            Start-Sleep -Seconds 2
            Write-Host "✓ Previous server stopped" -ForegroundColor Green
        } else {
            Write-Host "Exiting..." -ForegroundColor Gray
            exit 0
        }
    }
}

# Start the server
Set-Location $scriptDir

if ($Foreground) {
    Write-Host "Starting server in foreground mode with auto-restart (Ctrl+C to stop)..." -ForegroundColor Cyan
    Write-Host ""
    npm run dev
    exit 0
}

Write-Host "Starting server in background with auto-restart..." -ForegroundColor Cyan
$serverProcess = Start-Process -FilePath "pwsh" -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory $scriptDir -PassThru

if (-not $serverProcess) {
    Write-Host "✗ Failed to start server" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Server process started (PID: $($serverProcess.Id))" -ForegroundColor Green

# Wait for server to be ready
Write-Host "Waiting for server to be ready..." -ForegroundColor Gray
$maxAttempts = 10
$attempt = 0
$serverReady = $false

while ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 1
    $attempt++
    
    try {
        $connection = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($connection) {
            $serverReady = $true
            break
        }
    } catch {
        # Continue waiting
    }
    
    Write-Host "." -NoNewline -ForegroundColor Gray
}

Write-Host ""

if (-not $serverReady) {
    Write-Host "✗ Server did not start within $maxAttempts seconds" -ForegroundColor Red
    Write-Host "  Check logs for errors" -ForegroundColor Gray
    exit 1
}

Write-Host "✓ Server is ready on port $Port" -ForegroundColor Green
Write-Host ""

# Run health checks
if (-not $NoHealthCheck) {
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Running Health Checks" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    $baseUrl = "http://localhost:$Port"
    $allPassed = $true
    
    # Test 1: Health endpoint
    try {
        $health = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 5
        if ($health.status -eq "ok") {
            Write-Host "✓ GET /health" -ForegroundColor Green
            Write-Host "  Status: $($health.status)" -ForegroundColor Gray
            Write-Host "  Uptime: $([math]::Round($health.uptime, 2))s" -ForegroundColor Gray
            Write-Host "  Database: $($health.database)" -ForegroundColor Gray
        } else {
            throw "Unexpected status: $($health.status)"
        }
    } catch {
        Write-Host "✗ GET /health - $($_.Exception.Message)" -ForegroundColor Red
        $allPassed = $false
    }
    Write-Host ""
    
    # Test 2: System status
    try {
        $status = Invoke-RestMethod -Uri "$baseUrl/api/system/status" -TimeoutSec 5
        if ($status.status -eq "success") {
            Write-Host "✓ GET /api/system/status" -ForegroundColor Green
            Write-Host "  Server: $($status.data.server)" -ForegroundColor Gray
            Write-Host "  Database: $($status.data.database)" -ForegroundColor Gray
            Write-Host "  Version: $($status.data.version)" -ForegroundColor Gray
        } else {
            throw "Unexpected status: $($status.status)"
        }
    } catch {
        Write-Host "✗ GET /api/system/status - $($_.Exception.Message)" -ForegroundColor Red
        $allPassed = $false
    }
    Write-Host ""
    
    # Test 3: Dashboard stats
    try {
        $stats = Invoke-RestMethod -Uri "$baseUrl/api/reports/dashboard-stats?tenant_id=test" -TimeoutSec 5
        if ($stats.status -eq "success") {
            Write-Host "✓ GET /api/reports/dashboard-stats" -ForegroundColor Green
            Write-Host "  Contacts: $($stats.data.totalContacts)" -ForegroundColor Gray
            Write-Host "  Accounts: $($stats.data.totalAccounts)" -ForegroundColor Gray
            Write-Host "  Leads: $($stats.data.totalLeads)" -ForegroundColor Gray
        } else {
            throw "Unexpected status: $($stats.status)"
        }
    } catch {
        Write-Host "✗ GET /api/reports/dashboard-stats - $($_.Exception.Message)" -ForegroundColor Red
        $allPassed = $false
    }
    Write-Host ""
    
    # Test 4: Dashboard bundle
    try {
        $bundle = Invoke-RestMethod -Uri "$baseUrl/api/reports/dashboard-bundle?tenant_id=test" -TimeoutSec 5
        if ($bundle.status -eq "success") {
            Write-Host "✓ GET /api/reports/dashboard-bundle" -ForegroundColor Green
            Write-Host "  Tenant: $($bundle.tenant_id)" -ForegroundColor Gray
        } else {
            throw "Unexpected status: $($bundle.status)"
        }
    } catch {
        Write-Host "✗ GET /api/reports/dashboard-bundle - $($_.Exception.Message)" -ForegroundColor Red
        $allPassed = $false
    }
    Write-Host ""
    
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    if ($allPassed) {
        Write-Host "  ✓ All health checks passed!" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Some health checks failed" -ForegroundColor Yellow
    }
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "Server Information:" -ForegroundColor Cyan
Write-Host "  URL: http://localhost:$Port" -ForegroundColor White
Write-Host "  PID: $($serverProcess.Id)" -ForegroundColor White
Write-Host "  Endpoints: 197 functions across 26 categories" -ForegroundColor White
Write-Host ""
Write-Host "Quick Commands:" -ForegroundColor Cyan
Write-Host "  Health: Invoke-RestMethod http://localhost:$Port/health" -ForegroundColor Gray
Write-Host "  Status: Invoke-RestMethod http://localhost:$Port/api/system/status" -ForegroundColor Gray
Write-Host "  Stop: Stop-Process -Id $($serverProcess.Id)" -ForegroundColor Gray
Write-Host ""
Write-Host "✓ Backend server is running!" -ForegroundColor Green
