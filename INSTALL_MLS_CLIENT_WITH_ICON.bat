@echo off
setlocal
title Install Melann Lending System Client
color 0B

set "MLS_SOURCE_DIR=%~dp0"
set "MLS_CLIENT_SOURCE=%MLS_SOURCE_DIR%MLS_Client.bat"
set "MLS_ICON_SOURCE=%MLS_SOURCE_DIR%mls_icon.ico"
set "MLS_INSTALL_DIR=%LOCALAPPDATA%\Melann Lending System\Client"
set "MLS_CLIENT_TARGET=%MLS_INSTALL_DIR%\MLS_Client.bat"
set "MLS_ICON_TARGET=%MLS_INSTALL_DIR%\mls_icon.ico"

echo.
echo ==============================================
echo   MELANN LENDING SYSTEM - CLIENT INSTALLER
echo ==============================================
echo.

if not exist "%MLS_CLIENT_SOURCE%" (
  echo ERROR: MLS_Client.bat is missing.
  echo Extract the complete ZIP package first, then run this installer again.
  echo.
  pause
  exit /b 1
)

if not exist "%MLS_ICON_SOURCE%" (
  echo ERROR: mls_icon.ico is missing.
  echo Extract the complete ZIP package first, then run this installer again.
  echo.
  pause
  exit /b 1
)

if not exist "%MLS_INSTALL_DIR%" mkdir "%MLS_INSTALL_DIR%"
if errorlevel 1 goto :install_error

copy /Y "%MLS_CLIENT_SOURCE%" "%MLS_CLIENT_TARGET%" >nul
if errorlevel 1 goto :install_error

copy /Y "%MLS_ICON_SOURCE%" "%MLS_ICON_TARGET%" >nul
if errorlevel 1 goto :install_error

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $shortcutPath=Join-Path $desktop 'MLS - Melann Lending System.lnk'; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut($shortcutPath); $shortcut.TargetPath=$env:MLS_CLIENT_TARGET; $shortcut.WorkingDirectory=$env:MLS_INSTALL_DIR; $shortcut.IconLocation=$env:MLS_ICON_TARGET + ',0'; $shortcut.Description='Open Melann Lending System Client'; $shortcut.WindowStyle=1; $shortcut.Save()"
if errorlevel 1 goto :shortcut_error

echo   Installation complete.
echo   A shortcut with the MLS icon is now on your Desktop.
echo.
echo   You may delete the extracted package after installation.
echo.
pause
exit /b 0

:shortcut_error
echo ERROR: The files were installed, but the Desktop shortcut could not be created.
echo Installed location: %MLS_INSTALL_DIR%
echo.
pause
exit /b 1

:install_error
echo ERROR: The MLS client could not be installed.
echo Try running this installer again.
echo.
pause
exit /b 1
