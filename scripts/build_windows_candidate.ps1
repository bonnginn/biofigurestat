param(
    [Parameter(Mandatory = $true)][string]$ApprovedEngineDirectory,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [switch]$PublicDistribution
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$engineSource = (Resolve-Path -LiteralPath $ApprovedEngineDirectory).Path
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if ($outputRoot.Length -gt 100) { throw 'Choose a short output directory to avoid NSIS Windows path limits.' }
$candidateExecutable = Join-Path $outputRoot 'release/lifescience-analysis-app.exe'
$activeCandidate = Get-Process -Name 'lifescience-analysis-app' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $candidateExecutable }
if ($activeCandidate) { throw 'Close the running candidate before packaging; NSIS cannot read a locked executable.' }
$engineExecutable = Join-Path $engineSource 'lsaa-engine.exe'
if (-not (Test-Path -LiteralPath $engineExecutable)) { throw 'Approved frozen engine is missing.' }
$identity = '{}' | & $engineExecutable | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $identity.engine.version -ne '0.15.2') { throw 'This candidate requires the reviewed 0.15.2 engine.' }
$inventory = Get-Content -LiteralPath (Join-Path $repositoryRoot 'evidence/product10-scientific-gate-0152/release-license-inventory.json') -Raw | ConvertFrom-Json
if ($inventory.missing.Count -ne 0) { throw 'Dependency notices are incomplete.' }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$engineStage = Join-Path $outputRoot 'engine'
if ([IO.Path]::GetFullPath($engineStage) -ne $engineSource) {
    New-Item -ItemType Directory -Path $engineStage -Force | Out-Null
    Get-ChildItem -LiteralPath $engineSource | Copy-Item -Destination $engineStage -Recurse -Force
}
$resources = @{}
$resources[$engineStage.Replace('\', '/') + '/'] = 'engine/'
foreach ($notice in @('LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt')) {
    $source = Join-Path $repositoryRoot $notice
    if (-not (Test-Path -LiteralPath $source)) { throw "Missing distribution notice: $notice" }
    $resources[$source.Replace('\', '/')] = $notice
}
$configuration = @{ build = @{ beforeBuildCommand = $null }; bundle = @{ targets = @('nsis'); resources = $resources } }
if ($PublicDistribution) {
    if ($env:VITE_USAGE_TELEMETRY_ENDPOINT -ne 'https://biofigurestat-telemetry.biofigurestat.workers.dev/v1/usage' -or
        $env:VITE_PROBLEM_REPORT_ENDPOINT -ne 'https://biofigurestat-telemetry.biofigurestat.workers.dev/v1/problem-reports') {
        throw 'Restore the existing approved public release endpoints before public-distribution packaging.'
    }
    & node (Join-Path $PSScriptRoot 'prepare_telemetry_release_config.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Existing public reporting configuration did not pass release preflight.' }
    $telemetryOverlay = Get-Content -LiteralPath (Join-Path $repositoryRoot '.tmp/telemetry-release-config.json') -Raw | ConvertFrom-Json
    $configuration['app'] = $telemetryOverlay.app
}
$configPath = Join-Path $outputRoot 'candidate-build.json'
$configuration | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath -Encoding utf8
Push-Location $repositoryRoot
try {
    & pnpm --filter '@lsaa/ui' build
    if ($LASTEXITCODE -ne 0) { throw 'UI production build failed.' }
    & engine/python/.venv/Scripts/python.exe scripts/verify_release_bundle.py
    if ($LASTEXITCODE -ne 0) { throw 'Production boundary scan failed.' }
    $previousTarget = $env:CARGO_TARGET_DIR
    $env:CARGO_TARGET_DIR = $outputRoot
    try {
        & pnpm --filter '@lsaa/desktop' exec tauri build --config $configPath --bundles nsis
        if ($LASTEXITCODE -ne 0) { throw 'Native candidate packaging failed.' }
    } finally { $env:CARGO_TARGET_DIR = $previousTarget }
} finally { Pop-Location }
# This creates a local candidate. It neither installs nor publishes the application.
