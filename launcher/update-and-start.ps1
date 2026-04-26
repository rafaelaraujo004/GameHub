$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Push-Location $repoRoot
try {
  Write-Host '[GameHub] Atualizando codigo (git pull --ff-only)...'
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao atualizar repositorio com git pull.'
  }

  Write-Host '[GameHub] Instalando dependencias caso necessario (npm install)...'
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao instalar dependencias.'
  }

  Write-Host '[GameHub] Iniciando launcher seguro...'
  npm run launcher:start
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao iniciar launcher.'
  }
}
finally {
  Pop-Location
}
