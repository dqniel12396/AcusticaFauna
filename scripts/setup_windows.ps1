Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root
if (!(Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
}

python scripts/create_local_dirs.py

$Backend = Join-Path $Root "acusticafauna-General/acusticafauna-Back/backend"
$Ml = Join-Path $Root "acusticafauna-ML"
$Frontend = Join-Path $Root "acusticafauna-General/acusticafauna-frontend"
$BackendVenv = Join-Path $Backend ".venv-backend"

if (!(Test-Path $BackendVenv)) {
  python -m venv $BackendVenv
}
& "$BackendVenv/Scripts/python.exe" -m pip install -U pip
& "$BackendVenv/Scripts/python.exe" -m pip install -r "$Backend/requirements.txt"

if (!(Test-Path "$Ml/.venv-ml")) {
  python -m venv "$Ml/.venv-ml"
}
& "$Ml/.venv-ml/Scripts/python.exe" -m pip install -U pip
& "$Ml/.venv-ml/Scripts/python.exe" -m pip install -r "$Ml/requirements-ml.txt"

Push-Location $Frontend
npm install
Pop-Location

python scripts/check_environment.py
