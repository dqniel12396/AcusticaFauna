# Flujo de recortes, uploads y analisis por lote

Este documento describe como trabajar con audios derivados y lotes sin modificar audios originales.

## Deteccion de actividad en audio largo

Desde `/laboratorio-audio` el usuario puede abrir un audio largo y presionar **Detectar actividad**. El sistema ejecuta el analisis en backend y devuelve segmentos sugeridos. Estos segmentos no son archivos nuevos: son marcas temporales auditables sobre el audio original.

Flujo:

1. Abrir audio largo desde dataset, ruta manual, upload o recorte.
2. Abrir **Segmentar audio / detectar silencios**.
3. Elegir preset: Muy sensible, Normal o Conservador.
4. Ajustar parametros avanzados si la grabadora, ruido o volumen lo requieren.
5. Ejecutar deteccion.
6. Revisar tabla de segmentos y regiones resaltadas en la waveform.
7. Seleccionar segmentos utiles.
8. Crear recortes WAV derivados solo de los segmentos confirmados por el usuario.

Los resultados de deteccion se auditan en:

- `audio_lab_activity_runs`
- `audio_lab_activity_segments`

Los WAV derivados se guardan en la misma carpeta trazable de recortes:

```text
acusticafauna-General/acusticafauna-Back/backend/storage/audio_lab/clips/
```

Restricciones:

- No modificar audios originales.
- No borrar audios originales.
- No entrenar automaticamente con segmentos detectados.
- No registrar modelos desde este flujo.
- Mantener cada recorte con `source_audio_path`, tiempos, proposito y metadata JSON.

## Recortes

Los recortes permiten crear un audio derivado desde una seleccion de la waveform.

### Donde se guardan

Los recortes se guardan como WAV fisico en:

```text
acusticafauna-General/acusticafauna-Back/backend/storage/audio_lab/clips/
```

Tambien pueden tener metadata JSON de trazabilidad junto al WAV.

### Que se registra

Cada recorte conserva:

- `id`
- `clip_name`
- `source_audio_path`
- `start_seconds`
- `end_seconds`
- `duration_seconds`
- `output_audio_path`
- `output_metadata_path`
- `purpose`
- `notes`
- `created_at`

### Reglas importantes

- El audio original no se modifica.
- El audio original no se borra.
- El recorte debe existir como archivo WAV fisico.
- Si falla la creacion del WAV, el recorte no debe registrarse como valido.

### Crear un recorte

Pasos:

1. Abrir un audio en `/laboratorio-audio`.
2. Seleccionar un tramo en la waveform.
3. Presionar crear recorte.
4. Revisar nombre sugerido, proposito y notas.
5. Elegir crear, crear y abrir, o cancelar.

El nombre sugerido debe usar el audio original y, si existe, una etiqueta util:

```text
Boana_pugnax__seg0011__clip_0.9_1.8.wav
Boana_boans__IAvH-CSA-34384__seg0010__clip_1.8_5.6.wav
voz_humana__clip_5.0_10.0.wav
```

### Abrir y analizar recortes

Un recorte creado puede abrirse como audio activo en el laboratorio. Desde ese momento:

- El reproductor usa el WAV del recorte.
- La duracion visible debe ser la del recorte.
- El espectrograma se genera sobre el recorte.
- La prediccion ML usa `output_audio_path`, no el audio original.

## Upload multiple

La UI permite seleccionar o arrastrar varios archivos desde el PC.

### Donde se guardan

Los uploads temporales se guardan en:

```text
acusticafauna-General/acusticafauna-Back/backend/storage/audio_lab/uploads/
```

Cada upload registra:

- `original_filename`
- `stored_path`
- `size_bytes`
- `created_at`

### Cola visual

La cola de uploads debe estar separada de:

- rutas manuales pegadas por el usuario
- audios seleccionados desde tablas

Limpiar la lista visual de uploads solo limpia la cola en la interfaz. No debe borrar archivos fisicos sin una accion explicita y confirmacion fuerte.

## Analisis por lote

