@echo off
setlocal EnableExtensions
title Melann Lending System - STATIC SERVER
color 0A
cd /d "%~dp0"

set "STATIC_IP=192.168.254.192"
set "SERVER_PORT=5001"
set "SERVER_URL=http://%STATIC_IP%:%SERVER_PORT%"
set "NODE_DIR=%~dp0.runtime\node"
set "NODE_EXE=%NODE_DIR%\node.exe"

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - STATIC SERVER
echo ======================================================
echo   Address: %SERVER_URL%
echo ======================================================
echo.

powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%SERVER_URL%/api/health' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }"
if not errorlevel 1 (
  echo The server is already running.
  echo Opening the system in your browser...
  if /I not "%MLS_NO_BROWSER%"=="1" start "" "%SERVER_URL%/login?fix=favicon-v5"
  if /I "%MLS_MONITOR_ONCE%"=="1" exit /b 0
  goto :monitor_existing_server
)

if not exist "%NODE_EXE%" (
  echo ERROR: Local Node.js runtime is missing.
  echo Run SETUP_SERVER.bat first.
  pause
  exit /b 1
)

if not exist "%~dp0server\node_modules\express\package.json" (
  echo ERROR: Server dependencies are missing.
  echo Run SETUP_SERVER.bat first.
  pause
  exit /b 1
)

if not exist "%~dp0client\dist\index.html" (
  echo ERROR: The production web client is missing.
  echo Run SETUP_SERVER.bat first.
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
set "NODE_ENV=production"
set "HOST=0.0.0.0"
set "PORT=%SERVER_PORT%"
set "ENFORCE_HTTPS=false"
set "CORS_ORIGINS=http://%COMPUTERNAME%:%SERVER_PORT%,http://%STATIC_IP%:%SERVER_PORT%,http://localhost:%SERVER_PORT%,http://127.0.0.1:%SERVER_PORT%"

echo Starting the server. Keep this window open.
echo Press Ctrl+C to stop it.
echo.

rem Open the browser as soon as the health endpoint becomes available.
if /I not "%MLS_NO_BROWSER%"=="1" start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%SERVER_URL%/api/health' -TimeoutSec 1; if ($r.StatusCode -eq 200) { Start-Process '%SERVER_URL%/login?fix=favicon-v5'; exit 0 } } catch {}; Start-Sleep -Seconds 1 }"

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

:monitor_existing_server
cls
echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - STATIC SERVER STATUS
echo ======================================================
echo.
echo   SERVER STATUS: RUNNING
echo   Address: %SERVER_URL%
echo   Last checked: %DATE% %TIME%
echo.
echo   This window is monitoring the background server.
echo   Closing this window will only close the monitor.
echo   The existing background server will continue running.
echo.
echo ======================================================
powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%SERVER_URL%/api/health' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }"
if errorlevel 1 goto :existing_server_stopped
powershell.exe -NoProfile -Command "Start-Sleep -Seconds 10"
goto :monitor_existing_server

:existing_server_stopped
color 0C
echo.
echo   SERVER STATUS: STOPPED
echo   The background server is no longer responding.
echo   Close this window, then run START_SERVER_STATIC.bat again.
echo.
pause
exit /b 1
