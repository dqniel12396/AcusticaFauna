# Guia tecnica ML AcusticaFauna

Ultima actualizacion: 2026-05-16

Este documento es la guia tecnica principal de ML del proyecto AcusticaFauna. Debe mantenerse vivo: cada cambio relevante en modelos, datasets, thresholds, reglas de decision, auditoria, entrenamiento web o feedback debe reflejarse aqui.

## 1. Proposito de la ML en AcusticaFauna

La ML en AcusticaFauna no busca solamente entrenar modelos. El objetivo real es construir un ciclo de mejora con auditoria humana, trazabilidad y control de calidad.

El flujo completo se divide en seis partes:

1. Detector general rana/sapo.
2. Clasificadores especializados.
3. Auditoria humana.
4. Manifests limpios.
5. Entrenamiento controlado.
6. Evaluacion y registro de modelos.
7. Segmentacion de audio largo por actividad acustica.

La idea central es que cada modelo produce evidencia, la revision humana corrige errores, los manifests limpios acumulan esas correcciones, y solo despues se entrena o registra un modelo nuevo.

Esto evita entrenar a ciegas y reduce el riesgo de meter voz humana, ruido, etiquetas incorrectas o segmentos debiles dentro de datasets de especie.

## 2. Arquitectura general

Diagrama simplificado:

```text
Frontend React/Vite
        |
        v
Backend principal FastAPI
        |
        v
ML API en acusticafauna-ML
        |
        v
Scripts de entrenamiento OpenSoundscape
        |
        v
Modelos registrados en models/
```

Responsabilidades:

- El frontend permite revisar, analizar, dar feedback, crear recortes, construir manifests limpios y lanzar jobs.
- El backend principal guarda anotaciones, recortes, uploads y puede actuar como proxy.
- La ML API lista modelos, predice, genera espectrogramas y ejecuta jobs asincronos.
- Los scripts de `acusticafauna-ML` entrenan y evaluan con OpenSoundscape.
- Los modelos registrados quedan disponibles para la ML API y el Laboratorio de audio.

Reglas arquitectonicas:

- El backend principal no importa OpenSoundscape.
- El entrenamiento corre en `acusticafauna-ML`.
- La web orquesta, pero no entrena directamente.
- Los audios originales no se modifican.
- `dataset_curado` no se modifica directamente desde los flujos de revision.
- El entrenamiento no arranca automaticamente: siempre debe haber dry-run primero.

## Rutas de audio permitidas y portabilidad

Todo audio reproducible debe servirse por backend. El frontend no debe usar rutas locales crudas como `F:\...`, `C:\...` o `/mnt/...` como `src` de un reproductor.

El backend resuelve audios con `resolve_allowed_audio_path(input_path, allowed_roots)`. Las raices permitidas vienen de configuracion local:

- `ACUSTICAFAUNA_DATASET_DIR`
- `ACUSTICAFAUNA_STORAGE_DIR`
- uploads, clips, procesados y cache dentro de `storage/audio_lab`
- `sample_data`
- extras en `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS`
- compatibilidad legacy con `ACUSTICAFAUNA_ALLOWED_MEDIA_ROOTS`

Si un registro conserva una ruta absoluta vieja de otro PC, el backend puede intentar resolver por nombre o ruta relativa dentro del dataset/storage actual en runtime. Si la ruta contiene `dataset_curado`, intenta reconstruirla bajo `ACUSTICAFAUNA_DATASET_DIR`. Esa recuperacion no modifica la base de datos automaticamente.

Batch processing puede recibir `job_allowed_roots` para autorizar la carpeta padre de un audio elegido por el usuario. Folder-batch usa la carpeta escaneada y validada como root permitido solo para ese job. Ninguna de esas autorizaciones se agrega globalmente a `.env`.

Errores esperados:

- `audio_not_found`: el archivo no existe en este equipo.
- `audio_path_not_allowed`: el archivo existe, pero esta fuera de las carpetas permitidas.
- `audio_decode_error`: el formato no se pudo decodificar o reproducir.

Diagnostico local:

```text
GET  /api/system/paths
POST /api/audio-lab/debug/resolve-audio
```

## Segmentacion de audio largo

El laboratorio incluye el modulo **Segmentar audio / detectar silencios** para trabajar con grabaciones de 10, 30 o 60 minutos sin modificar el archivo original. El backend expone:

```text
POST /api/audio-lab/activity/detect
POST /api/audio-lab/activity/create-clips
```

La deteccion inicial usa energia RMS por ventanas (`energy`) y, cuando conviene limitar el rango acustico, energia aproximada en banda (`band_energy`). El resultado es una lista ordenada de segmentos con `start_seconds`, `end_seconds`, `peak_db`, `mean_db` y `score`. Cada ejecucion se audita en:

