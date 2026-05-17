# Flujo de entrenamiento desde la web

El entrenamiento desde la web esta disenado para ser seguro y trazable.

## Arquitectura

La web no entrena directamente.

El entrenamiento corre en:

```text
acusticafauna-ML
```

El backend principal FastAPI solo actua como proxy u orquestador ligero. No importa OpenSoundscape y no ejecuta entrenamiento.

La ML API expone endpoints de training jobs y ejecuta scripts con subprocess.

## Endpoints de ML API

Base local:

```text
http://127.0.0.1:8010
```

Endpoints principales:

- `GET /training/presets`
- `GET /training/manifests`
- `POST /training/clean-manifest/dry-run`
- `POST /training/clean-manifest`
- `GET /training/jobs`
- `POST /training/jobs`
- `GET /training/jobs/{id}`
- `GET /training/jobs/{id}/logs`
- `POST /training/jobs/{id}/cancel`
- `POST /training/jobs/{id}/evaluate`
- `POST /training/jobs/{id}/register-model`

## Flujo recomendado

1. Seleccionar preset.
2. Seleccionar manifest base.
3. Ejecutar dry-run.
4. Revisar filas, clases, split, exclusiones y conflictos.
5. Crear manifest limpio versionado.
6. Entrenar modelo.
7. Evaluar.
8. Registrar modelo solo si mejora.

## Dry-run obligatorio

Siempre se hace dry-run antes de entrenar.

El dry-run muestra:

- manifest base seleccionado
- filas antes
- filas despues
- clases
- distribucion train/val/test
- exclusiones por voz humana
- exclusiones por `excluded_from_training`
- feedback aplicado
- conflictos detectados
- si cumple minimos para entrenar

Si hay conflictos bloqueantes, no se debe entrenar salvo override explicito y consciente.

## Crear manifest limpio

La accion crear manifest limpio:

- no entrena
- no modifica audios
- no modifica `dataset_curado`
- crea una version de manifest en el espacio de ML

## Entrenar modelo

Al iniciar entrenamiento, la ML API crea un job asincrono.

El job guarda:

- estado
- parametros
- logs
- salida del proceso
- ruta de output

Los estados esperados son:

- `queued`
- `running`
- `completed`
- `failed`
- `canceled`

## Cola simple

Por defecto hay una cola simple: un entrenamiento a la vez.

Si un job esta `queued` o `running`, la UI no debe permitir iniciar otro como si fueran paralelos. Debe mostrar el estado del job activo.

## Logs y progreso

La UI consulta estado y logs periodicamente mientras el job esta activo.

Si una consulta falla temporalmente, no debe borrar el job activo. Debe mostrar que intenta reconectar.

## Evaluar

Despues de entrenar, se puede pedir evaluacion desde la ML API.

La evaluacion debe usar el modelo entrenado y el manifest de test correspondiente. Registrar solo despues de revisar metricas.

## Registrar modelo

Registrar modelo debe:

- copiar el `.model` final a `models/<model_id>/`
- crear o copiar `model_card.json`
- conservar metadatos utiles
- permitir que aparezca en `GET /models`
- permitir que aparezca en `/laboratorio-audio`

No registrar un modelo experimental como util si no mejora o si no fue evaluado.

## Reglas de seguridad

- No entrenar automaticamente al crear manifest.
- No modificar audios originales.
- No modificar `dataset_curado`.
- No importar OpenSoundscape desde backend principal.
- No entrenar si el dataset es insuficiente.
- Para Boana, exigir minimos razonables por split antes de entrenar.

