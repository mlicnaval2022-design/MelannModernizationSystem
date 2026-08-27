@echo off
setlocal EnableExtensions
title Melann Lending System - Restarting Server
color 0E
cd /d "%~dp0"

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - RESTART SERVER
echo ======================================================
echo.
call "%~dp0STOP_SERVER.bat" quiet
if errorlevel 1 (
  echo.
  echo RESTART CANCELLED: The existing process could not be safely stopped.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting a fresh server in this window...
echo This green window is the server window. Keep it open.
echo.
call "%~dp0START_SERVER.bat"
