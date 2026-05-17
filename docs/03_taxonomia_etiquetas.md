# 03 Taxonomia de Etiquetas

## Objetivo

La taxonomia de AcusticaFauna ordena las etiquetas importadas desde `dataset_curado` sin modificar los audios ni reescribir masivamente `curated_audio_segments.label`.

Sirve para separar cuatro conceptos:

- `label`: identificador interno estable, por ejemplo `Boana_boans`, `LEPFUS` u `otros_ruidos`.
- `display_name`: nombre visible para la interfaz, por ejemplo `Boana boans`.
- `scientific_name`: nombre cientifico cuando aplica, por ejemplo `Boana boans`.
- `aliases`: nombres alternativos, codigos cortos o formas historicas del mismo concepto.

## Por que es necesaria

El dataset curado mezcla especies, grupos generales, codigos, ruidos y pendientes:

- especies: `Boana_boans`, `Allobates_niputidea`;
- grupos: `rana_sapo`, `ave_general`;
- codigos: `LEPFUS`, `LEPINS`, `BOAPLA`, `RHIHOR`;
- ruido: `otros_ruidos`;
- pendientes: `revisar_etiqueta`.

Antes de entrenar modelos conviene revisar esta capa para decidir que etiquetas son entrenables, cuales son alias y cuales requieren auditoria.

## Campos principales

La tabla `label_taxonomy` incluye:

- `label`
- `display_name`
- `scientific_name`
- `common_name`
- `group_name`
- `family`
- `genus`
- `species`
- `label_type`
- `parent_label`
- `aliases`
- `code`
- `is_active`
- `use_for_training`
- `needs_review`
- `notes`

`label_type` puede ser `species`, `group`, `noise`, `human_activity`, `unknown`, `code` o `negative`.

## Codigos y alias

Los codigos cortos se mantienen como `label` original y se pueden mapear a una etiqueta padre o especie normalizada.

Mapeos iniciales editables:

- `LEPFUS` -> `Leptodactylus_fuscus`
- `LEPINS` -> `Leptodactylus_insularum`
- `BOAPLA` -> `Boana_platanera`
- `RHIHOR` -> `Rhinella_horribilis`

Estos mapeos estan en:

```text
app/data/initial_taxonomy_aliases.json
```

Se marcan con `needs_review=true` para que una persona los confirme antes de usarlos como especie normalizada.

## Uso para entrenamiento

`use_for_training` indica si una etiqueta puede entrar al armado futuro de datasets entrenables.

Reglas recomendadas:

- especies confiables: `use_for_training=true`;
- grupos generales utiles: `use_for_training=true` si se entrenara una clase general;
- ruido/background: `use_for_training=true` si se usara como clase negativa o ruido;
- `revisar_etiqueta`: `use_for_training=false`;
- codigos sin revisar: `use_for_training=false` y `needs_review=true`;
- etiquetas dudosas: `needs_review=true`.

Esto no entrena modelos ni crea ejemplos gold por si solo.

## Relacion con Dataset Curado

La relacion actual es conceptual por `label`.

Cuando `/api/curated-dataset/segments` encuentra una fila en `label_taxonomy`, agrega campos calculados:

- `taxonomy_display_name`
- `taxonomy_scientific_name`
- `taxonomy_group`
- `taxonomy_label_type`
- `taxonomy_use_for_training`
- `taxonomy_needs_review`

El label original del segmento no se modifica. Esta decision conserva trazabilidad hacia carpetas, manifest y fuente original.

## Crear sugerencias desde dataset curado

Endpoint:

```text
POST /api/taxonomy/suggest-from-curated
```

La accion lee etiquetas existentes en `curated_audio_segments` y crea o completa registros en `label_taxonomy`.

Heuristicas:

- etiquetas tipo binomio con guion bajo, como `Boana_boans`, se sugieren como `species`;
- `rana_sapo` se sugiere como grupo `anfibio`;
- `ave_general` se sugiere como grupo `ave`;
- `otros_ruidos` se sugiere como `noise`;
- `revisar_etiqueta` se marca como `unknown`, no entrenable y pendiente de revision;
- codigos en mayusculas se sugieren como `code`.

## Interfaz

La pagina `/taxonomia` permite:

- crear taxonomia sugerida desde el dataset;
- filtrar por grupo, tipo, entrenable, necesita revision y pocos ejemplos;
- editar nombre visible, nombre cientifico, grupo, familia, genero, especie, alias y notas;
- activar o desactivar uso para entrenamiento;
- marcar o quitar necesidad de revision;
- ver ejemplos asociados;
- mapear una etiqueta hacia otra mediante `parent_label`.

## Antes de entrenar

Falta todavia:

- revisar codigos cortos y confirmar sus especies;
- completar nombres comunes si se necesitan;
- decidir si grupos generales como `rana_sapo` o `ave_general` se entrenan como clases;
- separar ruido, actividad humana y negativos por objetivo;
- construir un dataset entrenable desde etiquetas gold y taxonomia revisada;
- versionar modelos y datasets.
