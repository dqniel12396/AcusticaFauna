# Fundamentos ML y bioacustica en AcusticaFauna

Ultima actualizacion: 2026-05-16

Este documento explica los fundamentos matematicos y de ML aplicado detras de AcusticaFauna. Complementa la guia operativa `docs/GUIA_TECNICA_ML_ACUSTICAFAUNA.md`: aqui el foco no es solo que boton tocar, sino por que cambian las metricas cuando tocamos datos, thresholds, manifests, decision rules o entrenamiento.

## 1. Que problema estamos resolviendo

Tenemos audios de campo. En esos audios queremos responder preguntas progresivas:

1. Hay presencia probable de rana/sapo?
2. Si hay rana/sapo, pertenece a un grupo o genero particular?
3. Si el problema esta bien definido, que especie es?
4. Si hay varias vocalizaciones simultaneas, como representarlas sin forzar una sola etiqueta?

El problema no es solo "clasificar audio". Tambien es construir un dataset limpio y auditable. En bioacustica, la calidad del dataset puede pesar tanto como la arquitectura del modelo: etiquetas incorrectas, voz humana, ruido, segmentos sin vocalizacion o especies mezcladas pueden bajar metricas aunque el modelo sea razonable.

Por eso la auditoria humana es parte del sistema ML. La web permite revisar predicciones, corregirlas, excluir casos, crear recortes y construir manifests limpios antes de entrenar.

Tipos de problema:

- Deteccion binaria: `rana_sapo` vs `no_rana_sapo`.
- Clasificacion cerrada: `Boana_boans` vs `Boana_pugnax`.
- Clasificacion multiclase: genero o especie entre muchas clases.
- Multilabel potencial: varios animales o sonidos en un mismo audio.

Cada tipo de problema necesita una salida, una funcion de perdida y una regla de decision adecuada.

Modelos actuales de referencia:

- Detector general: `frog_detector_v1_binary_v3_hardneg`.
- Clasificador cerrado Boana: `boana_boans_pugnax_v3_quality045`.

## 2. De audio a numeros

Un audio digital es una senal discreta:

```text
x[n]
```

Donde:

- `n` es el indice temporal.
- `x[n]` es la amplitud de la muestra `n`.
- `sample_rate` define cuantas muestras hay por segundo.

Ejemplo:

```text
sample_rate = 44100 Hz
1 segundo = 44100 muestras
5 segundos = 220500 muestras
```

Conceptos basicos:

- Duracion: tiempo total del audio.
- Sample rate: resolucion temporal de la senal.
- Amplitud: desplazamiento de la onda en cada muestra.
- Ruido: energia no objetivo, como viento, lluvia, insectos, pasos o voz humana.
- Clip o segmento: tramo de audio usado como unidad de entrenamiento o prediccion.

En AcusticaFauna usamos comunmente:

```text
clip_duration = 5 s
```

Cinco segundos suelen ser suficientes para capturar parte de una llamada de rana/sapo sin mezclar demasiado contexto irrelevante. Si el clip es demasiado corto, puede perder la llamada; si es demasiado largo, puede mezclar eventos y ruido.

## Energia RMS, dB y segmentacion

Para audios largos, antes de clasificar especie suele convenir encontrar donde hay actividad acustica. El metodo inicial no intenta identificar rana/sapo: solo detecta tramos con energia por encima de un umbral.

En cada ventana corta del audio se calcula RMS:

```text
rms = sqrt(mean(x[n]^2))
```

Luego se convierte a decibeles relativos:

```text
db = 20 * log10(rms + epsilon)
```

`epsilon` evita logaritmos de cero cuando la ventana es silencio puro. Un `threshold_db` como `-45` significa: marcar como activa cada ventana cuya energia sea mayor o igual a -45 dB. Si el audio viene de otra grabadora, el nivel absoluto puede cambiar; por eso existe `normalize`, que ajusta la amplitud de analisis sin modificar el archivo original.

Parametros principales:

- `window_seconds`: tamano de cada ventana RMS.
- `hop_seconds`: avance entre ventanas.
- `threshold_db`: sensibilidad principal.
- `min_activity_seconds`: descarta eventos demasiado cortos.
- `min_silence_seconds`: evita cortar una llamada por silencios breves.
- `padding_seconds`: agrega margen antes y despues del evento.
- `merge_gap_seconds`: une eventos cercanos.
- `max_segment_seconds`: divide segmentos demasiado largos en unidades manejables.

Cuando se usa `band_energy`, se estima cuanta energia cae entre `frequency_min_hz` y `frequency_max_hz`. Esto ayuda cuando el ruido dominante esta fuera de la banda de interes, aunque sigue siendo una segmentacion acustica simple, no una clasificacion biologica.

