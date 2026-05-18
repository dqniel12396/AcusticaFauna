# Guia tecnica ML AcusticaFauna

## Reporte de calidad original vs procesado

El endpoint `POST /api/audio-lab/audio-processing/quality-report` compara un audio fuente contra una copia procesada. Calcula duracion, sample rate, peak, clipping, RMS dBFS, ruido de fondo aproximado, actividad, contraste y energia por bandas.

El reporte nunca modifica el audio original. Genera un JSON trazable en:

```text
backend/storage/audio_lab/quality_reports/{report_id}.quality.json
```

El filename usa UUID para evitar problemas con nombres biologicos o rutas largas en Windows. El JSON conserva los nombres y rutas completas de fuente y procesado.

## Identidad legible vs rutas tecnicas

Los outputs procesados pueden tener nombres fisicos cortos, por ejemplo `a7588cb3-b6f_seg_0001_denoised.wav`. Ese nombre es una decision de almacenamiento para evitar errores de ruta larga en Windows, no una etiqueta semantica.

Para ML, revision humana y auditoria, la API devuelve identidad legible separada:

- `display_name`: nombre humano basado en el audio fuente y segmento.
- `display_label`: nombre humano con estado procesado.
- `source_audio_name` y `processed_audio_name`: nombres de archivo fuente/procesado.
- `source_audio_path` y `processed_audio_path`: rutas tecnicas completas.
- `batch_job_name`, `batch_job_id` y `batch_output_id`: trazabilidad del job.
- `processing_preset` y `processing_method`: configuracion visible de procesamiento.

La UI debe mostrar primero `display_name` o `display_label`, y dejar las rutas completas en paneles de detalles o botones de copiar. Esto evita que el usuario confunda un UUID tecnico con el origen biologico del audio.

## Recomendacion ML

La recomendacion del reporte es una ayuda para revision:

- `bueno_para_revision`: mejora el contraste y no introduce clipping relevante.
- `mejora_ligera`: hay mejora pequena, conviene revisar visual y auditivamente.
- `procesado_puede_empeorar`: el contraste cae o hay senales de perdida util.
- `posible_dano`: hay clipping, perdida fuerte en bandas utiles o duracion inconsistente.

La recomendacion de entrenamiento por defecto es `requires_review`. Un audio procesado no se usa automaticamente para entrenamiento ni registra modelos.

## Identificacion automatica por etapas

La ML API expone `POST /identify/audio-path`. Este endpoint selecciona modelos desde el registry por `task` y ejecuta un pipeline:

1. `frog_detector`: detector rana/sapo activo/default.
2. `amphibian_genus`: clasificador de genero activo/default, si existe.
3. `boana_boans_pugnax`: clasificador especializado si el genero predicho es `Boana`.

Si no hay clasificador de genero activo, el endpoint devuelve `rana_sapo`, `final_level: rana`, y una advertencia controlada. No falla el flujo ni intenta clasificar especie sin una etapa de genero confiable.

Los modelos experimentales solo se consideran si el usuario activa `use_experimental_models`. El candidato `amphibian_genus_v1` queda registrado como `experimental` y `is_default_for_task: false`; no se usa automaticamente hasta promoverlo desde Modelos ML.

### Proteccion por bajo rendimiento

`amphibian_genus_v1` no es confiable para ruteo automatico: accuracy 0.3799, balanced_accuracy 0.3759 y recall Boana 0.0699. Aunque devuelva un score alto, la identificacion automatica baja la confianza a `baja`, recomienda `requires_review` y no usa ese genero para enviar automaticamente a clasificadores especializados.

Modelos con balanced_accuracy < 0.60 se muestran como `No confiable`. Para modelos de genero, la promocion exige balanced_accuracy >= 0.70, recall Boana >= 0.70 y ausencia de colapso fuerte hacia Hyalinobatrachium/Atelopus.

### Constructor de modelos ML

