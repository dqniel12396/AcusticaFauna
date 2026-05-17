# Flujo de auditoria y manifests limpios

La retroalimentacion humana se acumula durante sesiones de revision. No reconstruye datasets inmediatamente y no modifica audios originales.

## Retroalimentacion acumulada

Cada feedback guarda una decision humana sobre un audio o segmento especifico.

Ejemplos:

- confirmar deteccion
- falso positivo
- falso negativo
- enviar a revisar
- excluir de entrenamiento
- hard negative

La acumulacion de feedback sirve como capa de correccion sobre manifests existentes.

## El resumen de retroalimentacion no es un dataset completo

En `/auditoria-retroalimentacion` puede existir un resumen de feedback acumulado.

Ese resumen no debe interpretarse como dataset entrenable completo.

Ejemplo:

```text
rows_before = 9
rows_after = 1
```

Eso indica que se esta mirando un conjunto pequeno de feedbacks o anotaciones, no el manifest base completo de entrenamiento.

Para entrenar se debe usar la seccion de entrenamiento con:

- manifest base completo
- reglas de feedback
- dry-run
- manifest limpio versionado

## Flujo correcto para crear manifest limpio

1. Seleccionar un preset de entrenamiento.
2. Seleccionar un manifest base completo.
3. Aplicar reglas de feedback.
4. Ejecutar dry-run.
5. Revisar resumen, conflictos y minimos.
6. Crear manifest limpio versionado.
7. Entrenar solo si el manifest es apto.

El manifest limpio no debe escribirse en `dataset_curado`. Debe generarse como version de trabajo para ML.

## Campos del dry-run

### `rows_before`

Numero de filas del manifest base antes de aplicar feedback.

### `rows_after`

Numero de filas que quedan despues de aplicar exclusiones y reglas.

### `excluded_by_human_voice`

Filas excluidas por feedback de voz humana.

Para entrenamiento de especies, voz humana debe excluirse.

### `excluded_by_retracted`

Feedbacks o anotaciones anuladas que se ignoran.

### `excluded_by_excluded_from_training`

Filas removidas por feedback explicito `excluded_from_training`.

### `feedback_applied`

Cantidad de reglas o feedbacks aplicados sobre el manifest base.

### `conflicts_detected`

Cantidad de items con feedback contradictorio.

Ejemplos de contradiccion:

- confirmado y falso positivo para el mismo audio/tramo/modelo
- hard negative y confirmado
- excluded_from_training y confirmado

Si hay conflictos, corregirlos antes de entrenar.

## Caso esperado para Boana

Para el flujo Boana con manifest base completo, un dry-run sano se ve cercano a:

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

Estos numeros pueden cambiar con nuevo feedback, pero la idea es que `rows_before` salga del manifest base completo, no solo de las anotaciones.

## Reglas de exclusion para manifests

Builders y dry-runs deben excluir o ignorar:

- `status = retracted`
- `feedback_type = excluded_from_training`
- `exclusion_reason = voz_humana` cuando el objetivo sea species
- `label_type = human_voice` cuando el objetivo sea species
- feedback contradictorio si el preset bloquea conflictos