Guia practica:

- Si detecta demasiado ruido, subir `threshold_db` o usar modo Conservador.
- Si no detecta llamadas suaves, bajar `threshold_db` o usar Muy sensible.
- Si corta llamadas, aumentar `padding_seconds`.
- Si une demasiados eventos, bajar `merge_gap_seconds`.
- Si divide demasiado, subir `merge_gap_seconds`.

## Reduccion de ruido y copias derivadas

La limpieza por lote crea una version derivada del audio, no corrige el original. En AcusticaFauna se usa como apoyo operativo para escuchar mejor, generar espectrogramas mas legibles o preparar candidatos para revision.

Los pasos basicos son:

- Bandpass: conserva una banda de frecuencia de interes y atenúa energia fuera de ella.
- Gate/reduccion: reduce partes de baja energia que probablemente sean ruido de fondo.
- Normalizacion: ajusta el pico del audio derivado para escuchar y comparar mejor.

Riesgo importante: una reduccion fuerte puede borrar llamadas suaves, armonicos o pulsos finos. Por eso los presets agresivos deben usarse con cuidado y ningun audio limpio entra automaticamente a entrenamiento. La regla bioacustica sigue siendo: revisar con oido, waveform, espectrograma y evidencia del detector antes de aceptar un clip.

## Calidad original vs procesado

Un espectrograma visualmente mas limpio no garantiza que el audio sea mejor para ML. Puede verse ordenado porque se removio ruido, pero tambien puede haber perdido energia util de la vocalizacion.

Por eso el reporte compara:

- `dBFS`: decibeles relativos al maximo digital posible.
- `clipping`: proporcion de muestras cerca de saturacion (`abs(x) >= 0.99`).
- `noise_floor`: percentil bajo de energia RMS por ventanas, usado como aproximacion del fondo.
- `activity_db`: percentil alto de energia RMS, usado como aproximacion de la actividad.
- `contrast_db`: diferencia entre actividad y fondo.
- bandas de frecuencia: permite ver si se redujo grave no deseado sin borrar energia entre 300 y 8000 Hz.

Una mejora razonable suele bajar el ruido de fondo, mantener la banda util y aumentar contraste sin clipping. Si el contraste baja o la energia util cae demasiado, el procesado puede empeorar el entrenamiento aunque el espectrograma parezca mas limpio.

## 3. Por que usamos espectrogramas

Una llamada de rana no se entiende solo mirando amplitud en el tiempo. Tambien importa la frecuencia: muchas especies se distinguen por bandas, armonicos, pulsos, modulacion y ritmo.

El espectrograma responde:

- que frecuencias aparecen;
- en que momento aparecen;
- con que intensidad aparecen.

La herramienta matematica base es la STFT, transformada de Fourier de tiempo corto:

```text
X(t, f) = sum_n x[n] * w[n - t] * exp(-j 2*pi*f*n)
```

Interpretacion:

- `x[n]` es la senal.
- `w[n - t]` es una ventana temporal alrededor de `t`.
- Se calcula una transformada de Fourier por ventanas.
- El resultado es una matriz tiempo-frecuencia.

Despues se usa magnitud o potencia y normalmente una escala logaritmica:

```text
S(t, f) = log(|X(t, f)|^2 + epsilon)
```

Donde `epsilon` evita problemas con logaritmo de cero.

Relacion con la UI:

- Waveform: amplitud en el tiempo.
- Espectrograma: energia por frecuencia y tiempo.

La waveform ayuda a seleccionar tramos. El espectrograma ayuda a entender la estructura acustica que probablemente ve el modelo.

## 4. Que ve una CNN en bioacustica

Una CNN no escucha como una persona. Recibe una imagen o matriz del espectrograma.

La CNN busca patrones visuales-acusticos:

- bandas horizontales;
- pulsos repetidos;
- armonicos;
- modulacion temporal;
- estructura de llamada;
- ruido vertical o impulsivo;
- zonas de silencio.

Una convolucion aplica filtros aprendidos:

```text
feature_map = activation(W * input + b)
```

Donde:

- `W` son filtros o kernels aprendidos.
- `b` es sesgo.
- `activation` puede ser ReLU.
- `feature_map` es una nueva representacion del input.

Intuitivamente:

- capas tempranas detectan bordes, bandas y texturas simples;
- capas intermedias combinan pulsos y patrones de frecuencia;
- capas profundas combinan rasgos mas abstractos de la llamada.

En bioacustica, esto funciona porque muchos sonidos biologicos tienen estructura tiempo-frecuencia reconocible.

## 5. Como entra OpenSoundscape

