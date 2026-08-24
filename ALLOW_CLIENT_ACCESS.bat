@echo off
setlocal
title Allow Melann Client Access

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator permission for Windows Firewall...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

rem Replace stale copies of the rule and allow the local subnet even when Windows
rem temporarily classifies the trusted branch network as Public.
netsh advfirewall firewall delete rule name="Melann Lending System (LAN)" >nul 2>&1
netsh advfirewall firewall add rule name="Melann Lending System (LAN)" dir=in action=allow protocol=TCP localport=5001 profile=any remoteip=localsubnet >nul
if errorlevel 1 (
  echo Failed to add the Windows Firewall rule.
  pause
  exit /b 1
)

echo.
echo Client access is now allowed from the local network on port 5001.
echo.
pause
