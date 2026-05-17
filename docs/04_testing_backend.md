# 04 Testing Backend

## Objetivo

El backend tiene un harness formal de `pytest` para probar importacion de dataset curado, revisiones humanas, taxonomia y endpoints FastAPI sin tocar la base real ni `dataset_curado` real.

## Aislamiento

Los tests usan `tmp_path` de pytest para crear:

- SQLite temporal;
- storage temporal;
- dataset_curado minimo;
- WAVs sinteticos muy pequenos;
- manifest `manifest_segmentos.csv` minimo.

Variables soportadas para pruebas y despliegue:

- `ACUSTICAFAUNA_DB_PATH`
- `ACUSTICAFAUNA_STORAGE_ROOT`
- `ACUSTICAFAUNA_STORAGE_DIR`
- `ACUSTICAFAUNA_CURATED_DATASET_ROOT`
- `ACUSTICAFAUNA_ALLOWED_MEDIA_ROOTS`

`settings.reload_from_env()` permite que los tests apliquen estas variables antes de inicializar tablas.

## Ejecutar

Desde:

```powershell
cd "F:\PROYECTO de cosa de sonido\acusticafauna-General\acusticafauna-Back\backend"
```

Ejecutar:

```powershell
python -m pytest tests -q
```

## Cobertura inicial

La suite valida:

- lectura de `manifest_segmentos.csv`;
- importacion de positivo, otros ruidos, negativo por objetivo y revisar_etiqueta;
- deduplicacion por importacion repetida;
- stats de dataset curado;
- endpoint de importacion, stats, listado y audio;
- revision humana idempotente;
- sugerencias de taxonomia desde labels y `negative_for`;
- mapeos conocidos como `LEPFUS`;
- `revisar_etiqueta` como no entrenable y pendiente de revision;
- edicion de taxonomia;
- stats de taxonomia;
- ejemplos por label.
- dataset versionado para entrenamiento;
- inclusion/exclusion de candidatos, gold, corregidos, ruido y negativos por objetivo;
- export CSV, lock y archive de versiones.

## Limites

Los tests no entrenan modelos, no ejecutan BirdNET/OpenSoundscape/RIBBIT, no generan espectrogramas masivos y no dependen de datasets grandes.