OpenSoundscape es una libreria Python para analisis bioacustico. Su documentacion oficial describe utilidades para cargar y manipular audio, crear espectrogramas, entrenar CNNs sobre espectrogramas con PyTorch y correr CNNs preentrenadas para detectar vocalizaciones.

En AcusticaFauna, OpenSoundscape vive en `acusticafauna-ML`, no en el backend principal.

Nuestro uso:

- `scripts/train_opensoundscape.py` prepara manifests y entrena.
- `scripts/evaluate_model.py` evalua modelos.
- `ml_api/main.py` expone prediccion, modelos y jobs.
- `models/` guarda modelos registrados.
- `outputs/` guarda experimentos.

OpenSoundscape transforma el problema de audio en un problema de clasificacion de imagenes de espectrogramas. La personalizacion puede incluir arquitectura CNN, pesos preentrenados, preprocesamiento, espectrogramas, learning rate, regularizacion y estrategias de muestreo para datos desbalanceados.

## 6. Transfer learning y ResNet

ResNet18 fue descargado o usado como arquitectura/preentrenamiento. Esto entra dentro de transfer learning.

Idea:

- Un modelo entrenado en muchas imagenes aprende filtros generales.
- Aunque un espectrograma no es una foto, tambien tiene bordes, texturas, bandas y patrones.
- Reutilizamos capas iniciales y cambiamos la ultima capa para nuestras clases.

Para `K` clases, la ultima capa produce `K` scores crudos o logits:

```text
logits = [z1, z2, ..., zK]
```

Para Boana:

```text
logits = [z_boans, z_pugnax]
```

Despues, esos logits se convierten en scores o probabilidades operativas segun el tipo de salida.

## 7. Logits, scores, softmax y argmax

El modelo produce logits. En multiclase se suelen convertir con softmax:

```text
p_i = exp(z_i) / sum_j exp(z_j)
```

La suma de todos los `p_i` es 1.

La regla argmax elige la clase con mayor score:

```text
predicted = class with max(p_i)
```

Advertencia importante:

- estos scores no siempre son probabilidades perfectamente calibradas;
- un score alto no siempre significa confianza real;
- un score bajo no siempre significa que no haya informacion util;
- por eso usamos validacion y thresholds.

Caso AcusticaFauna:

El argmax del modelo Boana podia decir `Boana_boans`, pero `score_Boana_pugnax` separaba bien `Boana_pugnax` con un threshold calibrado:

```text
score_Boana_pugnax >= 0.03 => Boana_pugnax
```

### 7.1 Por que calibrar thresholds en binarios multiclass

Un clasificador de dos clases entrenado con softmax no necesariamente debe operarse con argmax. Si una clase queda sistematicamente subestimada por los scores, argmax puede tener buen recall para una clase y mal recall para la otra.

La calibracion que usamos no cambia pesos del modelo ni toca audios. Solo aprende una regla de decision sobre validacion:

```text
score_clase_positiva >= threshold => clase_positiva
score_clase_positiva < threshold  => otra_clase
```

Para Boana, la clase positiva operacional es `Boana_pugnax`. Se prueban thresholds de `0.01` a `0.99` con paso `0.01`, se maximiza `balanced_accuracy` y, si hay empate, se elige el mejor F1 de `Boana_pugnax`.

La razon de usar `balanced_accuracy` es que mide el promedio del recall de ambas clases. En problemas cerrados como `Boana_boans` vs `Boana_pugnax`, esto evita registrar un modelo que acierta mucho una clase solo porque colapsa la otra.

El test se usa despues, con el threshold ya elegido en validacion. Asi se mantiene la separacion correcta:

```text
validacion: elegir threshold
test: estimar rendimiento final de la regla
registro: guardar decision_rule en model_card.json
```

### 7.2 UX de manifests limpios

La creacion de un manifest limpio no cambia audios ni reentrena modelos, pero es una accion critica porque define el dataset que se usara despues.

Por eso la interfaz muestra progreso explicito para que el usuario pueda distinguir:

- clic recibido;
- validacion del manifest base;
- aplicacion de reglas de feedback;
- verificacion de minimos por clase/split;
- escritura del CSV y resumen;
- resultado final.

Tambien se protege contra doble clic y contra sobrescritura accidental. Si el archivo destino ya existe, la UI pide escoger entre sobrescribir, crear un nombre con sufijo o cancelar.

### 7.3 Modelo activo vs modelo experimental

Entrenar y registrar un modelo nuevo no significa que deba reemplazar al modelo activo. En AcusticaFauna el criterio operativo es comparar el candidato contra el activo de la misma tarea, usando la metrica mas relevante disponible.

Para clasificadores especializados binarios calibrados, la comparacion primaria es:

```text
balanced_accuracy calibrado en test
```

Caso Boana:

