@echo off
setlocal EnableExtensions
title Melann Lending System - First-Time Server Setup
color 0E
cd /d "%~dp0"

set "NODE_VERSION=24.19.0"
set "NODE_DIR=%~dp0.runtime\node"
set "NODE_ZIP=%TEMP%\node-v%NODE_VERSION%-win-x64.zip"

echo.
echo ======================================================
echo   MELANN LENDING SYSTEM - FIRST-TIME SERVER SETUP
echo ======================================================
echo.

if not exist "%NODE_DIR%\node.exe" (
  echo Downloading the official Node.js runtime...
  if not exist "%~dp0.runtime" mkdir "%~dp0.runtime"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip' -OutFile '%NODE_ZIP%'; Expand-Archive -LiteralPath '%NODE_ZIP%' -DestinationPath '%~dp0.runtime' -Force; Move-Item -LiteralPath '%~dp0.runtime\node-v%NODE_VERSION%-win-x64' -Destination '%NODE_DIR%' -Force"
  if errorlevel 1 goto :failed
)

set "PATH=%NODE_DIR%;%PATH%"

powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 goto :server_running

echo Installing server packages...
call "%NODE_DIR%\npm.cmd" ci --prefix server
if errorlevel 1 goto :failed

echo Installing client packages...
call "%NODE_DIR%\npm.cmd" ci --prefix client
if errorlevel 1 goto :failed

echo Building the web client...
call "%NODE_DIR%\npm.cmd" run build --prefix client
if errorlevel 1 goto :failed

if not exist "%~dp0server\.env" (
  echo Creating branch-specific security configuration...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$rng=[Security.Cryptography.RandomNumberGenerator]::Create(); $jwtBytes=New-Object byte[] 48; $passwordBytes=New-Object byte[] 12; $rng.GetBytes($jwtBytes); $rng.GetBytes($passwordBytes); $rng.Dispose(); $jwt=[Convert]::ToBase64String($jwtBytes); $password=([Convert]::ToBase64String($passwordBytes).TrimEnd('=')) + 'Aa1!'; $serverIp=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' } | Select-Object -First 1 -ExpandProperty IPAddress); if (-not $serverIp) { $serverIp='127.0.0.1' }; $origins='http://localhost:5001,http://127.0.0.1:5001,http://' + $env:COMPUTERNAME + ':5001,http://' + $serverIp + ':5001'; $envLines=@('NODE_ENV=production','PORT=5001','HOST=0.0.0.0','DB_PATH=./melann.db','UPLOADS_PATH=../uploads',('JWT_SECRET=' + $jwt),('INITIAL_ADMIN_PASSWORD=' + $password),('CORS_ORIGINS=' + $origins),'ENFORCE_HTTPS=false','TRUST_PROXY=0'); [IO.File]::WriteAllLines('%~dp0server\.env',$envLines,[Text.UTF8Encoding]::new($false)); $credentialLines=@('Melann Lending System - Initial Branch Administrator','','Username: admin',('Temporary password: ' + $password),'','Sign in, change this password immediately, then securely delete this file.'); [IO.File]::WriteAllLines('%~dp0INITIAL_ADMIN_CREDENTIALS.txt',$credentialLines,[Text.UTF8Encoding]::new($false))"
  if errorlevel 1 goto :failed
)

if not exist "%~dp0server\melann.db" (
  echo Creating a new empty branch database...
  call "%NODE_DIR%\npm.cmd" run initialize:fresh --prefix server
  if errorlevel 1 goto :failed
)

echo Checking the branch database...
call "%NODE_DIR%\npm.cmd" run verify:database --prefix server
if errorlevel 1 goto :failed

echo.
echo Setup completed successfully.
if exist "%~dp0INITIAL_ADMIN_CREDENTIALS.txt" echo Initial administrator login: INITIAL_ADMIN_CREDENTIALS.txt
echo Next: run ALLOW_CLIENT_ACCESS.bat once, then START_SERVER.bat.
echo.
pause
exit /b 0

:server_running
echo.
echo SETUP STOPPED: The Melann server is currently running.
echo Close the server window first, then run SETUP_SERVER.bat again.
echo.
pause
exit /b 1

:failed
echo.
echo SETUP FAILED. Review the error shown above.
echo.
pause
exit /b 1
