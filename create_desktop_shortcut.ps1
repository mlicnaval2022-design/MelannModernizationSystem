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
$DesktopPath = [Environment]::GetFolderPath("Desktop")

# Verify icon exists
if (-Not (Test-Path $IconPath)) {
    Write-Host "ERROR: mls_icon.ico not found at: $IconPath" -ForegroundColor Red
    Write-Host "Please make sure mls_icon.ico is in the same folder as this script." -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    exit 1
}

function Create-Shortcut($ShortcutName, $TargetPath, $IconLocation, $Description, $WorkingDir) {
    $ShortcutPath = Join-Path $DesktopPath "$ShortcutName.lnk"
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $TargetPath
    $Shortcut.IconLocation = $IconLocation
    $Shortcut.Description = $Description
    $Shortcut.WorkingDirectory = $WorkingDir
    $Shortcut.Save()
    Write-Host "  Created: $ShortcutPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "  MLS - Desktop Shortcut Creator" -ForegroundColor Cyan
Write-Host "  Modernization of Melann Lending System" -ForegroundColor Cyan
Write-Host ""

# --- SERVER SHORTCUT (start-lan.bat with icon) ---
if ($Mode -eq "server" -or $Mode -eq "both") {
    Write-Host "  [SERVER] Creating server shortcut..." -ForegroundColor Yellow
    $StartLanBat = Join-Path $ProjectDir "start-lan.bat"
    if (Test-Path $StartLanBat) {
        Create-Shortcut "MLS Server" $StartLanBat "$IconPath,0" "Start Melann Lending System Server (LAN)" $ProjectDir
    } else {
        Write-Host "  start-lan.bat not found!" -ForegroundColor Red
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
