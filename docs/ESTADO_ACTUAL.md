# Estado actual de AcusticaFauna

Ultima actualizacion: 2026-05-14

Este documento resume el estado operativo del proyecto despues de integrar laboratorio de audio, retroalimentacion humana, recortes, manifests limpios y jobs de entrenamiento desde la web.

## Modulos principales

### Backend principal FastAPI

Ubicacion: `acusticafauna-General/acusticafauna-Back/backend`

Responsabilidades:

- Servir la API principal del proyecto.
- Exponer endpoints de dataset, taxonomia, laboratorio de audio y auditoria de retroalimentacion.
- Guardar anotaciones humanas, recortes, uploads y metadatos.
- Actuar como proxy/orquestador ligero hacia la ML API cuando aplica.

Regla importante: el backend principal no importa OpenSoundscape y no entrena modelos directamente.

### Frontend React/Vite

Ubicacion: `acusticafauna-General/acusticafauna-frontend`

Responsabilidades:

- Interfaz web del proyecto.
- Pagina `/laboratorio-audio`.
- Pagina `/auditoria-retroalimentacion`.
- Flujos de revision, feedback, recortes, uploads, lotes, manifests limpios y entrenamiento web.

### Modulo `acusticafauna-ML`

Ubicacion: `acusticafauna-ML`

Responsabilidades:

- Entrenamiento con OpenSoundscape.
- Scripts de scoring, filtrado, entrenamiento y evaluacion.
- Almacenamiento de modelos ML.
- Ejecucion de la ML API.

### ML API

Ubicacion: `acusticafauna-ML/ml_api`

URL local esperada: `http://127.0.0.1:8010`

Responsabilidades:

- Inferencia de modelos.
- Listado de modelos disponibles.
- Generacion de espectrogramas.
- Jobs asincronos de entrenamiento.
- Logs, evaluacion y registro de modelos entrenados.

## Funcionalidades operativas

### Dataset Curado

Existe `dataset_curado` con manifests, segmentos y datos curados. El flujo actual evita modificar audios originales y evita escribir directamente dentro de `dataset_curado` para acciones de revision.

### Laboratorio de audio

La pagina `/laboratorio-audio` permite:

- Abrir audios existentes.
- Subir audios temporales.
- Subir multiples audios.
- Reproducir audio.
- Ver waveform con fallback backend si el navegador no decodifica bien.
- Generar espectrogramas bajo demanda.
- Seleccionar fragmentos.
- Analizar audio completo o seleccion.
- Ver resultados por segmento.
- Guardar feedback humano.
- Crear recortes WAV trazables.
- Ejecutar analisis por lote sin mezclar audios distintos en la tabla activa.

### Detector rana/sapo

Modelo: `frog_detector_v1_binary_v3_hardneg`

Funciona como detector general de presencia probable de rana/sapo. No identifica especie.

### Clasificador Boana especializado

Modelo: `boana_boans_pugnax_v3_quality045`

Clasifica solamente entre:

- `Boana_boans`
- `Boana_pugnax`

Usa una regla calibrada basada en `score_Boana_pugnax`, no argmax simple.

### Reglas calibradas

La ML API puede leer `model_card.json` cuando existe y aplicar `decision_rule` personalizada. En resultados se muestra:

- `predicted_label`
- `raw_argmax_label`
- `decision_rule_applied`
- score usado por la regla
- threshold

### Feedback humano

El laboratorio permite registrar retroalimentacion por fila exacta:

- audio
- tramo
- modelo
- prediccion
- score
- threshold
- tipo de feedback
- notas
- estado

Tipos principales:

- `confirmed_positive`
- `false_positive`
- `false_negative`
- `sent_to_review`
- `hard_negative`
- `excluded_from_training`

### Excluir voz humana

Para voz humana se usa:

- `feedback_type: excluded_from_training`
- `exclusion_reason: voz_humana`
- `label_type: human_voice`
- `recommended_training_use: exclude_species_training`

En modelos cerrados de especie, voz humana no debe marcarse automaticamente como hard negative.

### Recortes WAV trazables

Los recortes se guardan como WAV fisico en:

`acusticafauna-General/acusticafauna-Back/backend/storage/audio_lab/clips/`

Cada recorte mantiene trazabilidad:

- audio original
- inicio
- fin
- duracion
- ruta de salida
- proposito
- notas

### Upload multiple

Los uploads multiples se guardan en:

`acusticafauna-General/acusticafauna-Back/backend/storage/audio_lab/uploads/`

La cola visual de uploads esta separada de rutas manuales y audios seleccionados desde tablas.

### Analisis por lote

Permite analizar varios audios secuencialmente con un modelo seleccionado. Los resultados se agrupan por `audio_path` y no se mezclan en la tabla activa.

### Auditoria de retroalimentacion

La pagina `/auditoria-retroalimentacion` permite:

- Ver resumen de feedback acumulado.
- Filtrar por modelo, tipo, razon, estado, fecha y audio.
- Detectar conflictos.
- Preparar manifests limpios usando un manifest base completo.
- Lanzar jobs de entrenamiento desde la web.

### Manifests limpios

El flujo de manifest limpio aplica feedback sobre un manifest base completo. No modifica audios ni `dataset_curado`. Genera un manifest versionado en el espacio de ML.

### Jobs de entrenamiento web

La web permite iniciar jobs asincronos mediante la ML API. El navegador no entrena y el backend principal no importa OpenSoundscape.

## Funcionalidades experimentales

- Modelos especializados por especie.
- Entrenamiento desde la web.
- Calibracion de thresholds por modelo.
- Reglas de decision personalizadas en `model_card.json`.
- Registro de modelos nuevos desde jobs.

## Reglas de seguridad del proyecto

No hacer:

- No modificar audios originales.
- No borrar audios.
- No modificar `dataset_curado` directamente.
- No entrenar automaticamente sin dry-run.
- No usar el modelo Boana como detector general de rana/sapo.
- No importar OpenSoundscape en el backend principal.
- No registrar un modelo nuevo como util sin evaluarlo y compararlo.

