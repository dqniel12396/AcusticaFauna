# 00 Diagnóstico AcusticaFauna

## 1. Resumen ejecutivo

El espacio de trabajo contiene varias piezas relacionadas con AcusticaFauna / GT-Híbrido, pero todavía no aparece como un producto integrado y ordenado bajo un solo paquete.

Lo que ya existe con evidencia en el repositorio:

- Un backend en `acusticafauna-General/acusticafauna-Back/backend` basado en FastAPI y SQLite manual con `sqlite3`.
- Un frontend en `acusticafauna-General/acusticafauna-frontend` basado en React + Vite + Tailwind.
- Un importador local que lee resultados `.BirdNET.selection.table.txt`, busca `resumen_espectrogramas.csv`, copia segmentos de audio/espectrogramas y registra sesiones, eventos y predicciones en SQLite.
- Un proyecto separado de ranas/aves en `PROYECTOGIT/Proyecto_Ranas_Aves` con datasets `train/` y `test/`, resultados BirdNET, espectrogramas, segmentos recortados y modelos `.tflite`.
- Un conjunto pequeño de audios de referencia en `Birdnet/FaunaGeneral_V1`, actualmente con clase `Aves` poblada y carpetas vacías para `Anuros`, `Background` e `Insectos`.
- Artículos, guías PDF, audios de prueba y videos que parecen materiales de investigación o referencia.

Lo que falta para llegar al sistema integrado AcusticaFauna:

- No se encontró código del grabador GT-Híbrido de Raspberry Pi dentro de este espacio de trabajo: no hay scripts con `arecord`, ALSA, RMS dBFS, `metadata_sistema.csv`, buffers de eventos, systemd o segmentación continua de 10 minutos.
- No hay motores internos ejecutando BirdNET, OpenSoundscape ni RIBBIT desde el backend. Hoy se importan resultados BirdNET ya generados externamente.
- No hay sistema completo de revisión humana persistida, taxonomía editable, etiquetas multietiqueta, entrenamiento/reentrenamiento ni versionado de modelos dentro de AcusticaFauna.
- No hay estructura de tests automatizados para backend/frontend.
- El backend usa rutas absolutas de Windows y `requirements.txt` está vacío, lo que dificulta reproducibilidad.

Supuesto razonable: GT-Híbrido ya existe o debe considerarse como componente de campo externo a este repositorio, ejecutándose en Raspberry Pi y generando carpetas de salida que AcusticaFauna central debe importar.

## 2. Inventario del repositorio

### Carpetas principales

| Ruta | Función probable | Recomendación |
| --- | --- | --- |
| `acusticafauna-General/` | Prototipo principal de AcusticaFauna con backend, frontend y entorno virtual local. | Mantener como base, pero ordenar estructura y dependencias. |
| `acusticafauna-General/acusticafauna-Back/backend/` | Backend FastAPI local para importación de resultados BirdNET a SQLite. | Mantener y refactorizar incrementalmente. |
| `acusticafauna-General/acusticafauna-frontend/` | Interfaz React/Vite con dashboard, eventos, detalle, dispositivos, estadísticas, sincronización y configuración. | Mantener, conectar a API real y retirar datos mock gradualmente. |
| `acusticafauna-General/.venv/` | Entorno virtual local. | No tocar sin confirmación; no debe versionarse. |
| `acusticafauna-General/acusticafauna-frontend/node_modules/` | Dependencias instaladas del frontend. | No tocar sin confirmación; no debe versionarse. |
| `PROYECTOGIT/Proyecto_Ranas_Aves/` | Subrepositorio Git con datasets, resultados BirdNET, generación de espectrogramas y modelos TFLite. | Mantener como referencia experimental; migrar solo piezas útiles a AcusticaFauna. |
| `Birdnet/FaunaGeneral_V1/` | Dataset pequeño por clases generales: `Aves`, `Anuros`, `Background`, `Insectos`. | Mantener como datos de referencia; completar clases vacías si se usa. |
| `Articulos/` | PDFs de investigación bioacústica, anuros, edge computing y monitoreo acústico. | Mantener como referencias, no mezclar con código. |
| `pruebas de audio/` | Audios y archivos `.sv` de prueba. | Mantener como datos de prueba manual; normalizar ubicación futura. |
| `videos/` | Videos de referencia. | Mantener fuera de la arquitectura principal. |