- `audio_lab_activity_runs`
- `audio_lab_activity_segments`

Reglas del modulo:

- El audio original no se modifica ni se borra.
- Los segmentos sugeridos son metadatos, no nuevos audios.
- Los clips WAV se crean solo cuando el usuario selecciona segmentos y confirma.
- Los clips quedan en `backend/storage/audio_lab/clips/` y se registran en `audio_lab_clips`.
- Ningun clip entra automaticamente a entrenamiento ni registra modelos.
- Los clips derivados pueden abrirse en `/laboratorio-audio`, generar espectrograma y analizarse con detector rana/sapo o clasificadores especializados.

Presets de sensibilidad:

- Muy sensible: baja el threshold dB y acepta actividad mas corta.
- Normal: punto de partida para audios de campo razonables.
- Conservador: sube el threshold y exige actividad mas estable para reducir ruido.

## Procesamiento por lote

El laboratorio tambien incluye **Procesamiento por lote** con dos modos:

### Solo limpiar lote existente

Usar cuando los audios ya son clips o recortes cortos. El pipeline no segmenta: crea copias WAV procesadas con bandpass, reduccion de ruido y/o normalizacion.

Salida:

```text
backend/storage/audio_lab/batch_jobs/{job_id}/processed/
```

Cada archivo limpio conserva metadata JSON con ruta fuente, parametros DSP y fecha. El audio limpio no entra automaticamente a entrenamiento.

### Procesamiento completo automatico

Usar para audios crudos o largos. El pipeline:

1. Detecta actividad.
2. Crea segmentos WAV.
3. Descarta segmentos vacios o debiles.
4. Procesa copias limpias.
5. Opcionalmente llama al detector general rana/sapo.
6. Clasifica la salida como `probable_rana`, `no_rana`, `revisar` o `error`.

Los jobs se registran en:

- `audio_lab_batch_jobs`
- `audio_lab_batch_items`
- `audio_lab_batch_outputs`

Reglas:

- Nunca modificar ni borrar audios originales.
- No modificar `dataset_curado`.
- No entrenar ni registrar modelos automaticamente.
- Todo output requiere revision humana antes de usarse en manifests de entrenamiento.

## Procesamiento masivo por carpeta local

Para lotes grandes, por ejemplo 70 GB de grabaciones de una especie objetivo, el Laboratorio de audio incluye **Procesamiento masivo por carpeta local**. Este flujo evita subir archivos uno por uno desde el navegador: el usuario pega una ruta local y el backend procesa desde el disco del computador.

Endpoints:

```text
POST /api/audio-lab/folder-batch/scan
POST /api/audio-lab/folder-batch/jobs
GET  /api/audio-lab/folder-batch/jobs
GET  /api/audio-lab/folder-batch/jobs/{job_id}
GET  /api/audio-lab/folder-batch/jobs/{job_id}/logs
POST /api/audio-lab/folder-batch/jobs/{job_id}/pause
POST /api/audio-lab/folder-batch/jobs/{job_id}/resume
POST /api/audio-lab/folder-batch/jobs/{job_id}/cancel
GET  /api/audio-lab/folder-batch/jobs/{job_id}/outputs
GET  /api/audio-lab/folder-batch/jobs/{job_id}/manifest
GET  /api/audio-lab/folder-batch/jobs/{job_id}/summary
```

Tablas:

- `audio_lab_folder_batch_jobs`
- `audio_lab_folder_batch_files`
- `audio_lab_folder_batch_segments`
- `audio_lab_folder_batch_outputs`

El analisis DSP trabaja por ventanas/bloques y calcula:

- RMS total en dBFS.
- RMS en banda objetivo.
- `band_energy_ratio`.
- score de actividad.
- flags heuristicas de contaminantes.

`dBFS` significa nivel relativo del archivo digital. No es dB SPL calibrado.

Reglas de segmentacion:

- Filtrar por banda objetivo, por ejemplo `1800-3000 Hz`.
- Unir eventos cercanos si el silencio es menor que `min_silence_seconds`.
- Agregar padding.
- Descartar eventos demasiado cortos.
- Dividir eventos largos en clips de duracion controlada.

Contaminantes heurísticos marcados como revision, no como verdad definitiva:

- `voz_humana_suspect`
- `carro_motor_suspect`
- `ave_suspect`
- `broadband_noise_suspect`

Salidas:

```text
backend/storage/audio_lab/folder_batch_jobs/{job_id}/
  clips/
  processed/
  summaries/
  manifests/
  logs/
```

