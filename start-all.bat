@echo off
title Antigravity 2.0 - Startup Script
cd /d "%~dp0"

echo Starting Antigravity Node Server Backend...
start "Antigravity Node Server" cmd /k "node server.js"

echo Starting Mobile Remote Terminal (ttyd)...
start "Antigravity Mobile Terminal" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ttyd.ps1"

echo Both servers are starting up in separate windows.
timeout /t 5
