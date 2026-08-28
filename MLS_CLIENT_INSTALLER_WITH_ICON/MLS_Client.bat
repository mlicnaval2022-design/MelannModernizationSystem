@echo off
setlocal EnableExtensions
title Melann Lending System - CLIENT
color 0B
set "MLS_LAUNCHER_VERSION=2026-08-28.1"

rem Set the new branch server PC name here, or define MLS_SERVER_NAME before launch.
if not defined MLS_SERVER_NAME set "MLS_SERVER_NAME=SERVERPC"
rem Fixed LAN address of this branch server. The server name remains the fallback.
if not defined MLS_SERVER_IP set "MLS_SERVER_IP=192.168.1.12"
if not defined MLS_SERVER_PORT set "MLS_SERVER_PORT=5001"

echo.
echo ==============================================
echo   MELANN LENDING SYSTEM - CLIENT
echo   Launcher %MLS_LAUNCHER_VERSION%
echo ==============================================
echo   Looking for the Melann server...
echo ==============================================
echo.

rem Prefer a fixed LAN address when one has been configured.
if defined MLS_SERVER_IP (
  call :check_server "https://%MLS_SERVER_IP%:%MLS_SERVER_PORT%"
  if not errorlevel 1 goto :connected
)

echo Trying the server name %MLS_SERVER_NAME%...
call :check_server "https://%MLS_SERVER_NAME%:%MLS_SERVER_PORT%"
if not errorlevel 1 goto :connected

rem A second pass handles a server that is still finishing its startup.
echo The server is not ready yet. Retrying...
powershell.exe -NoProfile -Command "Start-Sleep -Seconds 3"
if defined MLS_SERVER_IP (
  call :check_server "https://%MLS_SERVER_IP%:%MLS_SERVER_PORT%"
  if not errorlevel 1 goto :connected
)
call :check_server "https://%MLS_SERVER_NAME%:%MLS_SERVER_PORT%"
if not errorlevel 1 goto :connected

color 0C
echo.
echo ERROR: The Melann server cannot be reached.
echo.
echo On the server PC:
echo   1. Keep START_SERVER.bat running.
echo   2. Run ALLOW_CLIENT_ACCESS.bat once as administrator.
echo.
echo On this client PC:
echo   1. Connect to the same local network as the server.
echo   2. Reinstall the client if the HTTPS certificate changed.
echo   3. Try this client again.
echo.
pause
exit /b 1

:connected
set "MLS_LOGIN_URL=%MLS_SYSTEM_URL%/login?fix=favicon-v5"
echo Connected successfully: %MLS_SYSTEM_URL%
echo Opening the Melann Lending System...
echo.

if /I "%MLS_NO_BROWSER%"=="1" (
  echo Browser launch skipped for verification.
  exit /b 0
)

rem Open a real browser executable. Windows can report success for a broken URL
rem association, so the generic URL handler is used only as a last fallback.
call :open_browser
if not errorlevel 1 goto :browser_opened

color 0C
echo ERROR: Windows could not open the default browser.
echo Copy and open this address manually:
echo %MLS_LOGIN_URL%
echo.
pause
exit /b 1

:browser_opened
echo The client was opened in your default browser.
powershell.exe -NoProfile -Command "Start-Sleep -Seconds 5"
exit /b 0

:open_browser
set "MLS_BROWSER_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "MLS_BROWSER_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined MLS_BROWSER_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "MLS_BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined MLS_BROWSER_EXE if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "MLS_BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined MLS_BROWSER_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "MLS_BROWSER_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined MLS_BROWSER_EXE if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" set "MLS_BROWSER_EXE=%ProgramFiles%\Mozilla Firefox\firefox.exe"
if not defined MLS_BROWSER_EXE if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" set "MLS_BROWSER_EXE=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
if not defined MLS_BROWSER_EXE goto :open_with_windows

echo Using: %MLS_BROWSER_EXE%
powershell.exe -NoProfile -Command "try { Start-Process -FilePath $env:MLS_BROWSER_EXE -ArgumentList $env:MLS_LOGIN_URL -ErrorAction Stop; Start-Sleep -Seconds 2; if (Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($env:MLS_BROWSER_EXE)) -ErrorAction SilentlyContinue) { exit 0 }; exit 1 } catch { exit 1 }"
exit /b %ERRORLEVEL%

:open_with_windows
explorer.exe "%MLS_LOGIN_URL%" >nul 2>&1
if not errorlevel 1 exit /b 0
rundll32.exe url.dll,FileProtocolHandler "%MLS_LOGIN_URL%" >nul 2>&1
exit /b %ERRORLEVEL%

:check_server
set "MLS_SYSTEM_URL=%~1"
rem Disable the Windows web proxy for this LAN-only health check.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { $request=[Net.HttpWebRequest]::Create($env:MLS_SYSTEM_URL + '/api/health'); $request.Proxy=$null; $request.Timeout=5000; $response=$request.GetResponse(); $status=[int]$response.StatusCode; $response.Close(); if ($status -eq 200) { exit 0 } } catch {}; exit 1"
exit /b %ERRORLEVEL%