El manifest CSV incluye rutas derivadas, ruta original, tiempos, label objetivo, parametros DSP, `band_energy_ratio`, `rms_dbfs`, flags y recomendacion. Los segmentos con contaminantes fuertes, ratio bajo, clipping severo, duracion insuficiente o error de decodificacion deben quedar excluidos/revisar, no incluidos automaticamente como datos limpios.

Reglas:

- Nunca modificar ni borrar audios originales.
- No escribir dentro de la carpeta original por defecto.
- No modificar `dataset_curado`.
- No entrenar automaticamente.
- El job puede correr sin ML API; en ese caso se omite detector rana/sapo y se conserva el procesamiento DSP.

## Reporte de calidad original vs procesado

Para comparar un audio fuente contra una copia procesada, el backend expone:

```text
POST /api/audio-lab/audio-processing/quality-report
```

El reporte calcula:

- duracion y sample rate;
- pico y clipping;
- RMS global en dBFS;
- ruido de fondo aproximado;
- actividad acustica aproximada;
- contraste actividad/fondo;
- energia por bandas;
- score del detector rana/sapo si la ML API esta disponible.

El reporte se guarda en:

```text
backend/storage/audio_lab/quality_reports/
```

Tambien se registra en `audio_lab_quality_reports`. La recomendacion siempre usa `training_use = requires_review`; nunca convierte un audio limpio en dato de entrenamiento automaticamente.

## 3. Componentes ML actuales

### 3.1 Detector rana/sapo

Modelo:

```text
frog_detector_v1_binary_v3_hardneg
```

Funcion:

Detectar presencia probable de rana/sapo.

No hace:

- No identifica especie.
- No diferencia `Boana_boans` vs `Boana_pugnax`.
- No reemplaza clasificadores especializados.

Threshold actual:

```text
0.30
```

Metricas conocidas aproximadas:

| Metrica | Valor aproximado |
| --- | ---: |
| accuracy | 0.85 |
| balanced_accuracy | 0.84 |
| precision rana_sapo | 0.89 |
| recall rana_sapo | 0.88 |

Este modelo es la primera puerta. Se usa antes de clasificadores especializados para filtrar audio que probablemente no contiene rana/sapo. Tambien ayuda a construir datasets de mayor calidad, porque permite descartar segmentos debiles, ruido o audios sin vocalizacion objetivo.

### 3.2 Clasificador especializado Boana

Modelo:

```text
boana_boans_pugnax_v3_quality045
```

Clases:

- `Boana_boans`
- `Boana_pugnax`

Funcion:

Diferenciar unicamente estas dos clases.

Regla calibrada:

```text
score_Boana_pugnax >= 0.03 => Boana_pugnax
score_Boana_pugnax < 0.03  => Boana_boans
```

Este modelo no debe usarse como detector general. Si se le pasa voz humana, ruido o una especie fuera del problema, el modelo igual forzara una salida entre `Boana_boans` y `Boana_pugnax`, porque no tiene clase background ni clase `no_boana`.

Por eso, en la web se recomienda usar primero el detector rana/sapo o hacer auditoria humana antes de confiar en una prediccion especializada.

## 4. Por que el argmax no fue suficiente

En el clasificador Boana se encontro un caso importante: el argmax normal no era la mejor regla de decision.

El argmax toma la clase con mayor score. En teoria parece razonable, pero algunos modelos producen scores no calibrados como probabilidades. En esos casos, la clase correcta puede separarse mejor con un threshold especifico sobre un score particular.

Caso real:

Una version del modelo Boana con argmax normal tuvo:

| Metrica | Valor aproximado |
| --- | ---: |
| accuracy | 0.607 |
| recall `Boana_boans` | 1.0 |
| recall `Boana_pugnax` | 0.214 |

El modelo favorecia demasiado una clase al usar argmax.

Al calibrar threshold en validacion se encontro:

```text
threshold Boana_pugnax = 0.03
```

Aplicado al test:

| Metrica | Valor aproximado |
| --- | ---: |
| accuracy | 0.9107 |
| balanced_accuracy | 0.9107 |
| precision_pugnax | 0.8966 |
| recall_pugnax | 0.9286 |
| f1_pugnax | 0.9123 |

La conclusion fue que aunque `Boana_boans` pudiera tener score mayor en algunos casos, `score_Boana_pugnax` separaba bien `Boana_pugnax` si se usaba un threshold bajo.

Por eso la UI muestra siempre:

- `predicted_label`
- `raw_argmax_label`
- `decision_rule_applied`
- score usado
- threshold
- confianza operacional

Si `predicted_label` y `raw_argmax_label` difieren, el caso debe revisarse con mas cuidado.

### 4.1 Calibracion automatica antes de registrar

Para clasificadores especializados binarios entrenados como `multiclass`, la regla de registro es:

```text
evaluar -> calibrar threshold -> registrar modelo
```

