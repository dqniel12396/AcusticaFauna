# Manual Importacion local

## Que es

Importacion local registra resultados externos ya generados. Sirve para traer salidas de BirdNET, CSV de resumen, `selection.table.txt`, espectrogramas y sesiones externas con eventos o predicciones.

## Cuando usarla

Usala cuando ya tienes detecciones, predicciones o espectrogramas producidos fuera de AcusticaFauna y quieres revisarlos en la base local.

Flujo:

```text
Carpeta BirdNET/CSV/espectrogramas -> Importar -> Sesion importada -> Revisar eventos/predicciones
```

## Cuando no usarla

No limpia audios, no reduce ruido, no segmenta por frecuencia y no procesa carpetas grandes de 70 GB.

Para eso usa:

```text
Laboratorio de audio -> Procesamiento masivo por carpeta local
```

## Estructura esperada

La importacion automatica busca:

- Archivos `.BirdNET.selection.table.txt`.
- CSV de resumen si existe.
- Carpeta de segmentos de audio si existe.
- Carpeta de espectrogramas si existe.

Si la estructura no es estandar, usa modo avanzado y asigna cada ruta manualmente.

## Rutas no autorizadas

Si se importan predicciones o espectrogramas, pero los audios no se reproducen, revisa el diagnostico de la sesion.

Si aparece `audio_path_not_allowed`, configura una carpeta segura:

```env
ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\AudiosCampo
```

Si es Dataset Curado:

```env
ACUSTICAFAUNA_DATASET_DIR=F:\PROYECTO de cosa de sonido\dataset_curado
```

No se modifican audios originales ni se entrena automaticamente.