```text
v3_quality045: balanced_accuracy calibrado aprox 0.91
v4_feedback:   balanced_accuracy calibrado 0.817
```

Aunque `v4_feedback` mejora su propio argmax al calibrarse, no supera al modelo activo `v3_quality045`. Por eso queda como `experimental` y no como default. Este patron evita degradar la experiencia del laboratorio por registrar automaticamente el modelo mas reciente.

La promocion manual existe para casos excepcionales, pero si la comparacion indica que el candidato no mejora al activo, la interfaz exige confirmacion explicita. La intencion es que el registry permita experimentar sin convertir automaticamente cada modelo nuevo en modelo recomendado.

### 7.4 Exploracion de manifests y candidatos

La preparacion de nuevos modelos especializados debe partir de una exploracion reproducible del manifest base, no de seleccion manual en consola.

El Explorador ML agrupa las especies por genero inferido y aplica minimos por split:

```text
train >= 50 por clase
val   >= 10 por clase
test  >= 10 por clase
```

Si un genero tiene dos especies que cumplen minimos, se recomienda un clasificador binario especializado. Si tiene tres o mas especies entrenables, se recomienda multiclase. Si una o mas clases no cumplen minimos, la UI lo marca como insuficiente o como necesita mas datos.

En problemas cerrados de dos especies se conserva `target_mode = multiclass` para que el modelo produzca scores por clase y pueda calibrarse despues con una regla de threshold. Esto mantiene el mismo patron aprendido en Boana: argmax puede no ser suficiente, pero los scores calibrados pueden ser utiles.

## 8. Sigmoid vs softmax

### Softmax

Softmax se usa cuando las clases son mutuamente excluyentes.

Caracteristicas:

- una clase gana;
- la suma total es 1;
- sirve para problemas multiclass.

Ejemplo:

```text
Boana_boans vs Boana_pugnax
```

### Sigmoid

Sigmoid decide cada clase de forma independiente:

```text
p_i = 1 / (1 + exp(-z_i))
```

Caracteristicas:

- varias clases pueden estar presentes;
- sirve para multilabel;
- cada clase tiene su propio threshold.

Ejemplo potencial:

```text
rana_sapo + insecto + lluvia
```

En AcusticaFauna:

- Boana usa `multiclass`.
- El detector rana/sapo se puede tratar como presencia binaria.
- En el futuro, audios con varias especies podrian requerir multilabel.

## 9. Funcion de perdida

Durante entrenamiento el modelo se equivoca y se penaliza.

Para multiclase se usa cross entropy:

```text
L = - sum_i y_i * log(p_i)
```

Si la clase real es `Boana_pugnax`, entonces `y_pugnax = 1` y la perdida queda:

```text
L = -log(p_pugnax)
```

Si `p_pugnax` es bajo, la perdida es alta.

Para binario se usa binary cross entropy:

```text
L = -[y * log(p) + (1-y) * log(1-p)]
```

Entrenar significa ajustar pesos para reducir la perdida promedio sobre el dataset.

## 10. Backpropagation y learning rate

Backpropagation calcula como cambiar cada peso para reducir el error.

Actualizacion simplificada:

```text
w_new = w_old - learning_rate * gradient
```

Interpretacion:

- `gradient` indica hacia donde sube la perdida.
- restarlo mueve el peso hacia menor perdida.
- `learning_rate` controla el tamano del paso.

Si el learning rate es alto:

- aprende rapido;
- puede inestabilizar;
- puede saltarse buenos minimos.

Si el learning rate es bajo:

- aprende mas lento;
- puede ser mas estable;
- puede quedarse corto si hay pocas epocas.

Demasiadas epocas pueden causar sobreajuste: el modelo memoriza train y falla en validation/test.

OpenSoundscape permite personalizar entrenamiento, incluyendo learning rate, regularizacion, arquitectura y preprocesamiento.

## 11. Metricas: accuracy, precision, recall, F1, balanced accuracy

Para un detector rana/sapo:

- TP: rana detectada como rana.
- FP: ruido o voz detectada como rana.
- TN: ruido detectado como no rana.
- FN: rana no detectada.

Formulas:

```text
accuracy = (TP + TN) / total
precision = TP / (TP + FP)
recall = TP / (TP + FN)
F1 = 2 * precision * recall / (precision + recall)
specificity = TN / (TN + FP)
balanced_accuracy = (recall_positive + recall_negative) / 2
```

Accuracy puede enganar si hay desbalance. Por ejemplo, si 90% de audios son ruido, un modelo que predice todo como ruido tendria accuracy alta, pero recall de rana seria cero.

Balanced accuracy ayuda porque promedia el recall por clase.

## 12. Por que subia o bajaba el porcentaje de exito

