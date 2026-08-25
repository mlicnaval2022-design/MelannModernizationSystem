@echo off
setlocal EnableExtensions

rem Always move server startup into its own persistent, visible console window.
if /I not "%~1"=="console" (
  start "Melann Lending System - SERVER" "%ComSpec%" /d /k call "%~f0" console
  exit /b 0
)

title Melann Lending System - SERVER (KEEP THIS WINDOW OPEN)
color 0A
cd /d "%~dp0"

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - VISIBLE SERVER CONSOLE
echo ======================================================
echo   Keep this window open while the system is in use.
echo ======================================================
echo.

call "%~dp0START_SERVER.bat"

echo.
echo The server launcher has ended. This window will stay open.
echo Run START_SERVER.bat here again if you need to restart it.
echo.
