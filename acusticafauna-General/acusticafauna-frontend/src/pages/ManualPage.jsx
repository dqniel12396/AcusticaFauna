import { useMemo } from "react";
import { useParams } from "react-router-dom";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";

const MANUALS = {
  "laboratorio-audio": {
    title: "Manual Laboratorio de audio",
    purpose: "Abrir, revisar, segmentar, procesar y analizar audios sin modificar los originales.",
    flow: ["Abre un audio desde dataset, upload o ruta.", "Escucha y revisa waveform/espectrograma.", "Usa detectar rana/sapo, identificar automaticamente o modelos especializados.", "Si el audio es largo, segmenta actividad antes de analizar.", "Guarda feedback cuando revises un resultado."],
    buttons: ["Abrir audio: carga el archivo en el laboratorio.", "Identificar automaticamente: ejecuta el pipeline por etapas.", "Detectar actividad: encuentra zonas utiles en audios largos.", "Procesamiento por lote: limpia o procesa muchos audios.", "Reporte de calidad: compara original contra procesado."],
    fields: ["Audio activo: archivo que se escucha y analiza.", "Seleccion: tramo temporal elegido.", "Threshold: umbral de decision del modelo.", "Lote: cola de audios listos para procesar."],
    warnings: ["El audio original nunca se modifica.", "Un audio limpio no entra a entrenamiento sin revision humana.", "Si una grabadora externa tiene volumen distinto, ajusta sensibilidad."],
    examples: ["Sube un FLAC largo, detecta actividad, crea clips y analiza cada clip.", "Compara un WAV original contra su copia denoised antes de usarlo para revision."],
    errors: ["No hay audios en lote: agrega audio actual, uploads, tabla o rutas manuales.", "Detector no disponible: revisa que la ML API este activa.", "Pocos segmentos: baja threshold o usa modo mas sensible."],
  },
  "auditoria-feedback": {
    title: "Manual Auditoria feedback",
    purpose: "Revisar feedback humano, resolver conflictos y preparar manifests limpios para ML.",
    flow: ["Filtra feedback acumulado.", "Revisa conflictos y exclusiones.", "Usa Constructor de modelos ML para preparar un manifest.", "Ejecuta dry-run.", "Crea manifest limpio.", "Entrena, evalua, calibra y registra solo si corresponde."],
    buttons: ["Explorar datos: resume filas, clases y splits.", "Ejecutar dry-run: valida antes de escribir archivos.", "Crear manifest limpio: genera un CSV derivado.", "Usar para entrenamiento: autocompleta la seccion Entrenar modelos."],
    fields: ["Manifest base: CSV fuente disponible en acusticafauna-ML.", "Tipo de modelo: objetivo biologico/ML.", "Reglas de inclusion: filtros de calidad y feedback.", "Opciones avanzadas: rutas y nombres tecnicos editables."],
    warnings: ["No entrenes modelos sin dry-run.", "No promociones modelos no confiables.", "El constructor no modifica audios ni dataset_curado."],
    examples: ["Preparar amphibian_genus_v2 desde el preset de genero.", "Preparar dendropsophus_species_v1 seleccionando genero Dendropsophus.", "Crear un binario seleccionando exactamente dos labels."],
    errors: ["Manifest sin clases suficientes: consigue mas datos o usa binario.", "Binario invalido: selecciona exactamente dos labels.", "Conflictos activos: revisa feedback contradictorio antes de entrenar."],
  },
  "explorador-ml": {
    title: "Manual Explorador ML",
    purpose: "Inspeccionar manifests y encontrar grupos entrenables antes de crear modelos especializados.",
    flow: ["Selecciona manifest base.", "Carga resumen.", "Busca candidatos entrenables.", "Selecciona clases.", "Ejecuta dry-run y crea manifest especializado."],
    buttons: ["Actualizar resumen: lee el CSV seleccionado.", "Buscar candidatos entrenables: agrupa por genero.", "Dry-run especializado: valida splits y clases.", "Crear manifest especializado: escribe un CSV limpio derivado."],
    fields: ["Labels principales: clases disponibles.", "Split: distribucion train/val/test.", "Minimos: ejemplos requeridos por clase y split."],
    warnings: ["Un grupo con pocos datos puede requerir modelo binario o mas audios.", "No uses manifests con conflictos sin revisar."],
    examples: ["Encontrar Boana entrenable.", "Detectar que Nymphargus necesita mas datos antes de entrenar."],
    errors: ["No aparecen candidatos: carga resumen y verifica que el manifest tenga labels.", "Dry-run no apto: revisa minimos por split."],
  },
  "modelos-ml": {
    title: "Manual Modelos ML",
    purpose: "Administrar el registry de modelos activos, experimentales, archivados y rechazados.",
    flow: ["Revisa modelos por estado.", "Consulta metricas y model cards.", "Promueve solo modelos validados.", "Archiva o rechaza candidatos no utiles."],
    buttons: ["Promover: convierte un modelo en active/default si cumple reglas.", "Archivar: lo retira sin borrar archivos.", "Rechazar: marca modelos no adecuados."],
    fields: ["active/default: modelo usado por defecto.", "experimental: candidato en revision.", "balanced_accuracy: metrica robusta ante clases desbalanceadas.", "No confiable: bajo rendimiento historico."],
    warnings: ["Score alto no implica confianza si el modelo tiene baja balanced_accuracy.", "No promociones modelos de genero con recall Boana bajo."],
    examples: ["Mantener amphibian_genus_v1 como experimental no confiable.", "Promover amphibian_genus_v2 solo si supera reglas de validacion."],
    errors: ["Promocion bloqueada: el modelo no cumple metricas minimas.", "Model card incompleta: registra notas y metricas antes de promover."],
  },
  "dataset-curado": {
    title: "Manual Dataset Curado",
    purpose: "Explorar e importar audios curados con trazabilidad.",
    flow: ["Importa manifest.", "Revisa labels y rutas.", "Filtra por especie/calidad.", "Abre audios en laboratorio para inspeccion."],
    buttons: ["Importar manifest: lee registros nuevos.", "Abrir en laboratorio: revisa un audio puntual."],
    fields: ["Ruta dataset: carpeta o manifest fuente.", "Label: especie o categoria.", "Estado: calidad/revision del registro."],
    warnings: ["No edites dataset_curado desde flujos ML.", "Evita duplicados y revisa rutas faltantes."],
    examples: ["Importar nuevos clips Boana y revisar los dudosos en Laboratorio."],
    errors: ["Rutas faltantes: verifica carpeta base.", "Labels inconsistentes: revisa taxonomia y alias."],
  },
  entrenamiento: {
    title: "Manual Entrenamiento",
    purpose: "Crear versiones auditables de datasets y preparar datos para entrenamiento futuro.",
    flow: ["Crea version.", "Construye dataset.", "Revisa auditoria/balance.", "Bloquea la version cuando este lista.", "Exporta CSV."],
    buttons: ["Construir: genera la version derivada.", "Bloquear: congela la version para trazabilidad.", "Exportar: descarga manifest."],
    fields: ["Preset: reglas de construccion.", "Split: train/val/test.", "Included: registros usados."],
    warnings: ["Bloquear una version evita cambios accidentales.", "El entrenamiento de modelos se lanza desde Auditoria feedback."],
    examples: ["Crear una version balanceada para revision antes de entrenar."],
    errors: ["Version sin items: revisa filtros de inclusion.", "Export vacio: confirma que haya registros incluidos."],
  },
  "sesiones-analisis": {
    title: "Manual Sesiones de analisis",
    purpose: "Revisar sesiones importadas, eventos y resultados asociados.",
    flow: ["Abre una sesion.", "Revisa eventos.", "Filtra por estado.", "Abre audios relevantes."],
    buttons: ["Ver detalle: abre audio, predicciones y metadatos."],
    fields: ["Sesion: lote importado.", "Evento: deteccion individual.", "Importado: estado de sincronizacion."],
    warnings: ["Verifica rutas si un evento no reproduce audio."],
    examples: ["Revisar una sesion nocturna y enviar clips dudosos al laboratorio."],
    errors: ["Audio no reproduce: revisa ruta local.", "Sesion vacia: verifica importacion local."],
  },
  "procesamiento-lote": {
    title: "Manual Procesamiento por lote",
    purpose: "Procesar muchos audios desde la web en modo limpieza o pipeline completo.",
    flow: ["Agrega audios al lote.", "Elige Solo limpiar lote existente o Procesamiento completo automatico.", "Selecciona preset.", "Confirma que no se modificaran originales.", "Ejecuta y revisa outputs."],
    buttons: ["Agregar audio actual: suma el audio abierto al lote.", "Iniciar procesamiento: crea job asincrono.", "Cancelar: detiene un job si aun esta en ejecucion.", "Reporte de calidad: compara procesado contra original."],
    fields: ["Modo: limpieza o pipeline completo.", "Preset: conservador, normal, agresivo o personalizado.", "Pasos: actividad, segmentos, denoise, detector."],
    warnings: ["No proceses lotes enormes sin revisar duracion.", "Los outputs son derivados trazables.", "No se entrena automaticamente."],
    examples: ["Limpiar 30 clips ya cortados.", "Procesar tres FLAC largos, segmentar y analizar con detector rana/sapo."],
    errors: ["Boton iniciar deshabilitado: agrega al menos un audio al lote.", "Job fallido: revisa logs y rutas de entrada."],
  },
  "importacion-local": {
    title: "Manual Importacion local",
    purpose: "Importar carpetas locales, resultados BirdNET y metadatos al sistema.",
    flow: ["Selecciona ruta raiz.", "Elige modo de importacion.", "Ejecuta importacion.", "Revisa resumen."],
    buttons: ["Importar: lee archivos y registra eventos.", "Modo avanzado: asigna rutas manuales."],
    fields: ["Ruta raiz: carpeta fuente.", "Patron: estructura esperada.", "Sesion: nombre del lote importado."],
    warnings: ["La importacion registra metadatos; no borra audios fuente."],
    examples: ["Importar una carpeta de grabadora despues de copiarla al PC."],
    errors: ["Ruta raiz no existe: corrige la carpeta.", "CSV no detectado: usa modo avanzado."],
  },
  taxonomia: {
    title: "Manual Taxonomia",
    purpose: "Mantener especies, generos, alias y categorias usados por dataset y ML.",
    flow: ["Busca taxones.", "Edita alias.", "Asocia codigos.", "Revisa uso en entrenamiento."],
    buttons: ["Sugerir desde dataset: detecta labels presentes.", "Guardar: persiste cambios taxonomicos."],
    fields: ["Genero: agrupacion biologica.", "Alias: variantes de nombre.", "Entrenamiento: uso permitido."],
    warnings: ["Cambios taxonomicos afectan filtros y labels visibles."],
    examples: ["Unificar alias de Boana antes de construir manifests."],
    errors: ["Alias duplicado: revisa nombres equivalentes.", "Taxon no aparece: sincroniza desde dataset."],
  },
  configuracion: {
    title: "Manual Configuracion",
    purpose: "Revisar rutas y preferencias del sistema local.",
    flow: ["Verifica rutas.", "Ajusta preferencias.", "Guarda cambios.", "Prueba una importacion o analisis corto."],
    buttons: ["Guardar: conserva opciones locales."],
    fields: ["Rutas por defecto: carpetas usadas por importacion y storage.", "Opciones de importacion: comportamiento inicial."],
    warnings: ["Cambiar rutas puede afectar reproduccion de audios ya importados."],
    examples: ["Actualizar ruta base despues de mover el proyecto."],
    errors: ["Ruta invalida: confirma permisos y existencia.", "Cambio no aplicado: guarda y recarga la pagina."],
  },
  general: {
    title: "Manual general",
    purpose: "Orientacion rapida para moverse por AcusticaFauna.",
    flow: ["Importa o abre audios.", "Revisa en Laboratorio.", "Guarda feedback.", "Audita manifests.", "Entrena y registra modelos solo con validacion."],
    buttons: ["Laboratorio: trabajo con audio.", "Auditoria: manifests y entrenamiento.", "Modelos ML: registry.", "Dataset Curado: datos revisados."],
    fields: ["Original: archivo fuente no modificado.", "Derivado: clip o procesado trazable.", "Feedback: revision humana guardada."],
    warnings: ["No hay entrenamiento automatico.", "Los originales no se modifican.", "Los modelos no confiables requieren revision."],
    examples: ["De un audio largo a clips revisados y manifest limpio."],
    errors: ["Pagina sin datos: revisa importacion o conexion con backend.", "ML no disponible: inicia acusticafauna-ML."],
  },
};