### Caso 1: Dataset balanceado pero mal clasificado

Teniamos `Boana_boans` y `Boana_pugnax` balanceados. Aun asi el modelo se sesgo.

Conclusion:

Balancear cantidad no garantiza separabilidad acustica. Dos clases pueden tener ejemplos parecidos, etiquetas ruidosas o patrones que el modelo no separa con argmax.

### Caso 2: `min_frog_score 0.60`

El filtro fue mas estricto.

Quedaron menos datos:

```text
129/129 aprox
```

Resultado aproximado:

```text
accuracy 0.55
recall Boana_boans 0.50
recall Boana_pugnax 0.60
```

Conclusion:

Mas limpieza puede quitar demasiados ejemplos y empeorar estabilidad.

### Caso 3: `min_frog_score 0.45`

Quedaron mas datos:

```text
199/199 aprox
```

Argmax dio:

```text
accuracy 0.607
```

Pero estaba sesgado hacia `Boana_boans`.

Conclusion:

Mas datos ayudo, pero la regla de decision seguia mal.

### Caso 4: threshold calibrado `0.03`

Con validacion se eligio:

```text
score_Boana_pugnax >= 0.03
```

Resultado test aproximado:

```text
accuracy 0.9107
balanced_accuracy 0.9107
precision_pugnax 0.8966
recall_pugnax 0.9286
F1_pugnax 0.9123
```

Conclusion:

El modelo si tenia informacion util, pero argmax no era la regla correcta.

## 13. Thresholds y calibracion

Un threshold decide cuando una senal es suficiente para llamar una clase.

Ejemplo detector rana/sapo:

```text
score_rana_sapo >= 0.30 => rana_sapo
```

Si subimos threshold:

- menos falsos positivos;
- mas falsos negativos.

Si bajamos threshold:

- mas detecciones;
- mas falsos positivos.

Para Boana:

```text
score_Boana_pugnax >= 0.03 => Boana_pugnax
```

Un threshold bajo puede ser valido porque el score no es necesariamente una probabilidad calibrada. Lo importante es la separacion empirica en validation.

Tabla conceptual de calibracion:

| Threshold | Precision | Recall | FP | FN | Interpretacion |
| ---: | --- | --- | --- | --- | --- |
| bajo | baja o media | alto | suben | bajan | sensible, detecta mas |
| medio | balanceada | balanceado | moderados | moderados | punto candidato |
| alto | alta | bajo | bajan | suben | conservador |

La calibracion no se elige por intuicion. Se elige comparando metricas en validation y luego se aplica una vez al test.

## 14. Validacion vs test

Divisiones:

- Train: el modelo aprende.
- Validation: se deciden parametros, thresholds y early stopping.
- Test: mide resultado final.

Regla:

No calibrar threshold mirando test.

Flujo correcto:

1. Entrenar.
2. Evaluar en validation.
3. Elegir threshold.
4. Aplicar una sola vez en test.

Si se mira el test muchas veces para ajustar decisiones, el test deja de ser una medida honesta.

## 15. Fuga de datos y riesgo de sobreestimar resultados

En bioacustica puede haber audios muy parecidos:

- mismo sitio;
- mismo individuo;
- segmentos consecutivos;
- mismo archivo largo recortado;
- mismas condiciones de grabacion.

Riesgo:

Si segmentos muy parecidos estan en train y test, el modelo puede parecer mejor de lo real.

Recomendaciones:

- split por archivo fuente cuando sea posible;
- split por sitio/fecha si existe metadata;
- no confiar solo en test pequeno;
- repetir con varias semillas;
- revisar si clips derivados del mismo audio quedaron en splits diferentes.

## 16. Falsos positivos, falsos negativos y voz humana

Voz humana no debe entrar como especie.

En la web:

```text
Excluir de entrenamiento -> voz_humana
```

Para modelos cerrados Boana, voz humana no es hard negative automatico porque el modelo no tiene clase background. Si se mete voz humana dentro de un problema `Boana_boans` vs `Boana_pugnax`, el modelo queda obligado a aprender que voz humana pertenece a una de esas dos clases, lo cual contamina el entrenamiento.

Si queremos usar voz humana como negativo:

- crear pipeline con clase `background` o `no_boana`;
- o usarla para mejorar detector general rana/sapo;
- no meterla en clasificador cerrado de especie.

## 17. Hard negatives

Un hard negative es un ejemplo negativo que el modelo suele confundir como positivo.

Ejemplos:

- insecto parecido a rana;
- voz humana con frecuencia parecida;
- ruido impulsivo;
- otro anfibio no objetivo;
- lluvia o maquinaria con patron repetitivo.

Pero un hard negative solo sirve si el dataset tiene una clase o etiqueta donde ponerlo.