La ML API expone:

```text
POST /training/jobs/{job_id}/calibrate-threshold
```

Body recomendado para Boana:

```json
{
  "positive_class": "Boana_pugnax",
  "score_column": "score_Boana_pugnax",
  "metric": "balanced_accuracy",
  "threshold_min": 0.01,
  "threshold_max": 0.99,
  "threshold_step": 0.01
}
```

El endpoint evalua `val_manifest.csv`, prueba thresholds de 0.01 a 0.99, elige el que maximiza `balanced_accuracy` y usa F1 de la clase positiva como desempate. Luego aplica esa regla sobre `test_manifest.csv`.

Artefactos generados en el output del job:

- `calibration_report.csv`
- `calibration_summary.json`
- `test_calibrated_metrics.json`
- `test_calibrated_predictions.csv`

Al registrar un modelo, si existe `calibration_summary.json`, el `model_card.json` incluye `decision_rule`, `calibrated_metrics`, `raw_argmax_metrics` y `uses_calibrated_decision_rule: true`.

Si no existe calibracion, la web obliga a una confirmacion explicita antes de registrar un modelo especializado binario con argmax crudo.

## 5. Como interpretar scores y thresholds

Para `boana_boans_pugnax_v3_quality045`, la regla operativa actual es:

| Caso | Interpretacion |
| --- | --- |
| `score_Boana_pugnax < 0.03` | `Boana_boans` |
| `score_Boana_pugnax >= 0.03` y `< 0.05` | `Boana_pugnax` con baja confianza; revisar |
| `score_Boana_pugnax >= 0.05` | `Boana_pugnax` con mejor confianza operacional |

Un threshold bajo no significa necesariamente que el modelo sea malo. Significa que los scores no estan calibrados como probabilidades humanas intuitivas, pero pueden servir para separar clases.

Ejemplo:

```text
score_Boana_pugnax = 0.035
threshold = 0.03
predicted_label = Boana_pugnax
raw_argmax_label = Boana_boans
decision_rule_applied = true
```

Este caso es valido segun la regla calibrada, pero debe mostrarse como baja confianza porque esta cerca del umbral.

## 6. Evolucion de experimentos Boana

| Experimento | Datos | Resultado | Problema | Conclusion |
| --- | --- | --- | --- | --- |
| `boana_boans_pugnax_v1` | balanceado inicial | accuracy aprox 0.516 | sesgo hacia `Boana_pugnax`; recall `Boana_boans` muy bajo | balancear no resolvio el problema |
| quality score `>= 0.60` | 129/129 | accuracy aprox 0.55 | muy pocos datos; resultado inestable | el filtro fue demasiado estricto |
| quality score `>= 0.45` | 199/199 | argmax accuracy aprox 0.607 | sesgo por argmax | habia mas datos, pero faltaba calibracion |
| quality045 + threshold calibrado `0.03` | 199/199 | balanced_accuracy aprox 0.91 | depende de regla calibrada | el modelo sirve solo con decision rule |

Aprendizajes:

- Umbral `min_frog_score = 0.60` filtro demasiado.
- Umbral `min_frog_score = 0.45` conservo mas datos utiles.
- El balance de clases no garantiza buen modelo.
- La calibracion puede cambiar radicalmente el resultado.
- Un test pequeno debe interpretarse con cuidado.
- La regla calibrada debe documentarse en `model_card.json` y mostrarse en la UI.

## 7. Dataset, manifests y retroalimentacion

Un manifest es un CSV que define que audios o segmentos entran a entrenamiento, con columnas como ruta de audio, label, split y metadatos.

Un manifest base contiene muchos audios. La retroalimentacion acumulada no es un dataset completo: es una capa de correcciones, exclusiones y decisiones humanas que se aplica sobre un manifest base.

### 7.1 Creacion de manifest limpio desde la web

En `/auditoria-retroalimentacion`, la accion **Crear manifest limpio versionado** ahora muestra progreso visual aunque la operacion sea sincronica en la ML API.

Fases mostradas:

- Validando manifest base
- Cargando retroalimentacion
- Aplicando exclusiones
- Verificando minimos
- Escribiendo CSV limpio
- Guardando resumen
- Completado

La respuesta de la ML API incluye:

```json
{
  "status": "completed",
  "progress": 100,
  "steps": []
}
```

La UI deshabilita el boton mientras se crea el CSV para evitar doble clic. Si el destino ya existe, pide una decision explicita:

- Sobrescribir
- Crear con sufijo nuevo
- Cancelar

El backend tambien bloquea creaciones concurrentes sobre el mismo `output_csv` y responde con error si ya hay una creacion en progreso.

### 7.2 Copia y descarga de resultados de jobs

