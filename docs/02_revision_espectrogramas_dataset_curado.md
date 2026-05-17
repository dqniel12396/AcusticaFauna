# 02 Revision de Espectrogramas en Dataset Curado

## Objetivo

Los espectrogramas del dataset curado se generan bajo demanda para revision humana. No se crean miles de PNG durante la importacion del manifest.

## Previsualizacion temporal

Endpoint:

```text
GET /api/curated-dataset/segments/{id}/spectrogram?mode=preview
```

Comportamiento:

- Genera un PNG solo para el segmento solicitado.
- Si ya existe la previsualizacion y `force=false`, devuelve el mismo archivo.
- Guarda el PNG en `storage/spectrograms/tmp/`.
- Usa un nombre estable basado en `segment_id` y ruta de audio, por lo que multiples clics no deben crear multiples archivos.
- La interfaz debe mostrarlo usando el endpoint API, nunca abriendo rutas locales del sistema.

Para regenerar explicitamente:

```text
GET /api/curated-dataset/segments/{id}/spectrogram?mode=preview&force=true
```

## Confirmado permanente

Endpoint:

```text
GET /api/curated-dataset/segments/{id}/spectrogram?mode=confirmed
```

Comportamiento:

- Solo se permite cuando la ultima revision humana es `accepted` o `corrected`.
- Guarda el PNG en `storage/spectrograms/curated_confirmed/`.
- No se usa para `revisar_etiqueta`, `uncertain` o `rejected` por defecto.
- No reemplaza audios ni modifica el dataset curado original.

## Borrar previsualizaciones

Borrar previsualizacion de un segmento:

```text
DELETE /api/curated-dataset/segments/{id}/spectrogram?mode=preview
```

Borrar todas las previsualizaciones temporales:

```text
DELETE /api/curated-dataset/spectrograms/tmp
```

Este endpoint borra solo archivos `.png` dentro de `storage/spectrograms/tmp/`. No toca espectrogramas confirmados, audios ni revisiones.

## Evitar generacion masiva

- El importador de `dataset_curado` no genera espectrogramas.
- La UI debe generar un espectrograma solo cuando el usuario abre el detalle y presiona la accion correspondiente.
- Los botones deben deshabilitarse mientras se genera el PNG para evitar doble clic.
- `force=true` debe reservarse para la accion explicita "Regenerar previsualizacion".

## Estados visibles

La UI debe mostrar:

- `sin espectrograma`
- `Previsualizacion temporal`
- `Confirmado guardado`
- `Error al generar`

Tambien debe mostrar:

- loading: `Generando...`
- exito: `Previsualizacion generada` o `Espectrograma confirmado guardado`
- error claro si falla el backend o faltan dependencias.

## Uso del detalle

En la pagina `/dataset-curado`, la accion principal de cada fila abre el panel de revision del segmento:

- `Auditar`: para segmentos con etiqueta importada desde carpeta/manifest.
- `Identificar`: para pendientes reales `revisar_etiqueta`, `group_type=revisar` o `uncertain`.

La interfaz guarda la posicion actual de la tabla, baja suavemente al panel de detalle y muestra:

- audio del segmento;
- espectrograma bajo demanda;
- trazabilidad hacia archivo original y audio limpio;
- la ultima revision humana, con historial anterior colapsado;
- estado calculado de etiqueta fuente y uso para entrenamiento;
- acciones con nombres amigables: `Generar previsualizacion`, `Regenerar previsualizacion`, `Guardar como confirmado`, `Borrar previsualizacion` y `Borrar confirmado`.

Al presionar `Cerrar`, la pagina vuelve a la posicion previa de la tabla para no perder el contexto de revision.

En el detalle, las acciones de auditoria son:

- `Confirmar como gold`: crea una revision `accepted`.
- `Corregir etiqueta`: crea una revision `corrected` con la etiqueta escrita.
- `Marcar incierto`: crea una revision `uncertain` y vuelve el clip pendiente real.
- `Excluir`: crea una revision `rejected` y lo deja fuera del dataset entrenable.

Para clips de identificacion pendiente se muestran etiquetas rapidas como `rana_sapo`, `ave`, `insecto`, `ruido_humano`, `otros_ruidos` y `desconocido_biologico`.