Para detector rana/sapo:

- puede ayudar a separar `rana_sapo` de sonidos parecidos.

Para `Boana_boans` vs `Boana_pugnax`:

- puede ensuciar si no existe clase `no_boana`.

## 18. Manifests desde perspectiva matematica

Un manifest define la distribucion de entrenamiento.

No es solo una lista de archivos. Controla:

- que clases existen;
- cuantos ejemplos por clase;
- splits;
- duracion;
- labels;
- exclusiones;
- balance;
- sesgos de sitio/fecha/equipo;
- calidad minima de senal.

Cambiar manifest cambia el espacio de datos sobre el cual aprende el modelo.

Por eso afectan metricas:

- `min_frog_score`;
- `excluded_from_training`;
- `voz_humana`;
- `retracted`;
- `balance_strategy`;
- split estratificado;
- exclusion de etiquetas dudosas.

Un dry-run correcto debe aplicar feedback sobre un manifest base completo. Si el resumen dice:

```text
rows_before 9 / rows_after 1
```

eso es resumen de feedback, no dataset entrenable.

Para Boana, un dry-run correcto reciente fue:

```text
rows_before 398 / rows_after 397
```

## 19. Por que el feedback humano mejora ML

La ML aprende de etiquetas. Si las etiquetas estan malas, el modelo aprende errores.

Feedback humano corrige:

- falsos positivos;
- falsos negativos;
- voz humana;
- ruido;
- segmentos sin vocalizacion;
- etiquetas dudosas;
- casos ambiguos;
- ejemplos que deben excluirse.

Esto no mejora magicamente el modelo. Mejora el dataset. Luego, al entrenar con un manifest limpio, el modelo recibe una distribucion mas coherente.

## 20. Flujo matematico del entrenamiento

Pipeline:

```text
audio_path
  -> cargar audio
  -> recortar/pad a clip_duration
  -> convertir a espectrograma
  -> normalizar/transformar
  -> CNN
  -> logits
  -> loss
  -> backpropagation
  -> pesos actualizados
  -> validacion
  -> checkpoint best.model
```

Cada paso:

- Cargar audio: convierte archivo en senal `x[n]`.
- Recortar/pad: asegura duracion fija.
- Espectrograma: convierte senal en matriz tiempo-frecuencia.
- Normalizar/transformar: hace la entrada mas estable para CNN.
- CNN: extrae patrones.
- Logits: scores crudos por clase.
- Loss: mide error contra etiqueta.
- Backpropagation: calcula gradientes.
- Pesos actualizados: el modelo aprende.
- Validacion: mide generalizacion durante entrenamiento.
- Checkpoint: guarda el mejor modelo segun criterio definido.

## 21. Flujo matematico de prediccion

Pipeline general:

```text
audio nuevo
  -> espectrograma
  -> CNN
  -> logits/scores
  -> regla de decision
  -> predicted_label
  -> confianza operacional
  -> feedback humano
```

Para Boana:

```text
logits/scores
  -> raw_argmax_label
  -> aplicar threshold 0.03 sobre score_Boana_pugnax
  -> predicted_label corregido
```

Por eso la UI debe mostrar tanto argmax como decision final.

## 22. Parametros que podemos tocar y efectos esperados

| Parametro | Efecto | Si es muy bajo/corto | Si es muy alto/largo | Comentario |
| --- | --- | --- | --- | --- |
| `clip_duration` | duracion del fragmento que ve el modelo | puede perder llamada | mezcla ruido y eventos | 5 s es punto practico actual |
| threshold detector | sensibilidad rana/sapo | mas falsos positivos | mas falsos negativos | calibrar segun uso |
| threshold Boana | separacion `Boana_pugnax` | predice mas `Boana_pugnax` | predice menos `Boana_pugnax` | actual `0.03`, cambiar solo con validation |
| `min_frog_score` | filtra por calidad rana | mas datos y mas ruido | mas limpio y menos datos | probar `0.45`, `0.50`, `0.55`, `0.60` |
| `epochs` | oportunidad de aprender | underfitting | overfitting | mirar validation |
| `batch_size` | memoria y estabilidad | mas lento, mas ruido en gradiente | mas memoria | en CPU, bajar si falla |
| learning rate | tamano del paso | lento | inestable | ajustar con cuidado |
| `balance_strategy` | control de desbalance | conserva sesgos | puede descartar datos | balancear no garantiza separabilidad |
| `sample_strategy stratified` | mantiene proporciones | splits inestables | no aplica | recomendado para clasificadores |
| bandpass/frequency range | enfoca frecuencias relevantes | puede dejar ruido | puede quitar informacion util | validar con espectrogramas |

## 23. Senales de diagnostico

