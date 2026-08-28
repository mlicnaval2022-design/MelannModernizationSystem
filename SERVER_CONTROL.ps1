param(
    [ValidateSet("status", "stop")]
    [string]$Action = "status",
    [switch]$ElevatedRetry
)

$ErrorActionPreference = "Stop"
$Port = 5001
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExpectedNode = [IO.Path]::GetFullPath((Join-Path $ProjectDir ".runtime\node\node.exe"))
$HealthCheckScript = [IO.Path]::GetFullPath((Join-Path $ProjectDir "server\scripts\checkServerHealth.js"))

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
    if (-not (Test-Path -LiteralPath $ExpectedNode) -or
        -not (Test-Path -LiteralPath $HealthCheckScript)) {
        return $false
    }

    & $ExpectedNode $HealthCheckScript 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}

function Get-ListenerDetails {
    $listener = Get-ServerListener
    if (-not $listener) {
        return $null
    }

    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $processPath = $null
    $commandLine = $null
    if ($process) {
        try { $processPath = $process.Path } catch { $processPath = $null }
        try {
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
            $commandLine = $processInfo.CommandLine
        } catch {
            $commandLine = $null
        }
    }

    $isExpectedNode = $processPath -and
        ([IO.Path]::GetFullPath($processPath) -ieq $ExpectedNode)
    $isExpectedCommand = $commandLine -and
        ($commandLine -match '(?i)(^|[\\/\s"''])src[\\/]index\.js([\s"'']|$)')

    [pscustomobject]@{
        Listener = $listener
        Process = $process
        ProcessId = [int]$listener.OwningProcess
        ProcessPath = $processPath
        CommandLine = $commandLine
        IsExpectedNode = $isExpectedNode
        IsExpectedCommand = $isExpectedCommand
        # Some Windows policies hide another process's command line from a
        # standard user. The bundled Node executable is private to this MLS
        # installation, so its exact resolved path is still a safe identity.
        IsMelannServer = $isExpectedNode -and ($isExpectedCommand -or -not $commandLine)
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

    if (-not $details.IsMelannServer) {
        Write-Host "SERVER STATUS: PORT $Port IS IN USE BY AN UNKNOWN PROGRAM" -ForegroundColor Yellow
        Write-Host "Process ID: $($details.ProcessId)"
        if ($details.ProcessPath) { Write-Host "Program: $($details.ProcessPath)" }
        exit 4
    }

    if (-not $details.IsHealthy) {
        Write-Host "SERVER STATUS: MELANN SERVER IS RUNNING BUT NOT HEALTHY" -ForegroundColor Yellow
        Write-Host "Process ID: $($details.ProcessId)"
        Write-Host "The process can be safely closed with STOP_SERVER.bat."
        exit 5
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

if (-not $details.IsMelannServer) {
    Write-Host "STOP CANCELLED: Port $Port belongs to an unknown program." -ForegroundColor Red
    Write-Host "Process ID: $($details.ProcessId)"
    if ($details.ProcessPath) { Write-Host "Program: $($details.ProcessPath)" }
    Write-Host "No process was closed."
    exit 4
}

if (-not $details.IsHealthy) {
    Write-Host "The Melann server is not responding to its health check." -ForegroundColor Yellow
    Write-Host "It was positively identified by its executable and startup command."
}

Write-Host "Stopping Melann server process $($details.ProcessId)..." -ForegroundColor Yellow
try {
    Stop-Process -Id $details.ProcessId -ErrorAction Stop
} catch {
    $accessDenied = $_.Exception.Message -match '(?i)access is denied|cannot stop process'
    if ($accessDenied -and -not $ElevatedRetry) {
        Write-Host "Windows administrator approval is required to close this server." -ForegroundColor Yellow
        Write-Host "Please select Yes in the security prompt."
        $argumentLine = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" stop -ElevatedRetry"
        try {
            $elevated = Start-Process -FilePath "powershell.exe" -Verb RunAs `
                -ArgumentList $argumentLine -Wait -PassThru -ErrorAction Stop
            exit $elevated.ExitCode
        } catch {
            Write-Host "The administrator request was cancelled or could not be opened." -ForegroundColor Red
            exit 6
        }
    }

    Write-Host "The Melann server could not be stopped: $($_.Exception.Message)" -ForegroundColor Red
    exit 6
}

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-ServerListener)) {
        Write-Host "The Melann server has stopped." -ForegroundColor Green
        exit 0
    }
}

Write-Host "The server did not release port $Port within 10 seconds." -ForegroundColor Red
exit 5
