# Manual Auditoria feedback

## Para que sirve

Reune feedback humano, conflictos, limpieza de manifests, entrenamiento web, evaluacion, calibracion y registro de modelos.

## Flujo recomendado

1. Filtra feedback por modelo, audio, tipo o estado.
2. Revisa conflictos antes de construir manifests.
3. Usa Preparar nuevo modelo ML para elegir tipo, preset y manifest base.
4. Explora datos y revisa clases debiles.
5. Ejecuta dry-run.
6. Crea manifest limpio.
7. Usa el manifest para entrenamiento.
8. Evalua, calibra y registra solo si cumple reglas.

## Constructor de modelos ML

El constructor sirve para detector rana/sapo, genero, especies por genero, binarios especializados y modelos personalizados. `amphibian_genus_v2` es un preset, no una seccion fija.

## Advertencias

- El dry-run es obligatorio antes de crear manifest.
- No promociones modelos no confiables.
- No se modifican audios ni `dataset_curado`.

## Errores comunes

- Manifest sin clases suficientes: consigue mas datos o usa binario.
- Binario con menos o mas de dos labels: selecciona exactamente dos.
- Conflictos activos: revisa feedback contradictorio antes de entrenar.
