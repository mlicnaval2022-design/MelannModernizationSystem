@echo off
setlocal

set HOST_IP=localhost
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
  for /f "tokens=* delims= " %%B in ("%%A") do (
    set HOST_IP=%%B
    goto :found_ip
  )
)
:found_ip

echo Starting Melann Lending API on http://%HOST_IP%:5001
start "Melann API" cmd /k "cd /d ""%~dp0server"" && npm.cmd start"

echo Starting Melann Lending frontend on http://%HOST_IP%:5173
start "Melann Frontend" cmd /k "cd /d ""%~dp0client"" && npm.cmd run dev -- --host 0.0.0.0"

echo.
echo Share this link with PCs on the same Wi-Fi/LAN:
echo http://%HOST_IP%:5173
echo.
echo Keep both opened command windows running while your teammates use the system.
pause
