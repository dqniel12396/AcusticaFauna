$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root "acusticafauna-General/acusticafauna-frontend"
$NodeModules = Join-Path $Frontend "node_modules"
$Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (!$Npm) {
  Write-Error "Node.js/npm no esta instalado o no esta en PATH. Instala Node.js LTS y abre una nueva terminal."
  exit 1
}

if (!(Test-Path $NodeModules)) {
  Write-Error "Faltan dependencias frontend. Ejecuta .\scripts\setup_windows.ps1 primero."
  exit 1
}

Set-Location $Frontend
& $Npm.Source run dev -- --host 127.0.0.1 --port 5173
