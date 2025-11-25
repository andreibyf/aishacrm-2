#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Reset user password via backend API
.DESCRIPTION
    Resets a user's password in Supabase Auth via the backend admin endpoint
.PARAMETER Email
    The email address of the user
.PARAMETER Password
    The new password (optional - generates a strong password if not provided)
.EXAMPLE
    .\reset-password.ps1 -Email admin2025@temp.com
.EXAMPLE
    .\reset-password.ps1 -Email admin2025@temp.com -Password "MyNewPassword123!@#"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [Parameter(Mandatory=$false)]
    [string]$Password
)

$ErrorActionPreference = "Stop"

# Generate strong password if not provided
if (-not $Password) {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    $Password = -join ((1..16) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    $generatedPassword = $true
} else {
    $generatedPassword = $false
}

Write-Host "`n🔐 Resetting password for: $Email" -ForegroundColor Cyan
Write-Host ""

# Check if backend is running
try {
    $null = Invoke-RestMethod -Uri 'http://localhost:3001/health' -TimeoutSec 2 -ErrorAction Stop
} catch {
    Write-Host "❌ Backend server is not running!" -ForegroundColor Red
    Write-Host "   Start it with: .\start-all.ps1" -ForegroundColor Yellow
    exit 1
}

# Reset password
$body = @{
    email = $Email
    password = $Password
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri 'http://localhost:3001/api/users/admin-password-reset' `
                                 -Method POST `
                                 -Body $body `
                                 -ContentType 'application/json' `
                                 -ErrorAction Stop
    
    Write-Host "✅ SUCCESS! Password has been reset!" -ForegroundColor Green
    Write-Host "   ✓ Password expiration cleared" -ForegroundColor Green
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║              LOGIN CREDENTIALS                    ║" -ForegroundColor Cyan
    Write-Host "╠═══════════════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host "║ Email:    $(($Email).PadRight(40)) ║" -ForegroundColor White
    Write-Host "║ Password: $(($Password).PadRight(40)) ║" -ForegroundColor White
    Write-Host "╚═══════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🌐 Go to: http://localhost:5173" -ForegroundColor Green
    Write-Host "   Click 'Sign In' and use the credentials above" -ForegroundColor Gray
    Write-Host ""
    
    if ($generatedPassword) {
        Write-Host "⚠  Password was auto-generated. Copy it now!" -ForegroundColor Yellow
        Write-Host "   You can change it after logging in (Settings → User Management)" -ForegroundColor Gray
    }
    
    # Copy password to clipboard if available
    try {
        Set-Clipboard -Value $Password
        Write-Host "📋 Password copied to clipboard!" -ForegroundColor Green
    } catch {
        # Clipboard not available
    }
    
    Write-Host ""
    
} catch {
    Write-Host "❌ Failed to reset password!" -ForegroundColor Red
    Write-Host ""
    
    if ($_.ErrorDetails.Message) {
        $errorObj = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorObj.message)" -ForegroundColor Yellow
        
        if ($errorObj.message -like "*weak*" -or $errorObj.message -like "*easy to guess*") {
            Write-Host ""
            Write-Host "💡 Tip: Password must be strong. Requirements:" -ForegroundColor Cyan
            Write-Host "   • At least 8 characters" -ForegroundColor Gray
            Write-Host "   • Mix of uppercase and lowercase" -ForegroundColor Gray
            Write-Host "   • Numbers and special characters" -ForegroundColor Gray
            Write-Host "   • Not a common password" -ForegroundColor Gray
            Write-Host ""
            Write-Host "Try running without -Password to auto-generate a strong one:" -ForegroundColor Yellow
            Write-Host "   .\reset-password.ps1 -Email $Email" -ForegroundColor White
        }
    } else {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    exit 1
}
