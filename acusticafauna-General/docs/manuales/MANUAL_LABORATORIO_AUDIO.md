# Manual Laboratorio de audio

## Para que sirve

Permite abrir, escuchar, segmentar, limpiar, analizar e identificar audios sin modificar el archivo original.

## Flujo recomendado

1. Abre un audio desde Dataset Curado, upload temporal o ruta local.
2. Escucha el audio y revisa waveform/espectrograma.
3. Usa detector rana/sapo o Identificar automaticamente.
4. Si el audio es largo, usa Detectar actividad para crear segmentos utiles.
5. Si limpias audio, genera Reporte de calidad antes de usarlo para revision.
6. Guarda feedback humano cuando confirmes o corrijas una prediccion.

## Botones importantes

- Abrir audio: carga el archivo en el laboratorio.
- Identificar automaticamente: ejecuta detector rana/sapo, genero y especialista si aplica.
- Detectar actividad: encuentra zonas con sonido util.
- Crear recorte: genera WAV derivado y trazable.
- Procesamiento por lote: limpia o procesa varios audios.
- Procesamiento masivo por carpeta local: procesa carpetas grandes sin upload archivo por archivo.
- Reporte de calidad: compara original vs procesado.

## Procesar una carpeta grande de audios

Usa **Procesamiento masivo por carpeta local** cuando tengas muchos audios en una carpeta local, por ejemplo grabaciones largas de campo o un lote de 70 GB.

1. Pega la ruta local de la carpeta.

```text
C:\Datos\Ranas\lote_01
```

2. Activa `Recursivo` si hay subcarpetas.
3. Escribe el label objetivo o especie objetivo.
4. Pulsa **Escanear carpeta**.
5. Revisa cantidad de archivos, tamano total, duracion estimada y advertencias.
6. Ajusta la banda de frecuencia. Ejemplo: si la especie canta entre 1800 y 3000 Hz, usa `1800` y `3000`.
7. Ajusta `threshold dBFS`. dBFS es nivel relativo del archivo digital; no es dB acustico calibrado.
8. Ajusta actividad minima, silencio minimo, padding, duracion de clip y ratio minimo de energia en banda.
9. Pulsa **Iniciar procesamiento**.
10. Revisa candidatos, excluidos y sospechosos de contaminantes.
11. Exporta el manifest CSV cuando termines la revision.

Que significan los resultados:

- `candidate`: segmento candidato para revision humana.
- `band_energy_ratio`: que tanta energia cae en la banda objetivo.
- `rms_dbfs`: nivel digital del segmento.
- `voz_humana_suspect`, `carro_motor_suspect`, `ave_suspect`, `broadband_noise_suspect`: posibles contaminantes.

Botones de revision:

- Reproducir: abre y reproduce el audio derivado.
- Espectrograma: genera imagen para inspeccion visual.
- Reporte calidad: abre metadata/reporte del segmento.
- Confirmar: marca como positivo revisado.
- Excluir, Voz humana, Carro/motor, Ave: envia feedback de exclusion.
- Enviar a revisar: deja el segmento pendiente de revision.

Importante:

- No se modifican ni borran audios originales.
- El sistema no entrena automaticamente.
- Los outputs quedan en `backend/storage/audio_lab/folder_batch_jobs/{job_id}/`.
- Si ML API esta apagada, el procesamiento DSP sigue funcionando y solo se omite detector rana/sapo.

Cuando escaneas una carpeta, esa carpeta queda validada para ese job. No se agrega globalmente a `.env`; solo se permite durante el procesamiento de ese lote.

## Calibrar antes de procesar una carpeta grande

Usa **Asistente de calibracion acustica** antes de procesar una carpeta grande o ruidosa. La idea es analizar una muestra pequena, comparar configuraciones y aplicar la mejor al procesamiento masivo.

Flujo recomendado:

1. Pega la ruta local de la carpeta.
2. Escribe la especie objetivo.
3. Elige una muestra de 5, 10, 20 o 50 audios.
4. Marca el ruido predominante: lluvia, rio, viento, insectos, trafico o mezcla.
5. Elige el modo de calibracion. Para lluvia, rio o viento empieza con **Detectar y cortar candidatos**.
6. Pulsa **Analizar perfil acustico**.
7. Revisa banda sugerida, threshold dBFS, ratio minimo de energia en banda y advertencias.
8. Pulsa **Probar configuraciones** para comparar opciones intermedias.
9. Revisa por separado la mejor configuracion para detectar y la mejor configuracion para limpiar.
10. Si no hay limpieza segura, usa deteccion/corte sin normalizacion y revisa clips.
11. Usa **Usar esta configuracion en Procesamiento masivo por carpeta local**.
12. Escanea de nuevo la carpeta y procesa solo cuando la configuracion tenga sentido.

Origen de la ruta del asistente:

- Si el campo aparece vacio, no hay ruta activa y debes escribir una o sincronizarla desde procesamiento masivo.
- Si aparece el badge **Ultima ruta usada**, la ruta viene de `localStorage` del navegador. Es solo una ayuda visual; no ejecuta analisis automaticamente.
- Si aparece el badge **Ruta desde reporte**, la ruta corresponde al reporte de calibracion mostrado. Si cambias la ruta, ese reporte queda como historico/no aplicable hasta ejecutar de nuevo el analisis.
- Si aparece el badge **Ruta sincronizada desde procesamiento masivo**, la ruta fue copiada desde el formulario de **Procesamiento masivo por carpeta local**.

Controles utiles:

- **Limpiar ruta** vacia el campo del asistente y no borra audios, outputs ni reportes fisicos.
- **Usar ruta de procesamiento masivo** copia la ruta escrita en Procesamiento masivo al asistente. Si ya escribiste otra ruta, la app pide confirmacion antes de reemplazarla.
- Si la ruta del asistente y la ruta de procesamiento masivo son diferentes, la interfaz muestra ambas y permite copiar una hacia la otra.

La ruta del asistente sirve para calibrar una muestra. La ruta de procesamiento masivo sirve para escanear y crear jobs de procesamiento. Pueden ser distintas, pero si lo son revisa cuidadosamente antes de aplicar configuraciones.

Ejemplo para `Pristimantis_simoterus` con lluvia, viento o rio:

- Conservadora: `3000-4500 Hz`, threshold `-48 dBFS`, ratio `0.35`.
- Balanceada: `2500-4500 Hz`, threshold `-50 dBFS`, ratio `0.30`.
- Sensible: `2500-5000 Hz`, threshold `-52 dBFS`, ratio `0.25`.
- Intermedia sin normalizacion: `2500-5000 Hz`, threshold `-51 dBFS`, ratio `0.25`.
- Balanceada abierta: `2500-5000 Hz`, threshold `-51 dBFS`, ratio `0.28`.
- Alta conservadora: `3000-5000 Hz`, threshold `-52 dBFS`, ratio `0.22`.

Para `Pristimantis_simoterus`, un buen punto de partida suele ser `2500-4500 Hz`. Evita empezar en `0-1000 Hz` porque esa zona captura viento, golpes, rio y mucho ruido de baja frecuencia.

Como interpretar `threshold dBFS`:

- Valores mas bajos, por ejemplo `-52`, detectan cantos suaves o lejanos, pero tambien pueden incluir lluvia o rio.
- Valores mas altos, por ejemplo `-45`, filtran mas ruido, pero pueden perder cantos tenues.
- dBFS es nivel digital relativo del archivo; no es dB SPL calibrado.

Como interpretar `ratio energia banda`:

- Exige que una parte importante de la energia este dentro de la banda donde canta la especie.
- Es clave con lluvia o rio porque evita aceptar segmentos donde la energia viene de ruido amplio o baja frecuencia.
- Si hay pocos candidatos, baja el ratio un poco; si hay demasiados falsos positivos, subelo.

Como elegir entre configuraciones:

- **Conservadora**: primera opcion si el ruido es fuerte y no quieres falsos positivos.
- **Balanceada**: primera opcion general para revisar una carpeta nueva.
- **Sensible**: util si los cantos son suaves, lejanos o escasos; requiere mas revision humana.

