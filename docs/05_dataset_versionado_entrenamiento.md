# 05 Dataset Versionado para Entrenamiento

## Objetivo

Esta fase crea versiones auditables de datasets entrenables a partir de `dataset_curado`, revisiones humanas y taxonomia.

No entrena modelos, no modifica audios, no mueve archivos y no cambia masivamente `curated_audio_segments.label`.

## Tablas

Se agregan tres tablas:

- `training_dataset_versions`: metadatos de la version, reglas usadas, estado y totales.
- `training_dataset_items`: segmentos incluidos o excluidos, etiqueta normalizada, rol y split.
- `training_dataset_label_stats`: resumen por etiqueta para auditar balance y procedencia.

Estados de version:

- `draft`
- `built`
- `locked`
- `archived`

## Reglas iniciales

El build acepta reglas como:

```json
{
  "version_name": "dataset_v0_1",
  "description": "Primer dataset entrenable desde dataset_curado y taxonomia",
  "include_imported_candidates": true,
  "include_gold": true,
  "include_corrected": true,
  "include_background": true,
  "include_target_negatives": true,
  "exclude_needs_review": true,
  "exclude_uncertain": true,
  "exclude_rejected": true,
  "min_duration_seconds": 0.25,
  "max_duration_seconds": 10.0,
  "min_examples_per_label": 10,
  "max_examples_per_label": null,
  "max_background_examples": null,
  "include_label_types": [],
  "exclude_label_types": [],
  "include_group_names": [],
  "exclude_group_names": [],
  "map_species_to_group": false,
  "target_mode": "custom",
  "balance_strategy": "none",
  "background_ratio": null,
  "split_strategy": "stratified",
  "train_ratio": 0.7,
  "val_ratio": 0.15,
  "test_ratio": 0.15,
  "random_seed": 42
}
```

## Inclusion

Se incluyen, segun configuracion:

- candidatos importados con taxonomia `use_for_training=true` y `needs_review=false`;
- revisiones humanas `accepted`;
- revisiones humanas `corrected`, usando `reviewed_label` como `normalized_label`;
- `otros_ruidos` como `background`;
- `negativo_objetivo` como `negative`, asociado a `negative_for`.

## Exclusion

Se excluyen:

- `label=revisar_etiqueta`;
- `group_type=revisar`;
- `latest_review_status=uncertain`;
- `latest_review_status=rejected`;
- taxonomia `use_for_training=false`;
- taxonomia `needs_review=true`, salvo revisiones humanas `accepted` o `corrected`;
- archivos de audio inexistentes;
- segmentos sin `source_sha256`;
- duraciones fuera de rango;
- etiquetas con menos de `min_examples_per_label`.
- etiquetas por encima de `max_examples_per_label`, si se define;
- background por encima de `max_background_examples`, si se define;
- tipos taxonomicos no incluidos o explicitamente excluidos;
- grupos taxonomicos no incluidos o explicitamente excluidos.

Los items excluidos quedan registrados con `item_role=excluded` y `exclude_reason`.

## Roles

`training_dataset_items.item_role` puede ser:

- `positive`
- `negative`
- `background`
- `excluded`

`confidence_source` puede ser:

- `imported`
- `gold`
- `corrected`
- `negative_target`

## Endpoints

Crear version:

```text
POST /api/training-datasets
```

Construir version:

```text
POST /api/training-datasets/{version_id}/build
```

Listar versiones:

```text
GET /api/training-datasets
```

Consultar version:

```text
GET /api/training-datasets/{version_id}
```

Consultar items:

```text
GET /api/training-datasets/{version_id}/items
```

Consultar stats:

```text
GET /api/training-datasets/{version_id}/stats
```

Consultar auditoria automatica:

```text
GET /api/training-datasets/{version_id}/audit
```

Consultar presets:

```text
GET /api/training-datasets/presets
```

Reasignar splits:

```text
POST /api/training-datasets/{version_id}/splits
```

Exportar manifest CSV:

```text
GET /api/training-datasets/{version_id}/export?format=csv
GET /api/training-datasets/{version_id}/export?format=csv&included_only=true
```

Bloquear o archivar:

```text
POST /api/training-datasets/{version_id}/lock
POST /api/training-datasets/{version_id}/archive
```

## Interfaz web

La administracion visual esta disponible en:

```text
http://localhost:5173/datasets-entrenamiento
```

La pagina permite:

- listar versiones existentes;
- crear una version con reglas de inclusion/exclusion;
- construir el dataset versionado;
- ver stats por rol, split y etiqueta;
- ver auditoria y balance antes de entrenar;
- precargar presets para versiones balanceadas;
- filtrar items por `normalized_label`, `item_role`, `split` y `confidence_source`;
- descargar CSV completo de auditoria o CSV solo incluidos para entrenamiento;
- bloquear o archivar versiones con confirmacion.

