$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FrontendUrl = "http://localhost:5173"

function Start-ServiceScript {
  param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $ScriptPath
  )

  $process = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", $ScriptPath
  )
  Write-Host "$Name iniciando..."
  return $process
}

function Test-HttpReady {
  param([Parameter(Mandatory = $true)] [string] $Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

$BackendProcess = Start-ServiceScript "Backend" (Join-Path $Root "scripts/start_backend.ps1")
$MlProcess = Start-ServiceScript "ML API" (Join-Path $Root "scripts/start_ml_api.ps1")
$FrontendProcess = Start-ServiceScript "Frontend" (Join-Path $Root "scripts/start_frontend.ps1")

$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  if ($FrontendProcess.HasExited) {
    Write-Error "El frontend fallo al iniciar. Ejecuta .\scripts\start_frontend.ps1 en una terminal para ver el error."
    exit 1
  }

  if (Test-HttpReady $FrontendUrl) {
    Write-Host "Servicios iniciados: backend 8000, ML API 8010, frontend 5173."
    Write-Host "Abre $FrontendUrl"
    exit 0
  }

  Start-Sleep -Seconds 2
}

Write-Error "El frontend no respondio en $FrontendUrl. Ejecuta .\scripts\start_frontend.ps1 para revisar el error."
exit 1
