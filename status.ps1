#!/usr/bin/env pwsh
# AI-SHA CRM Status Check Script
# Shows status of all services

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI-SHA CRM - Service Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
    return $connection
}

# Check Docker
Write-Host "Docker:" -ForegroundColor Yellow
try {
    docker ps > $null 2>&1
    if ($?) {
        Write-Host "  ✓ Running" -ForegroundColor Green
        
        # Check containers
        $containers = docker ps --format "{{.Names}}" | Where-Object { $_ -like "*ai-sha-crm*" }
        if ($containers) {
            Write-Host "  Containers:" -ForegroundColor Cyan
            foreach ($container in $containers) {
                Write-Host "    • $container" -ForegroundColor White
            }
        }
    } else {
        Write-Host "  ❌ Not running" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ Not installed or not running" -ForegroundColor Red
}

# Check PostgreSQL
Write-Host "`nPostgreSQL (port 5432):" -ForegroundColor Yellow
if (Test-Port -Port 5432) {
    Write-Host "  ✓ Running" -ForegroundColor Green
} else {
    Write-Host "  ❌ Not accessible" -ForegroundColor Red
}

# Check Backend
Write-Host "`nBackend (port 3001):" -ForegroundColor Yellow
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

# Check Supabase
Write-Host "`nSupabase (port 8000):" -ForegroundColor Yellow
if (Test-Port -Port 8000) {
    Write-Host "  ✓ Running" -ForegroundColor Green
    Write-Host "  URL: http://localhost:8000" -ForegroundColor White
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
