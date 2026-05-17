$Root = Split-Path -Parent $PSScriptRoot
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-File","$Root/scripts/start_backend.ps1"
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-File","$Root/scripts/start_ml_api.ps1"
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-File","$Root/scripts/start_frontend.ps1"
Write-Host "Servicios iniciados: backend 8000, ML API 8010, frontend 5173."
