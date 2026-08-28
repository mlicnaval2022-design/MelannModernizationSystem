$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallerDir = Join-Path $ProjectDir "MLS_CLIENT_INSTALLER_WITH_ICON"
$InstallerZip = Join-Path $ProjectDir "MLS_CLIENT_INSTALLER_WITH_ICON.zip"
$StandaloneClient = Join-Path $ProjectDir "MLS_Client_Standalone.bat"
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

$certificateBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $ProjectDir "MLS_SERVER_CERT.cer")))
$launcherSource = Join-Path $ProjectDir "MLS_Client.bat"
$standaloneContents = (Get-Content -LiteralPath $launcherSource -Raw) -replace '(?m)^set "MLS_CERT_EMBEDDED="$', "set `"MLS_CERT_EMBEDDED=$certificateBase64`""
[IO.File]::WriteAllText($StandaloneClient, $standaloneContents, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath $StandaloneClient -Destination (Join-Path $InstallerDir "MLS_Client_Standalone.bat") -Force

if (Test-Path -LiteralPath $InstallerZip) {
    Remove-Item -LiteralPath $InstallerZip -Force
}
Compress-Archive -Path (Join-Path $InstallerDir "*") -DestinationPath $InstallerZip -CompressionLevel Optimal -Force
Write-Host "Secure client installer created: $InstallerZip" -ForegroundColor Green
Write-Host "Single-file client created: $StandaloneClient" -ForegroundColor Green
