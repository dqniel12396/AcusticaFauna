import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import {
  calibrateMlTrainingJobThreshold,
  cancelMlTrainingJob,
  createAudioLabCleanManifest,
  createMlTrainingCleanManifest,
  createMlTrainingJob,
  dryRunAudioLabCleanManifest,
  dryRunMlTrainingCleanManifest,
  downloadMlTrainingJobArtifact,
  fetchAudioLabAnnotationFacets,
  evaluateMlTrainingJob,
  fetchAudioLabFeedbackAudit,
  fetchMlHealth,
  fetchMlManifestCandidates,
  fetchMlManifestSummary,
  fetchMlModels,
  createMlSpecializedManifest,
  dryRunMlSpecializedManifest,
  fetchMlTrainingJob,
  fetchMlTrainingJobLogs,
  fetchMlTrainingJobs,
  fetchMlTrainingManifests,
  fetchMlTrainingPresets,
  promoteMlModel,
  registerMlTrainingJobModel,
} from "../services/api";

const EMPTY_FILTERS = {
  model_id: "",
  audio_path: "",
  feedback_type: "",
  exclusion_reason: "",
  status: "",
  date_from: "",
  date_to: "",
};

const PRESET_LABELS = {
  frog_detector: "Detector rana/sapo",
  boana_boans_pugnax: "Clasificador Boana",
  amphibian_genus: "Genero anfibio",
  amphibian_species: "Especies anfibias",
};

const FEEDBACK_TYPE_OPTIONS = [
  ["", "Todos"],
  ["confirmed_positive", "confirmed_positive"],
  ["false_positive", "false_positive"],
  ["false_negative", "false_negative"],
  ["uncertain", "sent_to_review"],
  ["hard_negative", "hard_negative"],
  ["excluded_from_training", "excluded_from_training"],
];

const EXCLUSION_REASON_OPTIONS = ["", "voz_humana", "ruido", "sin_vocalizacion", "audio_equivocado", "etiqueta_incorrecta", "otro"];
const STATUS_OPTIONS = ["", "active", "corrected", "retracted", "legacy", "needs_review"];
const DEVICE_OPTIONS = ["auto", "cpu", "cuda", "mps"];
const TARGET_MODE_OPTIONS = ["binary_presence", "multiclass", "multilabel"];
const SAMPLE_STRATEGY_OPTIONS = [
  ["stratified", "stratified"],
  ["random", "random"],
  ["head", "none"],
];
const TARGET_MODE_HELP = {
  multiclass: "Una sola clase por audio; util para genero o especie.",
  binary_presence: "Presencia/ausencia de una clase o grupo.",
  multilabel: "Varias etiquetas posibles por audio; usar solo si el dataset lo soporta.",
};
const SAMPLE_STRATEGY_HELP = {
  stratified: "Respeta proporciones por clase/split y es la opcion recomendada.",
  random: "Muestreo aleatorio; util para pruebas rapidas.",
  head: "Usa filas en orden; solo para diagnostico o datasets ya preparados.",
};
const MODEL_BUILDER_TYPES = {
  frog_detector: {
    label: "Detector rana/sapo",
    description: "Detecta presencia de rana/sapo; no identifica genero ni especie.",
    preset: "frog_detector",
    base_manifest_csv: "manifests/frog_detector_v1_binary_v3_hardneg_manifest.csv",
    model_name: "frog_detector_v2",
    output_csv: "manifests/clean/frog_detector_v2_clean.csv",
    target_mode: "binary_presence",
    sample_strategy: "stratified",
    promotion_rules: "balanced_accuracy >= 0.70 y falsos positivos revisados.",
  },
  amphibian_genus: {
    label: "Clasificador de genero",
    description: "Predice genero anfibio, por ejemplo Boana, Dendropsophus o Rhinella.",
    preset: "amphibian_genus",
    base_manifest_csv: "manifests/amphibian_genus_v1_manifest.csv",
    model_name: "amphibian_genus_v2",
    output_csv: "manifests/clean/amphibian_genus_v2_clean.csv",
    target_mode: "multiclass",
    sample_strategy: "stratified",
    promotion_rules: "balanced_accuracy >= 0.70, Boana recall >= 0.70 y sin colapso fuerte.",
  },
  genus_species: {
    label: "Clasificador de especies por genero",
    description: "Clasifica especies dentro de un genero seleccionado.",
    preset: "amphibian_species",
    base_manifest_csv: "manifests/amphibian_species_v2_aliases_top_manifest.csv",
    model_name: "boana_species_v1",
    output_csv: "manifests/clean/boana_species_v1_clean.csv",
    target_mode: "multiclass",
    sample_strategy: "stratified",
    promotion_rules: "balanced_accuracy por especie aceptable y recall alto para especies objetivo.",
  },
  binary_specialized: {
    label: "Clasificador especializado binario",
    description: "Diferencia exactamente dos clases.",
    preset: "boana_boans_pugnax",
    base_manifest_csv: "manifests/boana_boans_pugnax_v3_quality045_manifest.csv",
    model_name: "label1_vs_label2_v1",
    output_csv: "manifests/clean/label1_vs_label2_v1_clean.csv",
    target_mode: "multiclass",
    sample_strategy: "stratified",
    promotion_rules: "exactamente 2 labels, balanced_accuracy >= activo y revision de errores.",
  },
  custom: {
    label: "Clasificador personalizado",
    description: "Configuracion avanzada para manifests y clases definidos por el usuario.",
    preset: "amphibian_species",
    base_manifest_csv: "manifests/amphibian_species_v2_aliases_top_manifest.csv",
    model_name: "custom_classifier_v1",
    output_csv: "manifests/clean/custom_classifier_v1_clean.csv",
    target_mode: "multiclass",
    sample_strategy: "stratified",
    promotion_rules: "definir metrica minima antes de promover.",
  },
};
const MODEL_BUILDER_GENUS_OPTIONS = ["Boana", "Dendropsophus", "Nymphargus", "Hyalinobatrachium", "Atelopus", "Pristimantis", "Scinax"];
const AMPHIBIAN_GENUS_V2_PRESET = "Clasificador de genero anfibio v2";
const MODEL_BUILDER_PRESETS = {
  amphibian_genus_v2: {
    label: AMPHIBIAN_GENUS_V2_PRESET,
    type: "amphibian_genus",
    version: "v2",
  },
  boana_species: {
    label: "Boana species",
    type: "genus_species",
    genus: "Boana",
    version: "v1",
  },
  dendropsophus_species: {
    label: "Dendropsophus species",
    type: "genus_species",
    genus: "Dendropsophus",
    version: "v1",
  },
  frog_detector: {
    label: "Detector rana/sapo",
    type: "frog_detector",
    version: "v2",
  },
  custom: {
    label: "Personalizado",
    type: "custom",
    version: "v1",
  },
};

function metricLabel(key) {
  const labels = {
    active: "Activos",
    confirmed_positive: "Confirmados",
    false_positive: "Falsos positivos",
    false_negative: "Falsos negativos",
    excluded_from_training: "Excluidos",
    human_voice: "Voz humana",
    hard_negative: "Hard negatives",
    retracted: "Anulados",
    corrected: "Corregidos",
  };
  return labels[key] || key;
}

function getModelId(model) {
  return model?.model_id || model?.id || "";
}

function presetDefaults(presetId) {
  const slug = presetId === "boana_boans_pugnax" ? "boana_boans_pugnax_v4_feedback" : `${presetId}_feedback`;
  return {
    output_csv: `manifests/clean/${slug}.csv`,
    job_name: slug,
    output_dir: `outputs/${slug}`,
    model_name: slug,
    epochs: presetId === "frog_detector" ? 10 : 15,
    batch_size: presetId === "frog_detector" ? 16 : 8,
    random_seed: 52,
    sample_strategy: "stratified",
    device: "auto",
  };
}

function slugValue(value, fallback = "modelo") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function modelBuilderDefaults(type, current = {}) {
  const base = MODEL_BUILDER_TYPES[type] || MODEL_BUILDER_TYPES.custom;
  const defaultPresetId = type === "amphibian_genus" ? "amphibian_genus_v2" : type === "frog_detector" ? "frog_detector" : type === "custom" ? "custom" : type === "genus_species" ? "boana_species" : "";
  const currentPreset = MODEL_BUILDER_PRESETS[current.preset_id] || null;
  const version = current.version || (type === "amphibian_genus" ? "v2" : "v1");
  const genus = current.genus || "Boana";
  const labels = String(current.selected_labels_text || "")
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  let modelName = base.model_name;
  if (type === "genus_species") {
    modelName = `${slugValue(genus, "genero")}_species_${version}`;
  } else if (type === "binary_specialized" && labels.length >= 2) {
    modelName = `${slugValue(labels[0], "label1")}_vs_${slugValue(labels[1], "label2")}_${version}`;
  } else if (type === "custom") {
    modelName = `custom_classifier_${version}`;
  } else if (type === "frog_detector") {
    modelName = `frog_detector_${version}`;
  } else if (type === "amphibian_genus") {
    modelName = `amphibian_genus_${version}`;
  }
  return {
    type,
    preset_id: currentPreset?.type === type ? current.preset_id : defaultPresetId,
    preset_name: type === "amphibian_genus" ? AMPHIBIAN_GENUS_V2_PRESET : base.label,
    genus,
    version,
    selected_labels_text: current.selected_labels_text || "",
    model_name: modelName,
    job_name: modelName,
    base_manifest_csv: base.base_manifest_csv,
    output_csv: `manifests/clean/${modelName}_clean.csv`,
    output_dir: `outputs/${modelName}`,
    epochs: type === "frog_detector" ? 10 : 15,
    batch_size: type === "frog_detector" ? 16 : 8,
    random_seed: 42,
    limit_per_class: "",
    min_train_per_class: 50,
    min_val_per_class: 10,
    min_test_per_class: 10,
    exclude_weak_classes: true,
    apply_feedback: true,
    exclude_human_voice: true,
    exclude_excluded_from_training: true,
    ignore_retracted: true,
    block_conflicts: true,
    include_confirmed: true,
    target_mode: base.target_mode,
    sample_strategy: base.sample_strategy,
  };
}

function splitText(splitCountsByClass, label) {
  const parts = ["train", "val", "test"].map((split) => `${split}: ${splitCountsByClass?.[split]?.[label] || 0}`);
  return parts.join(" | ");
}

function inferManifestKind(manifestPath = "") {
  const lower = manifestPath.toLowerCase();
  if (lower.includes("genus")) return "genero anfibio";
  if (lower.includes("frog_detector") || lower.includes("rana")) return "detector rana/sapo";
  if (lower.includes("boana")) return "Boana";
  if (lower.includes("species")) return "especies";
  return "manifest ML";
}

function manifestOptionLabel(item, summary) {
  const name = item?.name || String(item?.path || "").split("/").pop() || item?.path || "manifest";
  const rows = summary?.rows ? ` - ${summary.rows} filas` : "";
  const classes = summary?.total_classes || summary?.classes?.length ? ` - ${summary.total_classes || summary.classes.length} clases` : "";
  return `${name} - ${inferManifestKind(item?.path || name)}${rows}${classes}`;
}