### Archivos importantes de backend

| Ruta | Función probable | Recomendación |
| --- | --- | --- |
| `acusticafauna-General/acusticafauna-Back/backend/app/main.py` | Crea app FastAPI, CORS, startup, inicializa storage/DB e incluye rutas. | Mantener y refactorizar cuando se agreguen motores internos. |
| `acusticafauna-General/acusticafauna-Back/backend/app/core/config.py` | Configuración con rutas absolutas a Windows y directorios de storage. | Refactorizar: usar variables de entorno y rutas relativas/configurables. |
| `acusticafauna-General/acusticafauna-Back/backend/app/db/database.py` | Conexión SQLite manual con WAL, `check_same_thread=False`. | Mantener inicialmente; evaluar SQLAlchemy/SQLModel en fase posterior. |
| `acusticafauna-General/acusticafauna-Back/backend/app/db/init_db.py` | Crea tablas `import_sessions`, `events`, `predictions`; agrega columnas si faltan. | Mantener para Fase 1; luego migrar a Alembic o migraciones controladas. |
| `acusticafauna-General/acusticafauna-Back/backend/app/services/import_service.py` | Importador principal de selection tables, CSV, segmentos y espectrogramas; deduplica por fingerprint. | Mantener y refactorizar: separar importación BirdNET externa de ingestión GT-Híbrido. |
| `acusticafauna-General/acusticafauna-Back/backend/app/services/discovery_service.py` | Descubre selection tables, CSV resumen y carpetas por nombres. | Mantener y ampliar para `metadata_sistema.csv`. |
| `acusticafauna-General/acusticafauna-Back/backend/app/services/csv_index_service.py` | Indexa `resumen_espectrogramas.csv` por audio y tiempos. | Mantener, pero crear indexador específico para `metadata_sistema.csv`. |
| `acusticafauna-General/acusticafauna-Back/backend/app/services/selection_table_service.py` | Lee tablas BirdNET tabuladas y agrupa predicciones por ventana. | Mantener como parser de resultados BirdNET externos. |
| `acusticafauna-General/acusticafauna-Back/backend/app/services/storage_service.py` | Crea carpetas, calcula SHA256 y copia archivos con nombre seguro. | Mantener; añadir política de librería de audio y no duplicación. |
| `acusticafauna-General/acusticafauna-Back/backend/app/api/routes/imports.py` | Endpoints `/api/imports/local` y `/api/imports/local-advanced`. | Mantener; ampliar con importador GT-Híbrido. |
| `acusticafauna-General/acusticafauna-Back/backend/app/api/routes/events.py` | Lista eventos y detalle con predicciones. | Mantener; añadir filtros, paginación y etiquetas humanas. |
| `acusticafauna-General/acusticafauna-Back/backend/app/api/routes/sessions.py` | Lista sesiones de importación. | Mantener. |
| `acusticafauna-General/acusticafauna-Back/backend/app/api/routes/media.py` | Sirve archivos locales desde ruta absoluta recibida por query. | Refactorizar por seguridad: no exponer cualquier ruta absoluta. |
| `acusticafauna-General/acusticafauna-Back/backend/app/schemas/import_job.py` | Pydantic models para importación. | Mantener y ampliar. |
| `acusticafauna-General/acusticafauna-Back/backend/requirements.txt` | Archivo de dependencias. Está vacío. | Refactorizar urgentemente: declarar FastAPI, Uvicorn, Pydantic, etc. |
| `acusticafauna-General/acusticafauna-Back/backend/storage/db/acusticafauna_local.db` | Base SQLite local existente. | No tocar sin confirmación; contiene datos importados. |

