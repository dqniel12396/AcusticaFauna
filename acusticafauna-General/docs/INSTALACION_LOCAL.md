# Instalacion local

## Requisitos

- Python 3.11 recomendado.
- Node.js y npm.
- Git Bash o PowerShell en Windows.
- Espacio local para modelos y audios propios.

## Instalacion recomendada en Windows

Para instalaciones con ML en Windows, evita clonar el repo dentro de OneDrive, Dropbox, Google Drive, Escritorio sincronizado o Documentos sincronizado. Esas carpetas suelen generar rutas largas y procesos de sincronizacion que pueden romper la instalacion de dependencias ML.

Usa una ruta corta:

```text
C:\AcusticaFauna
F:\AcusticaFauna
```

Python recomendado: 3.11. Python 3.13 puede fallar con dependencias ML que aun no publican wheels compatibles.

Desde Git Bash:

```bash
cd /c
git clone https://github.com/dqniel12396/AcusticaFauna.git AcusticaFauna
cd /c/AcusticaFauna
python scripts/doctor_install.py
python scripts/create_local_dirs.py
bash scripts/setup_gitbash.sh
```

Si aparece un error de rutas largas como `Windows Long Path support`, mueve el repo a `C:\AcusticaFauna` y vuelve a instalar. Habilitar rutas largas ayuda, pero no garantiza que todas las herramientas de Python, Node o compilacion funcionen en rutas sincronizadas o demasiado profundas.

Para habilitar rutas largas en Windows, abre PowerShell como administrador y ejecuta:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

Luego reinicia la terminal o el equipo antes de repetir la instalacion.

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
