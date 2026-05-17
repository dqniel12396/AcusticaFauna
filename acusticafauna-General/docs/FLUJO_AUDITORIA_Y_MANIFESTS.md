# Flujo de auditoria y manifests ML

## Constructor de modelos ML

La pantalla `/auditoria-retroalimentacion` incluye el flujo `Preparar nuevo modelo ML`. Es un constructor reusable para preparar manifests limpios sin crear secciones hardcodeadas por cada modelo.

Tipos disponibles:

- Detector rana/sapo.
- Clasificador de genero.
- Clasificador de especies por genero.
- Clasificador especializado binario.
- Clasificador personalizado.

Cada tipo autocompleta una configuracion inicial: manifest base, manifest limpio destino, nombre del modelo, output dir, target mode, sample strategy, epochs, batch y seed. Todos los campos siguen siendo editables antes del dry-run.

## Exploracion y reglas

Antes de crear un manifest se debe usar `Explorar datos` y luego `Ejecutar dry-run`.

La exploracion muestra:

- filas totales;
- numero de clases;
- conteo por clase;
- split train/val/test;
- clases debiles;
- recomendacion operativa.

Las reglas de inclusion permiten aplicar feedback acumulado, excluir voz humana, excluir `excluded_from_training`, ignorar `retracted`, bloquear conflictos y marcar clases con pocos ejemplos por split.

## Casos de uso

`amphibian_genus_v2` es un preset del constructor, no una seccion fija. Usa `manifests/amphibian_genus_v1_manifest.csv` como base y propone `manifests/clean/amphibian_genus_v2_clean.csv` como salida.

Para un clasificador de especies por genero, el usuario selecciona el genero, por ejemplo `Dendropsophus`, y el constructor propone `dendropsophus_species_v1` y `manifests/clean/dendropsophus_species_v1_clean.csv`.

Para un binario especializado, el usuario selecciona exactamente dos labels y el constructor propone un nombre tipo `label1_vs_label2_v1`.

## Restricciones

El constructor no entrena automaticamente, no modifica audios originales y no modifica `dataset_curado`. Solo crea manifests derivados y trazables. El entrenamiento se inicia despues desde `Entrenar modelos`.