### Archivos importantes de frontend

| Ruta | Función probable | Recomendación |
| --- | --- | --- |
| `acusticafauna-General/acusticafauna-frontend/package.json` | React 19, Vite beta, Tailwind 4, React Router 7. | Mantener con cuidado; revisar uso de Vite beta antes de producción. |
| `acusticafauna-General/acusticafauna-frontend/src/services/api.js` | Cliente API apuntando a `http://127.0.0.1:8000/api`. | Mantener; mover base URL a configuración. |
| `acusticafauna-General/acusticafauna-frontend/src/routes/AppRouter.jsx` | Rutas de dashboard, eventos, detalle, dispositivos, estadísticas, sincronización y configuración. | Mantener. |
| `acusticafauna-General/acusticafauna-frontend/src/pages/SyncPage.jsx` | Pantalla de importación local avanzada. | Mantener y adaptar a importador GT-Híbrido. |
| `acusticafauna-General/acusticafauna-frontend/src/pages/EventsPage.jsx` | Vista de eventos. | Mantener; añadir revisión humana. |
| `acusticafauna-General/acusticafauna-frontend/src/pages/EventDetailPage.jsx` | Detalle de evento con audio, espectrograma y predicciones. | Mantener; será base de revisión. |
| `acusticafauna-General/acusticafauna-frontend/src/data/mock*.js` | Datos mock para UI. | Reemplazar gradualmente por API real. |

### Proyecto experimental ranas/aves

| Ruta | Función probable | Recomendación |
| --- | --- | --- |
| `PROYECTOGIT/Proyecto_Ranas_Aves/scripts/Generar_Espectograma.py` | Script Pandas/SciPy/SoundFile/Matplotlib para leer tablas BirdNET, recortar segmentos y generar espectrogramas/CSV. | Mantener como referencia; no integrarlo sin refactor. Tiene rutas absolutas de otro equipo. |
| `PROYECTOGIT/Proyecto_Ranas_Aves/Resultados/*.BirdNET.selection.table.txt` | Salidas BirdNET tabuladas; 15 archivos `.txt` y 1 CSV de parámetros. | Mantener como datos de ejemplo. |
| `PROYECTOGIT/Proyecto_Ranas_Aves/espectogramas/` | 51 espectrogramas PNG, 51 segmentos WAV y `resumen_espectrogramas.csv`. | Mantener como dataset de prueba para importador. |
| `PROYECTOGIT/Proyecto_Ranas_Aves/modelos/clasificador ranas.tflite` | Modelo TFLite binario, etiquetas `otros_ruidos` y `rana`. | No tocar sin confirmación; posible modelo propio inicial. |
| `PROYECTOGIT/Proyecto_Ranas_Aves/output/Detector de ranas_v2.tflite` | Modelo TFLite con 19 clases, incluyendo especies de anuros y `otros_ruidos`. | No tocar sin confirmación; candidato para motor propio/RIBBIT-equivalente. |
| `PROYECTOGIT/Proyecto_Ranas_Aves/train/` | Dataset de entrenamiento por clase; incluye 3200 `otros_ruidos` y varias especies con pocos ejemplos. | Mantener; revisar balance y procedencia. |
| `PROYECTOGIT/Proyecto_Ranas_Aves/test/` | Dataset de prueba por clase; incluye 800 `otros_ruidos`. | Mantener; no mezclar con train. |

### Archivos que no deben tocarse sin confirmación

