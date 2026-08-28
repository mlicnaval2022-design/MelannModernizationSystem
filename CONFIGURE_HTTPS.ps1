param(
    [switch]$RotateCertificate
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path $ProjectDir "server"
$EnvPath = Join-Path $ServerDir ".env"
$CertDir = Join-Path $ServerDir "certs"
$PfxPath = Join-Path $CertDir "melann-server.pfx"
$PublicCertPath = Join-Path $ProjectDir "MLS_SERVER_CERT.cer"
$CredentialPath = Join-Path $ProjectDir "INITIAL_ADMIN_CREDENTIALS.txt"

function New-RandomSecret([int]$ByteCount = 48) {
    $bytes = New-Object byte[] $ByteCount
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=')
}

function Get-ServerIPv4 {
    $candidate = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.AddressState -eq 'Preferred'
        } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1 -ExpandProperty IPAddress
    if ($candidate) { return $candidate }
    return "127.0.0.1"
}

function Read-EnvLines {
    $result = [Collections.Generic.List[string]]::new()
    if (Test-Path $EnvPath) {
        foreach ($line in (Get-Content -LiteralPath $EnvPath)) {
            $result.Add($line)
        }
    }
    return ,$result
}

function Get-EnvValue($Lines, [string]$Name) {
    foreach ($line in $Lines) {
        if ($line -match ('^' + [regex]::Escape($Name) + '=(.*)$')) {
            return $Matches[1]
        }
    }
    return $null
}

function Set-EnvValue($Lines, [string]$Name, [string]$Value) {
    for ($index = 0; $index -lt $Lines.Count; $index++) {
        if ($Lines[$index] -match ('^' + [regex]::Escape($Name) + '=')) {
            $Lines[$index] = "$Name=$Value"
            return
        }
    }
    $Lines.Add("$Name=$Value")
}

$serverIp = Get-ServerIPv4
$serverName = $env:COMPUTERNAME
$lines = Read-EnvLines
$isNewEnvironment = $lines.Count -eq 0

if ($isNewEnvironment) {
    $jwtSecret = New-RandomSecret 48
    $adminPassword = (New-RandomSecret 18) + "Aa1!"
    Set-EnvValue $lines "NODE_ENV" "production"
    Set-EnvValue $lines "PORT" "5001"
    Set-EnvValue $lines "HOST" "0.0.0.0"
    Set-EnvValue $lines "DB_PATH" "./melann.db"
    Set-EnvValue $lines "UPLOADS_PATH" "../uploads"
    Set-EnvValue $lines "JWT_SECRET" $jwtSecret
    Set-EnvValue $lines "INITIAL_ADMIN_PASSWORD" $adminPassword

    $credentialLines = @(
        "Melann Lending System - Initial Branch Administrator",
        "",
        "Username: admin",
        "Temporary password: $adminPassword",
        "",
        "Sign in, change this password immediately, then securely delete this file."
    )
    [IO.File]::WriteAllLines($CredentialPath, $credentialLines, [Text.UTF8Encoding]::new($false))
}

New-Item -ItemType Directory -Path $CertDir -Force | Out-Null
$pfxPassphrase = Get-EnvValue $lines "TLS_PFX_PASSPHRASE"
$needsCertificate = $RotateCertificate -or -not (Test-Path $PfxPath) -or -not (Test-Path $PublicCertPath) -or [string]::IsNullOrWhiteSpace($pfxPassphrase)

