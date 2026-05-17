$Root = Split-Path -Parent $PSScriptRoot
$Ml = Join-Path $Root "acusticafauna-ML"
Set-Location $Ml
$Python = if (Test-Path ".venv-ml/Scripts/python.exe") { ".venv-ml/Scripts/python.exe" } else { "python" }
& $Python -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload
