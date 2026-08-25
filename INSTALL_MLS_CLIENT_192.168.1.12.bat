@echo off
setlocal EnableExtensions
title Melann Lending System - Client Setup
color 0B

set "MLS_SERVER_IP=192.168.1.12"
set "MLS_SERVER_NAME=SERVERPC"
set "MLS_SERVER_PORT=5001"
set "MLS_INSTALL_DIR=%LOCALAPPDATA%\Melann Lending System\Client"
set "MLS_INSTALLED_FILE=%MLS_INSTALL_DIR%\MLS_Client.bat"

if /I "%~1"=="--launch" goto :launch

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - CLIENT INSTALLER
echo ======================================================
echo   Server: %MLS_SERVER_IP%:%MLS_SERVER_PORT%
echo ======================================================
echo.

if not exist "%MLS_INSTALL_DIR%" mkdir "%MLS_INSTALL_DIR%"
if errorlevel 1 goto :install_failed

copy /Y "%~f0" "%MLS_INSTALLED_FILE%" >nul
if errorlevel 1 goto :install_failed

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $link=Join-Path $desktop 'MLS - Melann Lending System.lnk'; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut($link); $shortcut.TargetPath=$env:MLS_INSTALLED_FILE; $shortcut.Arguments='--launch'; $shortcut.WorkingDirectory=$env:MLS_INSTALL_DIR; $shortcut.IconLocation=$env:SystemRoot + '\System32\imageres.dll,14'; $shortcut.Description='Open Melann Lending System Client'; $shortcut.WindowStyle=1; $shortcut.Save()"
if errorlevel 1 goto :install_failed

echo   Installation complete.
echo   The MLS shortcut is now on your Desktop.
echo.
echo   Important: Connect this PC to the same network as the server.
echo.
set /p "MLS_OPEN_NOW=Open MLS now? [Y/N]: "
if /I "%MLS_OPEN_NOW%"=="Y" call "%MLS_INSTALLED_FILE%" --launch
exit /b 0

:launch
title Melann Lending System - CLIENT
echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - CLIENT
echo ======================================================
echo   Connecting to the server...
echo ======================================================
echo.

call :check_server "http://%MLS_SERVER_IP%:%MLS_SERVER_PORT%"
if not errorlevel 1 goto :connected

call :check_server "http://%MLS_SERVER_NAME%:%MLS_SERVER_PORT%"
if not errorlevel 1 goto :connected

color 0C
echo ERROR: The Melann server cannot be reached.
echo.
echo Please check the following:
echo   1. This PC and SERVERPC are connected to the same network.
echo   2. The MLS Server window is running on SERVERPC.
echo   3. ALLOW_CLIENT_ACCESS.bat was run once on SERVERPC.
echo.
echo Server IP: %MLS_SERVER_IP%
pause
exit /b 1

:connected
echo Connected: %MLS_SYSTEM_URL%
echo Opening the login page...
start "" "%MLS_SYSTEM_URL%/login?fix=favicon-v5"
if errorlevel 1 (
  color 0C
  echo.
  echo The browser could not be opened automatically.
  echo Open this address manually: %MLS_SYSTEM_URL%/login
  pause
  exit /b 1
)
exit /b 0

:check_server
set "MLS_SYSTEM_URL=%~1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { $request=[Net.HttpWebRequest]::Create($env:MLS_SYSTEM_URL + '/api/health'); $request.Proxy=$null; $request.Timeout=5000; $response=$request.GetResponse(); $status=[int]$response.StatusCode; $response.Close(); if ($status -eq 200) { exit 0 } } catch {}; exit 1"
exit /b %ERRORLEVEL%

:install_failed
color 0C
echo.
echo ERROR: The MLS client could not be installed.
echo Right-click this file and choose Run as administrator, then try again.
echo.
pause
exit /b 1