- Bases de datos: `acusticafauna-General/acusticafauna-Back/backend/storage/db/acusticafauna_local.db`.
- Modelos binarios: `*.tflite` en `PROYECTOGIT/Proyecto_Ranas_Aves/modelos/` y `output/`.
- Datasets grandes de audio, espectrogramas y segmentos: `train/`, `test/`, `espectogramas/`, `storage/audio/`, `storage/spectrograms/`, `Birdnet/FaunaGeneral_V1/`, `pruebas de audio/`.
- Entornos y dependencias instaladas: `.venv/`, `node_modules/`.
- PDFs y videos de referencia.
- Subrepositorio Git `PROYECTOGIT/Proyecto_Ranas_Aves/`, salvo que la tarea futura indique trabajar allí.

## 3. Lo que ya resuelve el GT-Híbrido

No se encontró el código fuente del GT-Híbrido en este espacio de trabajo. La búsqueda no encontró referencias a `arecord`, ALSA, `metadata_sistema.csv`, RMS dBFS, systemd, buffers de pre/post evento, umbrales ni segmentación continua.

Con base en el contexto funcional indicado por el usuario, debe considerarse que la Raspberry ya resuelve o debe resolver:

- Captura de audio desde ALSA/`arecord`.
- Procesamiento en ventanas de 100 ms.
- Cálculo de RMS en dBFS.
- Detección por umbral.
- Guardado continuo en segmentos de 10 minutos.
- Guardado de clips de eventos cuando se supera el umbral.
- Inclusión de pre-buffer antes del evento y post-buffer después.
- Exportación WAV/FLAC.
- Generación de `metadata_sistema.csv`.
- Modo solo eventos para evitar almacenar silencio.
- Estructura de salida por fecha, por ejemplo:

```text
/home/pi/prueba_ruido/
  sistema_integrado.log
  2026-05-11/
    continuo/
    eventos/
    metadata_sistema.csv
```

Para AcusticaFauna central, esta salida debe tratarse como el contrato de entrada del importador. La primera implementación no debería intentar reemplazar el grabador de Raspberry; debería indexar y preservar fielmente lo que GT-Híbrido ya produce.

## 4. Lo que falta para AcusticaFauna central

- Importador de audios GT-Híbrido: falta un importador específico para carpetas por fecha, `continuo/`, `eventos/` y `metadata_sistema.csv`.
- Indexador: existe indexación de `resumen_espectrogramas.csv`, pero falta indexación robusta de archivos de audio crudos, hashes, duraciones, fechas, dispositivo, estación, modo de grabación y relación evento/continuo.
- Base de datos: existe SQLite con `import_sessions`, `events` y `predictions`, pero faltan tablas para `audio_files`, `raspberry_devices`, `human_labels`, `label_taxonomy`, `model_versions` y `processing_jobs`.
- Motor BirdNET: hoy se importan tablas BirdNET ya generadas. Falta ejecutar BirdNET como motor interno desde backend/worker.
- Motor OpenSoundscape: no se encontró dependencia ni integración. Falta usarlo para audio, espectrogramas, predicción con CNNs, embeddings y transferencia.
- Motor RIBBIT: no se encontró integración. Falta motor especializado o equivalente para llamadas periódicas de ranas/sapos.
- Fusión de predicciones: no existe un módulo que combine BirdNET, OpenSoundscape, RIBBIT y modelos propios con reglas de prioridad/confianza.
- Interfaz de revisión: el frontend muestra eventos y predicciones, pero falta flujo de aceptar/corregir, multi-etiquetar y guardar revisión humana.
- Sistema de etiquetas: no existe taxonomía editable ni etiquetas nuevas creadas por usuarios.
- Entrenamiento/reentrenamiento: existen modelos TFLite y datasets, pero no pipeline integrado para construir datasets corregidos, entrenar, evaluar y versionar modelos.
- Exportación de resultados: no se encontró exportador CSV/Parquet consolidado desde la base central.

## 5. Propuesta de arquitectura integrada

```text
Raspberry GT-Híbrido
  -> carpeta de salida por fecha
     -> continuo/
     -> eventos/
     -> metadata_sistema.csv
  -> importador AcusticaFauna
  -> base de datos
     -> audio_files
     -> raspberry_devices
     -> predictions
     -> human_labels
     -> label_taxonomy
     -> model_versions
     -> processing_jobs
  -> motores de análisis
     -> BirdNET
     -> OpenSoundscape
     -> RIBBIT / modelos propios de ranas
  -> fusión
  -> revisión humana
  -> dataset entrenable
  -> nuevo modelo
  -> reportes CSV/Parquet
```

Principio de diseño: BirdNET, OpenSoundscape, RIBBIT y modelos propios deben ser motores internos. El usuario final debe ver un solo sistema: AcusticaFauna.

El backend debe separar claramente:

- Ingesta: traer archivos y metadata desde Raspberrys o carpetas locales.
- Almacenamiento: copiar o registrar audios sin duplicar, calcular hashes y mantener trazabilidad.
- Procesamiento: ejecutar motores y guardar resultados.
- Revisión: permitir corrección humana sin perder predicciones originales.
- Entrenamiento: convertir revisiones en datasets reproducibles y versiones de modelo.
- Reportes: exportar consultas y agregados.

## 6. Propuesta de estructura de carpetas

Adaptada al estado actual, conviene evolucionar desde `acusticafauna-General/acusticafauna-Back/backend/app` en vez de crear otro backend paralelo inmediatamente.

```text
acusticafauna-General/
  acusticafauna-Back/
    backend/
      app/
        main.py
        core/
          config.py
        db/
          database.py
          init_db.py
          migrations/
        models/
        schemas/
        repositories/
        services/
        api/
          routes/
        ingest/
          gt_hibrido_importer.py
          metadata_sistema_parser.py
          birdnet_selection_importer.py
        engines/
          birdnet_engine.py
          opensoundscape_engine.py
          ribbit_engine.py
          custom_tflite_engine.py
          fusion_engine.py
        review/
          label_service.py
          review_service.py
        training/
          dataset_builder.py
          train_jobs.py
          model_registry.py
        reports/
          csv_exporter.py
          parquet_exporter.py
      storage/
        db/
        audio/
        spectrograms/
        originals/
        imports/
        models/
        predictions/
        labels/
        reports/
  acusticafauna-frontend/
    src/
      pages/
      components/
      services/
      data/
  docs/
  tests/
```

Si se decide unificar y renombrar con un paquete más limpio, la estructura objetivo podría ser:

```text
acusticafauna/
  app/
    main.py
    config.py
    database.py
    models.py
    ingest/
    engines/
      birdnet_engine.py
      opensoundscape_engine.py
      ribbit_engine.py
      fusion_engine.py
    review/
    training/
    reports/
  data/
    incoming/
    library/
    predictions/
    labels/
    models/
  docs/
  tests/
```

Recomendación: no mover carpetas grandes todavía. Primero documentar contratos, implementar Fase 1 sobre el backend actual y luego decidir renombrado/migración.

## 7. Modelo de datos inicial

### `raspberry_devices`

- `id`: UUID/string primary key.
- `device_code`: identificador corto, único, por Raspberry.
- `hostname`: nombre del host si está disponible.
- `location_name`: estación o sitio.
- `latitude`: coordenada opcional.
- `longitude`: coordenada opcional.
- `habitat`: descripción opcional.
- `microphone_model`: micrófono usado.
- `sample_rate_hz`: tasa esperada.
- `channels`: número de canales.
- `created_at`: fecha de registro.
- `updated_at`: última edición.

### `audio_files`

- `id`: UUID/string primary key.
- `device_id`: FK a `raspberry_devices`.
- `import_session_id`: FK a sesión/proceso de importación.
- `source_path`: ruta original en Raspberry o disco importado.
- `stored_path`: ruta interna en biblioteca.
- `file_name`: nombre de archivo.
- `file_hash_sha256`: hash para deduplicación.
- `format`: WAV, FLAC, MP3.
- `sample_rate_hz`: tasa real.
- `channels`: canales.
- `duration_seconds`: duración.
- `recording_start`: timestamp de inicio si se conoce.
- `recording_end`: timestamp de fin si se conoce.
- `recording_mode`: `continuo`, `evento`, `desconocido`.
- `rms_dbfs`: RMS agregado si viene de metadata.
- `threshold_dbfs`: umbral usado si aplica.
- `pre_buffer_seconds`: pre-buffer aplicado si aplica.
- `post_buffer_seconds`: post-buffer aplicado si aplica.
- `metadata_json`: metadata adicional cruda.
- `created_at`: fecha de importación.

### `predictions`

- `id`: UUID/string primary key.
- `audio_file_id`: FK a `audio_files`.
- `event_id`: FK opcional si se mantiene tabla `events`.
- `model_version_id`: FK a `model_versions`.
- `engine_name`: `birdnet`, `opensoundscape`, `ribbit`, `custom_tflite`, `fusion`.
- `label`: etiqueta predicha.
- `common_name`: nombre común opcional.
- `scientific_name`: nombre científico opcional.
- `species_code`: código de especie/clase.
- `confidence`: score.
- `start_time_seconds`: inicio dentro del audio.
- `end_time_seconds`: fin dentro del audio.
- `low_freq_hz`: frecuencia baja opcional.
- `high_freq_hz`: frecuencia alta opcional.
- `rank_order`: ranking dentro de la ventana.
- `raw_output_json`: salida completa del motor.
- `created_at`: fecha de predicción.

### `human_labels`

- `id`: UUID/string primary key.
- `audio_file_id`: FK a `audio_files`.
- `prediction_id`: FK opcional a predicción corregida.
- `label_id`: FK a `label_taxonomy`.
- `start_time_seconds`: inicio anotado.
- `end_time_seconds`: fin anotado.
- `presence`: `presente`, `ausente`, `incierto`.
- `confidence_human`: opcional.
- `reviewer`: usuario/persona.
- `notes`: comentarios.
- `is_training_candidate`: booleano.
- `created_at`: fecha de revisión.
- `updated_at`: última edición.

### `label_taxonomy`

- `id`: UUID/string primary key.
- `name`: etiqueta interna estable.
- `display_name`: nombre visible.
- `parent_id`: FK opcional para jerarquía.
- `label_type`: `general`, `species`, `noise`, `human_activity`, `unknown`.
- `scientific_name`: si aplica.
- `common_name`: si aplica.
- `description`: descripción.
- `is_active`: booleano.
- `created_at`: fecha de creación.

### `model_versions`

- `id`: UUID/string primary key.
- `engine_name`: `birdnet`, `opensoundscape`, `ribbit`, `custom_tflite`, `fusion`.
- `model_name`: nombre.
- `version`: versión semántica o fecha.
- `model_path`: ruta local si aplica.
- `labels_path`: ruta a etiquetas si aplica.
- `training_dataset_ref`: referencia al dataset usado.
- `metrics_json`: métricas de evaluación.
- `parameters_json`: hiperparámetros/configuración.
- `license`: licencia conocida.
- `created_at`: fecha de registro.

### `processing_jobs`

- `id`: UUID/string primary key.
- `job_type`: `import`, `birdnet_predict`, `opensoundscape_predict`, `ribbit_predict`, `fusion`, `export`, `training`.
- `status`: `pending`, `running`, `completed`, `failed`, `cancelled`.
- `input_ref`: ruta, query o lote.
- `output_ref`: ruta o entidad generada.
- `engine_name`: motor asociado si aplica.
- `model_version_id`: FK opcional.
- `started_at`: inicio.
- `finished_at`: fin.
- `progress`: 0-100.
- `error_message`: error si falla.
- `metadata_json`: contexto adicional.

## 8. Taxonomía inicial de etiquetas

