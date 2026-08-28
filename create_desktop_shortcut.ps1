# ============================================================
# MLS Desktop Shortcut Creator
# Creates desktop shortcuts with MLS icon for:
# 1. Server PC (starts the full system)
# 2. Client PC (opens browser to server IP)
# ============================================================

param(
    [ValidateSet("server", "client", "both")]
    [string]$Mode = "both"
)

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$IconPath = Join-Path $ProjectDir "mls_icon.ico"
$ShortcutShell = New-Object -ComObject WScript.Shell
$DesktopPath = $ShortcutShell.SpecialFolders.Item("Desktop")
if ([string]::IsNullOrWhiteSpace($DesktopPath)) {
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
}

# Verify icon exists
if (-Not (Test-Path $IconPath)) {
    Write-Host "ERROR: mls_icon.ico not found at: $IconPath" -ForegroundColor Red
    Write-Host "Please make sure mls_icon.ico is in the same folder as this script." -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    exit 1
}

function Create-Shortcut($ShortcutName, $TargetPath, $IconLocation, $Description, $WorkingDir, $Arguments = "") {
    $ShortcutPath = Join-Path $DesktopPath "$ShortcutName.lnk"
    $Shortcut = $ShortcutShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $TargetPath
    $Shortcut.IconLocation = $IconLocation
    $Shortcut.Description = $Description
    $Shortcut.WorkingDirectory = $WorkingDir
    $Shortcut.Arguments = $Arguments
    $Shortcut.WindowStyle = 1
    $Shortcut.Save()
    Write-Host "  Created: $ShortcutPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "  MLS - Desktop Shortcut Creator" -ForegroundColor Cyan
Write-Host "  Modernization of Melann Lending System" -ForegroundColor Cyan
Write-Host ""

# --- SERVER SHORTCUT (persistent visible console with icon) ---
if ($Mode -eq "server" -or $Mode -eq "both") {
    Write-Host "  [SERVER] Creating server shortcut..." -ForegroundColor Yellow
    $VisibleServerLauncher = Join-Path $ProjectDir "MLS_SERVER_VISIBLE.cmd"
    if (Test-Path $VisibleServerLauncher) {
        $CommandPrompt = Join-Path $env:SystemRoot "System32\cmd.exe"
        $ServerArguments = "/d /k call `"$VisibleServerLauncher`" console"
        Create-Shortcut "MLS Server" $CommandPrompt "$IconPath,0" "Start Melann Lending System Server in a visible console" $ProjectDir $ServerArguments
    } else {
        Write-Host "  MLS_SERVER_VISIBLE.cmd not found!" -ForegroundColor Red
    }

    $RestartServer = Join-Path $ProjectDir "RESTART_SERVER.bat"
    if (Test-Path $RestartServer) {
        $RestartArguments = "/d /k call `"$RestartServer`""
        Create-Shortcut "MLS Server - RESTART" $CommandPrompt "$IconPath,0" "Stop and restart the Melann server in a visible console" $ProjectDir $RestartArguments
    }

    $StopServer = Join-Path $ProjectDir "STOP_SERVER.bat"
    if (Test-Path $StopServer) {
        $StopArguments = "/d /k call `"$StopServer`""
        Create-Shortcut "MLS Server - STOP" $CommandPrompt "$IconPath,0" "Safely stop the Melann Lending System server" $ProjectDir $StopArguments
    }

    $ServerStatus = Join-Path $ProjectDir "SERVER_STATUS.bat"
    if (Test-Path $ServerStatus) {
        $StatusArguments = "/d /k call `"$ServerStatus`""
        Create-Shortcut "MLS Server - STATUS" $CommandPrompt "$IconPath,0" "Check whether the Melann server is running" $ProjectDir $StatusArguments
    }
}

# --- CLIENT SHORTCUT (opens browser to server IP) ---
if ($Mode -eq "client" -or $Mode -eq "both") {
    Write-Host "  [CLIENT] Creating client shortcut..." -ForegroundColor Yellow
    $ClientBat = Join-Path $ProjectDir "MLS_Client.bat"
    if (Test-Path $ClientBat) {
        Create-Shortcut "MLS - Melann Lending System" $ClientBat "$IconPath,0" "Open Melann Lending System (Client)" $ProjectDir
    } else {
        Write-Host "  MLS_Client.bat not found!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "  Done! Check your Desktop for the MLS shortcut(s)." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit..."
