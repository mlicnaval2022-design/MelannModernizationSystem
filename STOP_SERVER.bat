@echo off
setlocal EnableExtensions
title Melann Lending System - Stop Server
color 0E
cd /d "%~dp0"

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - STOP SERVER
echo ======================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SERVER_CONTROL.ps1" stop
set "MLS_STOP_EXIT_CODE=%ERRORLEVEL%"
echo.
if /I not "%~1"=="quiet" pause
exit /b %MLS_STOP_EXIT_CODE%