El panel de job activo en `/auditoria-retroalimentacion` separa los resultados en cuatro bloques:

- A. Configuracion y dataset del entrenamiento.
- B. Resultado de evaluacion.
- C. Resultado de calibracion.
- D. Logs.

Cada bloque ofrece acciones de copia y descarga segun disponibilidad. Esto permite copiar JSON completo, generar resumen Markdown para documentacion o chat, descargar `training_metrics.json`, `metrics.json`, `calibration_summary.json`, `calibration_report.csv` y `train.log`.

Si solo existe entrenamiento, la UI avisa que esas metricas no representan rendimiento final y recomienda ejecutar **Evaluar**. Si existe evaluacion pero falta calibracion en un clasificador especializado binario, la UI advierte que puede requerir calibracion de threshold antes de registrarse.

## 8. Explorador ML

La pagina `/explorador-ml` reemplaza los scripts manuales de exploracion de manifests para preparar nuevos modelos especializados desde la web.

Flujo operativo:

1. Seleccionar un manifest base disponible en `acusticafauna-ML/manifests`, por ejemplo `amphibian_species_v2_aliases_top_manifest.csv`.
2. Revisar resumen: filas, columnas, clases, duracion total, splits, archivos faltantes, conteo por `normalized_label` y conteo por split/clase.
3. Presionar **Buscar candidatos entrenables** para agrupar por genero inferido.
4. Revisar especies del grupo, conteos `train/val/test`, minimos y recomendacion: `binario`, `multiclase`, `insuficiente` o `necesita_mas_datos`.
5. Seleccionar clases, nombre del manifest y reglas de limpieza.
6. Ejecutar dry-run antes de crear el CSV.
7. Crear el manifest especializado solo si el dry-run es apto.
8. Usar **Usar este manifest para entrenar** para abrir `/auditoria-retroalimentacion` con el manifest ya preseleccionado.

Endpoints ML API:

```text
GET /training/manifest-summary?manifest_csv=...
GET /training/manifest-candidates?manifest_csv=...
POST /training/specialized-manifest/dry-run
POST /training/specialized-manifest
```

Los minimos recomendados para candidatos binarios y multiclase son:

```text
train >= 50 por clase
val   >= 10 por clase
test  >= 10 por clase
```

Para clasificadores especializados de dos especies, el manifest se prepara como problema cerrado de dos clases, pero el `target_mode` de entrenamiento sigue siendo `multiclass` para mantener compatibilidad con calibracion posterior de threshold sobre scores por clase.

La creacion no entrena automaticamente, no modifica audios, no modifica `dataset_curado` y no borra manifests anteriores. Si el destino ya existe, la UI permite crear con sufijo nuevo.

## 9. Administracion de modelos ML

Los modelos registrados tienen metadata de registry en `model_card.json`:

- `registry_status`: `active`, `experimental`, `archived` o `rejected`.
- `task`: `frog_detector`, `boana_boans_pugnax`, `amphibian_genus` o `amphibian_species`.
- `is_default_for_task`: indica el modelo recomendado por defecto para esa tarea.
- `parent_model_id`, `training_job_id`, `registered_at`, `promoted_at`, `archived_at`, `notes`.
- `comparison_against_active`: comparacion contra el modelo activo al momento de registrar.

Estado actual recomendado:

| Modelo | Task | Estado | Default | Decision |
| --- | --- | --- | --- | --- |
| `frog_detector_v1_binary_v3_hardneg` | `frog_detector` | active | true | detector general por defecto |
| `boana_boans_pugnax_v3_quality045` | `boana_boans_pugnax` | active | true | mantener activo; balanced_accuracy calibrado aprox 0.91 |
| `boana_boans_pugnax_v4_feedback` | `boana_boans_pugnax` | experimental | false | calibrado, pero no supera v3; test balanced_accuracy calibrado 0.817 |

Endpoints administrativos:

```text
GET /models/registry
POST /models/{model_id}/promote
POST /models/{model_id}/archive
POST /models/{model_id}/reject
PATCH /models/{model_id}/notes
```

Promover un modelo lo marca `active` y `is_default_for_task: true` para su tarea. El activo anterior deja de ser default y queda archivado si estaba activo. No se borran modelos ni audios.

En `/laboratorio-audio`, los modelos archivados o descartados no aparecen en los selectores. Los experimentales se ocultan por defecto y se muestran con el toggle **Mostrar modelos experimentales**. Si se elige uno, la UI advierte que no es el activo recomendado.

