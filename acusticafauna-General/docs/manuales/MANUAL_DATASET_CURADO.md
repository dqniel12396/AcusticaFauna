# Manual Dataset Curado

## Para que sirve

Permite importar y revisar segmentos curados con labels, rutas y trazabilidad.

## Flujo recomendado

1. Importa el manifest curado.
2. Revisa resumen de labels.
3. Filtra por especie, calidad o estado.
4. Abre audios dudosos en Laboratorio.
5. Usa feedback humano para correcciones.

## Advertencias

- Dataset Curado no debe modificarse automaticamente desde entrenamiento.
- Revisa rutas faltantes o duplicadas.
- Mantener labels consistentes facilita construir manifests ML.

## Si un audio no abre

Si ves `audio_path_not_allowed` o `El audio existe, pero esta fuera de las carpetas permitidas`, el registro apunta a un archivo que existe fuera de las rutas autorizadas por el backend.

Para Dataset Curado configura en `.env`:

```env
ACUSTICAFAUNA_DATASET_DIR=F:\PROYECTO de cosa de sonido\dataset_curado
```

Si el manifest trae rutas viejas con `dataset_curado`, AcusticaFauna intenta reconstruir la ruta bajo `ACUSTICAFAUNA_DATASET_DIR` sin modificar la base de datos.

Si el archivo esta en otra carpeta local, autoriza solo esa carpeta:

```env
ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\PC202601\Descargasreal
```

Reinicia el backend y revisa Configuracion -> Rutas de audio permitidas.