La seccion no entrena modelos. Solo prepara versiones auditables que luego podran usarse en una fase de entrenamiento.

## Auditoria y balance

`dataset_v0_1` es una version valida para auditoria, pero no debe asumirse como dataset final de entrenamiento si mezcla especies, grupos generales, codigos pendientes y demasiado background.

El endpoint `/api/training-datasets/{version_id}/audit` reporta advertencias como:

- `otros_ruidos` o background dominante;
- grupos generales mezclados con especies;
- codigos cortos pendientes de confirmar;
- clases con pocos ejemplos;
- clases dominantes frente al resto;
- muchos excluidos por `taxonomia_requiere_revision`;
- muchos `revisar_etiqueta` o pendientes reales.

La seccion web "Auditoria y balance" muestra estas advertencias junto con distribucion por rol, razon de exclusion, tipo taxonomico, grupo, fuente de confianza y labels principales.

Las estadisticas separan labels incluidos y labels excluidos. Esto evita que `revisar_etiqueta`, clases rechazadas o labels descartadas por reglas aparezcan como si fueran clases principales del dataset entrenable.

## Presets recomendados

Los presets no construyen automaticamente. Solo cargan reglas en el formulario para que el usuario las revise:

- `general_detector_v0`: mapea especies anfibias a `rana_sapo`, aves a `ave`, insectos a `insecto`, mantiene `otros_ruidos`, excluye codigos/unknown y usa balance practico con `cap_per_label`, `max_examples_per_label`, `max_background_examples` y `background_ratio`. No baja todo al tamano de la clase mas pequena.
- `general_detector_strict_balanced`: variante extrema que usa `balanced_downsample`; puede dejar datasets muy pequenos si una clase minoritaria tiene pocos ejemplos. Es util para pruebas controladas, no como preset practico por defecto.
- `amphibian_species_v0`: incluye especies de `group_name=anfibio` y `otros_ruidos` como background controlado; excluye grupos, codigos y unknown.
- `audit_gold_only`: usa solo ejemplos con revision humana `accepted` o `corrected`; suele ser pequeno y sirve como conjunto humano de validacion.

No se debe entrenar con una mezcla no revisada de especies, grupos y codigos, porque el modelo aprenderia clases ambiguas y los resultados serian dificiles de interpretar.

Para clasificadores de especies, `amphibian_species_v0` conserva `normalized_label` como especie; no convierte `Boana_boans` o `Allobates_niputidea` en `rana_sapo`. El mapeo a grupo corresponde a detectores generales, no a clasificadores de especie.

`max_examples_per_label=0` es una regla valida y significa excluir todos los ejemplos de cada label incluido. En uso normal se recomienda dejarlo vacio o usar un entero positivo.

## Export CSV

El manifest exportado incluye:

- `dataset_version_id`
- `curated_segment_id`
- `original_label`
- `normalized_label`
- `taxonomy_label`
- `group_name`
- `label_type`
- `item_role`
- `confidence_source`
- `split`
- `duration_seconds`
- `source_path`
- `audio_path`
- `sha256`
- `include_reason`
- `exclude_reason`

Hay dos modos:

- CSV completo de auditoria: incluye filas incluidas y excluidas, util para revisar reglas y razones.
- CSV solo incluidos para entrenamiento: `included_only=true`; contiene solo `item_role != excluded`, con `split` train/val/test y `audio_path` valido.

## Tests

La suite pytest usa SQLite temporal y dataset minimo sintetico.

Ejecutar:

```powershell
cd "F:\PROYECTO de cosa de sonido\acusticafauna-General\acusticafauna-Back\backend"
python -m pytest tests -q
```

La cobertura actual valida:

- build de dataset versionado;
- inclusion de candidatos, background y negativos por objetivo;
- exclusion de pendientes reales;
- uso de `reviewed_label` en correcciones humanas;
- regla `min_examples_per_label`;
- reglas de balance `max_examples_per_label` y `max_background_examples`;
- filtros por `include_label_types`;
- presets `general_detector_v0` y `amphibian_species_v0`;
- endpoint de auditoria;
- export `included_only`;
- export CSV;
- lock/archive;
- endpoints FastAPI del flujo completo.

## Antes de entrenar

Todavia falta:

- revisar taxonomia incompleta;
- confirmar codigos cortos;
- decidir clases finales;
- construir balance por clase;
- definir dataset gold minimo;
- conectar esta version con entrenamiento OpenSoundscape/modelos propios.
