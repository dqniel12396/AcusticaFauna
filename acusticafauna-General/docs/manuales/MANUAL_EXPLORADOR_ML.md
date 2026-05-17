# Manual Explorador ML

## Para que sirve

Permite inspeccionar manifests, ver conteos por clase y encontrar grupos entrenables antes de preparar modelos.

## Flujo recomendado

1. Selecciona un manifest base.
2. Carga resumen.
3. Busca candidatos entrenables.
4. Revisa conteos y splits por clase.
5. Selecciona clases.
6. Ejecuta dry-run especializado.
7. Crea manifest derivado si es apto.

## Campos clave

- Manifest base: CSV fuente.
- Labels principales: clases mas frecuentes.
- Split train/val/test: distribucion usada para ML.
- Minimos: ejemplos requeridos por clase y split.

## Advertencias

- Un grupo con pocos datos puede requerir modelo binario.
- No uses manifests con conflictos sin revision.
- Crear manifest no entrena automaticamente.
