# Pendientes AcusticaFauna

## ML y auditoria

- Mantener `amphibian_genus_v1` como experimental/no confiable y no usarlo para ruteo automatico.
- Preparar `amphibian_genus_v2` desde el `Constructor de modelos ML`, no desde una seccion fija.
- Usar siempre `Explorar datos` y `Ejecutar dry-run` antes de crear manifests limpios.
- Validar promocion de clasificadores de genero solo si balanced_accuracy >= 0.70, recall Boana >= 0.70 y no hay colapso fuerte de predicciones.
- Revisar manualmente resultados antes de usarlos para entrenamiento.

## Flujo generico

- Reutilizar el constructor para futuros clasificadores por genero, por ejemplo `dendropsophus_species_v1`.
- Para binarios especializados, seleccionar exactamente dos labels y conservar el manifest limpio como derivado trazable.
- No crear nuevas secciones hardcodeadas por modelo salvo que exista una razon de producto muy especifica.

## UX y manuales

- Mantener actualizado el boton `Manual de esta pagina` en nuevas paginas principales.
- Completar manuales Markdown cuando se agreguen flujos nuevos.
- Seguir moviendo rutas y nombres tecnicos a `Opciones avanzadas` cuando exista una alternativa guiada.
- Si la ML API empieza a devolver mas metadatos por manifest, mostrarlos en el selector y en el modal de detalles.

## Release GitHub

- Reemplazar `PENDIENTE_URL_RELEASE` en `scripts/download_models.py` cuando existan Releases de modelos.
- Ejecutar `python scripts/preflight_github.py` antes de cada push publico.
- Revisar que manifests reales con rutas locales no entren al repo.
- Documentar cualquier modelo distribuido por Git LFS o Release.
- Mantener `sample_data/` pequeno y sin audios de licencia dudosa.
