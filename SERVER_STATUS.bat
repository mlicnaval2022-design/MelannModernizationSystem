@echo off
setlocal EnableExtensions
title Melann Lending System - Server Status
color 0B
cd /d "%~dp0"

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - SERVER STATUS
echo ======================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SERVER_CONTROL.ps1" status
echo.
pause
