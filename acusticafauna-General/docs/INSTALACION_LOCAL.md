# Instalacion local

## Requisitos

- Python 3.11 recomendado.
- Node.js y npm.
- Git Bash o PowerShell en Windows.
- Espacio local para modelos y audios propios.

## Preparacion

Desde la raiz del repo:

```powershell
Copy-Item .env.example .env
python scripts/create_local_dirs.py
```

Edita `.env` si tu dataset o modelos estan en otra carpeta.

## Instalacion PowerShell

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup_windows.ps1
```

## Instalacion Git Bash

```bash
bash scripts/setup_gitbash.sh
```

## Arranque de servicios

Backend:

```powershell
.\scripts\start_backend.ps1
```

ML API:

```powershell
.\scripts\start_ml_api.ps1
```

Frontend:

```powershell
.\scripts\start_frontend.ps1
```

Luego abre `http://localhost:5173`.

## Verificacion

```bash
python scripts/check_environment.py
```

Endpoints utiles:

- Backend: `http://127.0.0.1:8000/api/health`
- Hardware backend: `http://127.0.0.1:8000/api/system/hardware-profile`
- ML API: `http://127.0.0.1:8010/health`
- Hardware ML: `http://127.0.0.1:8010/system/hardware-profile`
