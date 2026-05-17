# Flujo del Laboratorio de audio

La pagina `/laboratorio-audio` es el espacio para escuchar audios, inspeccionar fragmentos, correr modelos y guardar feedback humano sin modificar archivos originales.

## Abrir un audio

Puedes abrir audio desde varias fuentes:

- Dataset o tablas disponibles en la aplicacion.
- Ruta local en modo local.
- Upload temporal.
- Recorte creado desde el laboratorio.
- Resultado de lote usando el boton de abrir en vista activa.

Al abrir un audio nuevo, la vista activa debe limpiar resultados, seleccion, espectrograma y estado de reproduccion anteriores. El historial puede conservar analisis previos, pero no debe mezclarlos con la tabla activa.

## Reproductor y waveform

El reproductor permite:

- Play / pause.
- Ver tiempo actual y duracion.
- Cambiar volumen.
- Cambiar velocidad.
- Seleccionar un tramo en la waveform.
- Reproducir seleccion.
- Analizar seleccion.
- Crear recorte.

Si el navegador no puede decodificar el waveform, el frontend intenta pedir peaks al backend. Si ambos fallan, la reproduccion, espectrograma y analisis deben seguir disponibles.

## Generar espectrograma

El espectrograma se genera bajo demanda.

Pasos:

1. Abre un audio.
2. Opcionalmente selecciona un tramo.
3. Presiona generar espectrograma.
4. Si hay seleccion, el espectrograma usa solo ese tramo.

No se generan miles de espectrogramas automaticamente.

## Analizar con detector rana/sapo

Modelo: `frog_detector_v1_binary_v3_hardneg`

Uso correcto:

- Detectar presencia probable de rana/sapo.
- Separar audio con vocalizacion probable de audio sin rana/sapo.
- Apoyar filtrado de datos antes de modelos de especie.

Parametros principales:

- `target_mode: binary_presence`
- `positive_label: rana_sapo`
- threshold recomendado: `0.30`

Este modelo no identifica especie.

Resultado esperado:

- `predicted_label`: `rana_sapo` o `no_rana_sapo`.
- `score_rana_sapo`: probabilidad operacional del grupo.
- `detected`: verdadero si el score supera el threshold.

## Analizar con clasificador Boana

Modelo: `boana_boans_pugnax_v3_quality045`

Uso correcto:

- Clasificar entre `Boana_boans` y `Boana_pugnax`.
- Revisar casos de ese grupo especifico.

Uso incorrecto:

- No usarlo para detectar si hay rana/sapo.
- No usarlo para audios de otras especies como si fuera un clasificador general.
- No usarlo para voz humana o ruido como si tuviera clase background.

Regla calibrada:

```text
score_Boana_pugnax >= 0.03 => Boana_pugnax
score_Boana_pugnax < 0.03  => Boana_boans
```

## Diferencia entre modelos

### Detector general rana/sapo

Pregunta que responde:

`Hay presencia probable de rana/sapo?`

Salida:

- `rana_sapo`
- `no_rana_sapo`

No identifica especie.

### Clasificador especializado Boana

Pregunta que responde:

`Si este audio pertenece al problema Boana_boans vs Boana_pugnax, cual de las dos clases parece mas probable segun la regla calibrada?`

Salida:

- `Boana_boans`
- `Boana_pugnax`

No detecta presencia general de rana/sapo.

## Como interpretar resultados

### `predicted_label`

Prediccion final que debe mirar el usuario. En modelos con regla calibrada puede diferir del argmax crudo.

### `raw_argmax_label`

Clase con score mas alto antes de aplicar reglas calibradas.

Si `predicted_label` y `raw_argmax_label` son diferentes, revisar el caso con cuidado.

### `decision_rule_applied`

Indica si la ML API aplico una regla personalizada desde `model_card.json`.

### Score usado

Score que alimenta la regla de decision. Para Boana v3 se usa `score_Boana_pugnax`.

### Threshold

Umbral operativo usado para decidir la clase final.

### Confianza operacional

Para `boana_boans_pugnax_v3_quality045`:

- Si `score_Boana_pugnax >= 0.03` y `< 0.05`: `Boana_pugnax - baja confianza, revisar`.
- Si `score_Boana_pugnax >= 0.05`: `Boana_pugnax`.
- Si `score_Boana_pugnax < 0.03`: `Boana_boans`.

## Feedback humano

El feedback se guarda por resultado exacto:

- audio
- tramo
- modelo
- prediccion
- score
- threshold
- tipo de feedback

Siempre confirmar en el modal antes de guardar.

### Confirmar deteccion

Usar cuando la prediccion parece correcta.

### Falso positivo

Usar cuando el modelo detecto o clasifico algo que no corresponde.

### Falso negativo

Usar cuando el modelo no detecto algo que si estaba presente.

### Enviar a revisar

Usar cuando el caso es ambiguo o requiere decision posterior.

### Excluir de entrenamiento

Usar cuando el audio o tramo no debe entrar a entrenamiento.

Para voz humana, elegir:

```text
Excluir de entrenamiento -> voz_humana
```

Esto debe guardar el caso como excluido para entrenamiento de especies.

### Hard negative

Usar solo cuando el pipeline de entrenamiento soporte negativos dificiles para ese objetivo.

Regla importante: en modelos cerrados de especie como `Boana_boans` vs `Boana_pugnax`, voz humana no debe marcarse como hard negative por defecto. Debe excluirse del entrenamiento de especies.