function ManualSection({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
        {items.map((item) => (
          <li key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ManualPage() {
  const { manualId = "general" } = useParams();
  const manual = useMemo(() => MANUALS[manualId] || MANUALS.general, [manualId]);
  return (
    <div className="space-y-6 p-6 text-slate-800 dark:text-slate-100">
      <SectionCard title={manual.title} subtitle={manual.purpose}>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">Manual de pagina</Badge>
          <Badge>No modifica datos</Badge>
          <Badge>Guia inicial</Badge>
        </div>
      </SectionCard>
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Flujo recomendado">
          <ManualSection title="Pasos" items={manual.flow} />
        </SectionCard>
        <SectionCard title="Botones y campos">
          <div className="space-y-5">
            <ManualSection title="Botones" items={manual.buttons} />
            <ManualSection title="Campos" items={manual.fields} />
          </div>
        </SectionCard>
        <SectionCard title="Advertencias">
          <div className="space-y-5">
            <ManualSection title="Ten en cuenta" items={manual.warnings} />
            <ManualSection title="Errores comunes" items={manual.errors} />
          </div>
        </SectionCard>
        <SectionCard title="Ejemplos y glosario">
          <div className="space-y-5">
            <ManualSection title="Ejemplos" items={manual.examples} />
            <ManualSection title="Glosario corto" items={["Manifest: CSV que lista audios y labels.", "Dry-run: validacion sin escribir resultados finales.", "Derivado trazable: copia o manifest generado a partir de un original.", "Registry: lista de modelos con estado y uso permitido."]} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