Si un reporte marca `possible_damage` o `requires_review`:

- No uses esos derivados automaticamente para entrenamiento.
- Revisa espectrograma y escucha antes de aceptar.
- Sospecha dano si el ruido de fondo sube mas de 6 dB, el contraste baja mas de 3 dB, aparece clipping o aumenta energia de 2000-8000 Hz sin mejorar contraste.
- Para lluvia/rio/viento, prefiere deteccion/corte con bandpass, reduccion suave o apagada, y normalizacion apagada.
- Si la limpieza empeora el contraste, conserva los clips candidatos como material de revision, no como audio final limpio.

Los reportes de calibracion se guardan como JSON, CSV y Markdown en `backend/storage/audio_lab/calibration_reports`. Los previews son derivados de prueba; los audios originales no se modifican.

## Rutas locales y reproduccion

El navegador no puede reproducir rutas locales como `F:\...\audio.wav` directamente. Laboratorio de audio siempre debe pedir el audio al backend mediante una URL segura.

Conceptos visibles en el reproductor y la cola:

- **Ruta original**: de donde viene el audio para trazabilidad. Puede ser una carpeta local, Dataset Curado o un nombre de archivo arrastrado.
- **Copia temporal en uploads**: cuando arrastras/subes un archivo, AcusticaFauna lo copia a `storage/audio_lab/uploads/` para procesarlo de forma segura.
- **playable_url**: URL HTTP del backend usada por el reproductor. No es una ruta local.
- **Output procesado**: WAV derivado de batch, folder-batch, recorte o limpieza. Nunca reemplaza el original.
- **job_allowed_root**: carpeta autorizada solo para un job cuando eliges un audio local fuera de las rutas globales.

Si pegas una ruta de carpeta en el Selector de audio, no se abrira como audio. Usa **Procesamiento masivo por carpeta local**.

Si pegas una ruta de archivo fuera de las rutas permitidas, puedes:

- Usar upload temporal.
- Autorizar la carpeta para un job de lote.
- Configurar `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS` en `.env`.

Ejemplo:

```env
ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\PC202601\Descargasreal;D:\AudiosCampo
```

## Advertencias

- El audio original nunca se modifica.
- Los audios procesados no se usan automaticamente para entrenamiento.
- Si una grabadora externa detecta demasiado ruido, ajusta threshold o sensibilidad.

## Limpieza de resultados de prueba

Cuando pruebas limpieza, procesamiento por lote o reportes de calidad, AcusticaFauna guarda derivados para trazabilidad:

- uploads temporales en `backend/storage/audio_lab/uploads`;
- outputs procesados en `backend/storage/audio_lab/batch_jobs/{job_id}`;
- reportes en `backend/storage/audio_lab/quality_reports`;
- registros del job en SQLite.

Esto no modifica ni borra el audio original. Si solo era una prueba, usa **Mantenimiento de laboratorio**.

Acciones disponibles:

- **Marcar como prueba**: marca el job como temporal para limpiarlo despues.
- **Eliminar outputs de este job**: borra WAV/metadata derivados dentro del job y marca los outputs como `deleted`.
- **Eliminar reporte de calidad**: borra el JSON del reporte y actualiza la referencia del output.
- **Eliminar uploads temporales**: borra copias en uploads solo si no estan usadas por otros jobs.
- **Limpiar pruebas antiguas**: limpia jobs marcados como prueba.

La confirmacion siempre debe decir que se eliminan derivados generados por la app, no audios originales. Si un reporte recomienda `possible_damage` o `requires_review`, no lo uses automaticamente para entrenamiento.

## Errores comunes

- "No hay audios en lote": agrega audio actual, uploads, tabla o rutas manuales.
- "Detector no disponible": revisa que la ML API este activa.
- "Pocos segmentos": baja threshold o usa modo mas sensible.
- "Carpeta no encontrada": revisa que la ruta exista en este computador.
- "ML API no disponible; se omitio detector rana/sapo": puedes seguir con DSP y revisar resultados manualmente.
