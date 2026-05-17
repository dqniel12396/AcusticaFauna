# Comandos de desarrollo

Comandos utiles para levantar y validar AcusticaFauna en entorno local.

Las rutas estan escritas en estilo Git Bash/MSYS por compatibilidad con los comandos usados en el proyecto.

## Backend principal

```bash
cd "/f/PROYECTO de cosa de sonido/acusticafauna-General/acusticafauna-Back/backend"
source .venv-backend/Scripts/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Documentacion interactiva:

```text
http://127.0.0.1:8000/docs
```

## Frontend

```bash
cd "/f/PROYECTO de cosa de sonido/acusticafauna-General/acusticafauna-frontend"
npm run dev
```

## ML API

```bash
cd "/f/PROYECTO de cosa de sonido/acusticafauna-ML"
source .venv-ml/Scripts/activate
python -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload
```

Health:

```text
http://127.0.0.1:8010/health
```

Modelos:

```text
http://127.0.0.1:8010/models
```

## Tests backend

```bash
cd "/f/PROYECTO de cosa de sonido/acusticafauna-General/acusticafauna-Back/backend"
source .venv-backend/Scripts/activate
PYTHONPATH=. pytest tests -q
```

## Build frontend

```bash
cd "/f/PROYECTO de cosa de sonido/acusticafauna-General/acusticafauna-frontend"
npm run build
```

## Compilar ML API

```bash
cd "/f/PROYECTO de cosa de sonido/acusticafauna-ML"
source .venv-ml/Scripts/activate
python -m py_compile ml_api/main.py
```

## Orden recomendado para desarrollo

1. Levantar ML API si se usaran predicciones o training jobs.
2. Levantar backend principal.
3. Levantar frontend.
4. Abrir `/laboratorio-audio` o `/auditoria-retroalimentacion`.

## Recordatorios

- No entrenar automaticamente.
- No modificar audios originales.
- No modificar `dataset_curado` directamente.
- Verificar dry-run antes de crear manifests limpios.

