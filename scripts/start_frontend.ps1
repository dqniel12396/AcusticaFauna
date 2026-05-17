$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root "acusticafauna-General/acusticafauna-frontend"
Set-Location $Frontend
npm run dev -- --host 127.0.0.1 --port 5173
