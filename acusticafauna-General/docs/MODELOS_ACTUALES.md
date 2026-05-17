# Modelos actuales

## Activos

- `frog_detector_v1_binary_v3_hardneg`: detector rana/sapo, task `frog_detector`, default activo.
- `boana_boans_pugnax_v3_quality045`: clasificador Boana boans vs Boana pugnax, task `boana_boans_pugnax`, default activo.

## Experimentales

- `boana_boans_pugnax_v4_feedback`: candidato experimental si esta presente en el registry.
- `amphibian_genus_v1`: candidato de genero anfibio. Se registra como `experimental` y `is_default_for_task: false`. No confiable: accuracy 0.3799, balanced_accuracy 0.3759, recall Boana 0.0699 y predicciones concentradas en Hyalinobatrachium/Atelopus. No promover.

## Uso por identificacion automatica

`POST /identify/audio-path` usa modelos activos/default por task. Solo considera modelos experimentales si el usuario activa la opcion correspondiente en la web.

Si se fuerza el uso de experimentales y el modelo de genero tiene balanced_accuracy < 0.60, el resultado queda como `requires_review`, confianza `baja` y no se enruta automaticamente a especie.

## Proximo candidato

`amphibian_genus_v2` debe prepararse desde la web con manifest limpio `manifests/clean/amphibian_genus_v2_clean.csv`, estrategia stratified y dry-run obligatorio. Solo se debe promover si balanced_accuracy >= 0.70, recall Boana >= 0.70 y no hay colapso fuerte de prediction_counts.
