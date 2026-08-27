@echo off
setlocal EnableExtensions
title Melann Lending System - SERVER
color 0A
cd /d "%~dp0"

set "NODE_DIR=%~dp0.runtime\node"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "PORT=5001"

rem If MLS is already running, report it instead of starting a second server.
powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/api/health' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }"
if not errorlevel 1 (
  echo.
  echo ======================================================
  echo   MELANN LENDING SYSTEM - SERVER
  echo ======================================================
  echo   The server is already running on port %PORT%.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SERVER_CONTROL.ps1" status
  echo ======================================================
  echo.
  if /I not "%MLS_NO_BROWSER%"=="1" start "" "http://localhost:%PORT%/login?fix=favicon-v5"
  if /I "%MLS_MONITOR_ONCE%"=="1" exit /b 0
  echo This window did not start the running server, so closing it will
  echo NOT stop the server. Use RESTART_SERVER.bat for a clean restart.
  echo.
  pause
  exit /b 0
)

if not exist "%NODE_EXE%" (
  echo.
  echo ERROR: The local Node.js runtime is missing.
  echo Run SETUP_SERVER.bat first.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0server\node_modules" (
  echo.
  echo ERROR: Server packages are missing.
  echo Run SETUP_SERVER.bat first.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0client\dist\index.html" (
  echo.
  echo ERROR: The web client has not been built.
  echo Run SETUP_SERVER.bat first.
  echo.
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
set "NODE_ENV=production"
set "HOST=0.0.0.0"
set "ENFORCE_HTTPS=false"

set "SERVER_IP=127.0.0.1"
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "$ips = Get-NetIPAddress -AddressFamily IPv4; foreach ($item in $ips) { if ($item.IPAddress -notlike '127.*' -and $item.AddressState -eq 'Preferred') { $item.IPAddress; break } }"`) do set "SERVER_IP=%%I"
set "CORS_ORIGINS=http://%COMPUTERNAME%:%PORT%,http://%SERVER_IP%:%PORT%,http://localhost:%PORT%,http://127.0.0.1:%PORT%"

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - SERVER
echo ======================================================
echo   Server PC:  http://localhost:%PORT%
echo   Client URL: http://%COMPUTERNAME%:%PORT%
echo   IP fallback: http://%SERVER_IP%:%PORT%
echo ======================================================
echo.
echo Keep this window open while clients use the system.
echo Press Ctrl+C to stop the server.
echo.

rem Open the browser as soon as the health endpoint becomes available.
if /I not "%MLS_NO_BROWSER%"=="1" start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/api/health' -TimeoutSec 1; if ($r.StatusCode -eq 200) { Start-Process 'http://localhost:%PORT%/login?fix=favicon-v5'; exit 0 } } catch {}; Start-Sleep -Seconds 1 }"

pushd "%~dp0server"
"%NODE_EXE%" "src\index.js"
set "MLS_SERVER_EXIT_CODE=%ERRORLEVEL%"
popd

echo.
if not "%MLS_SERVER_EXIT_CODE%"=="0" (
  echo ERROR: The Melann server could not start or stopped unexpectedly.
  echo Exit code: %MLS_SERVER_EXIT_CODE%
  echo Check the error message above. This window will remain open.
) else (
  echo The Melann server has stopped.
)
pause
exit /b %MLS_SERVER_EXIT_CODE%
