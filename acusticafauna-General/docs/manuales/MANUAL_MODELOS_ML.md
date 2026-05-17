# Manual Modelos ML

## Para que sirve

Administra el registry de modelos ML: activos, experimentales, archivados y rechazados.

## Estados

- active/default: modelo usado automaticamente para una tarea.
- experimental: candidato disponible solo con revision.
- archived: modelo retirado sin borrar archivos.
- rejected: modelo descartado para uso operativo.

## Flujo recomendado

1. Revisa model card y metricas.
2. Verifica balanced_accuracy, recall por clase y prediction_counts.
3. Promueve solo si supera reglas de validacion.
4. Archiva o rechaza modelos no adecuados.

## Advertencias

- Score alto en un audio no implica modelo confiable.
- Modelos con balanced_accuracy menor a 0.60 son No confiables.
- Modelos de genero deben superar BA >= 0.70, recall Boana >= 0.70 y no colapsar hacia pocas clases.