El sistema debe ser multietiqueta. Un mismo audio puede contener `ave + lluvia`, `rana_sapo + insecto`, `voz_humana + perro`, `vehiculo_motor + viento`, etc. Las etiquetas humanas no deben reemplazar automáticamente las predicciones originales; deben convivir como una capa de revisión.

Etiquetas mínimas iniciales:

- `ave`
- `ave_especie_probable`
- `rana_sapo`
- `insecto`
- `mamifero`
- `voz_humana`
- `vehiculo_motor`
- `lluvia`
- `viento`
- `agua`
- `perro`
- `ganado`
- `silencio_falso_evento`
- `desconocido_biologico`
- `desconocido_ruido`

Además, para anuros conviene permitir etiquetas de especie cuando exista evidencia o modelo:

- `Boana_boans`
- `Boana_platanera`
- `Boana_pugnax`
- `Atelopus_*`
- `Centrolene_*`
- Otras clases presentes en `Detector de ranas_v2_Labels.txt`.

## 9. Plan de implementación por fases

### Fase 1

- Crear importador de audios GT-Híbrido.
- Usar SQLite inicial.
- Indexar `metadata_sistema.csv`.
- Registrar archivos de `continuo/` y `eventos/`.
- Calcular hash y evitar duplicados.
- Crear CLI básica para importar una carpeta de Raspberry.
- Añadir pruebas enfocadas en parsing e indexación.

### Fase 2

- Integrar motor BirdNET interno.
- Ejecutar análisis desde backend/CLI sobre audios importados.
- Guardar predicciones normalizadas en DB.
- Exportar predicciones a CSV.

### Fase 3

- Integrar motor OpenSoundscape básico.
- Añadir clases generales y/o embeddings.
- Crear fusión simple entre BirdNET, OpenSoundscape y modelos propios.
- Guardar salida de fusión como predicción de motor `fusion`.

### Fase 4

- Construir interfaz web de revisión.
- Aceptar/corregir etiquetas.
- Agregar etiqueta nueva desde UI.
- Guardar revisiones humanas multietiqueta.
- Añadir filtros por motor, confianza, etiqueta, fecha, dispositivo y estado de revisión.

### Fase 5

- Crear dataset positivo/negativo desde revisiones.
- Implementar entrenamiento/reentrenamiento.
- Registrar versiones de modelos.
- Comparar métricas antes de promover un modelo.

### Fase 6

- Reportes CSV/Parquet.
- Mapas/estaciones.
- Consultas inteligentes por especie, estación, fecha, hora, clima/ruido y confianza.
- Gestión de almacenamiento y archivado.

## 10. Decisiones técnicas recomendadas

- Python 3.11 o 3.12: buena compatibilidad con FastAPI, ciencia de datos y ML. Validar compatibilidad exacta de BirdNET/OpenSoundscape antes de fijar versión.
- SQLite al inicio: suficiente para una estación local, importaciones iniciales y prototipo revisable. Migrar a PostgreSQL si crecen usuarios concurrentes, volumen o consultas geográficas.
- SQLAlchemy o SQLModel: recomendable para reemplazar SQL manual cuando el esquema crezca. SQLModel puede ser cómodo por Pydantic/FastAPI; SQLAlchemy puro ofrece más control.
- Typer para CLI: ideal para comandos como `import-gt`, `run-birdnet`, `export-csv`, `build-training-dataset`.
- FastAPI para backend: ya existe y encaja con API local, frontend y jobs.
- Streamlit o FastAPI + frontend simple para revisión: como ya existe React, conviene continuar con FastAPI + React si se quiere una app más integrada. Streamlit puede servir para prototipos rápidos de revisión/análisis.
- Pandas/Polars para tablas: Pandas ya aparece en el script experimental; Polars puede ser útil si el volumen crece.
- PyArrow/Parquet para resultados masivos: conveniente para exportar grandes predicciones y análisis por lotes.
- Docker opcional: útil cuando dependencias ML se estabilicen; no imprescindible para Fase 1 local.
- pytest para tests: necesario para proteger parsers, deduplicación, importadores y migraciones.