En `/auditoria-retroalimentacion` la seccion `Preparar nuevo modelo ML` funciona como constructor generico. Permite preparar manifests limpios para detector rana/sapo, clasificador de genero, clasificador de especies por genero, clasificador especializado binario y clasificadores personalizados.

El constructor autocompleta `manifest base`, `manifest limpio destino`, `model_name`, `output_dir`, `target_mode`, `sample_strategy`, `epochs`, `batch` y `seed` segun el tipo elegido. Tambien permite reglas de inclusion: aplicar feedback acumulado, excluir voz humana, excluir `excluded_from_training`, ignorar `retracted`, bloquear conflictos y marcar clases debiles con minimos por split.

El boton `Explorar datos` muestra filas, clases, conteo por clase, split train/val/test, clases debiles y una recomendacion. El dry-run sigue siendo obligatorio antes de crear el manifest limpio o usarlo para entrenamiento.

`amphibian_genus_v2` ya no es una seccion fija: queda como preset `Clasificador de genero anfibio v2`, con manifest base `manifests/amphibian_genus_v1_manifest.csv`, salida `manifests/clean/amphibian_genus_v2_clean.csv`, `target_mode: multiclass` y `sample_strategy: stratified`. Las reglas de promocion siguen siendo balanced_accuracy >= 0.70, recall Boana >= 0.70 y ausencia de colapso fuerte.

La UI muestra el manifest base como selector cargado desde la ML API. Cuando hay resumen disponible, cada opcion muestra nombre, tipo inferido, filas y clases. Los campos tecnicos (`model_name`, `job_name`, `output_dir` y manifest limpio destino) quedan en `Opciones avanzadas`, con valores autogenerados desde el preset.

Cada pagina principal tiene un boton `Manual de esta pagina` que abre una ruta `/manual/...` en nueva pestaña. Los manuales Markdown iniciales viven en `docs/manuales/` y explican flujo recomendado, botones, campos, advertencias, ejemplos y errores comunes.

## Rutas configurables para release local

El backend y la ML API cargan `.env` desde la raiz del repo o desde su carpeta local. Las rutas ya no deben depender de una ruta absoluta del equipo de desarrollo.

Variables relevantes:

- `ACUSTICAFAUNA_STORAGE_DIR`
- `ACUSTICAFAUNA_DATASET_DIR`
- `ACUSTICAFAUNA_ML_API_URL`
- `ACUSTICAFAUNA_ML_ROOT`
- `ACUSTICAFAUNA_MODELS_DIR`
- `ACUSTICAFAUNA_MANIFESTS_DIR`
- `ACUSTICAFAUNA_OUTPUTS_DIR`
- `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS`
- `ACUSTICAFAUNA_RESOURCE_PROFILE`

Los manifests reales que contienen rutas locales deben mantenerse fuera de Git y regenerarse o compartirse como artefactos controlados.

### Allowed audio roots

Los endpoints de audio resuelven rutas mediante `resolve_allowed_audio_path(input_path, allowed_roots)`. La funcion normaliza separadores Windows/Linux, evita traversal, acepta rutas absolutas solo dentro de roots permitidos y devuelve errores JSON claros.

Roots globales:

- `ACUSTICAFAUNA_DATASET_DIR`
- `ACUSTICAFAUNA_STORAGE_DIR`
- uploads/clips/processed/cache bajo storage
- `sample_data`
- `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS`

Roots de job/sesion:

- Batch processing puede recibir `job_allowed_roots` para autorizar la carpeta padre de un archivo elegido por el usuario.
- Folder-batch usa la carpeta escaneada y validada como root permitido solo para ese job.

Si una ruta antigua contiene `dataset_curado`, el resolver intenta reconstruir la ruta relativa bajo `ACUSTICAFAUNA_DATASET_DIR` en runtime. No migra la base de datos automaticamente.

## Errores controlados

Si el detector rana/sapo no esta disponible, el reporte se genera igual y agrega warning `detector no disponible`. Si el backend no puede guardar el JSON o registrar el reporte, responde un error JSON con detalle breve en lugar de dejar una excepcion sin controlar.
