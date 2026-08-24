@echo off
setlocal EnableExtensions
title Melann Lending System - STATIC CLIENT

set "MLS_SERVER_NAME=192.168.254.192"
set "MLS_SERVER_IP=192.168.254.192"
set "MLS_SERVER_PORT=5001"

call "%~dp0MLS_Client.bat"
exit /b %ERRORLEVEL%