La pagina **Modelos ML** separa cada tarea por estado: activo/default, experimentales, archivados y rechazados. Cada tarjeta muestra `model_id`, `registry_status`, `task`, `is_default_for_task`, `balanced_accuracy`, `threshold`, `decision_rule`, `uses_calibrated_decision_rule`, bitacora temporal y notas. El modelo `active` con `is_default_for_task: true` muestra el badge **Activo actual**, el mensaje "Este es el modelo recomendado actualmente para esta tarea." y no ofrece el boton redundante **Promover a activo**. El boton **Abrir en laboratorio** navega con `model_id` para seleccionar ese modelo directamente.

Si un modelo tiene `comparison_against_active.improves_active = false`, la UI pide confirmacion fuerte antes de promoverlo:

```text
Este modelo no supera al activo actual. ¿Seguro que quieres promoverlo?
```

Por eso hay que diferenciar:

### Resumen de retroalimentacion

Puede mostrar:

```text
rows_before = 9
rows_after = 1
```

Eso no sirve para entrenar. Significa que se esta mirando un resumen pequeno de feedback, no un dataset entrenable completo.

### Dry-run correcto sobre manifest base Boana

Un dry-run sano para Boana debe verse cercano a:

```text
rows_before: 398
rows_after: 397
excluded_by_human_voice: 1
excluded_by_retracted: 5
feedback_applied: 2
conflicts_detected: 0
clases:
  Boana_boans: 198
  Boana_pugnax: 199
split:
  train: 282
  val: 60
  test: 55
estado: apto
```

El punto clave es que `rows_before` debe venir del manifest base completo. Si aparece `rows_before 9 / rows_after 1`, no se debe entrenar: eso es solo resumen de feedback.

## 8. Reglas de exclusion

Se excluye de entrenamiento de especies si:

- `feedback_type = excluded_from_training`
- `exclusion_reason = voz_humana`
- `label_type = human_voice`
- `status = retracted`
- hay conflicto bloqueante

Para voz humana, la accion correcta en la web es:

```text
Excluir de entrenamiento -> voz_humana
```

No marcar automaticamente voz humana como hard negative en modelos cerrados Boana, porque el modelo no tiene clase background ni clase `no_boana`.

Hard negative solo debe usarse si el pipeline lo soporta explicitamente. Por ejemplo, un detector binario podria beneficiarse de negativos dificiles, pero un clasificador cerrado `Boana_boans` vs `Boana_pugnax` no tiene donde ubicar voz humana sin contaminar la tarea.

## 9. Que hacer si pasa X

### Si hay muchos falsos positivos con voz humana

Accion:

- Marcar como `Excluir de entrenamiento -> voz_humana`.
- No marcar como confirmado.
- No usar como hard negative en modelo cerrado.
- Revisar si el detector rana/sapo esta dejando pasar voz humana.

Parametros a revisar:

- threshold del detector rana/sapo.
- calidad del dataset background.
- posibilidad de agregar clase background solo en un pipeline disenado para eso.

### Si el modelo confunde `Boana_boans` con `Boana_pugnax`

Accion:

- Revisar matriz de confusion.
- Revisar ejemplos confundidos.
- Exportar errores.
- Calibrar threshold por validacion.
- Probar mas datos de calidad.
- No asumir que balancear resuelve todo.

Parametros:

- threshold de decision.
- `min_frog_score`.
- `epochs`.
- `balance_strategy`.
- `limit_per_class`.
- split estratificado.

### Si el modelo predice casi todo una sola clase

Accion:

- Revisar distribucion train/val/test.
- Revisar argmax vs scores.
- Calibrar threshold.
- Ver si una clase domina acusticamente.
- Revisar etiquetas incorrectas.

### Si subir `min_frog_score` mejora limpieza pero baja resultados

Un threshold alto deja menos datos. Menos datos pueden causar sobreajuste o inestabilidad.

Comparar:

- `0.45`
- `0.50`
- `0.55`
- `0.60`

Regla practica:

- `0.60`: mas estricto, menos datos.
- `0.45`: mas flexible, mas datos.
- Elegir por validacion, no por intuicion.

### Si el test parece demasiado bueno

Accion:

- Revisar tamano del test.
- Ver si hay fuga de datos.
- Ver si audios similares estan en train y test.
- Repetir con otra semilla.
- No registrar como produccion sin validacion adicional.

### Si el dry-run tiene `rows_after` muy bajo

Accion:

- Verificar que se selecciono el manifest base correcto.
- No entrenar con resumen de feedback.
- Revisar exclusiones.
- Revisar filtros.
- Revisar conflictos.

### Si ML API aparece desconectada

Levantar la ML API:

```bash
cd "/f/PROYECTO de cosa de sonido/acusticafauna-ML"
source .venv-ml/Scripts/activate
python -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload
```

Luego usar el boton de reintentar conexion en la web.

## 10. Parametros importantes y cuando tocarlos

