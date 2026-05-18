# AcusticaFauna

AcusticaFauna es una app local-first para curar, revisar y experimentar con audios bioacusticos. Incluye backend FastAPI, frontend React/Vite y una ML API FastAPI aislada para inferencia y entrenamiento.

## Que incluye

- Laboratorio de audio para abrir, segmentar, limpiar, analizar y dejar feedback.
- Auditoria de feedback y Constructor de modelos ML.
- Explorador ML, registry de modelos y entrenamiento web.
- Procesamiento por lote, reportes de calidad y recortes WAV trazables.

## Que no incluye el repo

- Audios reales grandes.
- `dataset_curado` completo.
- Outputs temporales, batch jobs o recortes generados.
- Modelos pesados dentro del Git normal.

Los datos y modelos se configuran localmente por `.env`, Releases/Git LFS o paquetes descargables.

## Estructura

```text
repo/
  acusticafauna-General/
    acusticafauna-Back/backend/
    acusticafauna-frontend/
    docs/
  acusticafauna-ML/
    ml_api/
    scripts/
    manifests/
    models/      # ignorado: descargar aparte
    outputs/     # ignorado
    ml_runs/     # ignorado
  scripts/
  sample_data/
```

## Instalacion rapida en Windows

Opcion recomendada para usuarios normales: PowerShell + HTTPS + Python 3.11.x.

| Tipo de usuario | Terminal | Clonado | Instalacion |
| --- | --- | --- | --- |
| Usuario normal Windows | PowerShell | HTTPS | `.\scripts\setup_windows.ps1` |
| Desarrollador avanzado | Git Bash opcional | SSH opcional | `bash scripts/setup_gitbash.sh` |

1. Instala Python 3.11.x:

   https://www.python.org/downloads/windows/

   En la pagina de descargas de Windows, busca una version Python 3.11.x. Sirve cualquier version de la rama 3.11: 3.11.0, 3.11.1, 3.11.8, 3.11.9, etc. Preferiblemente usa la mas reciente disponible dentro de Python 3.11.x.

   No uses el boton principal de descarga si te ofrece Python 3.13 o superior. Para AcusticaFauna ML se recomienda Python 3.11.x.

   Durante la instalacion marca `Add python.exe to PATH`.

   Cierra y abre PowerShell.

   Verifica:

   ```powershell
   py -3.11 --version
   ```

2. Instala Node.js LTS:

   https://nodejs.org/

   Verifica:

   ```powershell
   node --version
   npm.cmd --version
   ```

3. Clona con HTTPS, no SSH:

   ```powershell
   cd C:\
   git clone https://github.com/dqniel12396/AcusticaFauna.git AcusticaFauna
   cd C:\AcusticaFauna
   ```

   Usamos HTTPS porque no requiere configurar llaves SSH.

4. Ejecuta el diagnostico:

   ```powershell
   py -3.11 scripts\doctor_install.py
   ```

5. Crea carpetas locales:

   ```powershell
   py -3.11 scripts\create_local_dirs.py
   ```

6. Instala dependencias:

   ```powershell
   .\scripts\setup_windows.ps1
   ```

7. Arranca la aplicacion:

   ```powershell
   .\scripts\start_all.ps1
   ```

8. Abre:

   http://localhost:5173

El comando `py -3.11` sirve para cualquier Python 3.11.x instalado. No exige que sea exactamente 3.11.0.

Python 3.13 no es recomendado para AcusticaFauna ML. Dependencias como `torch`, `opensoundscape`, `librosa`, `numba`, `llvmlite` y `soundfile` suelen ser mas estables con Python 3.11.x.

## Sirve cualquier Python 3.11?

Si. Sirve cualquier version 3.11.x. Lo importante es que el comando `py -3.11 --version` funcione. Recomendamos la ultima version disponible de la rama 3.11.x.

## Si no tienes Git instalado

Puedes descargar el ZIP desde GitHub:

1. Abre el repositorio en GitHub.
2. Pulsa `Code`.
3. Pulsa `Download ZIP`.
4. Descomprime en:

```text
C:\AcusticaFauna
```

Entra con PowerShell:

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

## Error comun: npm.ps1 Statement

Si en PowerShell aparece un error parecido a:

```text
No se encuentra la propiedad 'Statement' en C:\Program Files\nodejs\npm.ps1
```

No es un error de AcusticaFauna. Es PowerShell ejecutando `npm.ps1` en vez de `npm.cmd`.

Los scripts de AcusticaFauna ya usan `npm.cmd` automaticamente. Si ejecutas comandos manualmente, usa:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

## Error: No suitable Python runtime found

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

## Arranque rapido

En tres terminales:

```powershell
.\scripts\start_backend.ps1
.\scripts\start_ml_api.ps1
.\scripts\start_frontend.ps1
```

O todo junto:

```powershell
.\scripts\start_all.ps1
```

Abre `http://localhost:5173`.

## Configuracion

Copia `.env.example` a `.env` y ajusta rutas si hace falta.

Variables clave:

- `ACUSTICAFAUNA_DATASET_DIR`
- `ACUSTICAFAUNA_STORAGE_DIR`
- `ACUSTICAFAUNA_MODELS_DIR`
- `ACUSTICAFAUNA_MANIFESTS_DIR`
- `ACUSTICAFAUNA_RESOURCE_PROFILE`

Si no tienes dataset, puedes usar uploads temporales en Laboratorio de audio.

## Modelos

Lista paquetes:

```bash
python scripts/download_models.py --list
```

Descarga pack default cuando existan URLs de release:

```bash
python scripts/download_models.py --pack default
```

Si un modelo falta, la ML API lo reporta como `modelo no descargado` y no rompe `/models`.

## Diagnostico

```bash
python scripts/doctor_install.py
python scripts/check_environment.py
python scripts/preflight_github.py
```

## Documentacion

- [Instalacion local](docs/INSTALACION_LOCAL.md)
- [Modelos y datos](acusticafauna-General/docs/MODELOS_Y_DATOS.md)
- [Estructura del proyecto](acusticafauna-General/docs/ESTRUCTURA_PROYECTO.md)
- [Recursos hardware](acusticafauna-General/docs/RECURSOS_HARDWARE.md)
- [Guia tecnica ML](acusticafauna-General/docs/GUIA_TECNICA_ML_ACUSTICAFAUNA.md)

## Reglas importantes

- No modificar audios originales.
- No modificar `dataset_curado` directamente.
- No entrenar automaticamente sin dry-run.
- Mantener OpenSoundscape aislado en `acusticafauna-ML`.
