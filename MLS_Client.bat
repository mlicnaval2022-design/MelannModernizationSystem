@echo off
title MLS - Melann Lending System
color 0B
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║                                                  ║
echo  ║   ███╗   ███╗██╗     ███████╗                   ║
echo  ║   ████╗ ████║██║     ██╔════╝                   ║
echo  ║   ██╔████╔██║██║     ███████╗                   ║
echo  ║   ██║╚██╔╝██║██║     ╚════██║                   ║
echo  ║   ██║ ╚═╝ ██║███████╗███████║                   ║
echo  ║   ╚═╝     ╚═╝╚══════╝╚══════╝                   ║
echo  ║                                                  ║
echo  ║   MODERNIZATION OF MELANN LENDING SYSTEM         ║
echo  ║                                                  ║
echo  ╚══════════════════════════════════════════════════╝
echo.
echo  Opening Melann Lending System...
echo.

REM === SERVER IP ADDRESS ===
set SERVER_IP=192.168.254.115
set SERVER_PORT=5173
set URL=http://%SERVER_IP%:%SERVER_PORT%

echo  Connecting to: %URL%
echo.

REM Open in default browser
start "" "%URL%"

echo  ✓ Browser opened successfully!
echo.
echo  NOTE: Make sure the server is running on the host PC.
echo  If the page does not load, contact your administrator.
echo.
timeout /t 5 /nobreak >nul
