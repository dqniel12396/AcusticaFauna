# Fundamentos ML bioacustica AcusticaFauna

## Identificacion por etapas

La identificacion automatica evita saltar directamente a especie. Primero decide si hay rana/sapo, luego intenta genero, y solo despues usa un clasificador especializado de especie.

Este orden reduce errores: un clasificador Boana solo debe ejecutarse cuando una etapa previa sugiere que el audio pertenece al genero Boana. Si falta un clasificador de genero activo, el sistema conserva el resultado `rana_sapo` y manda a revision humana.

## Confianza y revision

La confianza se reporta como `alta`, `media`, `baja` o `revisar` segun el score usado por la etapa final. Las reglas calibradas tienen prioridad sobre el argmax cuando el modelo las define.

Ningun resultado automatico entra a entrenamiento sin feedback o revision humana.

## Score alto no siempre significa confianza

Un modelo puede producir un score alto y aun asi ser historicamente malo. Por eso la confianza final combina el score del audio con metricas historicas del modelo. Si un clasificador de genero tiene balanced_accuracy < 0.60, se marca como `No confiable`, se baja la confianza a `baja` y no se usa para ruteo automatico hacia especie.

El caso `amphibian_genus_v1` ilustra este riesgo: balanced_accuracy 0.3759 y recall Boana 0.0699. En un audio Boana puede predecir otro genero con score alto por colapso de predicciones.
