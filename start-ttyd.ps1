# ============================================
# Antigravity 2.0 - Mobile Remote Access
# Start ttyd Web Terminal Server
# ============================================
# 
# This script launches a secure web-based terminal
# that you can access from your phone's browser.
#
# Usage: Right-click > Run with PowerShell
#        or: powershell -File start-ttyd.ps1
# ============================================

$PORT = 8080
$USERNAME = "admin"
$PASSWORD = "AntiGravity2025!"

# Get Wi-Fi IP address
$wifiIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.InterfaceAlias -match "Wi-Fi|Wireless" -and $_.IPAddress -notmatch "^169\." 
} | Select-Object -First 1).IPAddress

if (-not $wifiIP) {
    # Fallback: get any non-loopback IPv4
    $wifiIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
        $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notmatch "^169\." 
    } | Select-Object -First 1).IPAddress
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Antigravity 2.0 - Mobile Remote Access" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web Terminal URL:" -ForegroundColor Yellow
Write-Host "  http://${wifiIP}:${PORT}" -ForegroundColor Green
Write-Host ""
Write-Host "  Login Credentials:" -ForegroundColor Yellow
Write-Host "  Username: $USERNAME" -ForegroundColor White
Write-Host "  Password: $PASSWORD" -ForegroundColor White
Write-Host ""
Write-Host "  Open this URL in your phone's browser" -ForegroundColor Gray
Write-Host "  (make sure you're on the same Wi-Fi)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Launch ttyd
ttyd -W -p $PORT -c "${USERNAME}:${PASSWORD}" powershell
