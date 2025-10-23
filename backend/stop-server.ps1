#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stop Aisha CRM Independent Backend Server
.DESCRIPTION
    Stops all Node.js processes running the backend server
.EXAMPLE
    .\stop-server.ps1
#>

param(
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"

Write-Host "🛑 Stopping Aisha CRM Backend Server..." -ForegroundColor Cyan
Write-Host ""

# Find process listening on port
$connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $connection) {
    Write-Host "✓ No server running on port $Port" -ForegroundColor Green
    exit 0
}

$pid = $connection.OwningProcess
$process = Get-Process -Id $pid -ErrorAction SilentlyContinue

if ($process) {
    Write-Host "Found server process:" -ForegroundColor Yellow
    Write-Host "  Name: $($process.ProcessName)" -ForegroundColor Gray
    Write-Host "  PID: $pid" -ForegroundColor Gray
    Write-Host "  CPU: $([math]::Round($process.CPU, 2))s" -ForegroundColor Gray
    Write-Host ""
    
    try {
        Stop-Process -Id $pid -Force
        Start-Sleep -Seconds 2
        
        # Verify it stopped
        $stillRunning = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($stillRunning) {
            Write-Host "✗ Failed to stop process" -ForegroundColor Red
            exit 1
        }
        
        Write-Host "✓ Server stopped successfully" -ForegroundColor Green
    } catch {
        Write-Host "✗ Error stopping server: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✗ Could not find process with PID $pid" -ForegroundColor Red
    exit 1
}