if ($needsCertificate) {
    $pfxPassphrase = New-RandomSecret 32
    $rootInstance = [guid]::NewGuid().ToString('N').Substring(0, 8).ToUpperInvariant()
    $rootSubject = "CN=Melann Branch Root CA - $serverName - $rootInstance"
    $san = "2.5.29.17={text}DNS=$serverName&DNS=localhost&IPAddress=$serverIp&IPAddress=127.0.0.1"
    $eku = "2.5.29.37={text}1.3.6.1.5.5.7.3.1"
    $rootCertificate = New-SelfSignedCertificate `
        -Type Custom `
        -Subject $rootSubject `
        -TextExtension @("2.5.29.19={critical}{text}ca=true&pathlength=1") `
        -KeyUsage CertSign, CRLSign, DigitalSignature `
        -KeyAlgorithm RSA `
        -KeyLength 3072 `
        -HashAlgorithm SHA256 `
        -KeyExportPolicy Exportable `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(10)

    $certificate = New-SelfSignedCertificate `
        -Type Custom `
        -Subject "CN=$serverName" `
        -Signer $rootCertificate `
        -TextExtension @($san, $eku, "2.5.29.19={critical}{text}ca=false") `
        -KeyUsage DigitalSignature, KeyEncipherment `
        -KeyAlgorithm RSA `
        -KeyLength 3072 `
        -HashAlgorithm SHA256 `
        -KeyExportPolicy Exportable `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(3)

    $securePassphrase = ConvertTo-SecureString -String $pfxPassphrase -AsPlainText -Force
    Export-Certificate -Cert $rootCertificate -FilePath $PublicCertPath -Force | Out-Null
    # Clients receive the public root separately, so the server PFX needs only
    # the signed leaf certificate and its private key.
    Export-PfxCertificate -Cert $certificate -FilePath $PfxPath -Password $securePassphrase -ChainOption EndEntityCertOnly -Force | Out-Null
}

$origins = "https://localhost:5001,https://127.0.0.1:5001,https://$serverName`:5001,https://$serverIp`:5001"
Set-EnvValue $lines "NODE_ENV" "production"
Set-EnvValue $lines "HOST" "0.0.0.0"
Set-EnvValue $lines "CORS_ORIGINS" $origins
Set-EnvValue $lines "ENFORCE_HTTPS" "true"
Set-EnvValue $lines "TRUST_PROXY" "0"
Set-EnvValue $lines "TLS_PFX_PATH" "./certs/melann-server.pfx"
Set-EnvValue $lines "TLS_PFX_PASSPHRASE" $pfxPassphrase

[IO.File]::WriteAllLines($EnvPath, $lines, [Text.UTF8Encoding]::new($false))

# Keep the distributed client launcher aligned with the certificate SAN and
# the actual branch server identity.
$clientLauncherPath = Join-Path $ProjectDir "MLS_Client.bat"
if (Test-Path -LiteralPath $clientLauncherPath) {
    $clientLauncherLines = Get-Content -LiteralPath $clientLauncherPath | ForEach-Object {
        if ($_ -match '^if not defined MLS_SERVER_NAME set ') {
            "if not defined MLS_SERVER_NAME set `"MLS_SERVER_NAME=$serverName`""
        } elseif ($_ -match '^if not defined MLS_SERVER_IP set ') {
            "if not defined MLS_SERVER_IP set `"MLS_SERVER_IP=$serverIp`""
        } else {
            $_
        }
    }
    [IO.File]::WriteAllLines($clientLauncherPath, $clientLauncherLines, [Text.UTF8Encoding]::new($false))
}

# Trust only the public certificate. The exportable private key remains in the
# password-protected PFX file and is never copied to client PCs.
$publicForTrust = [Security.Cryptography.X509Certificates.X509Certificate2]::new($PublicCertPath)
$trustedCertificatePath = "Cert:\CurrentUser\Root\$($publicForTrust.Thumbprint)"
if (-not (Test-Path $trustedCertificatePath)) {
    & certutil.exe -user -f -addstore Root $PublicCertPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Windows could not trust the Melann HTTPS certificate for the current user."
    }
}

$loadedCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($PfxPath, $pfxPassphrase)
$loadedRootCertificate = $publicForTrust
Write-Host "HTTPS configuration completed." -ForegroundColor Green
Write-Host "Server name: $serverName"
Write-Host "Server IP:   $serverIp"
Write-Host "Certificate expires: $($loadedCertificate.NotAfter.ToString('yyyy-MM-dd'))"
Write-Host "Server certificate fingerprint: $($loadedCertificate.Thumbprint)"
Write-Host "Branch root fingerprint: $($loadedRootCertificate.Thumbprint)"
Write-Host "Client trust certificate: $PublicCertPath"

& (Join-Path $ProjectDir "BUILD_CLIENT_INSTALLER.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "The secure client installer could not be created."
}
