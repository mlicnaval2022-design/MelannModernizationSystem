param(
    [ValidateSet("status", "stop")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"
$Port = 5001
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExpectedNode = [IO.Path]::GetFullPath((Join-Path $ProjectDir ".runtime\node\node.exe"))

function Get-ServerListener {
    $listener = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) |
        Select-Object -First 1
    if ($listener) {
        return $listener
    }

    # Get-NetTCPConnection can return no rows under some Windows permission
    # policies. netstat remains available to standard desktop users.
    $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
    foreach ($line in (& netstat.exe -ano -p TCP)) {
        if ($line -match $pattern) {
            return [pscustomobject]@{ OwningProcess = [int]$Matches[1] }
        }
    }

    return $null
}

function Test-MelannHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "https://127.0.0.1:$Port/api/health" -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-ListenerDetails {
    $listener = Get-ServerListener
    if (-not $listener) {
        return $null
    }

    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $processPath = $null
    if ($process) {
        try { $processPath = $process.Path } catch { $processPath = $null }
    }

    [pscustomobject]@{
        Listener = $listener
        Process = $process
        ProcessId = [int]$listener.OwningProcess
        ProcessPath = $processPath
        IsExpectedNode = $processPath -and
            ([IO.Path]::GetFullPath($processPath) -ieq $ExpectedNode)
        IsHealthy = Test-MelannHealth
    }
}

$details = Get-ListenerDetails

if ($Action -eq "status") {
    if (-not $details) {
        Write-Host "SERVER STATUS: STOPPED" -ForegroundColor Red
        Write-Host "Nothing is listening on port $Port."
        exit 3
    }

    if (-not $details.IsExpectedNode -or -not $details.IsHealthy) {
        Write-Host "SERVER STATUS: PORT $Port IS IN USE BY AN UNKNOWN PROGRAM" -ForegroundColor Yellow
        Write-Host "Process ID: $($details.ProcessId)"
        if ($details.ProcessPath) { Write-Host "Program: $($details.ProcessPath)" }
        exit 4
    }

    Write-Host "SERVER STATUS: RUNNING" -ForegroundColor Green
    Write-Host "Process ID: $($details.ProcessId)"
    Write-Host "Address: https://localhost:$Port"
    exit 0
}

if (-not $details) {
    Write-Host "The Melann server is already stopped."
    exit 0
}

if (-not $details.IsExpectedNode -or -not $details.IsHealthy) {
    Write-Host "STOP CANCELLED: Port $Port belongs to an unknown program." -ForegroundColor Red
    Write-Host "Process ID: $($details.ProcessId)"
    if ($details.ProcessPath) { Write-Host "Program: $($details.ProcessPath)" }
    Write-Host "No process was closed."
    exit 4
}

Write-Host "Stopping Melann server process $($details.ProcessId)..." -ForegroundColor Yellow
Stop-Process -Id $details.ProcessId

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-ServerListener)) {
        Write-Host "The Melann server has stopped." -ForegroundColor Green
        exit 0
    }
}

Write-Host "The server did not release port $Port within 10 seconds." -ForegroundColor Red
exit 5
