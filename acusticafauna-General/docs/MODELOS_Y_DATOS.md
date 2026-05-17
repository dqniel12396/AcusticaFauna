# Modelos y datos

## Politica de GitHub

El repo no debe subir audios reales grandes, `dataset_curado` completo, modelos pesados, outputs temporales, batch jobs ni recortes generados.

## Dataset local

Configura tu dataset con:

```text
ACUSTICAFAUNA_DATASET_DIR=./data/dataset_curado
```

Si no existe dataset, la web debe permitir uploads temporales en Laboratorio de audio.

## Modelos

Los modelos se manejan como paquetes descargables, GitHub Releases o Git LFS si se decide explicitamente.

```bash
python scripts/download_models.py --list
python scripts/download_models.py --pack default
```

Mientras las URLs sean `PENDIENTE_URL_RELEASE`, el script solo informa que falta configurar la descarga.

## Git LFS opcional

`.gitattributes` contiene patrones para modelos (`*.model`, `*.pt`, `*.pth`, etc.). No basta con eso: se debe instalar y activar Git LFS antes de versionar binarios grandes.

## Modelo faltante

La ML API devuelve `model_exists`, `download_status` y `availability_label`. Si falta un archivo, `/models` sigue funcionando y las predicciones devuelven un error claro de `modelo no descargado`.

## sample_data

`sample_data/` queda para pruebas pequenas. No incluye audios de licencia dudosa; cada usuario puede colocar sus propios audios.
