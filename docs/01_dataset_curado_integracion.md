# 01 Dataset Curado - Integracion

## Que es `dataset_curado`

`dataset_curado/` es una salida limpia generada por `tools/curar_dataset_audio.py`. Contiene segmentos de audio ya filtrados por actividad acustica, ordenados por grupo y acompanados por manifests CSV. Esta integracion registra esos segmentos en la base SQLite de AcusticaFauna para inspeccion, revision humana y trazabilidad.

Esta fase no entrena modelos y no ejecuta BirdNET, OpenSoundscape ni RIBBIT.

## Estructura esperada

```text
dataset_curado/
  cleaned/
    positivos/
    negativos_por_objetivo/
    otros_ruidos/
    revisar_etiqueta/
  manifests/
    manifest_segmentos.csv
    manifest_rechazados.csv
    manifest_duplicados.csv
    resumen_por_etiqueta.csv
```

## Significado de carpetas

- `cleaned/positivos/<label>/`: segmentos positivos de una especie o clase.
- `cleaned/negativos_por_objetivo/<target>/`: audios que no pertenecen al objetivo indicado. Ejemplo: negativos para `LEPFUS`.
- `cleaned/otros_ruidos/otros_ruidos/`: audios ambientales o no objetivo, incluyendo background y ESC-50.
- `cleaned/revisar_etiqueta/revisar_etiqueta/`: audios validos pero sin etiqueta confiable. No deben usarse para entrenamiento todavia.

## Tablas agregadas

- `curated_import_sessions`: historial de importaciones del manifest curado.
- `curated_audio_segments`: catalogo de segmentos limpios, con trazabilidad hacia `source_path` y `output_path`.
- `label_taxonomy`: etiquetas detectadas desde el manifest.
- `human_reviews`: revisiones humanas simples sobre segmentos curados.

Las tablas existentes de BirdNET externo (`import_sessions`, `events`, `predictions`) no se modifican.

## Ejecutar importacion por CLI

Desde `acusticafauna-General/acusticafauna-Back/backend`:

```bash
python -m app.tools.import_curated_dataset --dataset-root "F:/PROYECTO de cosa de sonido/dataset_curado"
```

Tambien puede configurarse la ruta por entorno:

```bash
set ACUSTICAFAUNA_CURATED_DATASET_ROOT=F:/PROYECTO de cosa de sonido/dataset_curado
```

## Endpoints creados

- `POST /api/curated-dataset/import`
- `GET /api/curated-dataset/stats`
- `GET /api/curated-dataset/labels`
- `GET /api/curated-dataset/segments`
- `GET /api/curated-dataset/segments/{id}`
- `GET /api/curated-dataset/segments/{id}/audio`
- `GET /api/curated-dataset/segments/{id}/spectrogram?mode=preview|confirmed&force=false`
- `DELETE /api/curated-dataset/segments/{id}/spectrogram?mode=preview|confirmed|all`
- `POST /api/curated-dataset/segments/{id}/review`

Ejemplo de importacion:

```json
{
  "dataset_root": "F:/PROYECTO de cosa de sonido/dataset_curado"
}
```

Filtros soportados en `/segments`:

- `label`
- `group_type`
- `negative_for`
- `min_duration`
- `max_duration`
- `status`
- `review_status`
- `limit`
- `offset`

## Audio seguro

El audio de segmentos se sirve desde:

```text
GET /api/curated-dataset/segments/{id}/audio
```

El backend solo permite servir archivos dentro de raices permitidas:

- `dataset_curado/`
- `backend/storage/`
- rutas extra definidas en `ACUSTICAFAUNA_ALLOWED_MEDIA_ROOTS`

No se usa el endpoint antiguo de media con ruta absoluta para esta pagina.

## Espectrogramas bajo demanda

La importacion de `dataset_curado` no genera espectrogramas masivos. Los PNG se crean solo cuando el usuario abre o revisa un segmento especifico.

Modos disponibles:

- `preview`: genera o sirve un PNG temporal en `storage/spectrograms/tmp/`. Es el modo usado para segmentos no confirmados, incluyendo `revisar_etiqueta`, `uncertain` y `rejected`.
- `confirmed`: genera o sirve un PNG permanente en `storage/spectrograms/curated_confirmed/`. Solo se permite cuando la ultima revision humana del segmento es `accepted` o `corrected`.

Politica:

- `revisar_etiqueta` no crea espectrograma permanente por defecto.
- `uncertain` y `rejected` no crean espectrograma permanente por defecto.
- `accepted` y `corrected` pueden cachear espectrograma permanente bajo demanda.
- `force=true` regenera el PNG.
- El endpoint `DELETE` permite borrar preview, confirmado o ambos.

## Pagina frontend

Ruta:

```text
/dataset-curado
```

Nombre visible:

```text
Dataset Curado
```

La pagina permite:

- importar `manifest_segmentos.csv`;
- ver total de segmentos;
- ver conteo por `group_type`;
- ver etiquetas principales;
- filtrar por `label`, `group_type`, `negative_for`, `revisar_etiqueta` y estado de revision;
- reproducir audio desde endpoint seguro;
- abrir detalle de segmento con espectrograma bajo demanda;
- usar bandeja especial para `revisar_etiqueta`;
- marcar revision como `accepted`, `corrected`, `uncertain` o `rejected`.

## Que no usar todavia para entrenamiento

No usar todavia para entrenamiento:

- `group_type=revisar`
- `label=revisar_etiqueta`
- segmentos con `review_status=uncertain` o `rejected`
- cualquier segmento sin trazabilidad hacia `source_path` y `source_sha256`

Para entrenamiento futuro, construir un dataset versionado a partir de positivos, negativos por objetivo y revisiones humanas aceptadas/corregidas.

## Proximos pasos

1. Revisar manualmente `revisar_etiqueta`.
2. Definir reglas para convertir `human_reviews` en dataset entrenable.
3. Agregar versionado de datasets y modelos.
4. Integrar BirdNET/OpenSoundscape/RIBBIT como motores internos, no como programas separados para el usuario.
5. Exportar resultados y revisiones a CSV/Parquet.
