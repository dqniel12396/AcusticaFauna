# Flujo de recortes, uploads y lotes

## Regla central

Los audios originales no se modifican ni se borran. Todo recorte, limpieza, segmento, reporte o resultado de detector se guarda como archivo derivado y conserva trazabilidad hacia el audio fuente.

## Procesamiento por lote

El modulo de procesamiento por lote admite dos modos:

- `clean_existing`: usa audios ya preparados o recortes existentes. No detecta actividad ni segmenta; crea una copia procesada en `backend/storage/audio_lab/batch_jobs/{job_id}/processed/`.
- `full_auto`: usa audios crudos o largos. Detecta actividad, crea segmentos en `segments/`, procesa copias derivadas en `processed/` y deja resultados para revision.

Para evitar errores en Windows por rutas demasiado largas, los archivos fisicos derivados de batch usan nombres cortos basados en el identificador del item y el segmento. La ruta completa original, el audio procesado, el job y la metadata se guardan en SQLite y en los JSON asociados.

La UI no debe usar esos nombres fisicos cortos como titulo principal. Cada output de batch expone campos de identidad legible:

- `display_name` y `display_label`
- `source_audio_name` y `processed_audio_name`
- `batch_job_name`, `batch_job_id` y `short_id`
- `segment_label`, `segment_start_seconds` y `segment_end_seconds`
- `processing_preset` y `processing_method`

La tabla de outputs muestra el nombre original legible, el tramo o `audio completo`, y el procesamiento aplicado. Las rutas completas quedan disponibles en `Detalles`, con botones para copiar ruta original, ruta procesada y resumen.

El historial de jobs y outputs puede buscar por nombre legible, nombre procesado, ruta fuente, ruta procesada y nombre de job. La exportacion CSV de outputs incluye nombres legibles y rutas tecnicas para auditoria externa.

Si el usuario agrega un audio manual desde una carpeta externa, el job puede recibir `job_allowed_roots` con la carpeta padre validada. Esa autorizacion aplica solo al job. No se agrega globalmente a `.env` y no debe ser una raiz de unidad completa como `F:\` sin confirmacion fuerte.

Estados:

- `completed`: todos los audios procesaron.
- `completed_with_errors`: al menos un audio fallo, pero otros procesaron.
- `failed`: un job de un solo archivo fallo o no produjo ningun audio procesado.

Los errores de ruta devuelven JSON con `audio_path_not_allowed`, `allowed_roots` y `suggested_env_line`.

## Procesamiento masivo por carpeta local

Folder-batch primero escanea una carpeta local. Si el scan es valido, esa carpeta resuelta queda autorizada solo para ese job y los audios dentro de ella pueden procesarse aunque la carpeta no este en `.env`.

Los outputs siempre se escriben en:

```text
backend/storage/audio_lab/folder_batch_jobs/{job_id}/
```

Nunca se escribe sobre los originales.

## Reporte de calidad

Cada output procesado puede generar un reporte original vs procesado. El JSON se guarda en:

```text
backend/storage/audio_lab/quality_reports/{report_id}.quality.json
```

El nombre del archivo del reporte es corto y seguro. Las rutas completas y nombres reales se guardan dentro del JSON:

- `source_audio_path`
- `processed_audio_path`
- `source_audio_name`
- `processed_audio_name`
- `display_name`
- `display_label`
- `batch_job_id`
- `batch_output_id`

Si la carpeta `quality_reports/` no existe, el backend la crea antes de escribir. Si ocurre un error, el endpoint responde JSON con un mensaje claro para que la web no muestre solo `Failed to fetch`.

## Feedback desde outputs procesados

Cuando el feedback viene desde un output de batch procesado, queda asociado al archivo procesado y conserva trazabilidad al original mediante:

- `source_audio_path`
- `processed_audio_path`
- `batch_job_id`
- `batch_output_id`
- `segment_start_seconds`
- `segment_end_seconds`
- `processing_metadata_path`

Ese feedback no entrena ni registra modelos automaticamente. Debe pasar por revision humana antes de usarse en entrenamiento.
