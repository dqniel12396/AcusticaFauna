Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Python311Url = "https://www.python.org/downloads/windows/"

Write-Host "Instalacion Windows detectada."
Write-Host "Este script esta pensado para PowerShell."
Write-Host "No necesitas Git Bash ni SSH."
Write-Host "Para clonar se recomienda HTTPS."
Write-Host ""

function Get-AcusticaFaunaPython {
  $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    $py311 = & py -3.11 --version 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Usando Python 3.11.x via py -3.11: $py311"
      return @{ Command = "py"; Args = @("-3.11") }
    }
  }

  Write-Warning "No se encontro Python 3.11.x."
  Write-Host "Instala Python 3.11.x desde:"
  Write-Host $Python311Url
  Write-Host "Busca una version 3.11.x y descarga Windows installer (64-bit)."

  $python = Get-Command python -ErrorAction SilentlyContinue
  if (!$python) {
    throw "No se encontro Python 3.11.x. Instala Python 3.11.x desde: $Python311Url Busca una version 3.11.x y descarga Windows installer (64-bit)."
  }

  $versionText = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo ejecutar Python. Instala Python 3.11.x desde: $Python311Url Busca una version 3.11.x y descarga Windows installer (64-bit)."
  }

  $parts = $versionText.Split(".")
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 13)) {
    Write-Warning "Python 3.13 no es recomendado para ML. Instala Python 3.11.x."
    Write-Host "Descarga recomendada: $Python311Url"
    if ($env:ACUSTICAFAUNA_ALLOW_PYTHON_313 -ne "1") {
      $answer = Read-Host "Deseas continuar de todas formas? [y/N]"
      if ($answer -notin @("y", "Y", "yes", "YES")) {
        throw "Instalacion cancelada. Instala Python 3.11.x o define ACUSTICAFAUNA_ALLOW_PYTHON_313=1."
      }
    }
  } elseif (!($major -eq 3 -and $minor -eq 11)) {
    Write-Warning "No se encontro Python 3.11.x via py -3.11."
    Write-Host "Python actual en PATH: $versionText"
    Write-Host "Instala Python 3.11.x desde:"
    Write-Host $Python311Url
    Write-Host "Busca una version 3.11.x y descarga Windows installer (64-bit)."
  }

  Write-Host "Usando Python: $versionText"
  return @{ Command = "python"; Args = @() }
}

function Invoke-SelectedPython {
  param(
    [Parameter(Mandatory = $true)] [hashtable] $PythonSpec,
    [Parameter(ValueFromRemainingArguments = $true)] [string[]] $PythonArgs
  )

  & $PythonSpec["Command"] @($PythonSpec["Args"]) @PythonArgs
}

function Get-NpmCmd {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (!$npm) {
    throw "Node.js/npm no esta instalado o no esta en PATH. Instala Node.js LTS y abre una nueva terminal."
  }
  return $npm.Source
}

Set-Location $Root

$PythonSpec = Get-AcusticaFaunaPython
$NpmCmd = Get-NpmCmd

if (!(Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
}

Invoke-SelectedPython $PythonSpec scripts/create_local_dirs.py

$Backend = Join-Path $Root "acusticafauna-General/acusticafauna-Back/backend"
$Ml = Join-Path $Root "acusticafauna-ML"
$Frontend = Join-Path $Root "acusticafauna-General/acusticafauna-frontend"
$BackendVenv = Join-Path $Backend ".venv-backend"
$MlVenv = Join-Path $Ml ".venv-ml"

if (!(Test-Path $BackendVenv)) {
  Invoke-SelectedPython $PythonSpec -m venv $BackendVenv
}
& "$BackendVenv/Scripts/python.exe" -m pip install -U pip
& "$BackendVenv/Scripts/python.exe" -m pip install -r "$Backend/requirements.txt"

if (!(Test-Path $MlVenv)) {
  Invoke-SelectedPython $PythonSpec -m venv $MlVenv
}
& "$MlVenv/Scripts/python.exe" -m pip install -U pip
& "$MlVenv/Scripts/python.exe" -m pip install -r "$Ml/requirements-ml.txt"

Push-Location $Frontend
& $NpmCmd install
& $NpmCmd run build
Pop-Location

Invoke-SelectedPython $PythonSpec scripts/check_environment.py
