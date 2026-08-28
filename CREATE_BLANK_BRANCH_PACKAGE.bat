@echo off
setlocal EnableExtensions
title Create Blank Melann Branch Package
cd /d "%~dp0"

set "NODE_EXE=%~dp0.runtime\node\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node.exe"

echo Creating a verified package without database records, uploads, or secrets...
"%NODE_EXE%" "%~dp0scripts\createBlankBranchPackage.js"
if errorlevel 1 (
  echo.
  echo PACKAGE CREATION FAILED.
  pause
  exit /b 1
)

echo.
echo Package creation completed. Check the release-packages folder.
pause
