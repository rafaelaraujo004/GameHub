$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$releaseDir = Join-Path $scriptDir 'release'

Push-Location $repoRoot
try {
  Write-Host '[GameHub] Gerando launcher standalone...'
  npm run launcher:build-exe
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao gerar launcher standalone.'
  }

  $pkgPath = Join-Path $repoRoot 'package.json'
  $pkg = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
  $version = [string]$pkg.version
  if ([string]::IsNullOrWhiteSpace($version)) {
    $version = '0.0.0'
  }

  $commit = (git rev-parse --short HEAD 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($commit)) {
    $commit = 'local'
  }

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmm'
  $zipName = "GameHubLauncher-v$version-$commit-$timestamp.zip"
  $zipPath = Join-Path $releaseDir $zipName

  if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
  }

  $filesToPack = @(
    (Join-Path $releaseDir 'GameHubLauncher.exe'),
    (Join-Path $releaseDir 'config.json'),
    (Join-Path $releaseDir 'README-rapido.txt')
  )

  foreach ($file in $filesToPack) {
    if (-not (Test-Path $file)) {
      throw "Arquivo obrigatorio ausente para empacotamento: $file"
    }
  }

  Compress-Archive -Path $filesToPack -DestinationPath $zipPath -Force

  Write-Host ''
  Write-Host '[GameHub] Pacote pronto para distribuicao:'
  Write-Host $zipPath
}
finally {
  Pop-Location
}