## Barra lateral colapsable

La barra lateral queda sticky durante el scroll para mantener visible la navegacion. El control de abrir/cerrar vive dentro de la propia barra lateral, en la parte superior, para no tapar titulos ni contenido.

- Expandida: muestra logo, nombre, navegacion completa y estado local.
- Colapsada: mantiene un rail minimo de navegacion, deja visible el boton de apertura y libera espacio horizontal para la tabla y espectrograma.
- El boton tiene tooltip `Ocultar barra lateral` cuando esta abierta y `Abrir barra lateral` cuando esta cerrada.
- El boton permanece visible aunque el usuario haga scroll.

La preferencia se guarda en `localStorage` con la clave:

```text
acusticafauna_sidebar_collapsed
```

## Modo oscuro

El boton `Modo oscuro` / `Modo claro` alterna el tema visual de la aplicacion aplicando la clase global `dark` sobre `document.documentElement`.

- En tema claro, el boton muestra `Modo oscuro`.
- En tema oscuro, el boton muestra `Modo claro`.
- Si no hay preferencia guardada, se puede usar la preferencia del sistema.

La preferencia se guarda en:

```text
acusticafauna_dark_mode
```

El espectrograma conserva su paleta propia; solo cambia el contenedor y el resto de la interfaz.

## Mensajes y confirmaciones

La UI usa dos niveles de feedback:

- Toast global flotante: aparece fijo abajo a la derecha del viewport, no depende del scroll y se cierra solo despues de unos segundos.
- Mensaje local del detalle: aparece bajo los controles del espectrograma y bajo las acciones de auditoria para confirmar lo que acaba de ocurrir cerca del boton usado.

Mensajes esperados:

- `Previsualizacion generada`
- `Espectrograma confirmado guardado`
- `Previsualizacion eliminada`
- `Espectrograma confirmado eliminado`
- `Revision guardada`
- `Etiqueta corregida`
- `No se pudo completar la accion`

Las acciones destructivas piden confirmacion antes de ejecutarse:

- `Borrar previsualizacion`
- `Borrar confirmado`
- `Limpiar previsualizaciones`

`Limpiar previsualizaciones` esta en una seccion de mantenimiento, no dentro del detalle de un segmento. Esa accion borra solo imagenes temporales usadas para vista previa. No borra audios, revisiones ni espectrogramas confirmados.

## Etiqueta importada vs revision humana

No todos los segmentos necesitan aceptarse manualmente uno por uno.

- `Etiqueta importada`: etiqueta derivada del manifest o carpeta. Es candidata y puede revisarse por muestreo.
- `Candidato para entrenamiento`: segmento importado que todavia no tiene auditoria humana, pero no es pendiente real.
- `Candidato negativo`: segmento `negativo_objetivo` util como negativo para una clase objetivo.
- `Requiere identificacion`: segmentos `group_type=revisar` o `label=revisar_etiqueta`; estos son pendientes reales.
- `Gold confirmado`: revision humana `accepted`.
- `Gold corregido`: revision humana `corrected`.
- `Pendiente real`: revision marcada como `uncertain` o clip sin etiqueta confiable.
- `Excluido`: revision marcada como `rejected`.

La regla importante es que no se deben crear revisiones `accepted` masivas para todo el dataset. La auditoria humana se usa para construir un subconjunto gold, corregir dudas o excluir clips.

El filtro `Ver pendientes reales` muestra solo segmentos que realmente requieren accion:

- ultima revision `uncertain`;
- o sin revision humana y `group_type=revisar`;
- o sin revision humana y `label=revisar_etiqueta`.

Si un segmento `revisar_etiqueta` ya fue confirmado, corregido o excluido por la ultima revision humana, deja de aparecer como pendiente real.

## Estados calculados del backend

Las respuestas de `/api/curated-dataset/segments` y `/api/curated-dataset/segments/{id}` incluyen campos calculados para que el frontend no confunda etiqueta importada con gold humano:

- `source_label_status`: `imported` o `needs_audit`.
- `latest_review_status`: ultima revision humana, si existe.
- `training_status`: `candidate`, `candidate_negative`, `needs_review`, `gold` o `excluded`.
- `is_real_pending`: `true` solo para clips que realmente requieren accion humana.