function topLabels(summary, limit = 6) {
  if (!summary) return [];
  if (Array.isArray(summary.top_labels)) return summary.top_labels.slice(0, limit);
  return Object.entries(summary.class_counts || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function Spinner() {
  return <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

function LoadingText({ loading, loadingText, children }) {
  return (
    <span className="inline-flex items-center gap-2">
      {loading ? <Spinner /> : null}
      {loading ? loadingText : children}
    </span>
  );
}

function mlCommand() {
  return `cd "/f/PROYECTO de cosa de sonido/acusticafauna-ML"
source .venv-ml/Scripts/activate
python -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload`;
}

function formatCheckTime(value) {
  return value ? new Date(value).toLocaleTimeString() : "sin verificar";
}

function formatMetric(value) {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

const MANIFEST_CREATION_STEPS = [
  ["validating_base_manifest", "Validando manifest base", 15],
  ["loading_feedback", "Cargando retroalimentacion", 30],
  ["applying_exclusions", "Aplicando exclusiones", 50],
  ["checking_minimums", "Verificando minimos", 70],
  ["writing_clean_csv", "Escribiendo CSV limpio", 90],
  ["saving_summary", "Guardando resumen", 95],
  ["completed", "Completado", 100],
];

function buildManifestSteps(progress, status = "running") {
  return MANIFEST_CREATION_STEPS.map(([id, label, stepProgress]) => ({
    id,
    label,
    progress: stepProgress,
    status: status === "failed" ? (progress >= stepProgress ? "completed" : "pending") : progress >= stepProgress ? "completed" : "pending",
  }));
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function jsonText(value) {
  return JSON.stringify(value || {}, null, 2);
}

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function trainingSummaryMarkdown(job) {
  const metrics = job?.metrics || {};
  const manifest = metrics.manifest_summary || {};
  const classCounts = metrics.class_counts || manifest.by_label || {};
  const splitCounts = metrics.split_counts || manifest.by_split || {};
  const modelPath = metrics.model_path || `${job?.request?.output_dir || ""}/${job?.request?.model_name || job?.job_name || ""}.model`;
  return [
    `Modelo: ${metrics.model_name || job?.request?.model_name || job?.job_name || "-"}`,
    `Estado: ${metrics.status || job?.status || "-"}`,
    `Target mode: ${metrics.target_mode || job?.request?.target_mode || "-"}`,
    `Clases: ${(metrics.classes_used || metrics.source_classes || job?.manifest_summary?.classes || []).join(", ") || "-"}`,
    `Filas: ${manifest.rows ?? job?.manifest_summary?.rows ?? "-"}`,
    `Train: ${splitCounts.train ?? "-"}`,
    `Val: ${splitCounts.val ?? "-"}`,
    `Test: ${splitCounts.test ?? "-"}`,
    ...Object.entries(classCounts).map(([label, count]) => `${label}: ${count}`),
    `Clip duration: ${metrics.clip_duration ?? job?.request?.clip_duration ?? "-"}`,
    `Epochs: ${metrics.epochs ?? job?.request?.epochs ?? "-"}`,
    `Batch size: ${metrics.batch_size ?? job?.request?.batch_size ?? "-"}`,
    `Seed: ${metrics.random_seed ?? job?.request?.random_seed ?? "-"}`,
    `Model path: ${String(modelPath).replaceAll("\\", "/")}`,
  ].join("\n");
}

function evaluationSummaryMarkdown(job) {
  const metrics = job?.evaluation?.metrics || {};
  return [
    `Modelo: ${job?.request?.model_name || job?.job_name || "-"}`,
    `Evaluacion: ${job?.evaluation?.output_dir || "-"}`,
    `Target mode: ${metrics.target_mode || "-"}`,
    `Filas test: ${metrics.rows ?? "-"}`,
    `Accuracy: ${formatMetric(metrics.accuracy)}`,
    `Balanced accuracy: ${formatMetric(metrics.balanced_accuracy)}`,
    `Predicciones: ${Object.entries(metrics.prediction_counts || {}).map(([label, count]) => `${label}: ${count}`).join(", ") || "-"}`,
    `Reales: ${Object.entries(metrics.true_counts || {}).map(([label, count]) => `${label}: ${count}`).join(", ") || "-"}`,
  ].join("\n");
}

function calibrationSummaryMarkdown(job) {
  const calibration = job?.calibration || {};
  const test = calibration.test_metrics || {};
  return [
    `Modelo: ${job?.request?.model_name || job?.job_name || "-"}`,
    `Positive class: ${calibration.decision_rule?.positive_class || calibration.decision_rule?.if_score_gte_threshold || "-"}`,
    `Decision rule: ${calibration.decision_rule?.score_column || "-"} >= ${calibration.best_threshold ?? calibration.decision_rule?.threshold ?? "-"} => ${calibration.decision_rule?.if_score_gte_threshold || "-"}`,
    `Else: ${calibration.decision_rule?.else || "-"}`,
    `Validation balanced accuracy: ${formatMetric(calibration.validation_metrics?.balanced_accuracy)}`,
    `Test balanced accuracy: ${formatMetric(test.balanced_accuracy)}`,
    `Precision: ${formatMetric(test.precision)}`,
    `Recall: ${formatMetric(test.recall)}`,
    `F1: ${formatMetric(test.f1)}`,
  ].join("\n");
}

function ActionButton({ onClick, children, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">
      {children}
    </button>
  );
}

export default function AudioLabAuditPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [audit, setAudit] = useState({ summary: {}, conflicts: [], items: [] });
  const [dryRun, setDryRun] = useState(null);
  const [manifestName, setManifestName] = useState("audio_lab_manifest_limpio");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [mlHealth, setMlHealth] = useState({
    state: "loading",
    message: "Consultando ML API...",
    checkedAt: null,
    stale: false,
  });
  const [controlsLoading, setControlsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [jobLastUpdatedAt, setJobLastUpdatedAt] = useState(null);
  const [jobReconnectMessage, setJobReconnectMessage] = useState("");
  const actionLocks = useRef(new Set());
  const manifestProgressTimers = useRef([]);
  const manifestProgressStartedAt = useRef(null);
  const explorerQueryApplied = useRef(false);
  const [manifestCreation, setManifestCreation] = useState({
    status: "idle",
    progress: 0,
    steps: buildManifestSteps(0),
    result: null,
    error: null,
    showJson: false,
    startedAt: null,
  });
  const [trainingPresets, setTrainingPresets] = useState([]);
  const [trainingManifests, setTrainingManifests] = useState([]);
  const [trainingJobs, setTrainingJobs] = useState([]);
  const [mlModels, setMlModels] = useState([]);
  const [annotationFacets, setAnnotationFacets] = useState({ models: [], feedback_types: [], exclusion_reasons: [], statuses: [] });
  const [advancedTrainingOpen, setAdvancedTrainingOpen] = useState(false);
  const [trainingDryRun, setTrainingDryRun] = useState(null);
  const [createdTrainingManifest, setCreatedTrainingManifest] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [registeredModel, setRegisteredModel] = useState(null);
  const [jobLogs, setJobLogs] = useState("");
  const [trainingForm, setTrainingForm] = useState({
    preset: "boana_boans_pugnax",
    base_manifest_csv: "manifests/boana_boans_pugnax_v3_quality045_manifest.csv",
    output_csv: "manifests/clean/boana_boans_pugnax_v4_feedback.csv",
    job_name: "boana_boans_pugnax_v4_feedback",
    output_dir: "outputs/boana_boans_pugnax_v4_feedback",
    model_name: "boana_boans_pugnax_v4_feedback",
    target_mode: "multiclass",
    epochs: 15,
    batch_size: 8,
    clip_duration: 5,
    sample_strategy: "stratified",
    random_seed: 52,
    device: "auto",
    exclude_human_voice: true,
    exclude_excluded_from_training: true,
    ignore_retracted: true,
    block_conflicts: true,
    include_confirmed: true,
  });
  const [modelBuilder, setModelBuilder] = useState(() => modelBuilderDefaults("amphibian_genus"));
  const [builderExploration, setBuilderExploration] = useState(null);
  const [builderExploring, setBuilderExploring] = useState(false);
  const [builderAdvancedOpen, setBuilderAdvancedOpen] = useState(false);
  const [manifestDetailsOpen, setManifestDetailsOpen] = useState(false);
  const [manifestSummaries, setManifestSummaries] = useState({});
  const [builderCandidates, setBuilderCandidates] = useState([]);

  useEffect(() => {
    loadAudit();
    checkMlConnection();
    loadTrainingControls();
    return () => {
      manifestProgressTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (explorerQueryApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    const manifest = params.get("training_manifest");
    if (!manifest) return;
    explorerQueryApplied.current = true;
    const targetMode = params.get("target_mode") || "multiclass";
    const preset = params.get("preset") || "amphibian_species";
    const slug = params.get("model_slug") || manifest.split("/").pop()?.replace(/\.csv$/i, "") || "modelo_especializado";
    setTrainingForm((current) => ({
      ...current,
      preset,
      base_manifest_csv: manifest,
      output_csv: manifest,
      clean_manifest_csv: manifest,
      job_name: slug,
      model_name: slug,
      output_dir: `outputs/${slug}`,
      target_mode: targetMode,
    }));
    setCreatedTrainingManifest({ output_csv: manifest, classes: [], split_counts: {}, from_explorer: true });
    setMessage("Manifest especializado seleccionado desde Explorador ML. Revisa parametros y lanza el entrenamiento cuando quieras.");
  }, []);

  useEffect(() => {
    if (!activeJob?.id || !["queued", "running"].includes(activeJob.status)) return undefined;
    const timer = window.setInterval(() => refreshJob(activeJob.id), 2500);
    return () => window.clearInterval(timer);
  }, [activeJob?.id, activeJob?.status]);

  useEffect(() => {
    if (!modelBuilder.base_manifest_csv || manifestSummaries[modelBuilder.base_manifest_csv]) return;
    loadModelBuilderManifestInfo(modelBuilder.base_manifest_csv, { quiet: true });
  }, [modelBuilder.base_manifest_csv, manifestSummaries]);

  async function loadAudit(nextFilters = filters) {
    if (loading) return;
    try {
      setLoading(true);
      setError("");
      const data = await fetchAudioLabFeedbackAudit(nextFilters);
      setAudit(data);
    } catch (err) {
      setError(err.message || "No fue posible cargar la auditoria.");
    } finally {
      setLoading(false);
    }
  }

  async function runLocked(key, fn) {
    if (actionLocks.current.has(key)) return;
    actionLocks.current.add(key);
    setActionLoading((current) => ({ ...current, [key]: true }));
    try {
      await fn();
    } finally {
      actionLocks.current.delete(key);
      setActionLoading((current) => ({ ...current, [key]: false }));
    }
  }

  async function copyText(text, successMessage = "Copiado") {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("copy_failed");
      }
      setError("");
      setMessage(successMessage);
    } catch {
      setError("No se pudo copiar.");
    }
  }

  function downloadJsonFile(filename, data) {
    downloadText(filename, jsonText(data), "application/json");
    setMessage(`${filename} descargado.`);
  }

  async function downloadJobArtifact(filename) {
    if (!activeJob?.id) return;
    try {
      const blob = await downloadMlTrainingJobArtifact(activeJob.id, filename);
      downloadBlob(filename, blob);
      setMessage(`${filename} descargado.`);
    } catch (err) {
      setError(err.message || `No fue posible descargar ${filename}.`);
    }
  }

  async function checkMlConnection() {
    setMlHealth((current) => ({
      ...current,
      state: "loading",
      message: "Consultando ML API...",
      stale: Boolean(current.checkedAt),
    }));
    setStatusMessage("Consultando ML API...");
    try {
      const health = await fetchMlHealth();
      setMlHealth({
        state: "connected",
        message: `${health.service || "ML API"} conectada. ${health.models_available ?? "-"} modelo(s) disponibles.`,
        checkedAt: new Date().toISOString(),
        stale: false,
      });
      setStatusMessage("ML API conectada.");
      return true;
    } catch (err) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      setMlHealth((current) => ({
        state: "disconnected",
        message: "No se pudo conectar con ML API en http://127.0.0.1:8010. Revisa que acusticafauna-ML este corriendo.",
        checkedAt: new Date().toISOString(),
        stale: Boolean(current.checkedAt),
      }));
      setStatusMessage("ML API no disponible.");
      return false;
    }
  }

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function runDryRun() {
    await runLocked("legacyDryRun", async () => {
      try {
        setError("");
        setStatusMessage("Ejecutando dry-run de retroalimentacion acumulada...");
        const data = await dryRunAudioLabCleanManifest({ name: manifestName });
        setDryRun(data);
        setMessage("Dry-run completado. Revisa conflictos antes de crear el manifest.");
      } catch (err) {
        setError(err.message || "No fue posible ejecutar el dry-run.");
      }
    });
  }

  async function createManifest() {
    await runLocked("legacyCreateManifest", async () => {
      try {
        setError("");
        setStatusMessage("Creando manifest de retroalimentacion acumulada...");
        const data = await createAudioLabCleanManifest({ name: manifestName });
        setMessage(`Manifest versionado creado: ${data.manifest_path}`);
        setDryRun(data.summary);
      } catch (err) {
        setError(err.message || "No fue posible crear el manifest limpio.");
      }
    });
  }

  async function loadTrainingControls() {
    try {
      setControlsLoading(true);
      setStatusMessage("Cargando presets, manifests y jobs desde ML API...");
      const [presets, manifests, jobs, models, facets] = await Promise.all([
        fetchMlTrainingPresets(),
        fetchMlTrainingManifests(),
        fetchMlTrainingJobs(),
        fetchMlModels(),
        fetchAudioLabAnnotationFacets(),
      ]);
      setTrainingPresets(presets.items || []);
      setTrainingManifests(manifests.items || []);
      setTrainingJobs(jobs.items || []);
      setMlModels(models.items || []);
      setAnnotationFacets(facets || { models: [], feedback_types: [], exclusion_reasons: [], statuses: [] });
      setStatusMessage("Controles de entrenamiento cargados.");
    } catch (err) {
      setMlHealth((current) => ({
        ...current,
        state: current.checkedAt ? "error" : "disconnected",
        message: "No se pudieron actualizar presets/manifests de ML API. Los datos visibles pueden estar desactualizados.",
        checkedAt: new Date().toISOString(),
        stale: true,
      }));
      setError(err.message || "No fue posible cargar controles de entrenamiento ML.");
    } finally {
      setControlsLoading(false);
    }
  }

  function updateTrainingForm(key, value) {
    setTrainingForm((current) => ({ ...current, [key]: value }));
    if (["preset", "base_manifest_csv", "output_csv", "exclude_human_voice", "exclude_excluded_from_training", "ignore_retracted", "block_conflicts", "include_confirmed"].includes(key)) {
      setTrainingDryRun(null);
      setCreatedTrainingManifest(null);
      setManifestCreation({
        status: "idle",
        progress: 0,
        steps: buildManifestSteps(0),
        result: null,
        error: null,
        showJson: false,
        startedAt: null,
      });
    }
  }

  function applyPreset(presetId) {
    const preset = trainingPresets.find((item) => item.id === presetId) || {};
    const defaults = presetDefaults(presetId);
    setTrainingForm((current) => ({
      ...current,
      preset: presetId,
      base_manifest_csv: preset.default_manifest_csv || current.base_manifest_csv,
      target_mode: preset.target_mode || current.target_mode,
      ...defaults,
    }));
    setTrainingDryRun(null);
    setCreatedTrainingManifest(null);
    setManifestCreation({
      status: "idle",
      progress: 0,
      steps: buildManifestSteps(0),
      result: null,
      error: null,
      showJson: false,
      startedAt: null,
    });
  }

  function resetTrainingManifestState() {
    setTrainingDryRun(null);
    setCreatedTrainingManifest(null);
    setManifestCreation({
      status: "idle",
      progress: 0,
      steps: buildManifestSteps(0),
      result: null,
      error: null,
      showJson: false,
      startedAt: null,
    });
  }

  function applyModelBuilderType(type) {
    const next = modelBuilderDefaults(type, modelBuilder);
    setModelBuilder(next);
    setBuilderExploration(null);
    setBuilderCandidates([]);
    resetTrainingManifestState();
    setMessage(`${MODEL_BUILDER_TYPES[type]?.label || "Modelo"} preparado. Ejecuta explorar datos y dry-run antes de entrenar.`);
  }

  function applyModelBuilderPreset(presetId) {
    const preset = MODEL_BUILDER_PRESETS[presetId] || MODEL_BUILDER_PRESETS.custom;
    const next = modelBuilderDefaults(preset.type, { ...modelBuilder, ...preset, preset_id: presetId });
    setModelBuilder({
      ...next,
      preset_id: presetId,
      preset_name: preset.label,
      genus: preset.genus || next.genus,
    });
    setBuilderExploration(null);
    resetTrainingManifestState();
    setMessage(`${preset.label} preparado con valores recomendados.`);
  }

  function updateModelBuilder(key, value) {
    setModelBuilder((current) => {
      const next = { ...current, [key]: value };
      if (["type", "genus", "version", "selected_labels_text"].includes(key)) {
        return { ...next, ...modelBuilderDefaults(next.type, next), [key]: value };
      }
      return next;
    });
    if (["base_manifest_csv", "output_csv", "exclude_human_voice", "exclude_excluded_from_training", "ignore_retracted", "block_conflicts", "include_confirmed", "selected_labels_text", "genus", "type"].includes(key)) {
      resetTrainingManifestState();
    }
  }

  function modelBuilderLabels() {
    return String(modelBuilder.selected_labels_text || "")
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function toggleModelBuilderLabel(label) {
    const labels = modelBuilderLabels();
    const exists = labels.includes(label);
    const next = exists
      ? labels.filter((item) => item !== label)
      : modelBuilder.type === "binary_specialized"
        ? [...labels, label].slice(0, 2)
        : [...labels, label];
    updateModelBuilder("selected_labels_text", next.join("\n"));
  }

  function modelBuilderValidationMessages() {
    const messages = [];
    const labels = modelBuilderLabels();
    if (!modelBuilder.base_manifest_csv) messages.push("Selecciona un manifest base.");
    if (!modelBuilder.model_name) messages.push("Falta nombre de modelo.");
    if (!modelBuilder.target_mode) messages.push("Selecciona target_mode.");
    if (modelBuilder.type === "genus_species" && !modelBuilder.genus) messages.push("Selecciona genero para especies por genero.");
    if (modelBuilder.type === "binary_specialized" && labels.length !== 2) messages.push("Selecciona exactamente dos labels para el binario.");
    if (modelBuilder.type === "custom" && labels.length > 0 && labels.length < 2) messages.push("Selecciona al menos dos labels o deja el modelo personalizado sin filtro de labels.");
    return messages;
  }

  function modelBuilderUsesSpecialized() {
    if (modelBuilder.type === "genus_species") return true;
    if (modelBuilder.type === "binary_specialized") return modelBuilderLabels().length >= 2;
    if (modelBuilder.type === "custom") return modelBuilderLabels().length >= 2;
    return false;
  }

  function modelBuilderPayload(outputConflictStrategy = "fail") {
    if (modelBuilderUsesSpecialized()) {
      const labels = modelBuilderLabels();
      return {
        base_manifest_csv: modelBuilder.base_manifest_csv,
        output_csv: modelBuilder.output_csv,
        include_labels: modelBuilder.type === "genus_species" ? [] : labels.slice(0, modelBuilder.type === "binary_specialized" ? 2 : labels.length),
        filter_mode: modelBuilder.type === "genus_species" ? "group" : "labels",
        group: modelBuilder.type === "genus_species" ? modelBuilder.genus : null,
        apply_feedback: modelBuilder.apply_feedback,
        exclude_human_voice: modelBuilder.exclude_human_voice,
        exclude_retracted: modelBuilder.ignore_retracted,
        exclude_excluded_from_training: modelBuilder.exclude_excluded_from_training,
        block_conflicts: modelBuilder.block_conflicts,
        output_conflict_strategy: outputConflictStrategy,
        overwrite_existing: outputConflictStrategy === "overwrite",
      };
    }
    return {
      preset: modelBuilder.type === "custom" ? MODEL_BUILDER_TYPES.custom.preset : MODEL_BUILDER_TYPES[modelBuilder.type]?.preset,
      base_manifest_csv: modelBuilder.base_manifest_csv,
      output_csv: modelBuilder.output_csv,
      exclude_human_voice: modelBuilder.exclude_human_voice,
      exclude_excluded_from_training: modelBuilder.exclude_excluded_from_training,
      ignore_retracted: modelBuilder.ignore_retracted,
      block_conflicts: modelBuilder.block_conflicts,
      include_confirmed: modelBuilder.include_confirmed,
      output_conflict_strategy: outputConflictStrategy,
      overwrite_existing: outputConflictStrategy === "overwrite",
    };
  }

  async function loadModelBuilderManifestInfo(manifestCsv, options = {}) {
    if (!manifestCsv) return null;
    try {
      if (!options.quiet) setBuilderExploring(true);
      const summary = await fetchMlManifestSummary(manifestCsv);
      setManifestSummaries((current) => ({ ...current, [manifestCsv]: summary }));
      let candidates = [];
      try {
        const candidateData = await fetchMlManifestCandidates(manifestCsv);
        candidates = candidateData.candidates || [];
      } catch {
        candidates = [];
      }
      setBuilderCandidates(candidates);
      return { summary, candidates };
    } catch (err) {
      if (!options.quiet) setError(err.message || "No fue posible cargar detalles del manifest.");
      return null;
    } finally {
      if (!options.quiet) setBuilderExploring(false);
    }
  }

  async function refreshTrainingManifests() {
    await runLocked("refreshTrainingManifests", async () => {
      try {
        setError("");
        const data = await fetchMlTrainingManifests();
        setTrainingManifests(data.items || []);
        setMessage("Lista de manifests actualizada desde acusticafauna-ML/manifests.");
      } catch (err) {
        setError(err.message || "No fue posible actualizar la lista de manifests.");
      }
    });
  }

  function applyModelBuilderToTraining(useCreatedManifest = true) {
    const outputCsv = useCreatedManifest && createdTrainingManifest?.output_csv ? createdTrainingManifest.output_csv : modelBuilder.output_csv;
    setTrainingForm((current) => ({
      ...current,
      preset: MODEL_BUILDER_TYPES[modelBuilder.type]?.preset || current.preset,
      base_manifest_csv: modelBuilder.base_manifest_csv,
      output_csv: outputCsv,
      job_name: modelBuilder.job_name || modelBuilder.model_name,
      output_dir: modelBuilder.output_dir,
      model_name: modelBuilder.model_name,
      target_mode: modelBuilder.target_mode,
      epochs: modelBuilder.epochs,
      batch_size: modelBuilder.batch_size,
      sample_strategy: modelBuilder.sample_strategy,
      random_seed: modelBuilder.random_seed,
      exclude_human_voice: modelBuilder.exclude_human_voice,
      exclude_excluded_from_training: modelBuilder.exclude_excluded_from_training,
      ignore_retracted: modelBuilder.ignore_retracted,
      block_conflicts: modelBuilder.block_conflicts,
      include_confirmed: modelBuilder.include_confirmed,
    }));
    setMessage("Configuracion del constructor aplicada a Entrenar modelos. Revisa y lanza el entrenamiento cuando el manifest limpio este creado.");
  }

  function builderRecommendation(summary, weakClasses) {
    const classCount = Number(summary?.total_classes || summary?.classes?.length || Object.keys(summary?.class_counts || {}).length || 0);
    if (weakClasses.length) return "excluir clases debiles o conseguir mas datos";
    if (classCount < 2) return "necesita mas datos";
    if (classCount === 2 || modelBuilder.type === "binary_specialized") return "usar binario";
    return "apto para entrenamiento multiclase";
  }

  async function exploreModelBuilderData() {
    if (!modelBuilder.base_manifest_csv) {
      setError("Selecciona un manifest base antes de explorar datos.");
      return;
    }
    await runLocked("modelBuilderExplore", async () => {
      try {
        setBuilderExploring(true);
        setError("");
        const info = await loadModelBuilderManifestInfo(modelBuilder.base_manifest_csv);
        const summary = info?.summary || manifestSummaries[modelBuilder.base_manifest_csv] || {};
        const candidates = info?.candidates || builderCandidates || [];
        const classCounts = summary.class_counts || {};
        const splitClassCounts = summary.split_class_counts || {};
        const minimum = Number(modelBuilder.min_train_per_class || 0) + Number(modelBuilder.min_val_per_class || 0) + Number(modelBuilder.min_test_per_class || 0);
        const weakClasses = Object.entries(classCounts)
          .filter(([label, count]) => {
            const train = splitClassCounts.train?.[label] || 0;
            const val = splitClassCounts.val?.[label] || 0;
            const test = splitClassCounts.test?.[label] || 0;
            return Number(count || 0) < minimum || train < Number(modelBuilder.min_train_per_class || 0) || val < Number(modelBuilder.min_val_per_class || 0) || test < Number(modelBuilder.min_test_per_class || 0);
          })
          .map(([label]) => label);
        setBuilderExploration({
          summary,
          candidates,
          weakClasses,
          recommendation: builderRecommendation(summary, weakClasses),
        });
        setMessage("Datos explorados. Revisa clases, splits y recomendacion antes del dry-run.");
      } catch (err) {
        setError(err.message || "No fue posible explorar datos del manifest.");
      } finally {
        setBuilderExploring(false);
      }
    });
  }

  async function runModelBuilderDryRun() {
    await runLocked("modelBuilderDryRun", async () => {
      try {
        setError("");
        setMessage("Dry-run del constructor iniciado...");
        applyModelBuilderToTraining(false);
        const payload = modelBuilderPayload("fail");
        const data = modelBuilderUsesSpecialized()
          ? await dryRunMlSpecializedManifest(payload)
          : await dryRunMlTrainingCleanManifest(payload);
        setTrainingDryRun(data);
        setCreatedTrainingManifest(null);
        setMessage(data.can_train ? "Dry-run apto para entrenamiento." : "Dry-run completado con advertencias.");
      } catch (err) {
        setError(err.message || "No fue posible ejecutar el dry-run del constructor.");
      }
    });
  }

  async function createModelBuilderManifest(outputConflictStrategy = "fail") {
    await runLocked("modelBuilderCreateManifest", async () => {
      beginManifestProgress();
      try {
        setError("");
        applyModelBuilderToTraining(false);
        const payload = modelBuilderPayload(outputConflictStrategy);
        const data = modelBuilderUsesSpecialized()
          ? await createMlSpecializedManifest(payload)
          : await createMlTrainingCleanManifest(payload);
        setCreatedTrainingManifest(data);
        setTrainingDryRun(data);
        setTrainingForm((current) => ({ ...current, output_csv: data.output_csv || current.output_csv }));
        if (data.output_csv) {
          setTrainingManifests((current) => (
            current.some((item) => item.path === data.output_csv)
              ? current
              : [{ path: data.output_csv, name: data.output_csv.split("/").pop() || data.output_csv, size_bytes: null }, ...current]
          ));
        }
        await finishManifestProgress(data);
        setMessage("Manifest limpio creado desde Constructor de modelos ML.");
      } catch (err) {
        failManifestProgress(err);
        setError(err.message || "No fue posible crear el manifest desde el constructor.");
      }
    });
  }

  function cleanManifestPayload() {
    return {
      preset: trainingForm.preset,
      base_manifest_csv: trainingForm.base_manifest_csv,
      output_csv: trainingForm.output_csv,
      exclude_human_voice: trainingForm.exclude_human_voice,
      exclude_excluded_from_training: trainingForm.exclude_excluded_from_training,
      ignore_retracted: trainingForm.ignore_retracted,
      block_conflicts: trainingForm.block_conflicts,
      include_confirmed: trainingForm.include_confirmed,
    };
  }

  function setManifestProgress(progress, status = "running", extra = {}) {
    setManifestCreation((current) => ({
      ...current,
      status,
      progress,
      steps: buildManifestSteps(progress, status),
      ...extra,
    }));
  }

  function beginManifestProgress() {
    manifestProgressTimers.current.forEach((timer) => window.clearTimeout(timer));
    manifestProgressTimers.current = [];
    manifestProgressStartedAt.current = Date.now();
    setManifestCreation({
      status: "running",
      progress: 0,
      steps: buildManifestSteps(0),
      result: null,
      error: null,
      showJson: false,
      startedAt: manifestProgressStartedAt.current,
    });
    [
      [120, 15],
      [300, 30],
      [520, 50],
      [740, 70],
      [940, 90],
    ].forEach(([delay, progress]) => {
      const timer = window.setTimeout(() => setManifestProgress(progress), delay);
      manifestProgressTimers.current.push(timer);
    });
  }

  async function finishManifestProgress(data) {
    manifestProgressTimers.current.forEach((timer) => window.clearTimeout(timer));
    manifestProgressTimers.current = [];
    const elapsed = Date.now() - (manifestProgressStartedAt.current || Date.now());
    if (elapsed < 1000) {
      await wait(1000 - elapsed);
    }
    setManifestCreation({
      status: "completed",
      progress: 100,
      steps: data.steps || buildManifestSteps(100, "completed"),
      result: data,
      error: null,
      showJson: false,
      startedAt: null,
    });
    manifestProgressStartedAt.current = null;
  }

  function failManifestProgress(err) {
    manifestProgressTimers.current.forEach((timer) => window.clearTimeout(timer));
    manifestProgressTimers.current = [];
    manifestProgressStartedAt.current = null;
    setManifestCreation((current) => ({
      ...current,
      status: "failed",
      error: {
        message: err.message || "No fue posible crear el manifest limpio para entrenamiento.",
        base_manifest_csv: trainingForm.base_manifest_csv,
        output_csv: trainingForm.output_csv,
      },
      startedAt: null,
    }));
  }

  async function runTrainingDryRun() {
    await runLocked("trainingDryRun", async () => {
      try {
        setError("");
        setMessage("Dry-run iniciado...");
        setStatusMessage("Dry-run en progreso. Esto puede tardar unos segundos.");
        const data = await dryRunMlTrainingCleanManifest(cleanManifestPayload());
        setTrainingDryRun(data);
        setMessage("Dry-run completado.");
      } catch (err) {
        setError(err.message || "No fue posible ejecutar dry-run de entrenamiento.");
      }
    });
  }

  async function createTrainingManifest(outputConflictStrategy = "fail") {
    await runLocked("createTrainingManifest", async () => {
      beginManifestProgress();
      try {
        setError("");
        setMessage("");
        setStatusMessage("Creando manifest limpio versionado en acusticafauna-ML...");
        const data = await createMlTrainingCleanManifest({
          ...cleanManifestPayload(),
          output_conflict_strategy: outputConflictStrategy,
          overwrite_existing: outputConflictStrategy === "overwrite",
        });
        setCreatedTrainingManifest(data);
        setTrainingDryRun(data);
        setTrainingForm((current) => ({ ...current, output_csv: data.output_csv || current.output_csv }));
        if (data.output_csv) {
          setTrainingManifests((current) => (
            current.some((item) => item.path === data.output_csv)
              ? current
              : [{ path: data.output_csv, name: data.output_csv.split("/").pop() || data.output_csv, size_bytes: null }, ...current]
          ));
        }
        await finishManifestProgress(data);
        setStatusMessage("");
        setMessage("Manifest limpio creado correctamente.");
      } catch (err) {
        failManifestProgress(err);
        setStatusMessage("");
        setError(err.message || "No fue posible crear el manifest limpio para entrenamiento.");
      }
    });
  }

  function trainingBlocked() {
    const summary = createdTrainingManifest || trainingDryRun;
    if (!createdTrainingManifest) return true;
    if (!summary?.minimums_ok) return true;
    if (summary?.conflicts_detected > 0 && trainingForm.block_conflicts) return true;
    if ((summary?.warnings || []).length) return true;
    return false;
  }

  async function startTraining() {
    await runLocked("startTraining", async () => {
      try {
        setError("");
        setStatusMessage("Iniciando job de entrenamiento en ML API...");
        const job = await createMlTrainingJob({
          job_name: trainingForm.job_name,
          preset: trainingForm.preset,
          base_manifest_csv: trainingForm.base_manifest_csv,
          clean_manifest_csv: createdTrainingManifest?.output_csv || trainingForm.output_csv,
          output_dir: trainingForm.output_dir,
          model_name: trainingForm.model_name,
          target_mode: trainingForm.target_mode,
          epochs: Number(trainingForm.epochs),
          batch_size: Number(trainingForm.batch_size),
          clip_duration: Number(trainingForm.clip_duration),
          sample_strategy: trainingForm.sample_strategy,
          random_seed: Number(trainingForm.random_seed),
          device: trainingForm.device,
          dry_run_first: true,
        });
        setActiveJob(job);
        setTrainingJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
        setMessage("Job de entrenamiento iniciado.");
        refreshJob(job.id);
      } catch (err) {
        setError(err.message || "No fue posible crear el job de entrenamiento.");
      }
    });
  }

  async function refreshJob(jobId) {
    try {
      setJobReconnectMessage("");
      const [job, logs] = await Promise.all([fetchMlTrainingJob(jobId), fetchMlTrainingJobLogs(jobId)]);
      setActiveJob(job);
      setJobLogs(logs.logs || "");
      setTrainingJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setJobLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      setJobReconnectMessage("No se pudo actualizar el job. Intentando reconectar sin borrar el estado activo.");
    }
  }

  async function cancelTraining() {
    if (!activeJob?.id) return;
    await runLocked("cancelTraining", async () => {
      try {
        setStatusMessage("Cancelando job...");
        const job = await cancelMlTrainingJob(activeJob.id);
        setActiveJob(job);
        setMessage("Job cancelado.");
      } catch (err) {
        setError(err.message || "No fue posible cancelar el job.");
      }
    });
  }

  async function evaluateTraining() {
    if (!activeJob?.id) return;
    await runLocked("evaluateTraining", async () => {
      try {
        setStatusMessage("Evaluando modelo entrenado...");
        const evaluation = await evaluateMlTrainingJob(activeJob.id);
        setMessage(`Evaluacion completada: ${evaluation.output_dir}`);
        refreshJob(activeJob.id);
      } catch (err) {
        setError(err.message || "No fue posible evaluar el modelo.");
      }
    });
  }

  function activeJobClasses() {
    return activeJob?.manifest_summary?.classes || trainingDryRun?.classes || [];
  }

  function isSpecializedBinaryJob() {
    const classes = activeJobClasses();
    const targetMode = activeJob?.request?.target_mode || trainingForm.target_mode;
    return targetMode === "multiclass" && classes.length === 2;
  }

  function calibrationPositiveClass() {
    const classes = activeJobClasses();
    return classes.includes("Boana_pugnax") ? "Boana_pugnax" : classes[1] || classes[0] || "Boana_pugnax";
  }

  function needsCalibrationBeforeRegister() {
    return Boolean(activeJob?.evaluation) && isSpecializedBinaryJob() && !activeJob?.calibration;
  }

  async function calibrateTrainingThreshold() {
    if (!activeJob?.id) return;
    const positiveClass = calibrationPositiveClass();
    await runLocked("calibrateTraining", async () => {
      try {
        setStatusMessage("Calibrando threshold sobre validacion y aplicando a test...");
        const calibration = await calibrateMlTrainingJobThreshold(activeJob.id, {
          positive_class: positiveClass,
          score_column: `score_${positiveClass}`,
          metric: "balanced_accuracy",
          threshold_min: 0.01,
          threshold_max: 0.99,
          threshold_step: 0.01,
        });
        setMessage(`Calibracion completada. Threshold: ${formatMetric(calibration.best_threshold)}`);
        refreshJob(activeJob.id);
      } catch (err) {
        setError(err.message || "No fue posible calibrar el threshold.");
      }
    });
  }

  async function registerTrainingModel({ overrideArgmax = false } = {}) {
    if (!activeJob?.id) return;
    if (!activeJob.evaluation) {
      setError("Evalua el modelo antes de registrarlo.");
      return;
    }
    if (needsCalibrationBeforeRegister() && !overrideArgmax) {
      setPendingConfirm("registerArgmaxOverride");
      return;
    }
    await runLocked("registerTrainingModel", async () => {
      try {
        setStatusMessage("Registrando modelo en acusticafauna-ML/models...");
        const model = await registerMlTrainingJobModel(activeJob.id, {
          model_id: trainingForm.model_name,
          model_name: trainingForm.model_name,
          target_mode: trainingForm.target_mode,
        });
        setRegisteredModel(model);
        const comparison = model.comparison_against_active;
        if (model.registry_status === "experimental" && comparison?.warning) {
          setMessage(`Modelo registrado: ${model.model_id || model.id}. Registrado como experimental. ${comparison.warning}`);
        } else if (comparison?.improves_active) {
          setMessage(`Modelo registrado: ${model.model_id || model.id}. Mejora al activo; puedes promoverlo a modelo activo.`);
        } else {
          setMessage(`Modelo registrado: ${model.model_id || model.id}. Ya deberia aparecer en /models y en Laboratorio de audio.`);
        }
      } catch (err) {
        setError(err.message || "No fue posible registrar el modelo.");
      }
    });
  }

  async function promoteRegisteredModel() {
    const modelId = registeredModel?.model_id || registeredModel?.id;
    if (!modelId) return;
    const metrics = activeJob?.evaluation?.metrics || activeJob?.metrics || {};
    if (String(modelId).includes("amphibian_genus")) {
      const ba = Number(metrics.balanced_accuracy ?? registeredModel?.balanced_accuracy ?? 0);
      const boanaRecall = Number(metrics.per_class_recall?.Boana ?? metrics.recall_by_class?.Boana ?? 0);
      const counts = metrics.prediction_counts || {};
      const totalPredictions = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
      const collapsed = totalPredictions > 0 && (Number(counts.Hyalinobatrachium || 0) + Number(counts.Atelopus || 0)) / totalPredictions > 0.6;
      if (ba < 0.7 || boanaRecall < 0.7 || collapsed) {
        setError("No se permite promover genero: requiere BA >= 0.70, recall Boana >= 0.70 y sin colapso fuerte hacia Hyalinobatrachium/Atelopus.");
        return;
      }
    }
    await runLocked("promoteRegisteredModel", async () => {
      try {
        const model = await promoteMlModel(modelId, { notes: registeredModel.notes });
        setRegisteredModel(model);
        setMessage(`Modelo promovido a activo: ${model.model_id || model.id}.`);
      } catch (err) {
        setError(err.message || "No fue posible promover el modelo.");
      }
    });
  }

  const summary = audit.summary || {};
  const modelFilterOptions = useMemo(() => {
    const ids = new Set([...(annotationFacets.models || []), ...mlModels.map(getModelId).filter(Boolean)]);
    return Array.from(ids).sort();
  }, [annotationFacets.models, mlModels]);
  const selectedPreset = trainingPresets.find((item) => item.id === trainingForm.preset) || {};
  const selectedPresetDefaultMissing = Boolean(
    selectedPreset.default_manifest_csv &&
      trainingManifests.length &&
      !trainingManifests.some((item) => item.path === selectedPreset.default_manifest_csv)
  );
  const hasRunningJob = Boolean(
    activeJob && ["queued", "running"].includes(activeJob.status)
      ? activeJob
      : trainingJobs.find((job) => ["queued", "running"].includes(job.status))
  );
  const manifestOutputExists = trainingManifests.some((item) => item.path === trainingForm.output_csv);
  const isCreatingManifest = actionLoading.createTrainingManifest || manifestCreation.status === "running";
  const canCreateTrainingManifest = Boolean(
    trainingDryRun && !(trainingDryRun.conflicts_detected > 0 && trainingForm.block_conflicts) && !isCreatingManifest
  );
  const builderSummary = manifestSummaries[modelBuilder.base_manifest_csv] || builderExploration?.summary || null;
  const builderLabels = Object.keys(builderSummary?.class_counts || {}).sort();
  const builderGenusOptions = builderCandidates.length
    ? builderCandidates.map((item) => item.group).filter(Boolean)
    : MODEL_BUILDER_GENUS_OPTIONS;
  const builderValidation = modelBuilderValidationMessages();
  const builderDryRunOk = Boolean(trainingDryRun && !trainingDryRun.warnings?.length && !(trainingDryRun.conflicts_detected > 0 && modelBuilder.block_conflicts));
  const builderCanCreateManifest = Boolean(builderDryRunOk && !actionLoading.modelBuilderCreateManifest && !isCreatingManifest);
  const builderCanUseTraining = Boolean(createdTrainingManifest?.output_csv);
  const trainingManifestSummary = manifestSummaries[trainingForm.base_manifest_csv] || null;
  const calibration = activeJob?.calibration;
  const evaluationMetrics = activeJob?.evaluation?.metrics || {};
  const calibrationValidation = calibration?.validation_metrics || {};
  const calibrationTest = calibration?.test_metrics || {};
  const positiveMetrics = calibrationTest?.positive_label_metrics || calibrationTest;
  const registerRequiresCalibration = needsCalibrationBeforeRegister();
  const canRegisterModel = Boolean(activeJob?.status === "completed" && activeJob?.evaluation && !actionLoading.registerTrainingModel);

  return (
    <div className="space-y-6 p-6 text-slate-800">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}
      {statusMessage ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">{statusMessage}</div> : null}

      <SectionCard title="Estado ML API" subtitle="Conexion con acusticafauna-ML para manifests, jobs y modelos">
        <div className="flex flex-wrap items-center justify-between gap-3" aria-busy={mlHealth.state === "loading"}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={mlHealth.state === "connected" ? "success" : mlHealth.state === "loading" ? "info" : "danger"}>
              {mlHealth.state === "connected" ? "ML conectada" : mlHealth.state === "loading" ? "ML cargando" : "ML desconectada"}
            </Badge>
            <span className="text-sm text-slate-600">{mlHealth.message}</span>
            <span className="text-xs text-slate-500">Ultima verificacion: {formatCheckTime(mlHealth.checkedAt)}</span>
            {mlHealth.stale ? <Badge tone="warning">datos posiblemente desactualizados</Badge> : null}
          </div>
          <button type="button" onClick={() => runLocked("mlRetry", checkMlConnection)} disabled={actionLoading.mlRetry || mlHealth.state === "loading"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
            <LoadingText loading={actionLoading.mlRetry || mlHealth.state === "loading"} loadingText="Reintentando...">Reintentar conexion</LoadingText>
          </button>
        </div>
        {mlHealth.state !== "connected" && mlHealth.state !== "loading" ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>ML API no disponible.</strong>
            <p>Revisa que acusticafauna-ML este corriendo.</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{mlCommand()}</pre>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Auditoria de retroalimentacion" subtitle="Revisa feedback acumulado antes de construir manifests limpios">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {["active", "confirmed_positive", "false_positive", "false_negative", "excluded_from_training", "human_voice", "hard_negative", "retracted", "corrected"].map((key) => (
            <div key={key} className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{metricLabel(key)}</div>
              <strong>{summary[key] || 0}</strong>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Filtros" subtitle="Filtra feedback por modelo, audio, tipo, razon, estado o fecha">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Modelo</span>
            <select value={filters.model_id} onChange={(event) => updateFilter("model_id", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Todos</option>
              {modelFilterOptions.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Audio</span>
            <input value={filters.audio_path} onChange={(event) => updateFilter("audio_path", event.target.value)} placeholder="Buscar por nombre o ruta" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Tipo feedback</span>
            <select value={filters.feedback_type} onChange={(event) => updateFilter("feedback_type", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {FEEDBACK_TYPE_OPTIONS.map(([value, label]) => <option key={label} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Razon</span>
            <select value={filters.exclusion_reason} onChange={(event) => updateFilter("exclusion_reason", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {EXCLUSION_REASON_OPTIONS.map((value) => <option key={value || "all"} value={value}>{value || "Todas"}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Estado</span>
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {STATUS_OPTIONS.map((value) => <option key={value || "all"} value={value}>{value || "Todos"}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Fecha desde</span>
            <input type="date" value={filters.date_from} onChange={(event) => updateFilter("date_from", event.target.value)} min={(annotationFacets.date_min || "").slice(0, 10)} max={(annotationFacets.date_max || "").slice(0, 10)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Fecha hasta</span>
            <input type="date" value={filters.date_to} onChange={(event) => updateFilter("date_to", event.target.value)} min={(annotationFacets.date_min || "").slice(0, 10)} max={(annotationFacets.date_max || "").slice(0, 10)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => loadAudit()} disabled={loading} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <LoadingText loading={loading} loadingText="Aplicando filtros...">Aplicar filtros</LoadingText>
          </button>
          <button type="button" disabled={loading} onClick={() => { setFilters(EMPTY_FILTERS); loadAudit(EMPTY_FILTERS); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Limpiar
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Preparar nuevo modelo ML" subtitle="Constructor reutilizable para manifests limpios, dry-run obligatorio y entrenamiento posterior">
        <div className="space-y-4 text-sm">
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">
            Usa este constructor para preparar detectores, clasificadores de genero, especies por genero, binarios especializados o modelos personalizados. No entrena automaticamente, no modifica audios y no cambia dataset_curado.
          </p>

          <div className="grid gap-2 md:grid-cols-5">
            {[
              ["1", "Configurar", true],
              ["2", "Explorar datos", Boolean(builderExploration || builderSummary)],
              ["3", "Dry-run", Boolean(trainingDryRun)],
              ["4", "Crear manifest", Boolean(createdTrainingManifest)],
              ["5", "Usar para entrenamiento", builderCanUseTraining],
            ].map(([number, label, done]) => (
              <div key={number} className={`rounded-lg border px-3 py-2 ${done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                <strong>{number}. {label}</strong>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <label>
              <span className="mb-1 block font-semibold">Tipo de modelo</span>
              <select value={modelBuilder.type} onChange={(event) => applyModelBuilderType(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {Object.entries(MODEL_BUILDER_TYPES).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">{MODEL_BUILDER_TYPES[modelBuilder.type]?.description}</span>
            </label>
            <label>
              <span className="mb-1 block font-semibold">Preset</span>
              <select value={modelBuilder.preset_id || ""} onChange={(event) => applyModelBuilderPreset(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {Object.entries(MODEL_BUILDER_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">El preset rellena valores recomendados; luego puedes ajustar.</span>
            </label>
            <label>
              <span className="mb-1 block font-semibold">Version</span>
              <input value={modelBuilder.version} onChange={(event) => updateModelBuilder("version", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <span className="mt-1 block text-xs text-slate-500">Ejemplo: v1, v2, v3.</span>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label>
              <span className="mb-1 block font-semibold">Manifest base</span>
              {trainingManifests.length ? (
                <select value={modelBuilder.base_manifest_csv} onChange={(event) => { updateModelBuilder("base_manifest_csv", event.target.value); loadModelBuilderManifestInfo(event.target.value); }} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  {trainingManifests.map((item) => (
                    <option key={item.path} value={item.path}>{manifestOptionLabel(item, manifestSummaries[item.path])}</option>
                  ))}
                  {!trainingManifests.some((item) => item.path === modelBuilder.base_manifest_csv) ? (
                    <option value={modelBuilder.base_manifest_csv}>{modelBuilder.base_manifest_csv}</option>
                  ) : null}
                </select>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">No se encontraron manifests en acusticafauna-ML/manifests.</p>
              )}
              <span className="mt-1 block truncate text-xs text-slate-500" title={modelBuilder.base_manifest_csv}>Ruta real: {modelBuilder.base_manifest_csv || "sin seleccionar"}</span>
            </label>
            <button type="button" onClick={refreshTrainingManifests} disabled={actionLoading.refreshTrainingManifests} title="Vuelve a consultar los manifests disponibles en acusticafauna-ML/manifests." className="self-end rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50">
              <LoadingText loading={actionLoading.refreshTrainingManifests} loadingText="Actualizando...">Actualizar lista de manifests</LoadingText>
            </button>
            <button type="button" onClick={() => setManifestDetailsOpen(true)} disabled={!builderSummary} className="self-end rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50">
              Ver detalles del manifest
            </button>
          </div>

          {builderSummary ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <strong>Resumen del manifest seleccionado</strong>
                <Badge tone={builderExploration?.weakClasses?.length ? "warning" : "info"}>{builderExploration?.recommendation || "revisar datos"}</Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-lg bg-white p-2"><span className="text-xs text-slate-500">Ruta</span><br /><strong className="break-all font-mono text-xs">{modelBuilder.base_manifest_csv}</strong></div>
                <div className="rounded-lg bg-white p-2"><span className="text-xs text-slate-500">Filas</span><br /><strong>{builderSummary.rows || 0}</strong></div>
                <div className="rounded-lg bg-white p-2"><span className="text-xs text-slate-500">Clases</span><br /><strong>{builderSummary.total_classes || builderSummary.classes?.length || 0}</strong></div>
                <div className="rounded-lg bg-white p-2"><span className="text-xs text-slate-500">Missing files</span><br /><strong>{builderSummary.missing_files || 0}</strong></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(builderSummary.split_counts || {}).map(([split, count]) => <Badge key={split}>{split}: {count}</Badge>)}
                {topLabels(builderSummary).map((item) => <Badge key={item.label}>{item.label}: {item.count}</Badge>)}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-slate-200 p-3 text-slate-500">Selecciona un manifest y pulsa Explorar datos para ver filas, clases, splits, labels principales y advertencias.</p>
          )}

          {modelBuilder.type === "genus_species" ? (
            <label className="block">
              <span className="mb-1 block font-semibold">Genero para filtrar labels</span>
              <select value={modelBuilder.genus} onChange={(event) => updateModelBuilder("genus", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {builderGenusOptions.map((genus) => <option key={genus} value={genus}>{genus}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">La lista se alimenta desde los grupos detectados en el manifest cuando estan disponibles.</span>
            </label>
          ) : null}

          {["binary_specialized", "custom"].includes(modelBuilder.type) ? (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <strong>Labels para el modelo {modelBuilder.type === "binary_specialized" ? "(exactamente 2)" : "(opcional)"}</strong>
                <Badge>{modelBuilderLabels().length} seleccionado(s)</Badge>
              </div>
              {builderLabels.length ? (
                <div className="grid max-h-64 gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3">
                  {builderLabels.map((label) => {
                    const checked = modelBuilderLabels().includes(label);
                    const disabled = modelBuilder.type === "binary_specialized" && !checked && modelBuilderLabels().length >= 2;
                    return (
                      <label key={label} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"} ${disabled ? "opacity-50" : ""}`}>
                        <span className="min-w-0 truncate" title={label}>{label}</span>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleModelBuilderLabel(label)} />
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">Explora el manifest para cargar labels seleccionables.</p>
              )}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["epochs", "Epochs"],
              ["batch_size", "Batch"],
              ["random_seed", "Seed"],
              ["limit_per_class", "Limit per class"],
            ].map(([key, label]) => (
              <label key={key}>
                <span className="mb-1 block font-semibold">{label}</span>
                <input value={modelBuilder[key]} onChange={(event) => updateModelBuilder(key, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            ))}
            <label>
              <span className="mb-1 block font-semibold">Target mode</span>
              <select value={modelBuilder.target_mode} onChange={(event) => updateModelBuilder("target_mode", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {TARGET_MODE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">{TARGET_MODE_HELP[modelBuilder.target_mode]}</span>
            </label>
            <label>
              <span className="mb-1 block font-semibold">Sample strategy</span>
              <select value={modelBuilder.sample_strategy} onChange={(event) => updateModelBuilder("sample_strategy", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {SAMPLE_STRATEGY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">{SAMPLE_STRATEGY_HELP[modelBuilder.sample_strategy]}</span>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200">
            <button type="button" onClick={() => setBuilderAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold">
              <span>Opciones avanzadas</span>
              <span>{builderAdvancedOpen ? "Ocultar" : "Mostrar"}</span>
            </button>
            {builderAdvancedOpen ? (
              <div className="border-t border-slate-200 p-3">
                <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  Estos nombres y rutas se autogeneran desde el preset. Editalos solo si necesitas una version o destino especifico.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["model_name", "Nombre del modelo"],
                    ["job_name", "Nombre del job"],
                    ["output_csv", "Manifest limpio destino"],
                    ["output_dir", "Output dir"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <span className="mb-1 block font-semibold">{label}</span>
                      <input value={modelBuilder[key]} onChange={(event) => updateModelBuilder(key, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
                    </label>
                  ))}
                  <button type="button" onClick={() => applyModelBuilderPreset(modelBuilder.preset_id || "amphibian_genus_v2")} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold">
                    Restaurar valores recomendados
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <strong>Reglas de inclusion</strong>
              <Badge>{MODEL_BUILDER_TYPES[modelBuilder.type]?.promotion_rules}</Badge>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Aplicar feedback usa correcciones humanas; excluir voz humana evita audios marcados con habla; bloquear conflictos detiene anotaciones contradictorias; excluir clases con pocos ejemplos evita entrenar labels fragiles.
            </p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["apply_feedback", "aplicar feedback acumulado"],
                ["exclude_human_voice", "excluir voz humana"],
                ["exclude_excluded_from_training", "excluir excluded_from_training"],
                ["ignore_retracted", "ignorar retracted"],
                ["block_conflicts", "bloquear conflictos"],
                ["exclude_weak_classes", "excluir clases con pocos ejemplos"],
                ["include_confirmed", "incluir confirmados"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(modelBuilder[key])} onChange={(event) => updateModelBuilder(key, event.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {[
                ["min_train_per_class", "Min train por clase"],
                ["min_val_per_class", "Min val por clase"],
                ["min_test_per_class", "Min test por clase"],
              ].map(([key, label]) => (
                <label key={key}>
                  <span className="mb-1 block font-semibold">{label}</span>
                  <input value={modelBuilder[key]} onChange={(event) => updateModelBuilder(key, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
              ))}
            </div>
          </div>

          {builderValidation.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <strong>Antes del dry-run falta:</strong>
              <ul className="mt-2 list-disc pl-5">
                {builderValidation.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">Configuracion minima completa. Ya puedes explorar datos y ejecutar dry-run.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exploreModelBuilderData} disabled={builderExploring || !modelBuilder.base_manifest_csv} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50">
              <LoadingText loading={builderExploring} loadingText="Explorando...">Explorar datos</LoadingText>
            </button>
            <button type="button" onClick={runModelBuilderDryRun} disabled={actionLoading.modelBuilderDryRun || controlsLoading || builderValidation.length > 0} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50">
              <LoadingText loading={actionLoading.modelBuilderDryRun} loadingText="Ejecutando dry-run...">Ejecutar dry-run</LoadingText>
            </button>
            <button type="button" onClick={() => createModelBuilderManifest("fail")} disabled={!builderCanCreateManifest} title={!builderDryRunOk ? "Primero ejecuta dry-run para validar filas, clases y conflictos." : ""} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
              <LoadingText loading={actionLoading.modelBuilderCreateManifest || isCreatingManifest} loadingText="Creando manifest...">Crear manifest limpio</LoadingText>
            </button>
            <button type="button" onClick={() => applyModelBuilderToTraining(true)} disabled={!builderCanUseTraining} title={!builderCanUseTraining ? "Primero crea el manifest limpio." : ""} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
              Usar para entrenamiento
            </button>
          </div>
          {!builderDryRunOk ? <p className="text-xs text-slate-500">Crear manifest limpio se habilita despues de un dry-run exitoso. Primero valida filas, clases y conflictos.</p> : null}
          {!builderCanUseTraining ? <p className="text-xs text-slate-500">Usar para entrenamiento se habilita cuando exista un manifest limpio creado.</p> : null}

          {builderExploration ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <strong>Exploracion de datos</strong>
                  <Badge tone={builderExploration.weakClasses.length ? "warning" : "success"}>{builderExploration.recommendation}</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-2"><span className="text-xs text-slate-500">Filas</span><br /><strong>{builderExploration.summary.rows || 0}</strong></div>
                  <div className="rounded-lg bg-slate-50 p-2"><span className="text-xs text-slate-500">Clases</span><br /><strong>{builderExploration.summary.total_classes || builderExploration.summary.classes?.length || 0}</strong></div>
                  <div className="rounded-lg bg-slate-50 p-2"><span className="text-xs text-slate-500">Debiles</span><br /><strong>{builderExploration.weakClasses.length}</strong></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(builderExploration.summary.split_counts || {}).map(([split, count]) => <Badge key={split}>{split}: {count}</Badge>)}
                </div>
                {builderExploration.weakClasses.length ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    Clases debiles: {builderExploration.weakClasses.slice(0, 8).join(", ")}{builderExploration.weakClasses.length > 8 ? "..." : ""}.
                  </p>
                ) : null}
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
                {Object.entries(builderExploration.summary.class_counts || {}).slice(0, 24).map(([label, count]) => (
                  <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0">
                    <span className="min-w-0">
                      <strong className="block break-all">{label}</strong>
                      <span className="text-slate-500">{splitText(builderExploration.summary.split_class_counts, label)}</span>
                    </span>
                    <Badge tone={builderExploration.weakClasses.includes(label) ? "warning" : "success"}>{count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-slate-200 p-3 text-slate-500">Explora datos para ver filas totales, conteos por clase, split train/val/test, clases debiles y recomendacion.</p>
          )}

          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            El preset {AMPHIBIAN_GENUS_V2_PRESET} sigue disponible como caso de uso: manifest base `manifests/amphibian_genus_v1_manifest.csv`, salida `manifests/clean/amphibian_genus_v2_clean.csv`, multiclass, stratified y promocion solo si balanced_accuracy &gt;= 0.70, recall Boana &gt;= 0.70 y sin colapso fuerte.
          </p>

          {manifestDetailsOpen && builderSummary ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
              <div className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Detalles del manifest</h3>
                    <p className="break-all font-mono text-xs text-slate-500">{modelBuilder.base_manifest_csv}</p>
                  </div>
                  <button type="button" onClick={() => setManifestDetailsOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Cerrar</button>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <strong>Columnas</strong>
                    <div className="mt-2 flex flex-wrap gap-2">{(builderSummary.columns || []).map((column) => <Badge key={column}>{column}</Badge>)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <strong>Advertencias</strong>
                    <div className="mt-2 space-y-1 text-sm text-slate-600">
                      <p>Missing files: {builderSummary.missing_files || 0}</p>
                      {builderExploration?.weakClasses?.length ? <p>Clases debiles: {builderExploration.weakClasses.join(", ")}</p> : <p>Sin clases debiles detectadas con los minimos actuales.</p>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 lg:col-span-2">
                    <strong>Conteo y split por clase</strong>
                    <div className="mt-2 max-h-80 overflow-auto">
                      {Object.entries(builderSummary.class_counts || {}).map(([label, count]) => (
                        <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 px-2 py-2 text-sm last:border-b-0">
                          <span className="min-w-0">
                            <strong className="block break-all">{label}</strong>
                            <span className="text-xs text-slate-500">{splitText(builderSummary.split_class_counts, label)}</span>
                          </span>
                          <Badge>{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 lg:col-span-2">
                    <strong>Ejemplos de rutas</strong>
                    <div className="mt-2 space-y-1 font-mono text-xs text-slate-500">
                      {(builderSummary.sample_audio_paths || builderSummary.sample_paths || []).slice(0, 8).map((path) => <p key={path} className="break-all">{path}</p>)}
                      {!(builderSummary.sample_audio_paths || builderSummary.sample_paths || []).length ? <p>No hay ejemplos de rutas en el resumen.</p> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Entrenar modelos" subtitle="Crea manifests limpios sobre un manifest base completo y lanza jobs asincronos en la ML API">
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          El entrenamiento corre en acusticafauna-ML. El backend principal solo orquesta y no importa OpenSoundscape. Siempre se ejecuta dry-run antes de entrenar.
        </p>
        {controlsLoading ? (
          <div className="mb-4 grid gap-3 md:grid-cols-3" aria-busy="true">
            {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" aria-busy={controlsLoading || actionLoading.trainingDryRun || actionLoading.createTrainingManifest || actionLoading.startTraining}>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Tipo de modelo</span>
                <select value={trainingForm.preset} onChange={(event) => applyPreset(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  {(trainingPresets.length ? trainingPresets : [{ id: "boana_boans_pugnax" }]).map((item) => (
                    <option key={item.id} value={item.id}>{PRESET_LABELS[item.id] || item.name || item.id}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Manifest base</span>
                {trainingManifests.length ? (
                  <select value={trainingForm.base_manifest_csv} onChange={(event) => { updateTrainingForm("base_manifest_csv", event.target.value); loadModelBuilderManifestInfo(event.target.value, { quiet: true }); }} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    {trainingManifests.map((item) => (
                      <option key={item.path} value={item.path}>{manifestOptionLabel(item, manifestSummaries[item.path])}</option>
                    ))}
                    {!trainingManifests.some((item) => item.path === trainingForm.base_manifest_csv) ? (
                      <option value={trainingForm.base_manifest_csv}>{trainingForm.base_manifest_csv}</option>
                    ) : null}
                  </select>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No se encontraron manifests en acusticafauna-ML/manifests.</p>
                )}
                <span className="mt-1 block truncate text-xs text-slate-500" title={trainingForm.base_manifest_csv}>Valor interno: {trainingForm.base_manifest_csv}</span>
              </label>
            </div>
            {trainingManifestSummary ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="mb-2 font-semibold text-slate-600">Resumen del manifest de entrenamiento</div>
                <div className="flex flex-wrap gap-2">
                  <Badge>filas: {trainingManifestSummary.rows || 0}</Badge>
                  <Badge>clases: {trainingManifestSummary.total_classes || trainingManifestSummary.classes?.length || 0}</Badge>
                  {Object.entries(trainingManifestSummary.split_counts || {}).map(([split, count]) => <Badge key={split}>{split}: {count}</Badge>)}
                  {topLabels(trainingManifestSummary, 4).map((item) => <Badge key={item.label}>{item.label}: {item.count}</Badge>)}
                </div>
              </div>
            ) : null}
            {selectedPresetDefaultMissing ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                El preset recomienda {selectedPreset.default_manifest_csv}, pero no aparece en la lista de manifests.
              </p>
            ) : null}
            <div className="grid gap-2 rounded-lg border border-slate-200 p-3 text-sm md:grid-cols-2">
              {[
                ["exclude_human_voice", "excluir voz_humana"],
                ["exclude_excluded_from_training", "excluir excluded_from_training"],
                ["ignore_retracted", "ignorar retracted"],
                ["block_conflicts", "bloquear conflictos"],
                ["include_confirmed", "incluir confirmados"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(trainingForm[key])} onChange={(event) => updateTrainingForm(key, event.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200">
              <button type="button" onClick={() => setAdvancedTrainingOpen((open) => !open)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold">
                <span>Opciones avanzadas</span>
                <span>{advancedTrainingOpen ? "Ocultar" : "Mostrar"}</span>
              </button>
              {advancedTrainingOpen ? (
                <div className="border-t border-slate-200 p-3">
                  <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                    Usa ruta manual solo si el manifest no aparece en la lista. Estos campos se rellenan automaticamente al elegir preset.
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm md:col-span-3">
                      <span className="mb-1 block font-semibold">Ruta manual avanzada del manifest base</span>
                      <input value={trainingForm.base_manifest_csv} onChange={(event) => updateTrainingForm("base_manifest_csv", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
                    </label>
                    <label className="text-sm md:col-span-3">
                      <span className="mb-1 block font-semibold">Manifest limpio versionado</span>
                      <input value={trainingForm.output_csv} onChange={(event) => updateTrainingForm("output_csv", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
                    </label>
                    {[
                      ["job_name", "Job"],
                      ["model_name", "Modelo"],
                      ["output_dir", "Output dir"],
                      ["epochs", "Epochs"],
                      ["batch_size", "Batch"],
                      ["random_seed", "Seed"],
                    ].map(([key, label]) => (
                      <label key={key} className="text-sm">
                        <span className="mb-1 block font-semibold">{label}</span>
                        <input value={trainingForm[key]} onChange={(event) => updateTrainingForm(key, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      </label>
                    ))}
                    <label className="text-sm">
                      <span className="mb-1 block font-semibold">Device</span>
                      <select value={trainingForm.device} onChange={(event) => updateTrainingForm("device", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                        {DEVICE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-semibold">Target mode</span>
                      <select value={trainingForm.target_mode} onChange={(event) => updateTrainingForm("target_mode", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                        {TARGET_MODE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-semibold">Sample strategy</span>
                      <select value={trainingForm.sample_strategy} onChange={(event) => updateTrainingForm("sample_strategy", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                        {SAMPLE_STRATEGY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={runTrainingDryRun} disabled={actionLoading.trainingDryRun || controlsLoading} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
                <LoadingText loading={actionLoading.trainingDryRun} loadingText="Ejecutando dry-run...">Dry-run manifest limpio</LoadingText>
              </button>
              <button type="button" onClick={() => setPendingConfirm("createTrainingManifest")} disabled={!canCreateTrainingManifest} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <LoadingText loading={isCreatingManifest} loadingText="Creando manifest...">Crear manifest limpio versionado</LoadingText>
              </button>
              <button type="button" onClick={() => setPendingConfirm("startTraining")} disabled={trainingBlocked() || hasRunningJob || actionLoading.startTraining} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <LoadingText loading={actionLoading.startTraining} loadingText="Iniciando entrenamiento...">Entrenar modelo</LoadingText>
              </button>
            </div>
            {hasRunningJob ? <p className="text-xs text-amber-700">Ya hay un job en cola o ejecucion. No se iniciara otro desde esta pantalla hasta que termine o se cancele.</p> : null}
          </div>

          <div className="space-y-3">
            {trainingDryRun ? (
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <strong>Resumen del manifest</strong>
                  <Badge tone={trainingDryRun.can_train ? "success" : "warning"}>{trainingDryRun.can_train ? "apto" : "revisar"}</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {["rows_before", "rows_after", "feedback_applied", "excluded_by_human_voice", "excluded_by_retracted", "excluded_by_excluded_from_training", "conflicts_detected"].map((key) => (
                    <div key={key} className="rounded-lg bg-slate-50 p-2">
                      <div className="text-xs text-slate-500">{key}</div>
                      <strong>{trainingDryRun[key] || 0}</strong>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs">
                  <div className="font-semibold text-slate-500">Manifest base seleccionado</div>
                  <div className="truncate font-mono" title={trainingDryRun.base_manifest_csv || trainingForm.base_manifest_csv}>{trainingDryRun.base_manifest_csv || trainingForm.base_manifest_csv}</div>
                  <div className="mt-1 text-slate-500">Retracted ignorados: {trainingDryRun.excluded_by_retracted || 0}</div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-semibold text-slate-500">Clases</div>
                    <div className="flex flex-wrap gap-2">
                      {(trainingDryRun.classes || []).map((label) => <Badge key={label}>{label}: {trainingDryRun.class_counts?.[label] || 0}</Badge>)}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-slate-500">Split</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(trainingDryRun.split_counts || {}).map(([split, count]) => <Badge key={split}>{split}: {count}</Badge>)}
                    </div>
                  </div>
                </div>
                {trainingDryRun.min_checks?.length ? (
                  <div className="mt-3 max-h-32 overflow-auto rounded-lg border border-slate-200">
                    {trainingDryRun.min_checks.map((item) => (
                      <div key={`${item.split}-${item.label}`} className="flex justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0">
                        <span>{item.split} / {item.label}</span>
                        <strong className={item.ok ? "text-emerald-700" : "text-red-700"}>{item.count} / {item.minimum}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
                {trainingDryRun.warnings?.length ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {trainingDryRun.warnings.map((item) => <p key={item}>{item}</p>)}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Ejecuta el dry-run para ver filas, clases, splits, exclusiones y conflictos.</p>
            )}

            {manifestCreation.status !== "idle" ? (
              <div className={`rounded-lg border p-3 text-sm ${manifestCreation.status === "failed" ? "border-red-200 bg-red-50 text-red-900" : manifestCreation.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <strong>{manifestCreation.status === "completed" ? "Manifest limpio creado correctamente" : manifestCreation.status === "failed" ? "No se pudo crear el manifest" : "Creando manifest limpio"}</strong>
                  <Badge tone={manifestCreation.status === "completed" ? "success" : manifestCreation.status === "failed" ? "danger" : "info"}>{manifestCreation.progress}%</Badge>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/80">
                  <div className={`h-full rounded-full transition-all ${manifestCreation.status === "failed" ? "bg-red-500" : manifestCreation.status === "completed" ? "bg-emerald-600" : "bg-blue-600"}`} style={{ width: `${manifestCreation.progress}%` }} />
                </div>
                <div className="mt-3 grid gap-2">
                  {manifestCreation.steps.map((step) => (
                    <div key={step.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-xs">
                      <span className="font-medium">{step.label}</span>
                      <span>{step.status === "completed" ? "listo" : manifestCreation.status === "running" && manifestCreation.progress < step.progress ? "pendiente" : step.progress}</span>
                    </div>
                  ))}
                </div>
                {manifestCreation.status === "completed" && manifestCreation.result ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-2 rounded-lg bg-white/70 p-3 text-xs md:grid-cols-2">
                      <div className="md:col-span-2"><strong>Ruta destino:</strong> <span className="font-mono">{manifestCreation.result.output_csv}</span></div>
                      <div><strong>rows_after:</strong> {manifestCreation.result.rows_after ?? "-"}</div>
                      <div><strong>minimums_ok:</strong> {manifestCreation.result.minimums_ok ? "true" : "false"}</div>
                      <div><strong>Clases:</strong> {(manifestCreation.result.classes || []).join(", ") || "-"}</div>
                      <div><strong>Splits:</strong> {Object.entries(manifestCreation.result.split_counts || {}).map(([split, count]) => `${split}: ${count}`).join(", ") || "-"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setCreatedTrainingManifest(manifestCreation.result); setTrainingForm((current) => ({ ...current, output_csv: manifestCreation.result.output_csv || current.output_csv })); setMessage("Este manifest quedo seleccionado para entrenar."); }} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">
                        Usar este manifest para entrenar
                      </button>
                      {manifestCreation.result.summary_json ? (
                        <button type="button" onClick={() => setManifestCreation((current) => ({ ...current, showJson: !current.showJson }))} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold">
                          Ver resumen JSON
                        </button>
                      ) : null}
                    </div>
                    {manifestCreation.showJson ? (
                      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(manifestCreation.result, null, 2)}</pre>
                    ) : null}
                  </div>
                ) : null}
                {manifestCreation.status === "failed" && manifestCreation.error ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg bg-white/70 p-3 text-xs">
                      <div><strong>Error:</strong> {manifestCreation.error.message}</div>
                      <div className="mt-1"><strong>Manifest base:</strong> <span className="font-mono">{manifestCreation.error.base_manifest_csv}</span></div>
                      <div className="mt-1"><strong>Destino:</strong> <span className="font-mono">{manifestCreation.error.output_csv}</span></div>
                      <div className="mt-2">Revisa conflictos, permisos de escritura o confirma sobrescritura si el archivo ya existe.</div>
                    </div>
                    <button type="button" onClick={() => createTrainingManifest(manifestOutputExists ? "overwrite" : "fail")} disabled={isCreatingManifest} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                      <LoadingText loading={isCreatingManifest} loadingText="Reintentando...">Reintentar</LoadingText>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <strong>Job activo</strong>
                {activeJob ? <Badge tone={activeJob.status === "failed" ? "danger" : activeJob.status === "completed" ? "success" : "info"}>{activeJob.status}</Badge> : null}
              </div>
              {activeJob ? (
                <>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Nombre</div><strong>{activeJob.job_name}</strong></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Progreso</div><strong>{Math.round((activeJob.progress || 0) * 100)}%</strong></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Preset</div><strong>{activeJob.preset}</strong></div>
                  </div>
                  {activeJob.metrics ? (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong>A. Configuracion y dataset del entrenamiento</strong>
                          <p>Metricas de entrenamiento disponibles.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton onClick={() => copyText(jsonText(activeJob.metrics), "Metricas copiadas.")}>Copiar metricas</ActionButton>
                          <ActionButton onClick={() => copyText(trainingSummaryMarkdown(activeJob), "Resumen copiado.")}>Copiar resumen Markdown</ActionButton>
                          <ActionButton onClick={() => downloadJsonFile("training_metrics.json", activeJob.metrics)}>Descargar training_metrics.json</ActionButton>
                        </div>
                      </div>
                      {!activeJob.evaluation ? (
                        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                          Estas son metricas/configuracion de entrenamiento. Para saber rendimiento del modelo, ejecuta Evaluar.
                        </p>
                      ) : null}
                      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2">{jsonText(activeJob.metrics)}</pre>
                    </div>
                  ) : null}
                  {activeJob.evaluation ? (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong>B. Resultado de evaluacion</strong>
                          <p>{activeJob.evaluation.output_dir}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton onClick={() => copyText(jsonText(activeJob.evaluation.metrics), "Metricas copiadas.")}>Copiar metricas evaluacion</ActionButton>
                          <ActionButton onClick={() => copyText(evaluationSummaryMarkdown(activeJob), "Resumen copiado.")}>Copiar resumen evaluacion</ActionButton>
                          <ActionButton onClick={() => downloadJsonFile("metrics.json", activeJob.evaluation.metrics)}>Descargar metrics.json</ActionButton>
                          <ActionButton onClick={() => downloadJobArtifact("test_scores.csv")}>Descargar predictions</ActionButton>
                          <ActionButton onClick={() => downloadJobArtifact("diagnostics.json")}>Descargar diagnostics</ActionButton>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <div className="rounded-lg bg-white/70 p-2"><div className="text-blue-700">accuracy</div><strong>{formatMetric(activeJob.evaluation.metrics?.accuracy)}</strong></div>
                        <div className="rounded-lg bg-white/70 p-2"><div className="text-blue-700">balanced_accuracy</div><strong>{formatMetric(activeJob.evaluation.metrics?.balanced_accuracy)}</strong></div>
                        <div className="rounded-lg bg-white/70 p-2"><div className="text-blue-700">rows</div><strong>{activeJob.evaluation.metrics?.rows ?? "-"}</strong></div>
                      </div>
                    </div>
                  ) : null}
                  {activeJob.evaluation && isSpecializedBinaryJob() ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <strong>Este modelo especializado puede requerir regla calibrada.</strong>
                      <p>No registres solo con argmax si la calibracion mejora el resultado.</p>
                    </div>
                  ) : null}
                  {activeJob.evaluation ? (
                    <div className="mt-3 rounded-lg border border-slate-200 p-3 text-xs">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong>C. Resultado de calibracion</strong>
                          <div>{calibration ? "Threshold calibrado disponible." : "Calibracion threshold"}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {calibration ? (
                            <>
                              <ActionButton onClick={() => copyText(jsonText(calibration.test_metrics || calibration), "Metricas copiadas.")}>Copiar metricas calibradas</ActionButton>
                              <ActionButton onClick={() => copyText(jsonText(calibration.decision_rule), "Decision rule copiada.")}>Copiar decision_rule</ActionButton>
                              <ActionButton onClick={() => copyText(calibrationSummaryMarkdown(activeJob), "Resumen copiado.")}>Copiar resumen</ActionButton>
                              <ActionButton onClick={() => downloadJobArtifact("calibration_summary.json")}>Descargar calibration_summary.json</ActionButton>
                              <ActionButton onClick={() => downloadJobArtifact("calibration_report.csv")}>Descargar calibration_report.csv</ActionButton>
                            </>
                          ) : null}
                          {calibration ? <Badge tone="success">calibrado</Badge> : <Badge tone={isSpecializedBinaryJob() ? "warning" : "default"}>{isSpecializedBinaryJob() ? "pendiente" : "opcional"}</Badge>}
                        </div>
                      </div>
                      {calibration ? (
                        <div className="grid gap-2 md:grid-cols-3">
                          <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">best_threshold</div><strong>{formatMetric(calibration.best_threshold)}</strong></div>
                          <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">val balanced_accuracy</div><strong>{formatMetric(calibrationValidation.balanced_accuracy)}</strong></div>
                          <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">test balanced_accuracy</div><strong>{formatMetric(calibrationTest.balanced_accuracy)}</strong></div>
                          <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">precision clase positiva</div><strong>{formatMetric(positiveMetrics.precision)}</strong></div>
                          <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">recall clase positiva</div><strong>{formatMetric(positiveMetrics.recall)}</strong></div>
                          <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">F1 clase positiva</div><strong>{formatMetric(positiveMetrics.f1)}</strong></div>
                          <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">argmax balanced_accuracy</div><strong>{formatMetric(evaluationMetrics.balanced_accuracy)}</strong></div>
                          <div className="rounded-lg bg-slate-50 p-2 md:col-span-2"><div className="text-slate-500">regla</div><strong>{calibration.decision_rule?.score_column} &gt;= {formatMetric(calibration.best_threshold)} =&gt; {calibration.decision_rule?.if_score_gte_threshold}</strong></div>
                        </div>
                      ) : (
                        <p className="text-slate-600">Ejecuta la calibracion para comparar balanced_accuracy calibrado contra argmax.</p>
                      )}
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-lg border border-slate-200 p-3 text-xs">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong>D. Logs</strong>
                        <p>{jobLogs ? "train.log cargado." : "Sin logs todavia."}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton onClick={() => copyText(jobLogs || "", "Logs copiados.")} disabled={!jobLogs}>Copiar logs</ActionButton>
                        <ActionButton onClick={() => downloadText("train.log", jobLogs || "", "text/plain")} disabled={!jobLogs}>Descargar train.log</ActionButton>
                      </div>
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{jobLogs || "Sin logs todavia."}</pre>
                  </div>
                  {jobReconnectMessage ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{jobReconnectMessage}</p> : null}
                  {jobLastUpdatedAt ? <p className="mt-2 text-xs text-slate-500">Ultima actualizacion: {formatCheckTime(jobLastUpdatedAt)}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => refreshJob(activeJob.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Actualizar</button>
                    <button type="button" onClick={cancelTraining} disabled={!["queued", "running"].includes(activeJob.status) || actionLoading.cancelTraining} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">
                      <LoadingText loading={actionLoading.cancelTraining} loadingText="Cancelando...">Cancelar</LoadingText>
                    </button>
                    <button type="button" onClick={evaluateTraining} disabled={activeJob.status !== "completed" || actionLoading.evaluateTraining} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                      <LoadingText loading={actionLoading.evaluateTraining} loadingText="Evaluando...">Evaluar</LoadingText>
                    </button>
                    <button type="button" onClick={calibrateTrainingThreshold} disabled={!activeJob.evaluation || !isSpecializedBinaryJob() || actionLoading.calibrateTraining} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">
                      <LoadingText loading={actionLoading.calibrateTraining} loadingText="Calibrando...">Calibrar threshold</LoadingText>
                    </button>
                    <button type="button" onClick={() => registerTrainingModel()} disabled={!canRegisterModel} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                      <LoadingText loading={actionLoading.registerTrainingModel} loadingText="Registrando...">Registrar modelo</LoadingText>
                    </button>
                    <a href="/laboratorio-audio" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Abrir modelo en laboratorio</a>
                  </div>
                  {registerRequiresCalibration ? <p className="mt-2 text-xs text-amber-700">Registro bloqueado hasta calibrar o confirmar override explicito de argmax.</p> : null}
                  {registeredModel ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                      <strong>Comparacion contra modelo activo</strong>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <div><span className="text-slate-500">Estado registro</span><br /><strong>{registeredModel.registry_status || "-"}</strong></div>
                        <div><span className="text-slate-500">Activo comparado</span><br /><strong>{registeredModel.comparison_against_active?.active_model_id || "-"}</strong></div>
                        <div><span className="text-slate-500">Decision sugerida</span><br /><strong>{registeredModel.comparison_against_active?.recommendation === "keep_active" ? "mantener activo actual" : "promover candidato"}</strong></div>
                        <div><span className="text-slate-500">BA activo</span><br /><strong>{formatMetric(registeredModel.comparison_against_active?.active_balanced_accuracy)}</strong></div>
                        <div><span className="text-slate-500">BA candidato</span><br /><strong>{formatMetric(registeredModel.comparison_against_active?.candidate_balanced_accuracy)}</strong></div>
                      </div>
                      {registeredModel.registry_status === "experimental" ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">Registrado como experimental.</p>
                      ) : null}
                      {registeredModel.comparison_against_active?.improves_active ? (
                        <button type="button" onClick={promoteRegisteredModel} disabled={actionLoading.promoteRegisteredModel} className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                          <LoadingText loading={actionLoading.promoteRegisteredModel} loadingText="Promoviendo...">Promover a modelo activo</LoadingText>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-slate-500">Sin job activo.</p>
              )}
            </div>

            {trainingJobs.length ? (
              <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 text-sm">
                {trainingJobs.map((job) => (
                  <button key={job.id} type="button" onClick={() => refreshJob(job.id)} className="block w-full border-b border-slate-100 p-3 text-left last:border-b-0 hover:bg-slate-50">
                    <div className="flex justify-between gap-2"><strong>{job.job_name}</strong><Badge>{job.status}</Badge></div>
                    <div className="text-xs text-slate-500">{job.created_at}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Resumen de retroalimentacion acumulada" subtitle="Vista operativa del feedback; no es un dataset de entrenamiento completo">
        <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Esto resume solo las anotaciones acumuladas. No es un dataset de entrenamiento completo. Para entrenar, usa la seccion Entrenar modelos con un manifest base seleccionado.
        </p>
        <div className="flex flex-wrap gap-2">
          <input value={manifestName} onChange={(event) => setManifestName(event.target.value)} className="min-w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="button" onClick={runDryRun} disabled={actionLoading.legacyDryRun} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            <LoadingText loading={actionLoading.legacyDryRun} loadingText="Ejecutando dry-run...">Dry-run</LoadingText>
          </button>
          <button type="button" onClick={createManifest} disabled={!dryRun || dryRun.conflicts_detected > 0 || actionLoading.legacyCreateManifest} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <LoadingText loading={actionLoading.legacyCreateManifest} loadingText="Creando manifest...">Crear manifest versionado</LoadingText>
          </button>
          <button type="button" onClick={() => setDryRun(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
            Cancelar
          </button>
        </div>
        {dryRun ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              "rows_before",
              "rows_after",
              "excluded_by_human_voice",
              "excluded_by_retracted",
              "excluded_by_excluded_from_training",
              "included_confirmed",
              "sent_to_review",
              "hard_negatives_available",
              "conflicts_detected",
            ].map((key) => (
              <div key={key} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{key}</div>
                <strong>{dryRun[key] || 0}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Conflictos" subtitle="Corrige feedback contradictorio antes de usarlo para entrenamiento">
        {audit.conflicts?.length ? (
          <div className="space-y-2">
            {audit.conflicts.map((item) => (
              <div key={`${item.audio_path}-${item.start_seconds}-${item.model_id}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Este item tiene feedback contradictorio. Corrige antes de usarlo para entrenamiento.</strong>
                <div className="mt-1 truncate" title={item.audio_path}>{item.audio_path}</div>
                <div>{item.start_seconds} - {item.end_seconds} · {item.model_id}</div>
                <div className="mt-2 flex flex-wrap gap-2">{item.feedback_types.map((type) => <Badge key={type} tone="warning">{type}</Badge>)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Sin conflictos detectados.</p>
        )}
      </SectionCard>

      <SectionCard title="Feedbacks" subtitle="Muestra las anotaciones acumuladas con los filtros actuales">
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
          {audit.items?.length ? (
            audit.items.map((item) => (
              <div key={item.id} className="border-b border-slate-100 p-3 text-sm last:border-b-0">
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold" title={item.audio_path}>{item.audio_name || item.audio_path}</div>
                    <div className="truncate text-xs text-slate-500" title={item.audio_path}>{item.audio_path}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={item.status === "retracted" ? "danger" : "info"}>{item.status || "active"}</Badge>
                    <Badge tone={item.feedback_type === "excluded_from_training" ? "danger" : "default"}>{item.feedback_type || item.user_feedback}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.model_id} · {item.start_seconds} - {item.end_seconds} · {item.exclusion_reason || "sin razon"}</p>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">Sin feedbacks para estos filtros.</p>
          )}
        </div>
      </SectionCard>

      {pendingConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            {pendingConfirm === "createTrainingManifest" ? (
              <>
                <h2 className="text-lg font-bold text-slate-900">Crear manifest limpio versionado</h2>
                <p className="mt-1 text-sm text-slate-600">Confirma los datos antes de escribir el CSV limpio en acusticafauna-ML.</p>
                <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                  <div><strong>Manifest base:</strong> <span className="font-mono">{trainingForm.base_manifest_csv}</span></div>
                  <div><strong>Destino:</strong> <span className="font-mono">{trainingForm.output_csv}</span></div>
                  <div><strong>Rows after:</strong> {trainingDryRun?.rows_after ?? "-"}</div>
                  <div><strong>Clases:</strong> {(trainingDryRun?.classes || []).join(", ") || "-"}</div>
                  <div><strong>Conflictos:</strong> {trainingDryRun?.conflicts_detected || 0}</div>
                </div>
                {manifestOutputExists ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    El destino ya existe. Elige si quieres sobrescribirlo, crear una copia con sufijo nuevo o cancelar.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setPendingConfirm(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button>
                  {manifestOutputExists ? (
                    <>
                      <button type="button" onClick={() => { setPendingConfirm(null); createTrainingManifest("suffix"); }} disabled={isCreatingManifest} className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50">
                        Crear con sufijo nuevo
                      </button>
                      <button type="button" onClick={() => { setPendingConfirm(null); createTrainingManifest("overwrite"); }} disabled={isCreatingManifest} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        <LoadingText loading={isCreatingManifest} loadingText="Creando manifest...">Sobrescribir</LoadingText>
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setPendingConfirm(null); createTrainingManifest("fail"); }} disabled={isCreatingManifest} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      <LoadingText loading={isCreatingManifest} loadingText="Creando manifest...">Crear manifest</LoadingText>
                    </button>
                  )}
                </div>
              </>
            ) : pendingConfirm === "startTraining" ? (
              <>
                <h2 className="text-lg font-bold text-slate-900">Iniciar entrenamiento</h2>
                <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Este entrenamiento puede tardar varios minutos u horas segun CPU/GPU.
                </p>
                <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                  <div><strong>Modelo:</strong> {trainingForm.model_name}</div>
                  <div><strong>Manifest limpio:</strong> <span className="font-mono">{createdTrainingManifest?.output_csv || trainingForm.output_csv}</span></div>
                  <div><strong>Epochs:</strong> {trainingForm.epochs}</div>
                  <div><strong>Batch:</strong> {trainingForm.batch_size}</div>
                  <div><strong>Device:</strong> {trainingForm.device}</div>
                  <div><strong>Output dir:</strong> <span className="font-mono">{trainingForm.output_dir}</span></div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setPendingConfirm(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button>
                  <button type="button" onClick={() => { setPendingConfirm(null); startTraining(); }} disabled={actionLoading.startTraining || hasRunningJob} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    <LoadingText loading={actionLoading.startTraining} loadingText="Iniciando entrenamiento...">Iniciar entrenamiento</LoadingText>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900">Registrar sin calibracion</h2>
                <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Este clasificador especializado tiene dos clases y puede necesitar regla calibrada. Confirma solo si quieres registrar el modelo usando argmax crudo.
                </p>
                <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                  <div><strong>Modelo:</strong> {trainingForm.model_name}</div>
                  <div><strong>Argmax balanced_accuracy:</strong> {formatMetric(activeJob?.evaluation?.metrics?.balanced_accuracy)}</div>
                  <div><strong>Clases:</strong> {(activeJobClasses() || []).join(", ") || "-"}</div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setPendingConfirm(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button>
                  <button type="button" onClick={() => { setPendingConfirm(null); registerTrainingModel({ overrideArgmax: true }); }} disabled={actionLoading.registerTrainingModel} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    <LoadingText loading={actionLoading.registerTrainingModel} loadingText="Registrando...">Confirmar argmax</LoadingText>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
