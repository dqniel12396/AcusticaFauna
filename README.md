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

## Instalacion rapida

PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup_windows.ps1
```

Git Bash:

```bash
bash scripts/setup_gitbash.sh
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
python scripts/check_environment.py
python scripts/preflight_github.py
```

## Documentacion

- [Instalacion local](acusticafauna-General/docs/INSTALACION_LOCAL.md)
- [Modelos y datos](acusticafauna-General/docs/MODELOS_Y_DATOS.md)
- [Estructura del proyecto](acusticafauna-General/docs/ESTRUCTURA_PROYECTO.md)
- [Recursos hardware](acusticafauna-General/docs/RECURSOS_HARDWARE.md)
- [Guia tecnica ML](acusticafauna-General/docs/GUIA_TECNICA_ML_ACUSTICAFAUNA.md)

## Reglas importantes

- No modificar audios originales.
- No modificar `dataset_curado` directamente.
- No entrenar automaticamente sin dry-run.
- Mantener OpenSoundscape aislado en `acusticafauna-ML`.