| Parametro | Actual/valores | Que controla | Si lo subo | Si lo bajo | Recomendacion |
| --- | --- | --- | --- | --- | --- |
| threshold rana/sapo | `0.30` | sensibilidad del detector general | menos falsos positivos, mas falsos negativos | mas detecciones, mas falsos positivos | calibrar segun objetivo de revision |
| `score_Boana_pugnax` threshold | `0.03` | decision `Boana_boans` vs `Boana_pugnax` | mas dificil predecir `Boana_pugnax` | mas facil predecir `Boana_pugnax` | cambiar solo calibrando con validacion |
| `min_frog_score` | probados `0.45`, `0.60` | calidad minima de audio con senal rana | mas limpio, menos datos | mas datos, mas ruido | `0.45` dio mas datos y mejor resultado tras calibracion |
| `epochs` | depende del preset | tiempo de entrenamiento y ajuste | mas ajuste, riesgo de sobreajuste | menos ajuste, riesgo de subentrenar | revisar curvas y test |
| `batch_size` | `8` suele ser razonable en CPU | memoria y estabilidad | mas memoria, pasos mas grandes | menos memoria, mas lento | bajar si falla memoria |
| `sample_strategy` | `stratified` | distribucion por clase/split | no aplica directo | no aplica directo | usar `stratified` en clasificadores balanceados |
| `balance_strategy` | `min_class` o `none` | igualar clases o dejar distribucion natural | puede quitar datos | conserva distribucion natural | no asumir que balancear mejora siempre |

## 11. Flujo web recomendado paso a paso

### 11.1 Revisar un audio

1. Abrir `/laboratorio-audio`.
2. Seleccionar audio.
3. Generar espectrograma.
4. Analizar con detector rana/sapo.
5. Si aplica, analizar con clasificador especializado.
6. Revisar `predicted_label`, `raw_argmax_label`, score y confianza.
7. Dar feedback.

### 11.2 Marcar voz humana

1. Abrir acciones del resultado.
2. Elegir excluir de entrenamiento.
3. Razon: `voz_humana`.
4. Agregar nota opcional.
5. Guardar.

### 11.3 Crear recorte

1. Seleccionar tramo en waveform.
2. Crear recorte.
3. Revisar nombre sugerido.
4. Crear y abrir en laboratorio.
5. Analizar recorte si hace falta.

El recorte se guarda como WAV fisico y no modifica el audio original.

### 11.4 Analizar varios audios

1. Subir varios audios o seleccionarlos.
2. Elegir modelo:
   - detector rana/sapo para detectar presencia;
   - Boana solo para `Boana_boans` vs `Boana_pugnax`.
3. Analizar lote.
4. Revisar resultados agrupados por audio.

Los resultados de audios distintos nunca deben mezclarse en la tabla activa.

### 11.5 Crear manifest limpio

1. Ir a `/auditoria-retroalimentacion`.
2. Abrir entrenar modelos.
3. Elegir preset.
4. Elegir manifest base.
5. Ejecutar dry-run.
6. Revisar `rows_before`, `rows_after`, clases y conflictos.
7. Crear manifest limpio versionado.

### 11.6 Entrenar desde web

1. Entrenar solo si el dry-run esta apto.
2. Crear manifest limpio.
3. Iniciar entrenamiento.
4. Ver logs.
5. Evaluar.
6. No registrar modelo hasta comparar metricas.

## 12. Como decidir si un modelo nuevo se registra

No registrar un modelo solo porque entreno.

Antes de registrarlo, revisar:

- accuracy.
- balanced_accuracy.
- recall por clase.
- precision por clase.
- matriz de confusion.
- estabilidad con threshold.
- si mejora contra el modelo anterior.
- si respeta reglas de decision.
- si tiene `model_card.json` claro.

Modelo anterior de referencia:

```text
boana_boans_pugnax_v3_quality045
balanced_accuracy calibrado aprox 0.91
```

Si el nuevo modelo no mejora:

- dejarlo como experimento;
- no activarlo por defecto;
- documentar que fallo o que queda pendiente.

## 13. Bitacora viva de decisiones

