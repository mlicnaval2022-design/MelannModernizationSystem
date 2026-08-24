@echo off
setlocal
title Configure Melann Server Static IP
color 0E

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator permission to configure the network...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo Configuring the Melann server network address...
echo.

netsh interface ipv4 set address name="Ethernet" source=static address=192.168.254.192 mask=255.255.255.0 gateway=192.168.254.254 gwmetric=1 store=persistent
if errorlevel 1 goto :failed

netsh interface ipv4 set dnsservers name="Ethernet" source=static address=192.168.254.254 register=primary validate=no
if errorlevel 1 goto :failed

ipconfig /flushdns >nul

echo.
echo Static IP configuration completed:
echo   IP address: 192.168.254.192
echo   Subnet mask: 255.255.255.0
echo   Gateway: 192.168.254.254
echo   DNS: 192.168.254.254
echo.
pause
exit /b 0

:failed
echo.
echo Failed to configure the static IP address.
echo.
pause
exit /b 1
