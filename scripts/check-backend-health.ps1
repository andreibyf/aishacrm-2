#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Check AishaCRM backend health via direct HTTP requests (platform-agnostic).

.DESCRIPTION
    Fetches backend health status and recent metrics without requiring Railway CLI.
    Analyzes:
    - System status endpoint
    - Security metrics (JWT, rate limiting, CORS, RLS)
    - Performance metrics

.PARAMETER BackendUrl
    Backend URL (default: http://localhost:3001)

.EXAMPLE
    .\scripts\check-backend-health.ps1
    # Check production backend

.EXAMPLE
    .\scripts\check-backend-health.ps1 -BackendUrl "http://localhost:3001"
    # Check local backend
#>

$defaultUrl = $env:VITE_AISHACRM_BACKEND_URL
if ([string]::IsNullOrWhiteSpace($defaultUrl)) { $defaultUrl = "http://localhost:3001" }

param(
    [string]$BackendUrl = $defaultUrl
)

$colors = @{
    Error   = "Red"
    Warning = "Yellow"
    Success = "Green"
    Info    = "Cyan"
    Highlight = "Magenta"
}

function Write-ColorOutput {
    param([string]$Message, [string]$Type = "Info")
    Write-Host $Message -ForegroundColor $colors[$Type]
}

Clear-Host
Write-ColorOutput "AishaCRM Backend Health Check" "Highlight"
Write-ColorOutput ("=" * 60) "Info"
Write-Host ""
Write-ColorOutput "Backend URL: $BackendUrl" "Info"
Write-Host ""

# 1. System Status Check
Write-ColorOutput "1. System Status" "Highlight"
Write-ColorOutput ("-" * 60) "Info"
try {
    $statusResponse = Invoke-RestMethod -Uri "$BackendUrl/api/system/status" -Method Get -TimeoutSec 10
    
    if ($statusResponse.status -eq "healthy") {
        Write-ColorOutput "  OK: Backend is healthy" "Success"
    } else {
        Write-ColorOutput "  WARN: Backend status: $($statusResponse.status)" "Warning"
    }
    
    if ($statusResponse.data) {
        $db = $statusResponse.data.database
        $dbType = $statusResponse.data.database_type
        
        if ($db -and $db -notmatch "^error:") {
            Write-ColorOutput "  OK: Database connection active ($dbType)" "Success"
        } else {
            Write-ColorOutput "  ERROR: Database issue - $db" "Error"
        }
        
        Write-Host ""
        Write-Host "  Environment: $($statusResponse.data.environment)" -ForegroundColor Gray
        Write-Host "  Node Version: $($statusResponse.data.node_version)" -ForegroundColor Gray
        Write-Host "  Uptime: $($statusResponse.data.uptime) seconds" -ForegroundColor Gray
    }
} catch {
    Write-ColorOutput "  ERROR: Could not reach backend - $($_.Exception.Message)" "Error"
}

Write-Host ""

# 2. Security Metrics
Write-ColorOutput "2. Security Metrics" "Highlight"
Write-ColorOutput ("-" * 60) "Info"
try {
    $securityResponse = Invoke-RestMethod -Uri "$BackendUrl/api/metrics/security" -Method Get -TimeoutSec 10
    
    if ($securityResponse.data) {
        $metrics = $securityResponse.data
        
        Write-Host "  JWT Authentication:"
        Write-Host "    - Enabled: $($metrics.jwtEnabled)" -ForegroundColor $(if ($metrics.jwtEnabled) { "Green" } else { "Yellow" })
        Write-Host "    - Algorithm: $($metrics.jwtAlgorithm)" -ForegroundColor Gray
        
        Write-Host "  Rate Limiting:"
        Write-Host "    - Enabled: $($metrics.rateLimitEnabled)" -ForegroundColor $(if ($metrics.rateLimitEnabled) { "Green" } else { "Yellow" })
        if ($metrics.rateLimitConfig) {
            Write-Host "    - Window: $($metrics.rateLimitConfig.windowMs)ms, Max: $($metrics.rateLimitConfig.max)" -ForegroundColor Gray
        }
        
        Write-Host "  CORS:"
        Write-Host "    - Enabled: $($metrics.corsEnabled)" -ForegroundColor $(if ($metrics.corsEnabled) { "Green" } else { "Yellow" })
        if ($metrics.corsOrigins) {
            Write-Host "    - Origins: $($metrics.corsOrigins -join ', ')" -ForegroundColor Gray
        }
        
        Write-Host "  RLS (Row Level Security):"
        Write-Host "    - Enabled: $($metrics.rlsEnabled)" -ForegroundColor $(if ($metrics.rlsEnabled) { "Green" } else { "Yellow" })
    }
} catch {
    Write-ColorOutput "  WARN: Security metrics unavailable - $($_.Exception.Message)" "Warning"
}

Write-Host ""

# 3. Performance Metrics
Write-ColorOutput "3. Performance Metrics" "Highlight"
Write-ColorOutput ("-" * 60) "Info"
try {
    $perfResponse = Invoke-RestMethod -Uri "$BackendUrl/api/metrics/performance" -Method Get -TimeoutSec 10
    
    if ($perfResponse.data) {
        $perf = $perfResponse.data
        
        Write-Host "  Memory Usage:"
        Write-Host "    - RSS: $([math]::Round($perf.memory.rss / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host "    - Heap Used: $([math]::Round($perf.memory.heapUsed / 1MB, 2)) MB / $([math]::Round($perf.memory.heapTotal / 1MB, 2)) MB" -ForegroundColor Gray
        
        Write-Host "  System:"
        Write-Host "    - Uptime: $([math]::Round($perf.uptime / 3600, 2)) hours" -ForegroundColor Gray
        Write-Host "    - CPU Usage: $([math]::Round($perf.cpu.user / 1000000, 2))s user, $([math]::Round($perf.cpu.system / 1000000, 2))s system" -ForegroundColor Gray
        
        if ($perf.database) {
            Write-Host "  Database:"
            Write-Host "    - Pool: $($perf.database.poolSize) total, $($perf.database.idleCount) idle, $($perf.database.waitingCount) waiting" -ForegroundColor Gray
        }
    }
} catch {
    Write-ColorOutput "  WARN: Performance metrics unavailable - $($_.Exception.Message)" "Warning"
}

Write-Host ""

# 4. IPv4 DNS Verification (check for any IPv6 references in responses)
Write-ColorOutput "4. IPv4 DNS Status" "Highlight"
Write-ColorOutput ("-" * 60) "Info"
try {
    $statusJson = Invoke-RestMethod -Uri "$BackendUrl/api/system/status" -Method Get -TimeoutSec 10 | ConvertTo-Json -Depth 10
    
    if ($statusJson -match "IPv6|ENETUNREACH|::1|::") {
        Write-ColorOutput "  WARN: IPv6 references detected in status response" "Warning"
    } else {
        Write-ColorOutput "  OK: No IPv6 errors detected (IPv4 DNS fix working)" "Success"
    }
} catch {
    Write-ColorOutput "  INFO: Could not verify IPv4 status" "Info"
}

Write-Host ""

# Summary
Write-ColorOutput ("=" * 60) "Info"
Write-ColorOutput "Health Check Complete" "Highlight"
Write-Host ""
Write-ColorOutput "Next Steps:" "Info"
Write-Host "  1. Enable DB logging: Set DISABLE_DB_LOGGING=false (or remove) in your deployment env"
Write-Host "  2. Verify system_logs: Run queries in scripts/check-system-logs.sql (Supabase)"
Write-Host "  3. Monitor for 3-7 days: Re-run this script daily to track stability"
Write-Host ""
