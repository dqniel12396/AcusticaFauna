# Estructura del proyecto

```text
repo/
  README.md
  .gitignore
  .env.example
  scripts/
  sample_data/
  acusticafauna-General/
    acusticafauna-Back/backend/
    acusticafauna-frontend/
    docs/
  acusticafauna-ML/
    ml_api/
    scripts/
    manifests/
    models/
    outputs/
    ml_runs/
```

## Se versiona

- Codigo backend, frontend y ML API.
- Scripts de instalacion, arranque y diagnostico.
- Documentacion.
- `sample_data` liviano.
- Model cards o registry pequenos si no contienen binarios ni datos sensibles.

## Se ignora

- `.env` reales.
- Entornos virtuales.
- `node_modules` y `dist`.
- Audios (`wav`, `flac`, `mp3`, etc.).
- `dataset_curado`.
- Storage local de clips/uploads/processed/batch/quality reports.
- Modelos pesados y outputs ML.
- Manifests CSV reales con rutas locales.

## Estructura actual vs clon limpio

La estructura actual usa carpetas hermanas `acusticafauna-General/` y `acusticafauna-ML/`. No es necesario moverlas. Las rutas se resuelven con `.env` y defaults relativos.
