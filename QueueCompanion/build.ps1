param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build command failed ($LASTEXITCODE)." } }
Push-Location extension
try {
    npm ci
    Check-Exit
    if (!$SkipTests) { npm test; Check-Exit }
    npm run build
    Check-Exit
} finally { Pop-Location }
if (!$SkipTests) { dotnet run --project tests/helper/HelperTests.csproj -c Release; Check-Exit }
dotnet restore helper/QueueCompanion.csproj --locked-mode
Check-Exit
dotnet publish helper/QueueCompanion.csproj -c Release -o release/helper --no-restore
Check-Exit
Add-Type -AssemblyName System.IO.Compression
$vendorHashes = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'vendor/SHA256SUMS.json') -Raw | ConvertFrom-Json
foreach ($property in $vendorHashes.PSObject.Properties) {
    $vendorFile = Join-Path (Join-Path $PSScriptRoot 'vendor') $property.Name
    if ((Get-FileHash -LiteralPath $vendorFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $property.Value) { throw "Vendor checksum mismatch: $($property.Name)" }
}
$payloadPath = Join-Path $PSScriptRoot 'installer/payload.zip'
$fileStream = [IO.File]::Open($payloadPath,[IO.FileMode]::Create)
$zipArchive = [IO.Compression.ZipArchive]::new($fileStream,[IO.Compression.ZipArchiveMode]::Create)
function Add-PayloadFile([string]$source,[string]$entry) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive,$source,$entry,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
try {
    Add-PayloadFile (Join-Path $PSScriptRoot 'release/helper/QueueCompanion.exe') 'QueueCompanion.exe'
    Add-PayloadFile (Join-Path $PSScriptRoot 'extension/dist/queue-companion.js') 'extension/queue-companion.js'
    Add-PayloadFile (Join-Path $PSScriptRoot 'extension/module-index.js') 'extension/index.js'
    Add-PayloadFile (Join-Path $PSScriptRoot 'extension/metadata.json') 'extension/metadata.json'
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'vendor') -Recurse -File) {
        if ($file.Name -in @('daemon-token','pairing.json','credentials.dat','queue-companion-pairing.js') -or $file.Extension -eq '.log') { throw 'Private data found in payload.' }
        $relative = [IO.Path]::GetRelativePath($PSScriptRoot,$file.FullName).Replace('\','/')
        Add-PayloadFile $file.FullName $relative
    }
    Add-PayloadFile (Join-Path $PSScriptRoot 'LICENSE') 'LICENSE'
} finally { $zipArchive.Dispose(); $fileStream.Dispose() }
dotnet restore installer/QueueCompanion.Setup.csproj --locked-mode
Check-Exit
dotnet publish installer/QueueCompanion.Setup.csproj -c Release -o release/setup --no-restore
Check-Exit
Write-Host 'Built release/setup/QueueCompanion.Setup.exe with bundled Windows x64 runtimes.'
