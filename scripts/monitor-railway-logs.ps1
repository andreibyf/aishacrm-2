#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Monitor Railway backend logs for health patterns and errors.

.DESCRIPTION
    Fetches recent logs from Railway backend service and analyzes them for:
    - IPv6/ENETUNREACH errors (should be eliminated with IPv4 DNS fix)
    - Database connection issues
    - Successful startups/shutdowns
    - System logging activity

.PARAMETER ServiceId
    Railway service ID (optional - defaults to backend service)

.PARAMETER Lines
    Number of log lines to fetch (default: 200)

.PARAMETER Follow
    Continuously monitor logs (like tail -f)

.EXAMPLE
    .\scripts\monitor-railway-logs.ps1
    # Fetch last 200 lines and analyze

.EXAMPLE
    .\scripts\monitor-railway-logs.ps1 -Lines 500 -Follow
    # Monitor continuously with more history
#>

param(
    [string]$ServiceId = "",
    [int]$Lines = 200,
    [switch]$Follow
)

# Try to load persisted service from config if not provided via param
$monitorConfigPath = Join-Path $PSScriptRoot "monitoring.config.json"
if (-not $ServiceId -and (Test-Path $monitorConfigPath)) {
    try {
        $cfg = Get-Content $monitorConfigPath -Raw | ConvertFrom-Json
        if ($cfg.serviceId) { $ServiceId = $cfg.serviceId }
    } catch { }
}

# Colors for output
$colors = @{
    Error   = "Red"
    Warning = "Yellow"
    Success = "Green"
    Info    = "Cyan"
    Highlight = "Magenta"
}

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Type = "Info"
    )
    Write-Host $Message -ForegroundColor $colors[$Type]
}

function Test-RailwayCLI {
    $railwayCmd = Get-Command railway -ErrorAction SilentlyContinue
    if (-not $railwayCmd) {
        Write-ColorOutput "❌ Railway CLI not found. Install it first:" "Error"
        Write-Host ""
        Write-Host "npm install -g @railway/cli" -ForegroundColor White
        Write-Host ""
        Write-Host "Then authenticate with:" -ForegroundColor White
        Write-Host "railway login" -ForegroundColor White
        Write-Host ""
        return $false
    }
    return $true
}

function Get-RailwayLogs {
    param(
        [string]$Service,
        [int]$NumLines,
        [bool]$FollowMode
    )

    $cmd = "railway logs"
    if ($Service) { $cmd += " --service $Service" }
    $cmd += " --lines $NumLines"
    if ($FollowMode) { $cmd += " --follow" }

    Write-ColorOutput "Fetching logs: $cmd" "Info"
    Write-Host ""

    # Execute and capture output
    if ($FollowMode) {
        # In follow mode, stream directly
        Invoke-Expression $cmd
    } else {
        $output = Invoke-Expression $cmd 2>&1
        return $output
    }
}