| Sintoma | Posibles causas | Que hacer |
| --- | --- | --- |
| El modelo predice casi todo una clase | desbalance, mala calibracion, etiquetas ruidosas, clase acusticamente dominante | revisar matriz de confusion, calibrar threshold, revisar splits y ejemplos |
| Sube train accuracy pero baja validation | overfitting | mas datos, regularizacion, menos epochs, augmentation, revisar fugas |
| Muchos falsos positivos con voz | background insuficiente o modelo cerrado mal usado | excluir voz humana, usar detector general, crear clase background si corresponde |
| Dry-run apto pero modelo malo | dataset apto en cantidad pero no en calidad | inspeccionar errores, revisar espectrogramas, calibrar threshold |
| Test demasiado bueno | test pequeno o fuga de datos | revisar fuente de audios, repetir con semillas, separar por archivo/sitio |
| Precision alta y recall bajo | threshold muy conservador | bajar threshold si se quiere detectar mas |
| Recall alto y precision baja | threshold muy permisivo | subir threshold si se quiere menos falso positivo |

## 24. Como OpenSoundscape encaja con nuestro codigo

Piezas principales:

- `scripts/train_opensoundscape.py`
- `scripts/evaluate_model.py`
- `ml_api/main.py`
- `manifests/`
- `outputs/`
- `models/`
- `model_card.json`

`train_opensoundscape.py` prepara artefactos como:

- `train_manifest.csv`
- `val_manifest.csv`
- `test_manifest.csv`
- `opensoundscape_train_labels.csv`
- `opensoundscape_val_labels.csv`
- `opensoundscape_test_labels.csv`
- `label_map.json`
- archivo `.model`

`outputs/` guarda experimentos. `models/` guarda modelos registrados para uso desde la ML API y la web.

## 25. Que significa registrar un modelo

Registrar no es entrenar.

Registrar significa:

- copiar `.model`;
- copiar `label_map.json`;
- crear `model_card.json`;
- aparecer en `/models`;
- poder usarse en la web.

Estados recomendados de modelo:

- experimental;
- candidato;
- activo;
- archivado.

Un modelo no debe registrarse como activo solo porque entreno. Debe mejorar metricas, tener una regla de decision clara y estar documentado.

## 26. Como debe crecer este documento

Cada vez que se cambie:

- threshold;
- manifest;
- metrica;
- arquitectura;
- entrenamiento;
- regla de decision;
- feedback;
- recorte usado para entrenamiento;
- evaluacion;

se debe agregar una entrada en la bitacora tecnica con:

- fecha;
- que se cambio;
- hipotesis;
- resultado;
- metrica antes;
- metrica despues;
- decision;
- proximo experimento.

Este documento debe explicar por que una decision subio o bajo metricas, no solo registrar que se hizo.

## 27. Bitacora tecnica inicial

| Fecha | Cambio | Hipotesis | Resultado | Metrica antes | Metrica despues | Decision | Proximo experimento |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05-13 | Detector rana/sapo con hard negatives | Negativos dificiles bajan falsos positivos | Detector general usable | no aplica | balanced_accuracy aprox 0.84 | usar como primera puerta | seguir curando negativos |
| 2026-05-13 | Clasificador Boana inicial | Dataset balanceado deberia separar especies | Modelo sesgado | no aplica | accuracy aprox 0.516 | no registrar | revisar datos y decision |
| 2026-05-13 | Problema de sesgo por argmax | Argmax podria estar ocultando separacion | Se confirmo sesgo | accuracy aprox 0.607 | recall pugnax bajo | calibrar threshold | medir en validation |
| 2026-05-13 | Quality `0.60` | Mayor limpieza mejora modelo | Quedaron pocos datos | dataset mayor | accuracy aprox 0.55 | demasiado estricto | probar `0.45` |
| 2026-05-13 | Quality `0.45` | Mas datos utiles estabilizan | 199/199 aprox | 129/129 | argmax accuracy aprox 0.607 | conservar para calibracion | ajustar decision rule |
| 2026-05-13 | Calibracion threshold `0.03` | `score_Boana_pugnax` separa mejor que argmax | Mejora grande | argmax bajo | balanced_accuracy aprox 0.91 | usar regla calibrada | validar con mas datos |
| 2026-05-13 | Decision rule en `model_card` | La regla debe viajar con el modelo | ML API puede aplicarla | regla manual | regla visible en `/models` | mantener | documentar por modelo |
| 2026-05-14 | UI muestra `raw_argmax` y `decision_rule_applied` | Evita ocultar cambios de decision | Usuario ve casos sensibles | salida ambigua | decision trazable | mantener | mejorar ayudas visuales |
| 2026-05-14 | Feedback humano | Corregir datos mejora entrenamiento futuro | Feedback acumulado | revision manual dispersa | auditoria central | usar para manifests | detectar conflictos |
| 2026-05-14 | Excluir voz humana | Voz humana contamina especies | Exclusion trazable | riesgo de hard negative | `excluded_from_training` | mantener | evaluar background separado |
| 2026-05-14 | Recortes WAV | Permitir ejemplos trazables | Recortes reproducibles | recorte ambiguo | WAV fisico con metadata | mantener | definir retencion |
| 2026-05-14 | Analisis por lote | Revisar mas rapido sin mezclar audios | Resultados agrupados | analisis manual | lote por audio | mantener | probar con mas usuarios |
| 2026-05-14 | Manifest limpio sobre manifest base | Feedback aislado no es dataset | Dry-run 398 -> 397 | rows 9 -> 1 confundia | dataset apto | usar para entrenar | Boana v4 feedback |
| 2026-05-14 | Training jobs web | No depender de consola | Jobs asincronos | entrenamiento manual | logs desde web | probar completo | evaluar y registrar si mejora |

