# Laboratorio de audio y prediccion rana/sapo

La pagina `/laboratorio-audio` permite probar audios locales con el detector
`frog_detector_v1_binary_v3_hardneg`, revisar resultados por segmento y guardar
feedback humano sin modificar audios originales.

## Servicios necesarios

Backend principal:

```powershell
cd "F:\PROYECTO de cosa de sonido\acusticafauna-General\acusticafauna-Back\backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Servicio ML aislado:

```powershell
cd "F:\PROYECTO de cosa de sonido\acusticafauna-ML"
.\.venv-ml\Scripts\Activate.ps1
python -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload
```

El backend principal no importa OpenSoundscape. Solo consulta el servicio ML por
HTTP usando `ML_API_BASE_URL`, por defecto `http://127.0.0.1:8010`.

Si el servicio ML esta apagado, la pagina muestra:

```text
El servicio ML no esta activo. Inicialo desde acusticafauna-ML para usar prediccion.
```

## Abrir un audio

1. Entra a `/laboratorio-audio`.
2. Usa el selector del Dataset Curado.
3. Filtra por label o por estado: candidato, gold, revisar o ruido.
4. Pulsa `Abrir audio`.

Tambien puedes subir un audio temporal o pegar una ruta local. Los audios
originales no se mueven, no se borran y no se editan.

## Reproducir y seleccionar fragmentos

El reproductor permite:

- play/pause;
- ir al inicio o fin;
- controlar volumen;
- cambiar velocidad a 0.5x, 1x o 1.5x;
- activar loop de seleccion;
- ver tiempo actual y duracion.

En la waveform, arrastra con el mouse para seleccionar un tramo. La seleccion
muestra inicio, fin y duracion. Usa `Reproducir seleccion` para escuchar solo
ese rango o `Limpiar seleccion` para volver al audio completo.

## Generar espectrograma

El espectrograma se genera bajo demanda para evitar crear miles de imagenes.

- Sin seleccion: genera el audio completo.
- Con seleccion: genera solo el tramo seleccionado.
- Desde una fila de deteccion: genera solo ese segmento.

El PNG se devuelve desde el servicio ML y se muestra en la pagina. Puede
descargarse desde `Descargar PNG`.

## Analizar con el detector

Panel: `Detector rana/sapo`.

Valores recomendados:

- Modelo: `frog_detector_v1_binary_v3_hardneg`
- Threshold: `0.30`
- Clip duration: `5`
- Step seconds: `5`

Pulsa `Analizar con detector` para audio completo o `Analizar seleccion` para
un fragmento. El resultado incluye:

- detectado: si/no;
- grupo detectado: `rana_sapo` o `no_rana_sapo`;
- score maximo `rana_sapo`;
- score promedio;
- segmentos detectados;
- tabla con inicio, fin, score, label, reproducir segmento y ver espectrograma.

## Interpretacion

Este modelo detecta el grupo `rana_sapo`. Todavia no identifica especie exacta.

Cuando el resultado sea positivo, debe interpretarse asi:

- Grupo detectado: rana/sapo.
- Especie: no identificada por este modelo.
- Nota: para especie se necesita un clasificador especializado.

`score_rana_sapo` es el score operacional de presencia del grupo. Con threshold
`0.30`, un segmento con score `>= 0.30` se marca como deteccion.

## Guardar feedback

El laboratorio guarda anotaciones nuevas en `audio_lab_annotations`:

- `confirmed_positive`
- `false_positive`
- `false_negative`
- `uncertain`
- `hard_negative`

Campos principales:

- audio_path;
- start_seconds;
- end_seconds;
- model_id;
- predicted_label;
- score;
- user_feedback;
- user_label;
- notes;
- created_at.

Estas acciones no modifican `dataset_curado`, no editan audios originales y no
entrenan modelos automaticamente.

## Hard negatives

Un `hard_negative` es un segmento que el modelo confunde con `rana_sapo`, pero
la revision humana confirma que no contiene rana/sapo. Estos registros sirven
para construir manifests futuros de entrenamiento, por ejemplo con scripts como
`build_hard_negative_manifest.py`.

Antes de usarlos en un entrenamiento nuevo:

1. Exporta o consulta las anotaciones `hard_negative`.
2. Revisa que las rutas y rangos sean correctos.
3. Agrega esos ejemplos al manifest de entrenamiento de una nueva version.
4. Evalua la nueva version en un conjunto no visto.

## Exportar resultados

El boton `Exportar resultados CSV` descarga:

- audio_path;
- start_seconds;
- end_seconds;
- score_rana_sapo;
- predicted_label;
- threshold;
- model_id;
- feedback humano si existe.
