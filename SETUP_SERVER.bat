@echo off
setlocal EnableExtensions
title Melann Lending System - First-Time Server Setup
color 0E
cd /d "%~dp0"

set "NODE_VERSION=24.19.0"
set "NODE_DIR=%~dp0.runtime\node"
set "NODE_ZIP=%TEMP%\node-v%NODE_VERSION%-win-x64.zip"

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - FIRST-TIME SERVER SETUP
echo ======================================================
echo.

if not exist "%NODE_DIR%\node.exe" (
  echo Downloading the official Node.js runtime...
  if not exist "%~dp0.runtime" mkdir "%~dp0.runtime"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip' -OutFile '%NODE_ZIP%'; Expand-Archive -LiteralPath '%NODE_ZIP%' -DestinationPath '%~dp0.runtime' -Force; Move-Item -LiteralPath '%~dp0.runtime\node-v%NODE_VERSION%-win-x64' -Destination '%NODE_DIR%' -Force"
  if errorlevel 1 goto :failed
)

set "PATH=%NODE_DIR%;%PATH%"

powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 goto :server_running

echo Installing server packages...
call "%NODE_DIR%\npm.cmd" ci --prefix server
if errorlevel 1 goto :failed

echo Installing client packages...
call "%NODE_DIR%\npm.cmd" ci --prefix client
if errorlevel 1 goto :failed

echo Building the web client...
call "%NODE_DIR%\npm.cmd" run build --prefix client
if errorlevel 1 goto :failed

echo Creating or validating branch-specific HTTPS configuration...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURE_HTTPS.ps1"
if errorlevel 1 goto :failed

if not exist "%~dp0server\melann.db" (
  echo Creating a new empty branch database...
  call "%NODE_DIR%\npm.cmd" run initialize:fresh --prefix server
  if errorlevel 1 goto :failed
)

echo Checking the branch database...
call "%NODE_DIR%\npm.cmd" run verify:database --prefix server
if errorlevel 1 goto :failed

echo.
echo Setup completed successfully.
if exist "%~dp0INITIAL_ADMIN_CREDENTIALS.txt" echo Initial administrator login: INITIAL_ADMIN_CREDENTIALS.txt
echo Next: run ALLOW_CLIENT_ACCESS.bat once, then START_SERVER.bat.
echo Copy MLS_SERVER_CERT.cer with the client installer to every client PC.
echo.
pause
exit /b 0

:server_running
echo.
echo SETUP STOPPED: The Melann server is currently running.
echo Close the server window first, then run SETUP_SERVER.bat again.
echo.
pause
exit /b 1

:failed
echo.
echo SETUP FAILED. Review the error shown above.
echo.
pause
exit /b 1
