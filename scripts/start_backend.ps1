$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "acusticafauna-General/acusticafauna-Back/backend"
Set-Location $Backend
$Python = if (Test-Path ".venv/Scripts/python.exe") { ".venv/Scripts/python.exe" } else { "python" }
$HostValue = if ($env:ACUSTICAFAUNA_BACKEND_HOST) { $env:ACUSTICAFAUNA_BACKEND_HOST } else { "127.0.0.1" }
$PortValue = if ($env:ACUSTICAFAUNA_BACKEND_PORT) { $env:ACUSTICAFAUNA_BACKEND_PORT } else { "8000" }
& $Python -m uvicorn app.main:app --host $HostValue --port $PortValue --reload
