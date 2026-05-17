# Manual Entrenamiento

## Para que sirve

Gestiona versiones auditables de datasets de entrenamiento y prepara datos exportables.

## Flujo recomendado

1. Crea una version de dataset.
2. Construye la version.
3. Revisa auditoria, balance y exclusiones.
4. Bloquea la version cuando este lista.
5. Exporta manifests para uso posterior.

## Relacion con modelos ML

El entrenamiento web de modelos se coordina desde Auditoria feedback. La pagina de Entrenamiento organiza datasets y versiones; no debe entrenar ni registrar modelos automaticamente.

## Advertencias

- Bloquear una version congela su contenido para trazabilidad.
- Revisa clase/split antes de usar una version para ML.
- No modifiques audios originales.
