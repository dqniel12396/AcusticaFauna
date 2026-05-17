# AcusticaFauna ML

Modulo experimental y aislado para entrenamiento bioacustico con OpenSoundscape.

Este directorio no forma parte del backend FastAPI ni del frontend React. No modifica audios, no modifica `dataset_curado`, no instala dependencias en el backend y no entrena nada automaticamente.

## Estructura

```text
acusticafauna-ML/
  ml_api/
    main.py
  requirements-ml.txt
  configs/
    frog_detector_v1.yaml
    amphibian_species_v1.yaml
  scripts/
    train_opensoundscape.py
    evaluate_model.py
    predict_manifest.py
    ml_utils.py
  outputs/
  models/
```

## Iniciar API ML de inferencia

El servicio ML corre separado del backend principal. No importes OpenSoundscape desde
`acusticafauna-Back/backend`.

```powershell
cd "F:\PROYECTO de cosa de sonido\acusticafauna-ML"
.\.venv-ml\Scripts\Activate.ps1
python -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload
```

En Git Bash o shells tipo Unix en Windows:

```bash
cd "F:/PROYECTO de cosa de sonido/acusticafauna-ML"
source .venv-ml/Scripts/activate
python -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload
```

Probar salud:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health
Invoke-RestMethod http://127.0.0.1:8010/models
```

Modelo candidato registrado:

- `frog_detector_v1_binary_v3_hardneg`
- `target_mode`: `binary_presence`
- `positive_label`: `rana_sapo`
- threshold operativo recomendado: `0.30`
- path: `models/frog_detector_v1_binary_v3_hardneg/frog_detector_v1_binary_v3_hardneg.model`

Ejemplo de prediccion por ruta local:

```powershell
$body = @{
  audio_path = "F:\ruta\audio.wav"
  model_id = "frog_detector_v1_binary_v3_hardneg"
  target_mode = "binary_presence"
  positive_label = "rana_sapo"
  threshold = 0.30
  clip_duration = 5
  step_seconds = 5
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8010/predict/audio-path `
  -ContentType "application/json" `
  -Body $body
```

`score_rana_sapo` es la probabilidad operacional del detector binario para el
grupo `rana_sapo`. Con threshold `0.30`, segmentos con score mayor o igual a
`0.30` se reportan como deteccion. Este modelo no identifica especie exacta:
la UI y los reportes deben mostrar "Grupo detectado: rana/sapo" y "Especie:
no identificada por este modelo".

### Model cards y reglas de decision

La ML API lee `model_card.json` cuando existe en la carpeta del modelo. Esto
permite registrar clasificadores especializados con reglas calibradas que no
usan argmax simple.

Ejemplo actual:

```text
models/boana_boans_pugnax_v3_quality045/
  boana_boans_pugnax_v3_quality045.model
  label_map.json
  model_card.json
```

Regla del modelo `boana_boans_pugnax_v3_quality045`:

- clases: `Boana_boans`, `Boana_pugnax`
- usar `score_Boana_pugnax`
- si `score_Boana_pugnax >= 0.03`: `Boana_pugnax`
- si `score_Boana_pugnax < 0.03`: `Boana_boans`

La respuesta de `/predict/audio-path` incluye:

- `score_<clase>` para cada clase;
- `raw_argmax_label`;
- `decision_rule_applied`;
- `predicted_label` ya corregido por la regla calibrada.

Espectrograma bajo demanda:

```powershell
$body = @{
  audio_path = "F:\ruta\audio.wav"
  start_seconds = 0
  end_seconds = 5
  max_freq = 12000
} | ConvertTo-Json

Invoke-WebRequest `
  -Method Post `
  -Uri http://127.0.0.1:8010/spectrogram/audio-path `
  -ContentType "application/json" `
  -Body $body `
  -OutFile tmp\spectrogram_test.png
```

## Crear entorno separado

Desde la raiz del proyecto:

```powershell
cd "F:\PROYECTO de cosa de sonido\acusticafauna-ML"
python -m venv .venv-ml
.\.venv-ml\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-ml.txt
```

No instales `requirements-ml.txt` dentro del entorno del backend.

## Compatibilidad pandas/OpenSoundscape

Este modulo fija `opensoundscape==0.12.1` y `pandas>=2.2,<3`. OpenSoundscape 0.12.x puede emitir warnings internos con pandas 2.x y no debe ejecutarse con pandas 3 para este pipeline, porque cambios de pandas como `Series.__getitem__` pueden romper codigo interno de OpenSoundscape.

Si tu entorno quedo con pandas 3 o quieres corregir el entorno manualmente:

```powershell
python -m pip install "pandas>=2.2,<3" --force-reinstall
```

`train_opensoundscape.py` verifica la version al iniciar y muestra un error claro si detecta pandas 3 o superior.

## Manifest esperado

Usa el CSV "solo incluidos para entrenamiento" exportado desde:

```text
GET /api/training-datasets/{version_id}/export?format=csv&included_only=true
```

Columnas requeridas:

- `audio_path`
- `normalized_label`
- `split`
- `item_role`
- `duration_seconds`
- `sha256`

Los scripts filtran `item_role=excluded`, validan que `audio_path` exista y guardan los manifests realmente usados.

## Smoke test sin entrenar

```powershell
python scripts/train_opensoundscape.py `
  --manifest-csv "ruta\amphibian_species_v1_included.csv" `
  --output-dir outputs\smoke_amphibian_species_v1 `
  --model-name amphibian_species_v1 `
  --target-mode multiclass `
  --epochs 1 `
  --batch-size 4 `
  --clip-duration 5 `
  --limit 10 `
  --dry-run
```

`--dry-run` no importa OpenSoundscape ni entrena. Solo valida el CSV, rutas de audio, splits, etiquetas y escribe:

- `label_map.json`
- `metrics.json`
- `train_manifest.csv`
- `val_manifest.csv`
- `test_manifest.csv`
- `opensoundscape_*_labels.csv`

## Smoke test estratificado en CPU

Para pruebas reales en CPU conviene evitar `--limit 10` con el comportamiento por defecto, porque toma las primeras filas y puede dejar pocas clases. Usa `--limit-per-class` y `--sample-strategy stratified`:

```powershell
python scripts/train_opensoundscape.py `
  --manifest-csv "manifests\amphibian_species_v1_manifest_included_only.csv" `
  --output-dir outputs\amphibian_species_v1_tiny `
  --model-name amphibian_species_v1_tiny `
  --target-mode multiclass `
  --epochs 1 `
  --batch-size 4 `
  --clip-duration 5 `
  --limit-per-class 5 `
  --sample-strategy stratified `
  --random-seed 42 `
  --device auto
```

Opciones de muestreo:

- `--sample-strategy head`: conserva el comportamiento anterior; toma filas en orden.
- `--sample-strategy random`: toma una muestra aleatoria global reproducible.
- `--sample-strategy stratified`: intenta mantener varias clases representadas, sin cambiar las etiquetas de split.
- `--limit-per-class N`: toma hasta `N` ejemplos por clase dentro de cada split `train/val/test`. Si una clase tiene menos ejemplos en un split, usa los disponibles.
- `--random-seed`: fija la semilla para reproducibilidad.

`metrics.json` registra `classes_used`, `class_counts`, `split_counts`, `sample_strategy`, `limit_per_class` y `random_seed`.

Equivalente en shells con `\` como continuacion:

```bash
python scripts/train_opensoundscape.py \
  --manifest-csv "manifests/amphibian_species_v1_manifest_included_only.csv" \
  --output-dir outputs/amphibian_species_v1_tiny \
  --model-name amphibian_species_v1_tiny \
  --target-mode multiclass \
  --epochs 1 \
  --batch-size 4 \
  --clip-duration 5 \
  --limit-per-class 5 \
  --sample-strategy stratified \
  --random-seed 42 \
  --device auto
```

## Entrenar detector rana/sapo experimental

No uses `general_detector_v1` de 3 clases todavia si `ave_general` solo tiene 34 ejemplos. Para un primer detector general, crea una version binaria o balanceada razonable con `rana_sapo` y `otros_ruidos`.

```powershell
python scripts/train_opensoundscape.py `
  --manifest-csv "ruta\frog_detector_v1_included.csv" `
  --output-dir outputs\frog_detector_v1 `
  --model-name frog_detector_v1 `
  --target-mode multiclass `
  --epochs 5 `
  --batch-size 16 `
  --clip-duration 5 `
  --device auto
```

## Entrenar detector binario rana/sapo

Si el modo `multiclass` de dos clases colapsa a `otros_ruidos`, usa `binary_presence`. Este modo crea una sola salida `rana_sapo`:

- `normalized_label == rana_sapo` se convierte en `1`
- cualquier otra etiqueta se convierte en `0`
- `opensoundscape_*_labels.csv` tiene una sola columna `rana_sapo`
- OpenSoundscape se configura con `single_target=False` para usar salida tipo multilabel/sigmoid

```bash
python scripts/train_opensoundscape.py \
  --manifest-csv "manifests/frog_detector_v1_manifest_included_only.csv" \
  --output-dir outputs/frog_detector_v1_binary_tiny \
  --model-name frog_detector_v1_binary_tiny \
  --target-mode binary_presence \
  --positive-label rana_sapo \
  --epochs 3 \
  --batch-size 8 \
  --clip-duration 5 \
  --limit-per-class 100 \
  --sample-strategy stratified \
  --random-seed 42 \
  --device auto
```

Evaluacion binaria:

```bash
python scripts/evaluate_model.py \
  --model-path outputs/frog_detector_v1_binary_tiny/frog_detector_v1_binary_tiny.model \
  --manifest-csv outputs/frog_detector_v1_binary_tiny/test_manifest.csv \
  --output-dir outputs/frog_detector_v1_binary_tiny_eval \
  --target-mode binary_presence \
  --positive-label rana_sapo
```

La evaluacion binaria guarda `threshold_report.csv` con thresholds de 0.05 a 0.95 y reporta `precision`, `recall`, `f1`, `tp`, `fp`, `tn` y `fn`.

Para calibrar el umbral en validacion y aplicarlo despues al test:

```bash
python scripts/evaluate_model.py \
  --model-path outputs/frog_detector_v1_binary_v2/frog_detector_v1_binary_v2.model \
  --manifest-csv outputs/frog_detector_v1_binary_v2/test_manifest.csv \
  --calibration-manifest-csv outputs/frog_detector_v1_binary_v2/val_manifest.csv \
  --output-dir outputs/frog_detector_v1_binary_v2_eval \
  --target-mode binary_presence \
  --positive-label rana_sapo
```

Con `--calibration-manifest-csv`, el script:

- predice sobre validacion;
- guarda `validation_scores.csv`;
- guarda `validation_threshold_report.csv`;
- elige `best_threshold_by_f1` en validacion;
- aplica ese umbral al test;
- guarda `test_threshold_applied_metrics.json`.

## Hard negative mining

Los falsos positivos son audios negativos que el modelo marca como `rana_sapo`. Si una revision humana confirma que son ruidos reales y no ranas/sapos, son `hard negatives`: ejemplos especialmente utiles para reducir falsos positivos en el siguiente entrenamiento.

No se debe volver a evaluar de forma final en el mismo test del que salieron esos hard negatives, porque al agregarlos al entrenamiento dejan de ser una prueba independiente. Usalos para entrenar una version nueva y evalua en otro test o en una particion futura no vista.

Extraer falsos positivos desde una evaluacion calibrada:

```bash
python scripts/extract_hard_negatives.py \
  --eval-dir outputs/frog_detector_v1_binary_v2_eval_calibrated \
  --output-csv manifests/frog_detector_v1_hard_negatives.csv \
  --positive-label rana_sapo \
  --threshold 0.55
```

Crear manifest de reentrenamiento con hard negatives confirmados:

```bash
python scripts/build_hard_negative_manifest.py \
  --base-manifest-csv manifests/frog_detector_v1_manifest_included_only.csv \
  --hard-negatives-csv manifests/frog_detector_v1_hard_negatives.csv \
  --output-csv manifests/frog_detector_v1_binary_v3_hardneg_manifest.csv \
  --positive-label rana_sapo \
  --negative-label otros_ruidos \
  --hard-negative-weight 2 \
  --exclude-from-test true
```

El script no mueve ni modifica audios. Los hard negatives entran como referencias nuevas en `split=train`. Si `hard-negative-weight > 1`, se hace oversampling duplicando filas de train; `sample_weight` queda como metadato, pero OpenSoundscape 0.12.x no lo usa en este pipeline.

Entrenar v3 con hard negatives:

```bash
python scripts/train_opensoundscape.py \
  --manifest-csv manifests/frog_detector_v1_binary_v3_hardneg_manifest.csv \
  --output-dir outputs/frog_detector_v1_binary_v3_hardneg \
  --model-name frog_detector_v1_binary_v3_hardneg \
  --target-mode binary_presence \
  --positive-label rana_sapo \
  --epochs 10 \
  --batch-size 8 \
  --clip-duration 5 \
  --limit-per-class 700 \
  --sample-strategy stratified \
  --random-seed 43 \
  --device auto
```

Resumir un reporte de thresholds:

```bash
python scripts/summarize_thresholds.py \
  --threshold-report-csv outputs/frog_detector_v1_binary_v2_eval_calibrated/threshold_report.csv
```

El resumen destaca:

- mejor F1;
- threshold con `recall >= 0.90` y menor FP;
- threshold con `precision >= 0.75`, si existe.

## Entrenar clasificador de especies anfibias

`amphibian_species_v1` es la candidata actual mas razonable para un experimento:

- 3847 items
- 26 labels
- especies anfibias conservadas como `normalized_label`
- `otros_ruidos` como background controlado

```powershell
python scripts/train_opensoundscape.py `
  --manifest-csv "ruta\amphibian_species_v1_included.csv" `
  --output-dir outputs\amphibian_species_v1 `
  --model-name amphibian_species_v1 `
  --target-mode multiclass `
  --epochs 5 `
  --batch-size 16 `
  --clip-duration 5 `
  --device auto
```

## Evaluar

```powershell
python scripts/evaluate_model.py `
  --model-path outputs\amphibian_species_v1\amphibian_species_v1.model `
  --manifest-csv outputs\amphibian_species_v1\test_manifest.csv `
  --output-dir outputs\amphibian_species_v1_eval
```

Guarda:

- `test_manifest.csv`
- `test_scores.csv`
- `metrics.json`

Las metricas incluyen accuracy, precision/recall/F1 por clase y matriz de confusion cuando aplica.

## Predecir sobre un manifest

```powershell
python scripts/predict_manifest.py `
  --model-path outputs\amphibian_species_v1\amphibian_species_v1.model `
  --manifest-csv "ruta\nuevos_audios_included.csv" `
  --output-dir outputs\amphibian_species_v1_predictions
```

Guarda `predictions.csv` con:

- `audio_path`
- `true_label` si existe
- `predicted_label`
- `confidence`
- columnas `score_<clase>`

## Mejora de modelos de especie con filtrado por detector rana/sapo

Los experimentos de especie/genero pueden fallar aunque el dataset parezca
balanceado, porque muchos segmentos etiquetados como especie no contienen una
vocalizacion util, contienen ruido, silencio parcial o energia de otra fuente.
Antes de seguir entrenando especies a ciegas, puntua cada segmento con el
detector binario `frog_detector_v1_binary_v3_hardneg` y construye un manifest
de mayor calidad usando solo clips con alta probabilidad de contener rana/sapo.

Este flujo no modifica audios, no escribe en `dataset_curado`, no borra modelos
y no entrena automaticamente.

### 1. Puntuar un manifest con el detector rana/sapo

```bash
python scripts/score_manifest_with_frog_detector.py \
  --manifest-csv manifests/boana_boans_pugnax_v1_manifest.csv \
  --model-path models/frog_detector_v1_binary_v3_hardneg/frog_detector_v1_binary_v3_hardneg.model \
  --output-csv manifests/boana_boans_pugnax_v1_scored_by_frog_detector.csv \
  --target-mode binary_presence \
  --positive-label rana_sapo \
  --clip-duration 5 \
  --threshold 0.30
```

El CSV conserva las columnas originales y agrega:

- `score_rana_sapo`
- `predicted_rana_sapo`
- `frog_detector_model`
- `frog_detector_threshold`
- `frog_detector_clip_duration`
- `scoring_error`

`score_rana_sapo` se interpreta como probabilidad operacional del detector
binario. Para filtrar entrenamiento de especies conviene empezar con un umbral
mas estricto que el umbral operativo de deteccion, por ejemplo `0.60`.

### 2. Construir un manifest de calidad

```bash
python scripts/build_quality_species_manifest.py \
  --input-csv manifests/boana_boans_pugnax_v1_scored_by_frog_detector.csv \
  --output-csv manifests/boana_boans_pugnax_v2_quality_manifest.csv \
  --min-frog-score 0.60 \
  --min-duration 1.0 \
  --balance-strategy min_class
```

El script conserva splits, rutas y trazabilidad. Descarta:

- filas con `scoring_error`;
- segmentos con `score_rana_sapo < min_frog_score`;
- segmentos muy cortos;
- labels de ruido/grupo/revision por defecto;
- filas no positivas si `item_role` esta disponible.

Junto al CSV crea `*.summary.json` con filas antes/despues, conteos por clase y
descartes por score, error y duracion. Opciones utiles:

```bash
python scripts/build_quality_species_manifest.py \
  --input-csv manifests/amphibian_species_v2_aliases_top_scored.csv \
  --output-csv manifests/amphibian_species_v2_aliases_top_quality.csv \
  --min-frog-score 0.60 \
  --min-duration 1.0 \
  --max-per-class 200 \
  --balance-strategy none \
  --exclude-labels Pristimantis
```

### 3. Entrenar manualmente solo si los conteos tienen sentido

No ejecutes este paso automaticamente. Primero revisa el `*.summary.json`.

```bash
python scripts/train_opensoundscape.py \
  --manifest-csv manifests/boana_boans_pugnax_v2_quality_manifest.csv \
  --output-dir outputs/boana_boans_pugnax_v2_quality \
  --model-name boana_boans_pugnax_v2_quality \
  --target-mode multiclass \
  --epochs 15 \
  --batch-size 8 \
  --clip-duration 5 \
  --sample-strategy stratified \
  --random-seed 50 \
  --device auto
```

### 4. Exportar ejemplos de confusion para auditoria

Despues de evaluar un modelo, exporta los errores principales para escuchar y
revisar datos:

```bash
python scripts/export_confusion_examples.py \
  --eval-dir outputs/boana_boans_pugnax_v1_eval \
  --output-csv outputs/boana_boans_pugnax_v1_eval/confusion_examples.csv \
  --top-n 200
```

El CSV incluye:

- `true_label`
- `predicted_label`
- `confidence`
- `scores` como JSON compacto;
- `audio_path`
- `source_path`
- `duration_seconds`
- `sha256`
- `error_type`

Usa estos ejemplos para detectar clases mezcladas, segmentos sin llamada,
segmentos demasiado cortos, duplicados o etiquetas sospechosas antes de volver
a entrenar.

## Notas sobre OpenSoundscape

El pipeline prepara dataframes one-hot con rutas de audio como indice y clases como columnas, que es el formato usado por `opensoundscape.ml.cnn.CNN.train()`.

Para `target-mode=multiclass`, el script crea `CNN(..., single_target=True)`. Para `target-mode=multilabel` y `target-mode=binary_presence`, usa `single_target=False`.

`target-mode=one-vs-rest` queda documentado, pero no implementa todavia multiples entrenamientos binarios por clase.

La API de OpenSoundscape puede variar entre versiones. Si la version instalada cambia argumentos como `device`, `split_files_into_clips` o el acceso al `sample_rate` del preprocesador, los scripts intentan fallbacks defensivos y dejan notas en `metrics.json`.

## Reglas de seguridad

- No entrenar automaticamente al iniciar backend o frontend.
- No agregar OpenSoundscape a `acusticafauna-Back/backend/requirements.txt`.
- No borrar ni mover audios.
- No escribir dentro de `dataset_curado`.
- Usar `outputs/` para resultados experimentales.
- Guardar modelos entrenados en `outputs/<model-name>/` o mover manualmente a `models/` cuando esten validados.

## Antes de usar resultados cientificamente

- Auditar taxonomia y clases minoritarias.
- Revisar matriz de confusion.
- Revisar errores principales por especie.
- Separar validacion temporal/espacial si hay varias Raspberry Pi o sitios.
- No interpretar predicciones como observaciones biologicas sin estimar falsos positivos y falsos negativos.