function Analyze-Logs {
    param([string[]]$LogLines)

    Write-ColorOutput "`nREPORT: Log Analysis Report" "Highlight"
    Write-ColorOutput ("=" * 60) "Info"

    # Pattern definitions
    $patterns = @{
        IPv6Errors = @{
            Regex = "ENETUNREACH|IPv6|connect ETIMEDOUT.*::"
            Label = "IPv6/ENETUNREACH Errors"
            Type = "Error"
        }
        DBErrors = @{
            Regex = "ECONNREFUSED.*5432|Connection terminated|database.*error|Failed to connect to database"
            Label = "Database Connection Errors"
            Type = "Error"
        }
        StartupSuccess = @{
            Regex = "Backend server started successfully|Server running on port|IPv4 address resolved"
            Label = "Successful Startups"
            Type = "Success"
        }
        ShutdownEvents = @{
            Regex = "SIGTERM received|shutting down gracefully|Backend server shutting down"
            Label = "Graceful Shutdowns"
            Type = "Warning"
        }
        SystemLogs = @{
            Regex = "logBackendEvent|INSERT INTO system_logs|Failed to log backend event"
            Label = "System Logging Activity"
            Type = "Info"
        }
        HealthChecks = @{
            Regex = "GET /api/system/status|health check"
            Label = "Health Check Requests"
            Type = "Info"
        }
        AuthErrors = @{
            Regex = "401|Unauthorized|Invalid token|Authentication failed"
            Label = "Authentication Errors"
            Type = "Warning"
        }
        ServerErrors = @{
            Regex = "500|Internal Server Error|Unhandled.*error"
            Label = "500 Server Errors"
            Type = "Error"
        }
    }

    $results = @{}
    foreach ($key in $patterns.Keys) {
        $pattern = $patterns[$key]
        $matches = $LogLines | Select-String -Pattern $pattern.Regex -AllMatches
        $results[$key] = @{
            Count = $matches.Count
            Lines = $matches
            Pattern = $pattern
        }
    }

    # Display results
    Write-Host ""
    Write-ColorOutput "Pattern Match Summary:" "Highlight"
    Write-Host ""

    foreach ($key in $patterns.Keys) {
        $result = $results[$key]
        $pattern = $result.Pattern
        $count = $result.Count

    $icon = if ($count -eq 0) { "OK" } else { "WARN" }
        $countStr = "$count matches"
        
        Write-Host "  $icon " -NoNewline
        Write-Host $pattern.Label -NoNewline -ForegroundColor $colors[$pattern.Type]
        Write-Host ": " -NoNewline
        Write-Host $countStr -ForegroundColor $(if ($count -eq 0) { "Green" } else { "Yellow" })
    }

    Write-Host ""
    Write-ColorOutput ("=" * 60) "Info"

    # Detailed findings for critical issues
    $criticalKeys = @("IPv6Errors", "DBErrors", "ServerErrors")
    $hasCritical = $false

    foreach ($key in $criticalKeys) {
        $result = $results[$key]
        if ($result.Count -gt 0) {
            $hasCritical = $true
            Write-Host ""
            Write-ColorOutput "⚠️  CRITICAL: $($result.Pattern.Label) ($($result.Count) found)" "Error"
            Write-ColorOutput ("-" * 60) "Info"
            
            # Show first 5 matches
            $samplesToShow = [Math]::Min(5, $result.Lines.Count)
            for ($i = 0; $i -lt $samplesToShow; $i++) {
                $line = $result.Lines[$i].Line
                # Truncate long lines
                if ($line.Length -gt 120) {
                    $line = $line.Substring(0, 117) + "..."
                }
                Write-Host "  $($i + 1). " -NoNewline -ForegroundColor DarkGray
                Write-Host $line -ForegroundColor Red
            }
            
            if ($result.Lines.Count -gt 5) {
                Write-Host "  ... and $($result.Lines.Count - 5) more" -ForegroundColor DarkGray
            }
        }
    }

    if (-not $hasCritical) {
        Write-Host ""
    Write-ColorOutput "OK: No critical issues detected in logs" "Success"
    }

    # IPv4 Stability Summary
    Write-Host ""
    Write-ColorOutput "IPv4 Stability Status:" "Highlight"
    Write-ColorOutput ("-" * 60) "Info"
    
    $ipv6Count = $results["IPv6Errors"].Count
    $dbErrorCount = $results["DBErrors"].Count
    $startupCount = $results["StartupSuccess"].Count

    if ($ipv6Count -eq 0 -and $dbErrorCount -eq 0) {
    Write-ColorOutput "  OK: IPv4 DNS fix working correctly - no IPv6 errors detected" "Success"
    Write-ColorOutput "  OK: Database connections stable - no connection errors" "Success"
    } elseif ($ipv6Count -gt 0) {
    Write-ColorOutput "  ERROR: IPv6 errors still occurring - DNS fix may need adjustment" "Error"
    } elseif ($dbErrorCount -gt 0) {
    Write-ColorOutput "  WARN: Database connection issues detected" "Warning"
    }

    if ($startupCount -gt 0) {
    Write-ColorOutput "  INFO: $startupCount successful startup(s) detected" "Info"
    }

    # Recommendations
    Write-Host ""
    Write-ColorOutput "Recommendations:" "Highlight"
    Write-ColorOutput ("-" * 60) "Info"

    if ($ipv6Count -gt 0) {
    Write-Host "  - Review IPv4 DNS configuration in backend/server.js"
    Write-Host "  - Check if Supabase host resolution is using IPv6 fallback"
    }
    
    if ($dbErrorCount -gt 0) {
    Write-Host "  - Verify DATABASE_URL and Supabase connection string"
    Write-Host "  - Check for connection pool exhaustion or timeouts"
    }

    if ($results["SystemLogs"].Count -eq 0) {
    Write-Host "  - System logging may be disabled (DISABLE_DB_LOGGING=true)"
    Write-Host "  - Enable logging to verify audit trail functionality"
    } elseif ($results["SystemLogs"].Lines | Select-String "Failed to log") {
    Write-Host "  - System logging errors detected - verify system_logs table exists"
    }

    if ($results["ServerErrors"].Count -gt 5) {
    Write-Host "  - High rate of 500 errors - investigate application errors"
    }

    if (-not ($ipv6Count -or $dbErrorCount -or ($results["ServerErrors"].Count -gt 5))) {
    Write-ColorOutput "  OK: Backend looks healthy - continue monitoring" "Success"
    }

    Write-Host ""
}

# Main execution
Clear-Host
Write-ColorOutput "Railway Backend Log Monitor - AishaCRM Production Diagnostics" "Highlight"
Write-Host ""

# Check Railway CLI
if (-not (Test-RailwayCLI)) {
    exit 1
}

# Verify we're in the right project
Write-ColorOutput "Verifying Railway project..." "Info"
$projectInfo = railway status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-ColorOutput "❌ Not in a Railway project or not authenticated" "Error"
    Write-ColorOutput "Run 'railway link' to connect to your project" "Info"
    exit 1
}

Write-ColorOutput "✅ Connected to Railway project" "Success"
Write-Host ""

# Ensure we have a service to query
if (-not $ServiceId) {
    Write-ColorOutput "No service specified. Please set one of the following:" "Warning"
    Write-Host "  1) Run: railway service <service-id-or-name>  # to link the service in this repo"
    Write-Host "  2) Run: .\\scripts\\monitor-railway-logs.ps1 -ServiceId '<service-id>'"
    Write-Host "  3) Save it: echo '{\"serviceId\":\"<service-id>\"}' > $monitorConfigPath"
    exit 1
}

# Fetch and analyze logs
if ($Follow) {
    Write-ColorOutput "Starting continuous log monitoring (Ctrl+C to stop)..." "Info"
    Write-ColorOutput "Note: Analysis only available in snapshot mode (-Follow:$false)" "Warning"
    Write-Host ""
    Get-RailwayLogs -Service $ServiceId -NumLines $Lines -FollowMode $true
} else {
    $logs = Get-RailwayLogs -Service $ServiceId -NumLines $Lines -FollowMode $false
    
    if ($logs -and $logs.Count -gt 0) {
        Analyze-Logs -LogLines $logs
    } else {
    Write-ColorOutput "WARN: No logs retrieved. Check Railway CLI configuration." "Warning"
    }
}

Write-Host ""
Write-ColorOutput "Log monitoring complete." "Info"
Write-Host ""
