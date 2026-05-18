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

## Errores comunes

- "No hay audios en lote": agrega audio actual, uploads, tabla o rutas manuales.
- "Detector no disponible": revisa que la ML API este activa.
- "Pocos segmentos": baja threshold o usa modo mas sensible.
- "Carpeta no encontrada": revisa que la ruta exista en este computador.
- "ML API no disponible; se omitio detector rana/sapo": puedes seguir con DSP y revisar resultados manualmente.