## 28. Glosario matematico

### Senal discreta

Secuencia de muestras `x[n]` que representa un audio digital.

### Sample rate

Numero de muestras por segundo.

### Ventana

Tramo corto usado para analizar una parte local de la senal.

### Fourier

Transformacion matematica que expresa una senal como combinacion de frecuencias.

### STFT

Transformada de Fourier de tiempo corto. Calcula Fourier por ventanas temporales.

### Espectrograma

Matriz que representa energia por tiempo y frecuencia.

### dB

Escala logaritmica de intensidad. Ayuda a comprimir rangos grandes de energia.

### CNN

Red neuronal convolucional. Aprende filtros sobre matrices o imagenes.

### Convolucion

Operacion que aplica un filtro local sobre una entrada para detectar patrones.

### Filtro/kernel

Pesos aprendidos por una convolucion.

### Feature map

Salida de una capa convolucional que resalta patrones detectados.

### Logits

Scores crudos del modelo antes de activaciones como softmax o sigmoid.

### Softmax

Convierte logits multiclass en scores que suman 1.

### Sigmoid

Convierte cada logit en un score independiente entre 0 y 1.

### Cross entropy

Funcion de perdida usada para penalizar predicciones incorrectas.

### Gradient descent

Metodo de optimizacion que ajusta pesos en direccion de menor perdida.

### Learning rate

Tamano del paso de aprendizaje.

### Epoch

Una pasada completa por el dataset de entrenamiento.

### Batch

Grupo de ejemplos procesados juntos en un paso de entrenamiento.

### Overfitting

El modelo memoriza train y falla al generalizar.

### Underfitting

El modelo no aprende suficiente ni siquiera en train.

### Threshold

Umbral para convertir score en decision.

### Calibration

Proceso de ajustar thresholds o scores usando validation para mejorar decisiones.

### Argmax

Regla que elige la clase con mayor score.

### Precision

De las predicciones positivas, cuantas fueron correctas.

### Recall

De los positivos reales, cuantos fueron encontrados.

### F1

Media armonica entre precision y recall.

### Specificity

De los negativos reales, cuantos fueron correctamente descartados.

### Balanced accuracy

Promedio del recall por clase.

### Validation

Conjunto usado para elegir parametros y thresholds.

### Test

Conjunto reservado para medicion final.

### Data leakage

Fuga de datos entre train y test que hace que metricas parezcan mejores de lo real.

## 29. Lecturas recomendadas internas

- [Guia tecnica ML AcusticaFauna](GUIA_TECNICA_ML_ACUSTICAFAUNA.md)
- [Modelos actuales](MODELOS_ACTUALES.md)
- [Flujo de entrenamiento desde la web](FLUJO_ENTRENAMIENTO_WEB.md)
- [Flujo de auditoria y manifests limpios](FLUJO_AUDITORIA_Y_MANIFESTS.md)
- [Flujo del Laboratorio de audio](FLUJO_LABORATORIO_AUDIO.md)

## 30. Fuentes externas recomendadas

- [Documentacion oficial de OpenSoundscape](https://opensoundscape.org/en/latest/index.html): referencia principal sobre la libreria, audio, espectrogramas, CNNs con PyTorch y deteccion de vocalizaciones.
- [Tutorial oficial para personalizar entrenamiento CNN en OpenSoundscape](https://opensoundscape.org/en/latest/tutorials/customize_cnn_training.html): punto de partida para profundizar en arquitectura, pesos preentrenados, preprocesamiento, learning rate, regularizacion y muestreo.
- Documentacion oficial de PyTorch: util para ampliar conceptos de CNN, funciones de perdida, optimizadores y entrenamiento con GPU.
