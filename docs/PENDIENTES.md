# Pendientes

Lista de pendientes actuales para mantener trazabilidad del proyecto.

## Entrenamiento y modelos

- Mantener `FUNDAMENTOS_ML_BIOACUSTICA_ACUSTICAFAUNA.md` actualizado con cada experimento ML.
- Probar entrenamiento web completo con `Boana_boans_pugnax_v4_feedback`.
- Evaluar el nuevo modelo Boana entrenado con feedback.
- Calibrar threshold del nuevo modelo si mejora.
- Registrar modelo solo si mejora frente a la version actual.
- Revisar UX de entrenamiento en jobs largos.

## Datos y taxonomia

- Documentar decisiones de dataset y taxonomia.
- Mantener auditoria de aliases taxonomicos.
- Validar en web los candidatos detectados por Explorador ML antes de entrenar siguientes grupos:
  - `Dendropsophus`
  - genero anfibio
  - especies anfibias
- Revisar que `NON` y `NO` nunca entren como especie.

## Operacion y mantenimiento

- Eventualmente migrar FastAPI `on_event` a lifespan.
- Agregar limpieza controlada de uploads temporales con confirmacion fuerte.
- Definir politica de retencion para uploads temporales y recortes.
- Agregar diagnosticos mas detallados para ML API desconectada o jobs largos.

## UX pendiente

- Seguir probando flujo de lote con usuarios reales.
- Probar el nuevo procesamiento por lote con carpetas reales largas y ajustar limites/advertencias para jobs de muchas horas.
- Medir si los presets conservador/normal/agresivo preservan llamadas suaves en especies objetivo antes de recomendarlos para curacion.
- Mejorar visualizacion de logs largos.
- Probar Explorador ML con manifests grandes y ajustar ordenamiento/filtros si hace falta.
- Agregar descarga directa del resumen JSON del dry-run especializado si se vuelve necesaria.
