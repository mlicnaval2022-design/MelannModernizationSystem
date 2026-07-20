@echo off
title MLS - Setup Desktop Shortcut
echo.
echo  Setting up MLS Desktop Shortcuts...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0create_desktop_shortcut.ps1" -Mode both