| Fecha | Cambio | Motivo | Resultado | Metrica antes | Metrica despues | Decision | Proximo paso |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05-13 | Se creo detector rana/sapo con hard negatives | Reducir falsos positivos y filtrar ruido | Detector general funcional | no aplica | balanced_accuracy aprox 0.84 | Usarlo como primera puerta | Seguir agregando negativos dificiles bien curados |
| 2026-05-13 | Se entreno Boana inicial | Probar clasificador `Boana_boans` vs `Boana_pugnax` | Resultado bajo e inestable | no aplica | accuracy aprox 0.516 | No registrar como solucion final | Mejorar datos y revisar confusion |
| 2026-05-13 | Se detecto problema de argmax | El modelo favorecia una clase | Argmax no era suficiente | accuracy aprox 0.607 | recall `Boana_pugnax` bajo | Buscar regla calibrada | Calibrar con validacion |
| 2026-05-13 | Se probo quality `0.60` | Filtrar segmentos con mayor probabilidad rana/sapo | Dataset muy pequeno | no aplica | accuracy aprox 0.55 | Filtro demasiado estricto | Probar umbral menor |
| 2026-05-13 | Se probo quality `0.45` | Conservar mas datos utiles | Dataset 199/199 | quality 0.60 con 129/129 | argmax accuracy aprox 0.607 | Mantener para calibracion | Ajustar threshold |
| 2026-05-13 | Se calibro threshold `0.03` | Separar mejor `Boana_pugnax` | Mejora grande en test | balanced_accuracy baja con argmax | balanced_accuracy aprox 0.91 | Usar decision rule | Documentar en `model_card.json` |
| 2026-05-14 | Se agrego feedback humano | Acumular correcciones sin tocar audios | Feedback por fila exacta | revision manual dispersa | auditoria centralizada | Usar para manifests limpios | Revisar conflictos |
| 2026-05-14 | Se agrego excluir voz humana | Evitar contaminar especies | Voz humana queda fuera de species training | riesgo de hard negative incorrecto | exclusion trazable | Usar `excluded_from_training` | Evaluar backgrounds aparte |
| 2026-05-14 | Se agrego manifest limpio | Aplicar feedback sobre manifest base | Dry-run Boana 398 -> 397 | feedback aislado | dataset apto | Crear version limpia antes de entrenar | Entrenar Boana v4 feedback |
| 2026-05-14 | Se agrego entrenamiento web por jobs | Evitar consola y bloquear UI | Jobs asincronos con logs | entrenamiento manual | orquestacion web | Mantener un job a la vez | Probar flujo completo |

## 14. Reglas para actualizar este documento automaticamente con Codex

Cada vez que Codex haga cambios relacionados con ML, debe actualizar este archivo.

Instruccion permanente:

Si se modifica cualquiera de estos elementos:

- scripts de entrenamiento;
- manifests;
- modelos;
- thresholds;
- reglas de decision;
- flujo de auditoria;
- entrenamiento web;
- evaluacion;
- feedback;
- recortes usados para entrenamiento;

entonces actualizar `docs/GUIA_TECNICA_ML_ACUSTICAFAUNA.md` con:

1. que cambio;
2. por que cambio;
3. como se usa;
4. que metrica o comportamiento mejoro/empeoro;
5. que parametro tocar si falla;
6. proximo paso recomendado.

Tambien actualizar `docs/PENDIENTES.md` si aparece una tarea nueva.

## 15. Glosario

### Audio original

Archivo fuente que no debe modificarse ni borrarse.

### Recorte

Archivo derivado de un tramo de audio. En el laboratorio se guarda como WAV fisico con metadata de trazabilidad.

### Manifest

CSV que define que audios o segmentos entran a entrenamiento, con labels, rutas, split y metadatos.

### Manifest base

Manifest completo sobre el cual se aplican reglas de feedback para generar una version limpia.

### Manifest limpio

Manifest versionado despues de aplicar exclusiones, correcciones y reglas de feedback.

### Feedback

Decision humana sobre un resultado o segmento: confirmar, falso positivo, falso negativo, enviar a revisar, excluir o marcar como hard negative.

### Hard negative

Ejemplo negativo dificil. Solo debe usarse si el pipeline soporta explicitamente ese tipo de dato.

### False positive

Caso donde el modelo predijo presencia o una clase, pero no correspondia.

### False negative

Caso donde el modelo no detecto algo que si estaba presente.

### Threshold

Umbral usado para convertir un score en decision.

### Argmax

Regla que elige la clase con score mas alto.

### Calibrated decision rule

Regla de decision calibrada en validacion. Puede usar un threshold especifico en lugar de argmax.

### Validation

Conjunto usado para ajustar decisiones, thresholds o configuraciones sin tocar el test final.

### Test

Conjunto reservado para estimar rendimiento despues de definir la regla de decision.

### Balanced accuracy

Promedio del recall por clase. Es util cuando hay clases desbalanceadas o sesgos fuertes.

### Recall

Proporcion de ejemplos reales de una clase que el modelo logra detectar como esa clase.

### Precision

Proporcion de predicciones de una clase que realmente pertenecen a esa clase.

### `model_card`

Archivo de metadatos del modelo. Debe documentar clases, tipo, thresholds, decision rules, metricas y uso recomendado.

### Job de entrenamiento

Proceso asincrono lanzado desde la ML API para entrenar, evaluar o registrar modelos sin bloquear la web.
