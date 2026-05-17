# Modelos actuales

Este documento resume los modelos disponibles y su uso correcto.

## `frog_detector_v1_binary_v3_hardneg`

Tipo:

```text
binary_presence_detector
```

Funcion:

```text
rana_sapo vs no_rana_sapo
```

Threshold operativo recomendado:

```text
0.30
```

Uso correcto:

- Detector general de presencia probable de rana/sapo.
- Filtrar segmentos antes de entrenar modelos de especie.
- Revisar audio completo o fragmentos.

No hace:

- No identifica especie.
- No distingue `Boana_boans` de `Boana_pugnax`.
- No reemplaza un clasificador taxonomico especializado.

Texto recomendado en UI:

```text
Grupo detectado: rana/sapo
Especie: no identificada por este modelo
```

## `boana_boans_pugnax_v3_quality045`

Tipo:

```text
specialized_species_classifier
```

Clases:

- `Boana_boans`
- `Boana_pugnax`

Funcion:

Clasificar solamente entre `Boana_boans` y `Boana_pugnax`.

No usar como detector general de rana/sapo.

## Regla calibrada Boana

La decision final no usa argmax simple.

Regla:

```text
score_Boana_pugnax >= 0.03 => Boana_pugnax
score_Boana_pugnax < 0.03  => Boana_boans
```

La UI debe mostrar:

- `predicted_label`
- `raw_argmax_label`
- `decision_rule_applied`
- `score_Boana_boans`
- `score_Boana_pugnax`
- threshold

Si `predicted_label != raw_argmax_label`, mostrar aviso de revision.

## Confianza operacional Boana

Interpretacion recomendada:

- `score_Boana_pugnax >= 0.03` y `< 0.05`: `Boana_pugnax - baja confianza, revisar`.
- `score_Boana_pugnax >= 0.05`: `Boana_pugnax`.
- `score_Boana_pugnax < 0.03`: `Boana_boans`.

## Advertencia de uso

Este modelo especializado no tiene clase de fondo, ruido o voz humana.

Si el audio es voz humana, ruido o no pertenece al problema Boana, marcar feedback como:

```text
Excluir de entrenamiento -> voz_humana/ruido/otro
```

No marcar voz humana automaticamente como hard negative para este modelo cerrado.

