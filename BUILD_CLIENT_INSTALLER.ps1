$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallerDir = Join-Path $ProjectDir "MLS_CLIENT_INSTALLER_WITH_ICON"
$InstallerZip = Join-Path $ProjectDir "MLS_CLIENT_INSTALLER_WITH_ICON.zip"
$RequiredFiles = @(
    "INSTALL_MLS_CLIENT_WITH_ICON.bat",
    "MLS_Client.bat",
    "mls_icon.ico",
    "MLS_SERVER_CERT.cer"
)

New-Item -ItemType Directory -Path $InstallerDir -Force | Out-Null
foreach ($file in $RequiredFiles) {
    $source = Join-Path $ProjectDir $file
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Client installer source is missing: $source"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $InstallerDir $file) -Force
}

if (Test-Path -LiteralPath $InstallerZip) {
    Remove-Item -LiteralPath $InstallerZip -Force
}
& tar.exe -a -c -f $InstallerZip -C $InstallerDir .
if ($LASTEXITCODE -ne 0) {
    throw "Windows could not create the secure client installer ZIP."
}
Write-Host "Secure client installer created: $InstallerZip" -ForegroundColor Green
