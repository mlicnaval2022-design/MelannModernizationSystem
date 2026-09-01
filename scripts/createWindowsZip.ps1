param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPath
)

$ErrorActionPreference = 'Stop'
$resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
$resolvedDestination = [IO.Path]::GetFullPath($DestinationPath)

if (-not (Test-Path -LiteralPath $resolvedSource -PathType Container)) {
    throw "ZIP source folder does not exist: $resolvedSource"
}

if (Test-Path -LiteralPath $resolvedDestination) {
    Remove-Item -LiteralPath $resolvedDestination -Force
}

Compress-Archive -Path (Join-Path $resolvedSource '*') -DestinationPath $resolvedDestination -CompressionLevel Optimal -Force

# Validate with the same Windows extraction library used by Explorer.
$verificationPath = Join-Path ([IO.Path]::GetDirectoryName($resolvedDestination)) ('.zip-verify-' + [guid]::NewGuid().ToString('N'))
try {
    Expand-Archive -LiteralPath $resolvedDestination -DestinationPath $verificationPath -Force
    if (-not (Get-ChildItem -LiteralPath $verificationPath -Force | Select-Object -First 1)) {
        throw 'ZIP verification extracted no files.'
    }
} finally {
    if (Test-Path -LiteralPath $verificationPath) {
        Remove-Item -LiteralPath $verificationPath -Recurse -Force
    }
}
