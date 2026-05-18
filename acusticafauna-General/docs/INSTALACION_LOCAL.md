# Instalacion local

## Instalacion recomendada en Windows

Camino recomendado para la mayoria de usuarios: PowerShell + HTTPS + Python 3.11.x.

No necesitas Git Bash. No necesitas SSH. Evita instalar el proyecto dentro de OneDrive, Dropbox, Google Drive, Escritorio sincronizado o Documentos sincronizado. Para ML, esas rutas suelen causar problemas por sincronizacion y nombres demasiado largos.

Usa una ruta corta:

```text
C:\AcusticaFauna
C:\Proyectodesonido\AcusticaFauna
```

Python recomendado: 3.11.x. Python 3.13 puede fallar con dependencias ML. En AcusticaFauna, paquetes como `torch`, `opensoundscape`, `librosa`, `numba`, `llvmlite` y `soundfile` son mas estables con Python 3.11.x.

### A. Instalar Python 3.11.x

1. Abre https://www.python.org/downloads/windows/
2. Busca una version Python 3.11.x. Sirve cualquier version de la rama 3.11: 3.11.0, 3.11.1, 3.11.8, 3.11.9, etc. Preferiblemente usa la mas reciente disponible dentro de Python 3.11.x.
3. No uses el boton principal de descarga si te ofrece Python 3.13 o superior. Para AcusticaFauna ML se recomienda Python 3.11.x.
4. Descarga `Windows installer (64-bit)`.
5. Durante la instalacion marca `Add python.exe to PATH`.
6. Cierra y abre PowerShell.
7. Verifica:

```powershell
py -3.11 --version
```

El comando `py -3.11` sirve para cualquier Python 3.11.x instalado. No exige que sea exactamente 3.11.0.

### B. Instalar Node.js LTS

Instala Node.js LTS desde https://nodejs.org/

Luego abre una terminal PowerShell nueva y verifica:

```powershell
node --version
npm.cmd --version
```

En PowerShell usa `npm.cmd`, no `npm`, para evitar que Windows ejecute `npm.ps1`.

### C. Clonar con HTTPS en una ruta corta

Usa HTTPS porque no requiere configurar llaves SSH:

```powershell
cd C:\
git clone https://github.com/dqniel12396/AcusticaFauna.git AcusticaFauna
cd C:\AcusticaFauna
```

### D. Instalar AcusticaFauna

```powershell
py -3.11 scripts\doctor_install.py
py -3.11 scripts\create_local_dirs.py
.\scripts\setup_windows.ps1
```

### E. Arrancar

```powershell
.\scripts\start_all.ps1
```

Abre:

```text
http://localhost:5173
```

## Si no tienes Git instalado

Puedes descargar el ZIP desde GitHub:

1. En GitHub, pulsa `Code`.
2. Pulsa `Download ZIP`.
3. Descomprime el ZIP en:

```text
C:\AcusticaFauna
```

Entra con PowerShell y continua:

```powershell
cd C:\AcusticaFauna
py -3.11 scripts\doctor_install.py
py -3.11 scripts\create_local_dirs.py
.\scripts\setup_windows.ps1
```

## Git Bash y SSH son opcionales

Git Bash no es obligatorio. SSH no es obligatorio.

Para la mayoria de usuarios se recomienda HTTPS:

```powershell
git clone https://github.com/dqniel12396/AcusticaFauna.git
```

SSH solo es para desarrolladores que ya tienen llaves configuradas:

```bash
git clone git@github.com:dqniel12396/AcusticaFauna.git
```

### Por que no usamos SSH por defecto

SSH requiere crear una llave local, agregarla a GitHub y configurar el agente SSH. Para usuarios no tecnicos esto suele fallar con `Permission denied (publickey)`. Por eso la guia usa HTTPS.

### Alternativa para usuarios avanzados: Git Bash

```bash
cd /c
git clone https://github.com/dqniel12396/AcusticaFauna.git AcusticaFauna
cd /c/AcusticaFauna
python scripts/doctor_install.py
python scripts/create_local_dirs.py
bash scripts/setup_gitbash.sh
```

## Problemas comunes

### Permission denied (publickey)

Este error aparece cuando intentas clonar con SSH sin tener una llave SSH configurada en GitHub.

Solucion recomendada: usa HTTPS.

```powershell
git clone https://github.com/dqniel12396/AcusticaFauna.git
```

Solucion avanzada: configura una llave SSH en GitHub y vuelve a intentar el clon SSH.

### localhost rechazo la conexion

Significa que algun servicio no arranco o todavia no esta listo.