El analisis por lote permite procesar varios audios secuencialmente.

### Fuentes del lote

El lote puede formarse desde:

- Cola de archivos subidos.
- Rutas manuales.
- Audios seleccionados desde una tabla.

Estas fuentes deben verse separadas para evitar confusion.

### Seleccion de modelo

Antes de analizar el lote, elegir modelo.

Usar:

- `frog_detector_v1_binary_v3_hardneg` para saber si hay rana/sapo.
- `boana_boans_pugnax_v3_quality045` solo para diferenciar `Boana_boans` vs `Boana_pugnax`.

Advertencia importante: el clasificador Boana no detecta presencia general de rana/sapo. Solo clasifica entre sus dos clases.

### Resultados agrupados

Los resultados de lote deben agruparse por audio:

- `audio_name`
- `audio_path`
- `model_id`
- `predicted_label`
- score principal
- threshold
- estado
- botones para abrir, espectrograma y feedback

Nunca se deben mezclar resultados de audios distintos en la tabla activa. La tabla activa representa un solo audio.

## Actividad por lote

El lote tambien puede ejecutar deteccion de actividad sobre varios audios antes de clasificar. Esto sirve para audios largos donde analizar todo el archivo seria costoso o poco util.

Flujo recomendado:

1. Armar lote desde tabla, rutas manuales o uploads.
2. Ejecutar **Detectar actividad en lote**.
3. Abrir un resultado de actividad en la vista activa.
4. Revisar y seleccionar segmentos.
5. Crear recortes WAV derivados.
6. Analizar esos recortes con detector rana/sapo o clasificador especializado.

El paso de deteccion reduce el audio a zonas candidatas. La decision biologica sigue dependiendo del detector ML, clasificador especializado y revision humana.

## Procesamiento por lote

La web ofrece dos modos de pipeline:

### Cola explicita de procesamiento

El panel muestra una lista visible de **Audios listos para procesamiento**. Esa cola puede alimentarse desde:

- audios marcados con el checkbox `LOTE` en la tabla;
- archivos subidos por upload multiple, que se agregan automaticamente;
- rutas pegadas en el campo de rutas manuales y confirmadas con **Agregar rutas al lote**;
- el audio activo del laboratorio mediante **Agregar audio actual al lote**.

Si el audio activo no esta en la cola, la web muestra un aviso para agregarlo. La cola evita duplicados por `audio_path` y permite quitar items sin borrar archivos fisicos. Iniciar procesamiento sin audios muestra ayuda: primero debe agregarse al menos un audio.

### Solo limpiar lote existente

Para clips ya cortados o audios cortos. No detecta actividad ni crea segmentos. Crea una copia procesada por cada entrada:

```text
clip_001.wav
clip_001_denoised.wav
```

La copia queda en:

```text
backend/storage/audio_lab/batch_jobs/{job_id}/processed/
```

### Procesamiento completo automatico

Para audios crudos/largos. Crea una carpeta por job:

```text
backend/storage/audio_lab/batch_jobs/{job_id}/
  segments/
  processed/
  summaries/
  logs/
```

El pipeline detecta actividad, corta segmentos, descarta vacios, limpia copias derivadas y opcionalmente analiza con detector rana/sapo. Los resultados se guardan como outputs con accion recomendada:

- `probable_rana`
- `no_rana`
- `revisar`
- `error`

Ningun output pasa automaticamente a entrenamiento. Para construir manifests, primero debe abrirse en laboratorio, revisarse y recibir feedback humano.

### Reporte de calidad

Cada output procesado puede generar **Reporte de calidad**. El reporte compara el audio fuente contra el WAV procesado y muestra:

- nivel general;
- ruido de fondo;
- contraste;
- energia por bandas;
- detector rana/sapo si esta disponible;
- recomendacion para revision.

El reporte JSON queda en:

```text
backend/storage/audio_lab/quality_reports/
```

Si la ML API esta apagada, el reporte se genera igual y agrega warning de detector no disponible. La recomendacion nunca habilita entrenamiento automatico: todo queda como `requires_review`.