Primera decisión práctica: declarar dependencias reales del backend. `requirements.txt` está vacío aunque el código importa FastAPI y Pydantic.

## 11. Riesgos y dudas

- Sistema operativo del servidor central: el código actual está amarrado a rutas absolutas de Windows; GT-Híbrido corre en Raspberry/Linux.
- Si se usará GPU: BirdNET/OpenSoundscape pueden funcionar en CPU, pero el volumen puede exigir GPU.
- Volumen real de audios: cantidad de Raspberrys, horas por día, modo continuo/eventos y duración de retención.
- Formato final de audios: WAV/FLAC/MP3, tasa de muestreo, mono/estéreo y normalización.
- Número de Raspberrys y cómo se identificarán: hostname, serial, estación, coordenadas.
- Especies objetivo: aves generales, especies locales, anuros prioritarios, insectos, mamíferos o ruido humano.
- Modo offline: si no habrá internet, los modelos y dependencias deben empaquetarse previamente.
- Licencias de modelos BirdNET, OpenSoundscape, Bioacoustics Model Zoo, Perch, HawkEars y modelos propios.
- Capacidad de almacenamiento: continuo de 10 minutos puede crecer rápido; modo eventos reduce silencio pero puede perder contexto si el umbral está mal calibrado.
- Seguridad del endpoint `/api/media/file`: actualmente sirve rutas absolutas arbitrarias si existen.
- Reproducibilidad: rutas absolutas en backend y script experimental; `requirements.txt` vacío; no hay tests automatizados.
- Calidad de datos: dataset de ranas está desbalanceado, con algunas clases de muy pocos ejemplos y `otros_ruidos` dominante.
- Codificación de texto: varios archivos muestran mojibake en comentarios/mensajes (`ConfiguraciÃ³n`, etc.); revisar encoding antes de editar UI/backend.
- Estado Git: la raíz no es repo Git; el único `.git` detectado está en `PROYECTOGIT/Proyecto_Ranas_Aves`.

## 12. Siguiente tarea recomendada para Codex

Prompt recomendado para implementar Fase 1:

```text
Actúa como arquitecto senior Python y mantenedor cuidadoso del repositorio AcusticaFauna.

Objetivo: implementar la Fase 1 sin romper lo existente.

Lee primero docs/00_diagnostico_acusticafauna.md y el backend actual en acusticafauna-General/acusticafauna-Back/backend.

Implementa un importador inicial para salidas de Raspberry GT-Híbrido:
- Debe aceptar una carpeta raíz tipo /home/pi/prueba_ruido o una copia local equivalente.
- Debe detectar subcarpetas por fecha.
- Debe detectar continuo/, eventos/ y metadata_sistema.csv.
- Debe registrar archivos WAV/FLAC encontrados.
- Debe calcular SHA256 y evitar duplicados.
- Debe guardar metadata mínima en SQLite.
- Debe añadir tablas mínimas nuevas si hacen falta: raspberry_devices, audio_files, processing_jobs.
- Debe exponer una CLI básica con Typer o, si prefieres mantener mínima la dependencia, un módulo ejecutable con argparse.
- Debe incluir tests pytest para parsing de metadata_sistema.csv y detección de estructura.

Restricciones:
- No elimines ni muevas datasets, modelos .tflite, storage existente, node_modules ni .venv.
- No rompas los endpoints actuales de importación BirdNET.
- Si requirements.txt está vacío, actualízalo con dependencias mínimas reales del backend y tests.
- Documenta supuestos sobre columnas de metadata_sistema.csv si el formato exacto no está presente.

Al final resume archivos modificados, cómo ejecutar la importación y qué tests corriste.
```