1. Revisa la ventana de PowerShell donde ejecutaste `.\scripts\start_all.ps1`.
2. Arranca los servicios por separado para ver el error real:

```powershell
.\scripts\start_backend.ps1
.\scripts\start_ml_api.ps1
.\scripts\start_frontend.ps1
```

3. Abre estas rutas para revisar cada servicio:

```text
http://127.0.0.1:8000/docs
http://127.0.0.1:8010/health
http://localhost:5173
```

### No module named uvicorn

Significa que no se instalo el entorno virtual o que estas usando el Python global equivocado.

Ejecuta:

```powershell
.\scripts\setup_windows.ps1
```

El backend debe usar:

```text
.venv-backend\Scripts\python.exe
```

No debe usar el Python global, por ejemplo:

```text
C:\Python313\python.exe
```

### No suitable Python runtime found

Este error no significa que falte cualquier Python. Significa que no esta instalado Python 3.11.x o que no esta registrado en el Python Launcher.

Solucion:

1. Instala Python 3.11.x desde https://www.python.org/downloads/windows/
2. En la pagina de Windows busca una version 3.11.x y descarga `Windows installer (64-bit)`.
3. Durante la instalacion marca `Add python.exe to PATH`.
4. Cierra y abre PowerShell.
5. Verifica:

```powershell
py -3.11 --version
```

### Error comun: npm.ps1 Statement

Si aparece:

```text
No se encuentra la propiedad 'Statement' en C:\Program Files\nodejs\npm.ps1
```

No es un error de AcusticaFauna. Es PowerShell ejecutando el wrapper `npm.ps1` de Node.js. Usa `npm.cmd`.

Los scripts de AcusticaFauna ya usan `npm.cmd` automaticamente. Si ejecutas comandos frontend manualmente, usa:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

### Error al cargar audio / 403 Forbidden / audio_path_not_allowed

El backend solo sirve audios dentro de carpetas permitidas. Esto evita que una pagina web pueda leer cualquier archivo del computador.

El repo de GitHub no incluye audios reales. Si clonaste en otro equipo, los registros importados pueden apuntar a rutas de otro PC, por ejemplo `F:\PROYECTO de cosa de sonido\dataset_curado\...`.

Soluciones:

1. Si el audio pertenece al Dataset Curado, configura en `.env`:

```env
ACUSTICAFAUNA_DATASET_DIR=F:\PROYECTO de cosa de sonido\dataset_curado
```

2. Si quieres autorizar una carpeta adicional de audios locales:

```env
ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\PC202601\Descargasreal;D:\AudiosCampo
```

3. Reinicia el backend.
4. En la app abre Configuracion -> Rutas de audio permitidas -> Probar rutas.

No uses rutas de otro PC si esos audios no existen en este equipo. Para carpetas grandes, usa Laboratorio de audio -> Procesamiento masivo por carpeta local. Para archivos sueltos, puedes usar uploads temporales.

Si una ruta vieja contiene `dataset_curado`, AcusticaFauna intenta reconstruirla bajo `ACUSTICAFAUNA_DATASET_DIR` en tiempo de ejecucion. No modifica la base de datos automaticamente.

Ejemplo para Dataset Curado y audios fuente externos:

```env
ACUSTICAFAUNA_DATASET_DIR=F:\PROYECTO de cosa de sonido\dataset_curado
ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\PROYECTO de cosa de sonido\dataset_ranas-20260512T141405Z-3-004
```

Si aparece `content-script.bundle.js` en la consola del navegador, normalmente viene de una extension. Prueba en una ventana sin extensiones antes de tratarlo como bug de AcusticaFauna.

### Error de rutas largas

Si aparece un error como `Windows Long Path support`, mueve el repo a `C:\AcusticaFauna` y vuelve a instalar. Habilitar rutas largas ayuda, pero no garantiza que todas las herramientas de Python, Node o compilacion funcionen en rutas sincronizadas o demasiado profundas.

Para habilitar rutas largas en Windows, abre PowerShell como administrador y ejecuta:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

Luego reinicia la terminal o el equipo antes de repetir la instalacion.

## Diagnostico

```powershell
py -3.11 scripts\doctor_install.py
py -3.11 scripts\check_environment.py
```

Endpoints utiles:

- Backend: `http://127.0.0.1:8000/api/health`
- Hardware backend: `http://127.0.0.1:8000/api/system/hardware-profile`
- ML API: `http://127.0.0.1:8010/health`
- Hardware ML: `http://127.0.0.1:8010/system/hardware-profile`
