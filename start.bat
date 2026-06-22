@echo off
title Melann Lending System V2
color 0A
echo.
echo ============================================
echo   MELANN LENDING SYSTEM V2 - MODERNIZED
echo ============================================
echo.
echo Starting Backend Server (Port 5001)...
start "Melann Server" cmd /k "cd /d %~dp0server && npm run dev"
timeout /t 3 /nobreak >nul

echo Starting Frontend Client (Port 5173)...
start "Melann Client" cmd /k "cd /d %~dp0client && npm run dev"
timeout /t 4 /nobreak >nul

echo.
echo ============================================
echo  System started! Opening browser...
echo  URL: http://localhost:5173
echo ============================================
echo.
start http://localhost:5173
