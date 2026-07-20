@echo off
title MLS - Setup Client Desktop Shortcut
echo.
echo  Setting up MLS Client Desktop Shortcut...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0create_desktop_shortcut.ps1" -Mode client
pause
