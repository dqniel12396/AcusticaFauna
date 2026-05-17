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
- Reporte de calidad: compara original vs procesado.

## Advertencias

- El audio original nunca se modifica.
- Los audios procesados no se usan automaticamente para entrenamiento.
- Si una grabadora externa detecta demasiado ruido, ajusta threshold o sensibilidad.

## Errores comunes

- "No hay audios en lote": agrega audio actual, uploads, tabla o rutas manuales.
- "Detector no disponible": revisa que la ML API este activa.
- "Pocos segmentos": baja threshold o usa modo mas sensible.
