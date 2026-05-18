# Manual Configuracion

## Rutas de audio permitidas

La tarjeta **Rutas de audio permitidas** muestra las carpetas desde donde el backend puede servir audios al frontend.

Incluye:

- `ACUSTICAFAUNA_DATASET_DIR`
- `ACUSTICAFAUNA_STORAGE_DIR`
- `sample_data`
- `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS`
- rutas temporales autorizadas por sesion o job cuando aplica

## Probar rutas

Pulsa **Probar rutas** para confirmar si las carpetas existen en este computador.

Si una ruta no existe, corrige `.env`, cierra y abre la terminal, y reinicia backend/frontend.

## Copiar ejemplo .env

El boton **Copiar ejemplo .env** genera lineas base para autorizar Dataset Curado y carpetas externas.

Ejemplo:

```env
ACUSTICAFAUNA_DATASET_DIR=F:\PROYECTO de cosa de sonido\dataset_curado
ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\PC202601\Descargasreal;D:\AudiosCampo
```

Autoriza carpetas concretas, no unidades completas como `F:\`, salvo que tengas una razon clara.
