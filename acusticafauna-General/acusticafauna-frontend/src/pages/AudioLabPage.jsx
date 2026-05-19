import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import {
  cancelAudioLabBatchProcessingJob,
  cancelAudioLabFolderBatchJob,
  createAudioLabAnnotation,
  createAudioLabActivityClips,
  createAudioLabBatchProcessingJob,
  createAudioLabClip,
  createAudioLabFolderBatchJob,
  createAudioLabQualityReport,
  debugResolveAudio,
  detectAudioLabActivity,
  fetchAudioLabBatchProcessingJob,
  fetchAudioLabBatchProcessingJobs,
  fetchAudioLabBatchProcessingLogs,
  fetchAudioLabFolderBatchJob,
  fetchAudioLabFolderBatchJobs,
  fetchAudioLabFolderBatchLogs,
  fetchAudioLabFolderBatchOutputs,
  fetchAudioLabFolderBatchSummary,
  fetchAudioLabClips,
  fetchAudioLabWaveform,
  fetchAudioLabAnnotations,
  fetchCuratedDatasetLabels,
  fetchCuratedSegments,
  fetchMlHealth,
  fetchMlModels,
  fetchMlSpectrogramBlob,
  getAudioLabClipAudioUrl,
  getAudioLabFolderBatchManifestUrl,
  getCuratedSegmentAudioUrl,
  getMediaFileUrl,
  getPlayableAudioUrl,
  pauseAudioLabFolderBatchJob,
  predictAudioPath,
  predictUploadedAudio,
  resumeAudioLabFolderBatchJob,
  retractAudioLabAnnotation,
  scanAudioLabFolderBatch,
  updateAudioLabAnnotation,
  uploadAudioLabBatch,
} from "../services/api";

const DEFAULT_GENERAL_MODEL_ID = "frog_detector_v1_binary_v3_hardneg";
const DEFAULT_POSITIVE_LABEL = "rana_sapo";
const BOANA_BOANS_PUGNAX_MODEL_ID = "boana_boans_pugnax_v3_quality045";
const ACTIVITY_DEFAULT_PARAMS = {
  method: "energy",
  threshold_db: -45,
  min_activity_seconds: 0.4,
  min_silence_seconds: 1.5,
  padding_seconds: 0.5,
  window_seconds: 0.05,
  hop_seconds: 0.025,
  frequency_min_hz: 300,
  frequency_max_hz: 8000,
  normalize: true,
  merge_gap_seconds: 1.0,
  max_segment_seconds: 10.0,
};
const ACTIVITY_PRESETS = {
  sensitive: { label: "Muy sensible", threshold_db: -55, min_activity_seconds: 0.25, min_silence_seconds: 1.0 },
  normal: { label: "Normal", threshold_db: -45, min_activity_seconds: 0.4, min_silence_seconds: 1.5 },
  conservative: { label: "Conservador", threshold_db: -35, min_activity_seconds: 0.7, min_silence_seconds: 2.0 },
};
const BATCH_PROCESSING_DEFAULT_STEPS = {
  clean_existing: {
    detect_activity: false,
    create_segments: false,
    discard_empty_segments: false,
    denoise: true,
    normalize: true,
    bandpass: true,
    run_frog_detector: false,
  },
  full_auto: {
    detect_activity: true,
    create_segments: true,
    discard_empty_segments: true,
    denoise: true,
    normalize: true,
    bandpass: true,
    run_frog_detector: true,
  },
};
const BATCH_PROCESSING_PRESETS = {
  conservador: { threshold_db: -38, prop_decrease: 0.55, detector_threshold: 0.35 },
  normal: { threshold_db: -45, prop_decrease: 0.8, detector_threshold: 0.3 },
  agresivo: { threshold_db: -52, prop_decrease: 0.95, detector_threshold: 0.25 },
  personalizado: {},
};
const FOLDER_BATCH_DEFAULT_FORM = {
  folder_path: "",
  recursive: true,
  target_label: "Boana_boans",
  job_name: "",
  preset: "normal",
  config_name: "safe_strict",
  calibration_mode: "safe",
  frequency_min_hz: 1800,
  frequency_max_hz: 3000,
  threshold_dbfs: -45,
  min_activity_seconds: 0.4,
  min_silence_seconds: 1.0,
  padding_seconds: 0.3,
  clip_duration_seconds: 5,
  max_segment_seconds: 10,
  min_band_ratio: 0.45,
  bandpass: true,
  noise_reduce: true,
  normalize: true,
  discard_empty: true,
  detect_frog: true,
  detect_contaminants_heuristic: true,
  create_clips: true,
  create_manifest: true,
  resource_profile: "auto",
};
const FOLDER_BATCH_SAFE_RECOMMENDED_CONFIG = {
  name: "safe_strict",
  preset: "normal",
  calibration_mode: "safe",
  frequency_min_hz: 1800,
  frequency_max_hz: 3000,
  threshold_dbfs: -45,
  min_band_ratio: 0.45,
  bandpass: true,
  noise_reduce: true,
  normalize: true,
  min_activity_seconds: 0.4,
  min_silence_seconds: 1.0,
  padding_seconds: 0.3,
  clip_duration_seconds: 5,
  max_segment_seconds: 10,
};
const FOLDER_BATCH_EXPLORATORY_WIDE_CONFIG = {
  name: "exploratory_wide",
  preset: "exploratory_wide",
  calibration_mode: "exploratory",
  frequency_min_hz: 1800,
  frequency_max_hz: 6000,
  threshold_dbfs: -55,
  min_band_ratio: 0.15,
  bandpass: true,
  noise_reduce: false,
  normalize: false,
  min_activity_seconds: 0.25,
  min_silence_seconds: 0.5,
  padding_seconds: 0.15,
  clip_duration_seconds: 5,
  max_segment_seconds: 10,
};
const FOLDER_BATCH_INTERMEDIATE_CONFIG = {
  name: "intermedia_exploratoria",
  preset: "intermedia_exploratoria",
  calibration_mode: "intermediate",
  frequency_min_hz: 2200,
  frequency_max_hz: 5500,
  threshold_dbfs: -53,
  min_band_ratio: 0.2,
  bandpass: true,
  noise_reduce: false,
  normalize: false,
  min_activity_seconds: 0.25,
  min_silence_seconds: 0.5,
  padding_seconds: 0.15,
  clip_duration_seconds: 5,
  max_segment_seconds: 10,
};
const FOLDER_BATCH_PRESETS = {
  conservador: { config_name: "safe_strict", calibration_mode: "safe", threshold_dbfs: -38, min_band_ratio: 0.6, min_activity_seconds: 0.6, noise_reduce: false },
  normal: FOLDER_BATCH_SAFE_RECOMMENDED_CONFIG,
  agresivo: { config_name: "recommended_sensitive", calibration_mode: "recommended", threshold_dbfs: -52, min_band_ratio: 0.3, min_activity_seconds: 0.25, noise_reduce: true },
  exploratory_wide: FOLDER_BATCH_EXPLORATORY_WIDE_CONFIG,
  intermedia_exploratoria: FOLDER_BATCH_INTERMEDIATE_CONFIG,
  personalizado: { config_name: "personalizado", calibration_mode: "recommended" },
};

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

function formatCheckTime(value) {
  return value ? new Date(value).toLocaleTimeString() : "sin verificar";
}

function getModelId(model) {
  return model?.model_id || model?.id || "";
}

function isSpecializedModel(model) {
  return model?.model_type === "specialized_species_classifier";
}

function isGeneralDetector(model) {
  return model?.model_type === "binary_presence_detector" || model?.target_mode === "binary_presence";
}

function isRecommendedModel(model) {
  return model?.registry_status === "active" || model?.is_default_for_task;
}

function isExperimentalModel(model) {
  return model?.registry_status === "experimental";
}

function modelDisplayName(model) {
  return model?.name || getModelId(model) || "Modelo ML";
}

function describeDecisionRule(rule) {
  if (!rule) return "Sin regla calibrada";
  if (typeof rule === "string") return rule;
  const scoreColumn = rule.score_column || "score";
  const threshold = rule.threshold ?? rule.value;
  const positive = rule.if_score_gte_threshold || rule.gte_label || rule.positive_label;
  const negative = rule.else || rule.lt_label || rule.negative_label;
  if (threshold !== undefined && positive && negative) {
    return `${scoreColumn} >= ${threshold} => ${positive}; si no => ${negative}`;
  }
  return JSON.stringify(rule);
}

function segmentScoreForLabel(segment, label) {
  return segment?.[`score_${label}`];
}

function primarySegmentScore(segment, model) {
  if (!segment) return undefined;
  if (isSpecializedModel(model)) {
    const predictedScore = segmentScoreForLabel(segment, segment.predicted_label);
    return predictedScore ?? segment.decision_rule_score ?? segment.confidence;
  }
  const positiveLabel = model?.positive_label || DEFAULT_POSITIVE_LABEL;
  return segmentScoreForLabel(segment, positiveLabel) ?? segment.confidence;
}

function ruleScoreForSegment(segment, model) {
  if (!segment) return undefined;
  if (getModelId(model) === BOANA_BOANS_PUGNAX_MODEL_ID) {
    return segment.score_Boana_pugnax;
  }
  return segment.decision_rule_score ?? primarySegmentScore(segment, model);
}

function operationalConfidenceLabel(segment, model) {
  if (!segment) return "-";
  if (getModelId(model) === BOANA_BOANS_PUGNAX_MODEL_ID) {
    const score = Number(segment.score_Boana_pugnax);
    const threshold = Number(model?.threshold ?? 0.03);
    if (Number.isNaN(score)) return "-";
    if (score >= threshold && score < 0.05) return "Boana_pugnax - baja confianza, revisar";
    if (score >= 0.05) return "Boana_pugnax";
    return "Boana_boans";
  }
  return segment.predicted_label || "-";
}

function didRuleChangeArgmax(segment) {
  return Boolean(
    segment?.predicted_label &&
      segment?.raw_argmax_label &&
      segment.predicted_label !== segment.raw_argmax_label
  );
}

function makeAnalysisId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getAudioName(audioPath, fallback = "Audio") {
  const raw = audioPath || fallback || "Audio";
  const name = String(raw).split(/[\\/]/).pop();
  return name || fallback || "Audio";
}

function getAudioStem(audioPath, fallback = "Audio") {
  return getAudioName(audioPath, fallback).replace(/\.[^.]+$/, "");
}

function safeNamePart(value, fallback = "audio") {
  const cleaned = String(value || fallback)
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function isGenericClipPart(value) {
  const normalized = safeNamePart(value, "").toLowerCase();
  return !normalized || ["audio", "clip", "segmento", "sin_label", "unknown"].includes(normalized);
}

function limitNameStem(value, maxLength = 120) {
  if (value.length <= maxLength) return value;
  const match = value.match(/seg\d+/i);
  if (match) return match[0];
  return value.slice(0, maxLength).replace(/[._-]+$/g, "");
}

function shortPath(value, maxLength = 86) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  const tail = text.slice(-(maxLength - 4));
  return `...${tail}`;
}

function traceDisplayName(trace) {
  return trace?.display_name || trace?.display_label || trace?.source_audio_name || trace?.processed_audio_name || getAudioName(trace?.processed_audio_path || trace?.source_audio_path || trace?.audio_path);
}

function traceSubLabel(trace) {
  const kind = trace?.processed_audio_path ? "procesado" : "original";
  const job = trace?.batch_job_name || trace?.batch_job_id;
  const parts = [kind];
  if (job) parts.push(`job ${String(job).slice(0, 12)}`);
  if (trace?.processing_preset || trace?.processing_method) parts.push([trace.processing_preset, trace.processing_method].filter(Boolean).join(" · "));
  return parts.filter(Boolean).join(" · ");
}

function AudioTraceInfo({ trace, compact = false }) {
  if (!trace) return null;
  const name = traceDisplayName(trace);
  const sourcePath = trace.source_audio_path || trace.audio_path;
  const processedPath = trace.processed_audio_path;
  const segmentText =
    trace.segment_start_seconds !== null && trace.segment_start_seconds !== undefined
      ? `${formatTime(trace.segment_start_seconds)} - ${formatTime(trace.segment_end_seconds)}`
      : "audio completo";
  return (
    <details className="group max-w-full">
      <summary className="cursor-pointer list-none">
        <div className="max-w-64 truncate font-semibold" title={name}>{name}</div>
        <div className="max-w-64 truncate text-xs text-slate-500">{traceSubLabel(trace)}</div>
      </summary>
      <div className={`mt-2 grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 ${compact ? "max-w-72" : ""}`}>
        <div><strong>Segmento:</strong> {segmentText}</div>
        {trace.batch_job_name || trace.batch_job_id ? <div><strong>Job:</strong> {trace.batch_job_name || trace.batch_job_id}</div> : null}
        {sourcePath ? <div className="truncate" title={sourcePath}><strong>Original:</strong> {sourcePath}</div> : null}
        {processedPath ? <div className="truncate" title={processedPath}><strong>Procesado:</strong> {processedPath}</div> : null}
      </div>
    </details>
  );
}

function buildSuggestedClipName({ audioPath, normalizedLabel, predictedLabel, visibleLabel }, selection) {
  const stem = safeNamePart(getAudioStem(audioPath, visibleLabel || "audio"), "audio");
  const labelCandidate = [normalizedLabel, predictedLabel, visibleLabel, stem].find((item) => !isGenericClipPart(item));
  const labelPart = safeNamePart(labelCandidate || stem, stem);
  const clipPart = `clip_${clipBoundary(selection.start)}_${clipBoundary(selection.end)}`;
  const stemPart = limitNameStem(stem, 80);
  const parts = [];
  if (!isGenericClipPart(labelPart)) parts.push(labelPart);
  if (stemPart && stemPart.toLowerCase() !== labelPart.toLowerCase()) parts.push(stemPart);
  if (!parts.length) parts.push(stemPart || labelPart || "audio");
  let base = [...parts, clipPart].join("__");
  if (base.length > 120) {
    const prefixBudget = Math.max(24, 120 - clipPart.length - 2);
    const shortStem = limitNameStem(stem, prefixBudget);
    const compactParts =
      shortStem && shortStem.toLowerCase() !== labelPart.toLowerCase()
        ? [labelPart, shortStem, clipPart]
        : [labelPart || shortStem || "audio", clipPart];
    base = compactParts.join("__");
  }
  if (base.length > 120) base = `${base.slice(0, 120 - clipPart.length - 2).replace(/[._-]+$/g, "")}__${clipPart}`;
  return `${base}.wav`;
}

function clipBoundary(value) {
  return Number(value || 0).toFixed(1);
}

function clipIsPlayable(clip) {
  return Boolean(
    clip?.output_audio_path &&
      Number(clip?.duration_seconds) > 0 &&
      clip?.file_exists !== false &&
      clip?.wav_exists !== false
  );
}

function sameAudioPath(left, right) {
  if (!left || !right) return false;
  return String(left).replaceAll("\\", "/").toLowerCase() === String(right).replaceAll("\\", "/").toLowerCase();
}

function normalizeAudioPathKey(value) {
  return String(value || "").replaceAll("\\", "/").toLowerCase();
}

function hasAudioFileExtension(value) {
  return /\.(wav|flac|mp3|ogg|m4a)$/i.test(String(value || "").trim());
}

function parentFolderFromPath(value) {
  const raw = String(value || "").trim();
  const index = Math.max(raw.lastIndexOf("\\"), raw.lastIndexOf("/"));
  return index > 0 ? raw.slice(0, index) : "";
}

function isInternalUploadPath(value) {
  return normalizeAudioPathKey(value).includes("/storage/audio_lab/uploads/");
}

function audioOriginLabel(kind) {
  const labels = {
    curated: "dataset",
    manual: "ruta local",
    upload: "upload temporal",
    upload_batch: "upload temporal",
    clip: "clip derivado",
    batch_output: "output procesado",
    folder_batch_output: "output procesado",
  };
  return labels[kind] || kind || "desconocido";
}

function batchAuthorizationStatus(item) {
  if (isInternalUploadPath(item.output_path)) return "copia interna autorizada";
  if (["dataset", "clip derivado", "output procesado", "upload temporal"].includes(item.source_kind)) return "autorizado por backend";
  return "requiere ruta permitida o autorizacion por job";
}

function normalizeAnalysisResult(result, context) {
  const analysisId = makeAnalysisId();
  const audioPath = result.audio_path || result.uploaded_temp_file || context.audioPath || "";
  const audioName = context.audioName || getAudioName(audioPath);
  const threshold = result.threshold ?? context.threshold;
  const modelId = result.model_id || context.modelId;
  const sourceRowId = context.sourceRowId || "";
  const trace = context.trace || {};
  const segments = (result.segments || []).map((segment, index) => {
    const enriched = {
      ...segment,
      analysis_id: analysisId,
      result_row_id: `${analysisId}:${index}`,
      audio_path: segment.audio_path || audioPath,
      audio_name: segment.audio_name || trace.display_name || audioName,
      display_name: segment.display_name || trace.display_name || audioName,
      display_label: segment.display_label || trace.display_label || trace.display_name || audioName,
      source_audio_name: segment.source_audio_name || trace.source_audio_name || null,
      processed_audio_name: segment.processed_audio_name || trace.processed_audio_name || null,
      source_audio_path: segment.source_audio_path || trace.source_audio_path || null,
      processed_audio_path: segment.processed_audio_path || trace.processed_audio_path || null,
      batch_job_id: segment.batch_job_id || trace.batch_job_id || null,
      batch_job_name: segment.batch_job_name || trace.batch_job_name || null,
      batch_output_id: segment.batch_output_id || trace.batch_output_id || null,
      processing_metadata_path: segment.processing_metadata_path || trace.processing_metadata_path || null,
      segment_label: segment.segment_label || trace.segment_label || null,
      processing_method: segment.processing_method || trace.processing_method || null,
      processing_preset: segment.processing_preset || trace.processing_preset || null,
      source_row_id: segment.source_row_id || sourceRowId,
      model_id: segment.model_id || modelId,
      threshold,
      raw_argmax_label: segment.raw_argmax_label || "",
      decision_rule_applied: Boolean(segment.decision_rule_applied ?? result.decision_rule_applied),
    };
    return {
      ...enriched,
      score_used: segment.score_used ?? ruleScoreForSegment(enriched, context.model),
    };
  });
  return {
    ...result,
    analysis_id: analysisId,
    audio_path: audioPath,
    audio_name: trace.display_name || audioName,
    display_name: trace.display_name || audioName,
    display_label: trace.display_label || trace.display_name || audioName,
    source_audio_name: trace.source_audio_name || null,
    processed_audio_name: trace.processed_audio_name || null,
    source_audio_path: trace.source_audio_path || null,
    processed_audio_path: trace.processed_audio_path || null,
    batch_job_id: trace.batch_job_id || null,
    batch_job_name: trace.batch_job_name || null,
    batch_output_id: trace.batch_output_id || null,
    processing_metadata_path: trace.processing_metadata_path || null,
    source_row_id: sourceRowId,
    model_id: modelId,
    threshold,
    analyzed_at: new Date().toISOString(),
    segments,
  };
}

function formatTime(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function formatNumber(value, digits = 3) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function qualityLabelText(label) {
  const mapping = {
    bueno_para_revision: "Bueno para revision",
    mejora_ligera: "Mejora ligera",
    procesado_puede_empeorar: "Posible dano",
    posible_dano: "Posible dano",
  };
  return mapping[label] || "Revisar manualmente";
}

function qualityTone(severity) {
  if (severity === "ok") return "success";
  if (severity === "danger") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

function firstAnalysisSegment(analysis) {
  return analysis?.segments?.[0] || null;
}

function summarizeBatchResult(item, model) {
  if (item.error) {
    return { predictedLabel: "-", score: undefined, threshold: undefined, statusLabel: "error", segment: null };
  }
  const analysis = item.analysis;
  const segment = firstAnalysisSegment(analysis);
  const threshold = analysis?.threshold ?? model?.threshold;
  if (isGeneralDetector(model)) {
    const positiveLabel = model?.positive_label || DEFAULT_POSITIVE_LABEL;
    const detected = Boolean(analysis?.summary?.detected ?? segment?.detected);
    const score = analysis?.summary?.max_score_rana_sapo ?? segment?.[`score_${positiveLabel}`] ?? segment?.confidence;
    return {
      predictedLabel: detected ? positiveLabel : `no_${positiveLabel}`,
      score,
      threshold,
      statusLabel: detected ? "detectado" : "no detectado",
      segment,
    };
  }
  const score = segment ? ruleScoreForSegment(segment, model) : analysis?.summary?.max_confidence;
  const operational = segment ? operationalConfidenceLabel(segment, model) : analysis?.summary?.top_label;
  return {
    predictedLabel: operational || segment?.predicted_label || "-",
    score,
    threshold,
    statusLabel: String(operational || "").includes("revisar") ? "revisar" : "detectado",
    segment,
  };
}

function feedbackLabel(type) {
  const labels = {
    confirmed_positive: "Confirmar deteccion",
    false_positive: "Falso positivo",
    false_negative: "Falso negativo",
    uncertain: "Enviar a revisar",
    hard_negative: "Hard negative",
    excluded_from_training: "Excluir de entrenamiento",
  };
  return labels[type] || type;
}

function WaveformCanvas({
  audioUrl,
  audioPath,
  duration,
  currentTime,
  selection,
  detections,
  activitySegments = [],
  threshold,
  zoom,
  onSelectionChange,
  onSeek,
  onDetectionClick,
  onActivitySegmentClick,
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [peaks, setPeaks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dragRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function loadWaveform() {
      if (!audioUrl) {
        setPeaks([]);
        return;
      }
      try {
        setLoading(true);
        setError("");
        let nextPeaks = [];
        try {
          const response = await fetch(audioUrl);
          const buffer = await response.arrayBuffer();
          const context = new AudioContext();
          const audioBuffer = await context.decodeAudioData(buffer.slice(0));
          const channel = audioBuffer.getChannelData(0);
          const bucketCount = 1400;
          const blockSize = Math.max(1, Math.floor(channel.length / bucketCount));
          for (let i = 0; i < bucketCount; i += 1) {
            let min = 1;
            let max = -1;
            const start = i * blockSize;
            const end = Math.min(channel.length, start + blockSize);
            for (let j = start; j < end; j += 1) {
              const sample = channel[j];
              if (sample < min) min = sample;
              if (sample > max) max = sample;
            }
            nextPeaks.push({ min, max });
          }
          await context.close();
        } catch {
          if (!audioPath) throw new Error("browser_decode_failed");
          const serverWaveform = await fetchAudioLabWaveform(audioPath, 1400);
          nextPeaks = serverWaveform.peaks || [];
        }
        if (!cancelled) setPeaks(nextPeaks);
      } catch (err) {
        if (!cancelled) {
          setPeaks([]);
          setError("No fue posible dibujar la waveform. La reproduccion, espectrograma y analisis siguen disponibles.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadWaveform();
    return () => {
      cancelled = true;
    };
  }, [audioUrl, audioPath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(900, Math.floor(1100 * zoom));
    const height = 220;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    detections
      .filter((segment) => segment.detected || Number(segment.score_rana_sapo) >= Number(threshold))
      .forEach((segment) => {
        const x = (segment.start_seconds / Math.max(duration, 1)) * width;
        const w = ((segment.end_seconds - segment.start_seconds) / Math.max(duration, 1)) * width;
        ctx.fillStyle = "rgba(16, 185, 129, 0.24)";
        ctx.fillRect(x, 0, Math.max(2, w), height);
      });

    activitySegments.forEach((segment) => {
      const x = (segment.start_seconds / Math.max(duration, 1)) * width;
      const w = ((segment.end_seconds - segment.start_seconds) / Math.max(duration, 1)) * width;
      ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
      ctx.fillRect(x, 0, Math.max(2, w), height);
      ctx.strokeStyle = "rgba(217, 119, 6, 0.78)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, 1, Math.max(2, w), height - 2);
    });

    if (selection?.start !== undefined && selection?.end !== undefined) {
      const start = Math.min(selection.start, selection.end);
      const end = Math.max(selection.start, selection.end);
      const x = (start / Math.max(duration, 1)) * width;
      const w = ((end - start) / Math.max(duration, 1)) * width;
      ctx.fillStyle = "rgba(59, 130, 246, 0.22)";
      ctx.fillRect(x, 0, Math.max(2, w), height);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, 1, Math.max(2, w), height - 2);
    }

    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const center = height / 2;
    if (peaks.length) {
      peaks.forEach((peak, index) => {
        const x = (index / Math.max(peaks.length - 1, 1)) * width;
        ctx.moveTo(x, center + peak.min * center * 0.86);
        ctx.lineTo(x, center + peak.max * center * 0.86);
      });
    } else {
      ctx.moveTo(0, center);
      ctx.lineTo(width, center);
    }
    ctx.stroke();

    const playX = (currentTime / Math.max(duration, 1)) * width;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
  }, [peaks, duration, currentTime, selection, detections, activitySegments, threshold, zoom]);

  function eventToSeconds(event) {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }

  function handlePointerDown(event) {
    if (!duration) return;
    const start = eventToSeconds(event);
    dragRef.current = start;
    onSelectionChange({ start, end: start });
  }

  function handlePointerMove(event) {
    if (dragRef.current === null) return;
    const end = eventToSeconds(event);
    onSelectionChange({ start: dragRef.current, end });
  }

  function finishDrag(event) {
    if (dragRef.current === null) return;
    const end = eventToSeconds(event);
    const start = dragRef.current;
    dragRef.current = null;
    if (Math.abs(end - start) < 0.15) {
      onSeek(end);
      onSelectionChange(null);
    } else {
      onSelectionChange({ start: Math.min(start, end), end: Math.max(start, end) });
    }
  }

  function handleDoubleClick(event) {
    const seconds = eventToSeconds(event);
    const activityHit = activitySegments.find(
      (segment) => seconds >= segment.start_seconds && seconds <= segment.end_seconds
    );
    if (activityHit && onActivitySegmentClick) {
      onActivitySegmentClick(activityHit);
      return;
    }
    const hit = detections.find(
      (segment) => seconds >= segment.start_seconds && seconds <= segment.end_seconds
    );
    if (hit) onDetectionClick(hit);
  }

  function handleClick(event) {
    const seconds = eventToSeconds(event);
    const activityHit = activitySegments.find(
      (segment) => seconds >= segment.start_seconds && seconds <= segment.end_seconds
    );
    if (activityHit && onActivitySegmentClick) onActivitySegmentClick(activityHit);
  }

  return (
    <div>
      <div ref={wrapperRef} className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <canvas
          ref={canvasRef}
          className="block cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerLeave={finishDrag}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span>{loading ? "Dibujando waveform..." : "Arrastra sobre la forma de onda para seleccionar un tramo."}</span>
        <span>Click en actividad detectada para seleccionarla; doble clic en una deteccion ML para reproducir.</span>
      </div>
      {error ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}
    </div>
  );
}

export default function AudioLabPage() {
  const audioRef = useRef(null);
  const uploadInputRef = useRef(null);
  const [labels, setLabels] = useState([]);
  const [segments, setSegments] = useState({ items: [], total: 0 });
  const [labelFilter, setLabelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [manualPath, setManualPath] = useState("");
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [mlStatus, setMlStatus] = useState({ connected: false, state: "loading", message: "Verificando servicio ML...", checkedAt: null, stale: false });
  const [models, setModels] = useState([]);
  const [showExperimentalModels, setShowExperimentalModels] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_GENERAL_MODEL_ID);
  const [selectedBatchModelId, setSelectedBatchModelId] = useState(DEFAULT_GENERAL_MODEL_ID);
  const [threshold, setThreshold] = useState(0.3);
  const [clipDuration, setClipDuration] = useState(5);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopSelection, setLoopSelection] = useState(false);
  const [selection, setSelection] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [prediction, setPrediction] = useState(null);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [spectrogramUrl, setSpectrogramUrl] = useState("");
  const [spectrogramLoading, setSpectrogramLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [annotations, setAnnotations] = useState([]);
  const [notes, setNotes] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState(null);
  const [actionRow, setActionRow] = useState(null);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [batchPaths, setBatchPaths] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState([]);
  const [clipDraft, setClipDraft] = useState(null);
  const [clipHistory, setClipHistory] = useState([]);
  const [lastClip, setLastClip] = useState(null);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [clipSaving, setClipSaving] = useState(false);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [activityAdvancedOpen, setActivityAdvancedOpen] = useState(false);
  const [activityPreset, setActivityPreset] = useState("normal");
  const [activityParams, setActivityParams] = useState(ACTIVITY_DEFAULT_PARAMS);
  const [activityRunning, setActivityRunning] = useState(false);
  const [activityRun, setActivityRun] = useState(null);
  const [selectedActivityIds, setSelectedActivityIds] = useState([]);
  const [activityClipPurpose, setActivityClipPurpose] = useState("revision");
  const [activityClipPrefix, setActivityClipPrefix] = useState("");
  const [activityClipSaving, setActivityClipSaving] = useState(false);
  const [lastActivityClipBatch, setLastActivityClipBatch] = useState(null);
  const [batchActivityRunning, setBatchActivityRunning] = useState(false);
  const [batchActivityProgress, setBatchActivityProgress] = useState({ current: 0, total: 0 });
  const [batchActivityResults, setBatchActivityResults] = useState([]);
  const [batchProcessingMode, setBatchProcessingMode] = useState("clean_existing");
  const [batchProcessingPreset, setBatchProcessingPreset] = useState("normal");
  const [batchProcessingSteps, setBatchProcessingSteps] = useState(BATCH_PROCESSING_DEFAULT_STEPS.clean_existing);
  const [batchProcessingAdvancedOpen, setBatchProcessingAdvancedOpen] = useState(false);
  const [batchProcessingJobName, setBatchProcessingJobName] = useState("");
  const [batchProcessingParams, setBatchProcessingParams] = useState({
    threshold_db: -45,
    min_activity_seconds: 0.4,
    min_silence_seconds: 1.5,
    padding_seconds: 0.5,
    frequency_min_hz: 300,
    frequency_max_hz: 8000,
    prop_decrease: 0.8,
    detector_threshold: 0.3,
    clip_duration: 5,
  });
  const [batchProcessingJobs, setBatchProcessingJobs] = useState([]);
  const [activeBatchProcessingJob, setActiveBatchProcessingJob] = useState(null);
  const [batchProcessingLogs, setBatchProcessingLogs] = useState("");
  const [batchProcessingSubmitting, setBatchProcessingSubmitting] = useState(false);
  const [batchProcessingQueue, setBatchProcessingQueue] = useState([]);
  const [batchProcessingHelp, setBatchProcessingHelp] = useState("");
  const [batchProcessingJobAllowedRoots, setBatchProcessingJobAllowedRoots] = useState([]);
  const [batchJobSearch, setBatchJobSearch] = useState("");
  const [batchJobStatusFilter, setBatchJobStatusFilter] = useState("");
  const [batchJobModeFilter, setBatchJobModeFilter] = useState("");
  const [batchJobDateFilter, setBatchJobDateFilter] = useState("");
  const [batchJobFlagFilter, setBatchJobFlagFilter] = useState("");
  const [folderBatchForm, setFolderBatchForm] = useState(FOLDER_BATCH_DEFAULT_FORM);
  const [folderBatchScan, setFolderBatchScan] = useState(null);
  const [folderBatchJobs, setFolderBatchJobs] = useState([]);
  const [activeFolderBatchJob, setActiveFolderBatchJob] = useState(null);
  const [folderBatchLogs, setFolderBatchLogs] = useState("");
  const [folderBatchOutputs, setFolderBatchOutputs] = useState([]);
  const [folderBatchSummary, setFolderBatchSummary] = useState(null);
  const [folderBatchScanning, setFolderBatchScanning] = useState(false);
  const [folderBatchSubmitting, setFolderBatchSubmitting] = useState(false);
  const [folderBatchSearch, setFolderBatchSearch] = useState("");
  const [folderBatchStatusFilter, setFolderBatchStatusFilter] = useState("");
  const [folderBatchOutputFilter, setFolderBatchOutputFilter] = useState("candidates");
  const [folderBatchMinScore, setFolderBatchMinScore] = useState("");
  const [folderBatchMinRatio, setFolderBatchMinRatio] = useState("");
  const [qualityReport, setQualityReport] = useState(null);
  const [qualityReportLoading, setQualityReportLoading] = useState("");
  const [batchOutputDetails, setBatchOutputDetails] = useState(null);
  const [autoIdentifyRunning, setAutoIdentifyRunning] = useState(false);
  const [autoIdentifyResult, setAutoIdentifyResult] = useState(null);
  const [autoIdentifyExperimental, setAutoIdentifyExperimental] = useState(false);
  const [batchAutoIdentifyRunning, setBatchAutoIdentifyRunning] = useState(false);
  const [batchAutoIdentifyResults, setBatchAutoIdentifyResults] = useState([]);

  const folderBatchIsExploratory = folderBatchConfigIsExploratory(folderBatchForm);
  const folderBatchCurrentRecommendation = folderBatchRecommendationFor(folderBatchForm);
  const folderBatchCandidateCount = Number(activeFolderBatchJob?.candidates_count || folderBatchSummary?.summary?.candidates || 0);
  const folderBatchTooManyCandidates = folderBatchIsExploratory || folderBatchCurrentRecommendation === "too_many_candidates";
  const folderBatchHasSafeRecommendation = !folderBatchTooManyCandidates;
  const folderBatchBestNextStep = folderBatchIsExploratory && folderBatchCandidateCount > 0 ? "try_intermediate_config" : null;
  const folderBatchComparisonRows = [
    {
      ...FOLDER_BATCH_SAFE_RECOMMENDED_CONFIG,
      label: "Segura estricta",
      badge: "Segura",
      tone: "success",
      recommendationText: "Apta para procesar carpeta cuando la muestra revisada es consistente.",
    },
    {
      ...FOLDER_BATCH_INTERMEDIATE_CONFIG,
      label: "Intermedia exploratoria",
      badge: "Intermedia",
      tone: "info",
      recommendationText: "Siguiente paso si la amplia encuentra actividad pero abre demasiado el filtro.",
    },
    {
      ...FOLDER_BATCH_EXPLORATORY_WIDE_CONFIG,
      label: "Exploratoria amplia",
      badge: "Exploratoria",
      tone: "warning",
      recommendationText: "Demasiado amplia; puede incluir lluvia/viento/ruido.",
    },
  ];

  const labelOptions = useMemo(() => labels.map((item) => item.label).filter(Boolean), [labels]);
  const selectableModels = useMemo(() => {
    const visible = models.filter((model) => {
      if (model.registry_status === "archived" || model.registry_status === "rejected") return false;
      if (isExperimentalModel(model) && !showExperimentalModels) return false;
      return true;
    });
    return visible.sort((a, b) => Number(Boolean(b.is_default_for_task)) - Number(Boolean(a.is_default_for_task)));
  }, [models, showExperimentalModels]);
  const generalModels = useMemo(() => selectableModels.filter(isGeneralDetector), [selectableModels]);
  const specializedModels = useMemo(() => selectableModels.filter(isSpecializedModel), [selectableModels]);
  const selectedModel = useMemo(
    () =>
      models.find((item) => getModelId(item) === selectedModelId) ||
      generalModels.find(isRecommendedModel) ||
      generalModels[0] ||
      models[0] ||
      null,
    [generalModels, models, selectedModelId]
  );
  const selectedModelIsSpecialized = isSpecializedModel(selectedModel);
  const selectedModelClasses = selectedModel?.classes || [];
  const selectedPositiveLabel = selectedModel?.positive_label || DEFAULT_POSITIVE_LABEL;
  const selectedBatchModel = useMemo(
    () =>
      models.find((item) => getModelId(item) === selectedBatchModelId) ||
      selectableModels.find((item) => getModelId(item) === DEFAULT_GENERAL_MODEL_ID) ||
      generalModels.find(isRecommendedModel) ||
      generalModels[0] ||
      models[0] ||
      null,
    [generalModels, models, selectableModels, selectedBatchModelId]
  );
  const selectedBatchModelIsSpecialized = isSpecializedModel(selectedBatchModel);
  const activeRows = useMemo(() => prediction?.segments || [], [prediction]);
  const activeAudioPaths = useMemo(
    () => Array.from(new Set(activeRows.map((row) => row.audio_path).filter(Boolean))),
    [activeRows]
  );
  const hasMixedActiveResults = activeAudioPaths.length > 1;
  const activeTableRows = hasMixedActiveResults ? [] : activeRows;
  const detectionSegments = activeTableRows;
  const activitySegments = useMemo(() => activityRun?.segments || [], [activityRun]);
  const selectedActivitySegments = useMemo(
    () => activitySegments.filter((segment) => selectedActivityIds.includes(segment.id)),
    [activitySegments, selectedActivityIds]
  );
  const selectedRange = selection
    ? {
        start: Math.min(selection.start, selection.end),
        end: Math.max(selection.start, selection.end),
      }
    : null;
  const annotationsByRange = useMemo(() => {
    const map = new Map();
    annotations.forEach((item) => {
      const key = `${item.model_id || ""}:${Number(item.segment_start_seconds ?? item.start_seconds ?? 0).toFixed(2)}-${Number(item.segment_end_seconds ?? item.end_seconds ?? 0).toFixed(2)}`;
      map.set(key, item);
    });
    return map;
  }, [annotations]);
  const batchFrogSummary = useMemo(() => {
    if (!isGeneralDetector(selectedBatchModel)) return null;
    const okItems = batchResults.filter((item) => item.analysis && !item.error);
    const scores = okItems
      .map((item) => summarizeBatchResult(item, selectedBatchModel).score)
      .filter((value) => value !== undefined && value !== null && !Number.isNaN(Number(value)))
      .map(Number);
    const detected = okItems.filter((item) => summarizeBatchResult(item, selectedBatchModel).statusLabel === "detectado").length;
    return {
      total: batchResults.length,
      detected,
      notDetected: okItems.length - detected,
      errors: batchResults.filter((item) => item.error).length,
      averageScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : undefined,
    };
  }, [batchResults, selectedBatchModel]);

  const filteredSegments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return segments.items;
    return segments.items.filter((item) =>
      `${item.label || ""} ${item.output_path || ""} ${item.segment_id || ""}`.toLowerCase().includes(term)
    );
  }, [segments.items, search]);

  useEffect(() => {
    loadAudioChoices();
    checkMlService();
    loadClipHistory();
    loadBatchProcessingJobs();
    loadFolderBatchJobs();
    return () => {
      if (selectedAudio?.objectUrl) URL.revokeObjectURL(selectedAudio.objectUrl);
      if (spectrogramUrl) URL.revokeObjectURL(spectrogramUrl);
    };
  }, []);

  useEffect(() => {
    loadAudioChoices();
  }, [labelFilter, statusFilter]);

  useEffect(() => {
    if (selectedModel?.threshold !== undefined && selectedModel?.threshold !== null) {
      setThreshold(Number(selectedModel.threshold));
    }
  }, [selectedModelId, selectedModel?.threshold]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = playbackRate;
  }, [volume, playbackRate, selectedAudio]);

  useEffect(() => {
    if (!selectedAudio?.audioPath) {
      setAnnotations([]);
      return;
    }
    fetchAudioLabAnnotations(selectedAudio.audioPath)
      .then((data) => setAnnotations(data.items || []))
      .catch(() => setAnnotations([]));
  }, [selectedAudio?.audioPath]);

  useEffect(() => {
    if (!activeBatchProcessingJob?.id || !["queued", "running"].includes(activeBatchProcessingJob.status)) return undefined;
    const timer = window.setInterval(() => {
      refreshBatchProcessingJob(activeBatchProcessingJob.id);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeBatchProcessingJob?.id, activeBatchProcessingJob?.status]);

  useEffect(() => {
    if (!activeFolderBatchJob?.id || !["pending", "running", "paused"].includes(activeFolderBatchJob.status)) return undefined;
    const timer = window.setInterval(() => {
      refreshFolderBatchJob(activeFolderBatchJob.id, { quiet: true });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeFolderBatchJob?.id, activeFolderBatchJob?.status]);

  async function loadAudioChoices() {
    try {
      const filters = { label: labelFilter, limit: 80 };
      if (statusFilter === "revisar") {
        filters.pending_real = "true";
      } else if (statusFilter === "ruido") {
        filters.group_type = "otros_ruidos";
      } else if (statusFilter === "gold") {
        filters.review_status = "accepted";
      } else if (statusFilter === "candidato") {
        filters.group_type = "positivo";
      }
      const [labelsData, segmentsData] = await Promise.all([
        fetchCuratedDatasetLabels(),
        fetchCuratedSegments(filters),
      ]);
      setLabels(labelsData);
      setSegments(segmentsData);
    } catch (err) {
      setError(err.message || "No fue posible cargar audios del Dataset Curado.");
    }
  }

  async function loadClipHistory() {
    try {
      const data = await fetchAudioLabClips();
      setClipHistory(data.items || []);
    } catch {
      setClipHistory([]);
    }
  }

  async function loadBatchProcessingJobs() {
    try {
      const data = await fetchAudioLabBatchProcessingJobs();
      setBatchProcessingJobs(data.items || []);
    } catch {
      setBatchProcessingJobs([]);
    }
  }

  async function loadFolderBatchJobs() {
    try {
      const data = await fetchAudioLabFolderBatchJobs();
      setFolderBatchJobs(data.items || []);
    } catch {
      setFolderBatchJobs([]);
    }
  }

  async function checkMlService() {
    try {
      setMlStatus((current) => ({ ...current, connected: false, state: "loading", message: "Consultando ML API...", stale: Boolean(current.checkedAt) }));
      const [health, modelData] = await Promise.all([fetchMlHealth(), fetchMlModels()]);
      const availableModels = modelData.items || [];
      const requestedModelId = new URLSearchParams(window.location.search).get("model_id");
      const requestedModel = availableModels.find((item) => getModelId(item) === requestedModelId);
      if (requestedModel && isExperimentalModel(requestedModel)) {
        setShowExperimentalModels(true);
      }
      setModels(availableModels);
      setSelectedModelId((current) => {
        if (requestedModel) return getModelId(requestedModel);
        if (availableModels.some((item) => getModelId(item) === current)) return current;
        const defaultGeneral = availableModels.find((item) => item.task === "frog_detector" && item.is_default_for_task) || availableModels.find(isGeneralDetector);
        return getModelId(defaultGeneral || availableModels[0]) || DEFAULT_GENERAL_MODEL_ID;
      });
      setSelectedBatchModelId((current) => {
        if (requestedModel) return getModelId(requestedModel);
        if (availableModels.some((item) => getModelId(item) === current)) return current;
        const defaultGeneral = availableModels.find((item) => item.task === "frog_detector" && item.is_default_for_task) || availableModels.find((item) => getModelId(item) === DEFAULT_GENERAL_MODEL_ID) || availableModels.find(isGeneralDetector);
        return getModelId(defaultGeneral || availableModels[0]) || DEFAULT_GENERAL_MODEL_ID;
      });
      setMlStatus({
        connected: true,
        state: "connected",
        checkedAt: new Date().toISOString(),
        stale: false,
        message: `${health.service || "ML API"} conectada. ${health.models_available ?? availableModels.length} modelo(s) disponibles.`,
      });
    } catch (err) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      if (!models.length) setModels([]);
      setMlStatus({
        connected: false,
        state: "disconnected",
        checkedAt: new Date().toISOString(),
        stale: Boolean(models.length),
        message: "No se pudo conectar con ML API en http://127.0.0.1:8010. Revisa que acusticafauna-ML este corriendo.",
      });
    }
  }

  function resetAnalysisState() {
    audioRef.current?.pause();
    setPrediction(null);
    setSelection(null);
    setCurrentTime(0);
    setDuration(0);
    setMessage("");
    setError("");
    setFeedbackDraft(null);
    setActivityRun(null);
    setSelectedActivityIds([]);
    setLastActivityClipBatch(null);
    if (spectrogramUrl) URL.revokeObjectURL(spectrogramUrl);
    setSpectrogramUrl("");
  }

  function openCuratedAudio(segment) {
    resetAnalysisState();
    setUploadedFile(null);
    setSelectedAudio({
      kind: "curated",
      title: segment.label || segment.segment_id,
      audioPath: segment.output_path,
      audioUrl: getCuratedSegmentAudioUrl(segment.id),
      originalAudioPath: segment.source_path || segment.output_path,
      processingPath: segment.output_path,
      originLabel: "dataset",
      isValid: true,
      segment,
    });
  }

  function toggleBatchSegment(segmentId) {
    setSelectedBatchIds((current) =>
      current.includes(segmentId)
        ? current.filter((id) => id !== segmentId)
        : [...current, segmentId]
    );
  }

  function openManualPath() {
    const path = manualPath.trim();
    if (!path) return;
    if (!hasAudioFileExtension(path)) {
      setFolderBatchForm((current) => ({ ...current, folder_path: path }));
      setMessage("Esta ruta parece una carpeta. Para procesar carpetas grandes usa Procesamiento masivo por carpeta local.");
      return;
    }
    resetAnalysisState();
    setUploadedFile(null);
    setSelectedAudio({
      kind: "manual",
      title: path.split(/[\\/]/).pop() || "Audio local",
      audioPath: path,
      audioUrl: getPlayableAudioUrl({ audio_path: path }),
      originalAudioPath: path,
      processingPath: path,
      originLabel: "ruta local",
      isValid: true,
    });
  }

  function openAudioPath(audioPath, title = null) {
    resetAnalysisState();
    setUploadedFile(null);
    const internalUpload = isInternalUploadPath(audioPath);
    setSelectedAudio({
      kind: internalUpload ? "upload_batch" : "manual",
      title: title || getAudioName(audioPath),
      audioPath,
      audioUrl: getPlayableAudioUrl({ audio_path: audioPath }),
      originalAudioPath: internalUpload ? title || getAudioName(audioPath) : audioPath,
      processingPath: audioPath,
      internalCopyPath: internalUpload ? audioPath : "",
      originLabel: internalUpload ? "upload temporal" : "ruta local",
      isValid: true,
    });
  }

  function openClipInLab(clip) {
    if (!clip?.output_audio_path) {
      setError("El recorte no tiene output_audio_path.");
      return false;
    }
    if (!clipIsPlayable(clip)) {
      setError("El recorte no tiene un WAV fisico disponible. No se cargara como audio activo.");
      return false;
    }
    if (!Number(clip.duration_seconds) || Number(clip.duration_seconds) <= 0) {
      setError("El recorte no tiene una duracion valida.");
      return false;
    }
    resetAnalysisState();
    setUploadedFile(null);
    setDuration(Number(clip.duration_seconds));
    setSelectedAudio({
      kind: "clip",
      title: clip.clip_name || clip.audio_name || getAudioName(clip.output_audio_path),
      audioPath: clip.output_audio_path,
      audioUrl: getAudioLabClipAudioUrl(clip),
      originalAudioPath: clip.source_audio_path || clip.output_audio_path,
      processingPath: clip.output_audio_path,
      originLabel: "clip derivado",
      isValid: true,
      clip,
    });
    return true;
  }

  function openUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    resetAnalysisState();
    if (selectedAudio?.objectUrl) URL.revokeObjectURL(selectedAudio.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    setUploadedFile(file);
    setSelectedAudio({
      kind: "upload",
      title: file.name,
      audioPath: "",
      audioUrl: objectUrl,
      objectUrl,
      originalAudioPath: file.webkitRelativePath || file.name,
      processingPath: "",
      originLabel: "upload temporal",
      isValid: true,
    });
  }

  function handleAudioLoaded(event) {
    setDuration(event.currentTarget.duration || 0);
    setSelectedAudio((current) => current ? { ...current, isValid: true, loadError: "" } : current);
  }

  function handleTimeUpdate(event) {
    const time = event.currentTarget.currentTime || 0;
    setCurrentTime(time);
    if (loopSelection && selectedRange && time >= selectedRange.end) {
      event.currentTarget.currentTime = selectedRange.start;
      event.currentTarget.play();
    }
  }

  function seek(seconds) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(seconds, duration || seconds));
    setCurrentTime(audio.currentTime);
  }

  async function playRange(start, end) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = start;
    await audio.play();
    if (!loopSelection) {
      const timer = window.setInterval(() => {
        if (!audio || audio.paused || audio.currentTime >= end) {
          audio.pause();
          window.clearInterval(timer);
        }
      }, 120);
    }
  }

  async function playResultRow(row) {
    const activeAudioPath = selectedAudio?.audioPath || prediction?.uploaded_temp_file;
    if (!sameAudioPath(row.audio_path, activeAudioPath)) {
      setError("Este resultado pertenece a otro audio. Carga ese audio para reproducirlo.");
      return;
    }
    await playRange(row.start_seconds, row.end_seconds);
  }

  async function generateSpectrogram(targetSegment = null) {
    if (!selectedAudio && !targetSegment?.audio_path) return;
    const range = targetSegment
      ? { start: targetSegment.start_seconds, end: targetSegment.end_seconds }
      : selectedRange;
    const audioPath = targetSegment?.audio_path || selectedAudio?.audioPath || prediction?.uploaded_temp_file;
    if (!audioPath) {
      setError("Primero analiza el audio subido para crear una copia temporal utilizable por el servicio ML.");
      return;
    }
    try {
      setSpectrogramLoading(true);
      setError("");
      const blob = await fetchMlSpectrogramBlob({
        audio_path: audioPath,
        start_seconds: range ? range.start : 0,
        end_seconds: range ? range.end : undefined,
        max_freq: 12000,
      });
      if (spectrogramUrl) URL.revokeObjectURL(spectrogramUrl);
      setSpectrogramUrl(URL.createObjectURL(blob));
      setMessage("Espectrograma generado.");
    } catch (err) {
      setError(err.message || "No fue posible generar el espectrograma.");
    } finally {
      setSpectrogramLoading(false);
    }
  }

  async function analyze(scope = "full") {
    if (!selectedAudio || analyzing) return;
    const useSelection = scope === "selection";
    const range = useSelection ? selectedRange : null;
    if (useSelection && !range) {
      setError("Selecciona un tramo en la waveform antes de analizar la seleccion.");
      return;
    }

    const activeModel = selectedModel || { id: DEFAULT_GENERAL_MODEL_ID, target_mode: "binary_presence", positive_label: DEFAULT_POSITIVE_LABEL };
    const activeModelId = getModelId(activeModel) || DEFAULT_GENERAL_MODEL_ID;
    const activeIsSpecialized = isSpecializedModel(activeModel);
    const payload = {
      model_id: activeModelId,
      target_mode: activeModel.target_mode || (activeIsSpecialized ? "multiclass" : "binary_presence"),
      threshold: Number(threshold),
      clip_duration: Number(clipDuration),
      step_seconds: Number(clipDuration),
      start_seconds: range ? range.start : undefined,
      end_seconds: range ? range.end : undefined,
    };
    if (!activeIsSpecialized) {
      payload.positive_label = activeModel.positive_label || DEFAULT_POSITIVE_LABEL;
    }

    try {
      setAnalyzing(true);
      setError("");
      setMessage(`Analizando con ${modelDisplayName(activeModel)}...`);
      const result =
        selectedAudio.kind === "upload" && uploadedFile
          ? await predictUploadedAudio(uploadedFile, payload)
          : await predictAudioPath({ ...payload, audio_path: selectedAudio.audioPath });
      const normalized = normalizeAnalysisResult(result, {
        audioPath: result.audio_path || result.uploaded_temp_file || selectedAudio.audioPath,
        audioName: selectedAudio.title,
        sourceRowId: selectedAudio.segment?.id,
        modelId: activeModelId,
        threshold: Number(threshold),
        model: activeModel,
      });
      setPrediction(normalized);
      setAnalysisHistory((current) => [normalized, ...current].slice(0, 20));
      setMessage(
        activeIsSpecialized
          ? "Analisis completado. Modelo especializado experimental; usa regla calibrada, no argmax simple."
          : "Analisis completado. Recuerda: este modelo detecta grupo rana/sapo, no especie."
      );
    } catch (err) {
      setError(err.message || "No fue posible analizar el audio.");
      setMessage("");
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeAudioPathDirect(audioPath, title = null, audioUrl = null, trace = null) {
    const activeModel = selectedModel || { id: DEFAULT_GENERAL_MODEL_ID, target_mode: "binary_presence", positive_label: DEFAULT_POSITIVE_LABEL };
    const activeModelId = getModelId(activeModel) || DEFAULT_GENERAL_MODEL_ID;
    const payload = buildPredictionPayload(activeModel);
    try {
      setAnalyzing(true);
      resetAnalysisState();
      setError("");
      setSelectedAudio({
        kind: "manual",
        title: title || getAudioName(audioPath),
        audioPath,
        audioUrl: audioUrl || getPlayableAudioUrl({ audio_path: audioPath }),
        originalAudioPath: trace?.source_audio_path || audioPath,
        processingPath: trace?.processed_audio_path || audioPath,
        originLabel: trace?.processed_audio_path ? "output procesado" : "ruta local",
        isValid: true,
      });
      const result = await predictAudioPath({ ...payload, audio_path: audioPath });
      const normalized = normalizeAnalysisResult(result, {
        audioPath: result.audio_path || audioPath,
        audioName: title || getAudioName(audioPath),
        sourceRowId: "",
        modelId: activeModelId,
        threshold: Number(threshold),
        model: activeModel,
        trace,
      });
      setPrediction(normalized);
      setAnalysisHistory((current) => [normalized, ...current].slice(0, 20));
      setMessage("Recorte cargado y analizado.");
    } catch (err) {
      setError(err.message || "No fue posible analizar el recorte.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function requestAutomaticIdentification(payload) {
    const response = await fetch("http://127.0.0.1:8000/api/ml/identify/audio-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) throw new Error(data?.detail || "No fue posible identificar automaticamente el audio.");
    return data;
  }

  async function runAutomaticIdentification() {
    if (!selectedAudio?.audioPath || autoIdentifyRunning) return;
    try {
      setAutoIdentifyRunning(true);
      setError("");
      const result = await requestAutomaticIdentification({
        audio_path: selectedAudio.audioPath,
        start_seconds: selection?.start ?? null,
        end_seconds: selection?.end ?? null,
        use_experimental_models: autoIdentifyExperimental,
        return_stage_details: true,
      });
      setAutoIdentifyResult(result);
      setMessage("Identificacion automatica completada.");
    } catch (err) {
      setError(err.message || "No fue posible identificar automaticamente el audio.");
    } finally {
      setAutoIdentifyRunning(false);
    }
  }

  async function runBatchAutomaticIdentification() {
    const queue = [
      ...segments.items
        .filter((item) => selectedBatchIds.includes(item.id))
        .map((item) => ({ id: item.id, audio_path: item.output_path, label: item.label || getAudioName(item.output_path) })),
      ...batchPaths
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter(Boolean)
        .map((path) => ({ id: path, audio_path: path, label: getAudioName(path) })),
      ...uploadQueue.map((item) => ({ id: item.id, audio_path: item.stored_path, label: item.original_filename || getAudioName(item.stored_path) })),
    ].filter((item) => item.audio_path);
    if (!queue.length || batchAutoIdentifyRunning) return;
    try {
      setBatchAutoIdentifyRunning(true);
      setBatchAutoIdentifyResults([]);
      setError("");
      const results = [];
      for (const item of queue) {
        try {
          const result = await requestAutomaticIdentification({
            audio_path: item.audio_path,
            use_experimental_models: autoIdentifyExperimental,
            return_stage_details: true,
          });
          results.push({ ...item, result });
        } catch (err) {
          results.push({ ...item, error: err.message || "Error identificando audio." });
        }
        setBatchAutoIdentifyResults([...results]);
      }
      setMessage("Identificacion automatica por lote completada.");
    } finally {
      setBatchAutoIdentifyRunning(false);
    }
  }

  function applyActivityPreset(presetId) {
    const preset = ACTIVITY_PRESETS[presetId] || ACTIVITY_PRESETS.normal;
    setActivityPreset(presetId);
    setActivityParams((current) => ({
      ...current,
      threshold_db: preset.threshold_db,
      min_activity_seconds: preset.min_activity_seconds,
      min_silence_seconds: preset.min_silence_seconds,
    }));
  }

  function updateActivityParam(key, value) {
    setActivityParams((current) => ({ ...current, [key]: value }));
  }

  function buildActivityPayload(audioPath) {
    return {
      ...activityParams,
      audio_path: audioPath,
      threshold_db: Number(activityParams.threshold_db),
      min_activity_seconds: Number(activityParams.min_activity_seconds),
      min_silence_seconds: Number(activityParams.min_silence_seconds),
      padding_seconds: Number(activityParams.padding_seconds),
      window_seconds: Number(activityParams.window_seconds),
      hop_seconds: Number(activityParams.hop_seconds),
      frequency_min_hz: activityParams.frequency_min_hz === "" ? null : Number(activityParams.frequency_min_hz),
      frequency_max_hz: activityParams.frequency_max_hz === "" ? null : Number(activityParams.frequency_max_hz),
      normalize: Boolean(activityParams.normalize),
      merge_gap_seconds: Number(activityParams.merge_gap_seconds),
      max_segment_seconds: activityParams.max_segment_seconds === "" ? null : Number(activityParams.max_segment_seconds),
    };
  }

  async function runActivityDetection() {
    if (!selectedAudio?.audioPath || activityRunning) {
      if (selectedAudio?.kind === "upload") {
        setError("Para detectar actividad server-side, sube el audio al lote o abre una ruta local/recorte con audio_path.");
      }
      return;
    }
    try {
      setActivityRunning(true);
      setError("");
      setMessage("Detectando actividad acustica...");
      const result = await detectAudioLabActivity(buildActivityPayload(selectedAudio.audioPath));
      setActivityRun(result);
      setSelectedActivityIds((result.segments || []).map((segment) => segment.id));
      setActivityClipPrefix(safeNamePart(getAudioStem(selectedAudio.audioPath, selectedAudio.title), "audio"));
      setMessage(`Actividad detectada: ${result.summary?.segments_detected || 0} segmento(s).`);
    } catch (err) {
      setError(err.message || "No fue posible detectar actividad.");
    } finally {
      setActivityRunning(false);
    }
  }

  function selectActivitySegment(segment) {
    if (!segment) return;
    setSelection({ start: segment.start_seconds, end: segment.end_seconds });
    setSelectedActivityIds((current) => (current.includes(segment.id) ? current : [...current, segment.id]));
  }

  function toggleActivitySegment(segmentId) {
    setSelectedActivityIds((current) =>
      current.includes(segmentId)
        ? current.filter((id) => id !== segmentId)
        : [...current, segmentId]
    );
  }

  async function playActivitySegment(segment) {
    selectActivitySegment(segment);
    await playRange(segment.start_seconds, segment.end_seconds);
  }

  async function analyzeActivitySegment(segment) {
    if (!selectedAudio?.audioPath || analyzing) return;
    selectActivitySegment(segment);
    const activeModel = selectedModel || { id: DEFAULT_GENERAL_MODEL_ID, target_mode: "binary_presence", positive_label: DEFAULT_POSITIVE_LABEL };
    const activeModelId = getModelId(activeModel) || DEFAULT_GENERAL_MODEL_ID;
    const payload = buildPredictionPayload(activeModel, { start: segment.start_seconds, end: segment.end_seconds });
    try {
      setAnalyzing(true);
      setError("");
      setMessage(`Analizando segmento ${segment.id}...`);
      const result = await predictAudioPath({ ...payload, audio_path: selectedAudio.audioPath });
      const normalized = normalizeAnalysisResult(result, {
        audioPath: result.audio_path || selectedAudio.audioPath,
        audioName: selectedAudio.title,
        sourceRowId: selectedAudio.segment?.id,
        modelId: activeModelId,
        threshold: Number(threshold),
        model: activeModel,
      });
      setPrediction(normalized);
      setAnalysisHistory((current) => [normalized, ...current].slice(0, 20));
      setMessage(`Segmento ${segment.id} analizado.`);
    } catch (err) {
      setError(err.message || "No fue posible analizar el segmento.");
    } finally {
      setAnalyzing(false);
    }
  }

  function openActivitySegmentClipDraft(segment) {
    if (!selectedAudio?.audioPath || !segment) return;
    setSelection({ start: segment.start_seconds, end: segment.end_seconds });
    setClipDraft({
      source_audio_path: selectedAudio.audioPath,
      audio_name: selectedAudio.title || getAudioName(selectedAudio.audioPath),
      start_seconds: segment.start_seconds,
      end_seconds: segment.end_seconds,
      suggested_name: `${safeNamePart(activityClipPrefix || getAudioStem(selectedAudio.audioPath), "audio")}__${segment.id}__clip_${clipBoundary(segment.start_seconds)}_${clipBoundary(segment.end_seconds)}.wav`,
      purpose: activityClipPurpose,
      notes: `Recorte derivado de deteccion de actividad ${segment.id}.`,
    });
  }

  async function createSelectedActivityClips() {
    if (!selectedAudio?.audioPath || !selectedActivitySegments.length || activityClipSaving) return;
    const totalSeconds = selectedActivitySegments.reduce((sum, segment) => sum + Number(segment.duration_seconds || 0), 0);
    const confirmed = window.confirm(
      `Crear ${selectedActivitySegments.length} recorte(s) WAV en backend/storage/audio_lab/clips con duracion total ${formatNumber(totalSeconds, 1)} s?`
    );
    if (!confirmed) return;
    try {
      setActivityClipSaving(true);
      setError("");
      const result = await createAudioLabActivityClips({
        audio_path: selectedAudio.audioPath,
        segments: selectedActivitySegments,
        purpose: activityClipPurpose,
        name_prefix: activityClipPrefix || getAudioStem(selectedAudio.audioPath, selectedAudio.title),
        format: "wav",
      });
      const clips = result.clips || [];
      setLastActivityClipBatch(result);
      setClipHistory((current) => [...clips, ...current]);
      setLastClip(clips[0] || null);
      setMessage(`Recortes creados: ${clips.length}. El audio original no se modifico.`);
    } catch (err) {
      setError(err.message || "No fue posible crear recortes de actividad.");
    } finally {
      setActivityClipSaving(false);
    }
  }

  async function analyzeActivityClipBatch(clips) {
    const playable = (clips || []).filter(clipIsPlayable);
    if (!playable.length || analyzing) return;
    const activeModel = selectedBatchModel || selectedModel || { id: DEFAULT_GENERAL_MODEL_ID, target_mode: "binary_presence", positive_label: DEFAULT_POSITIVE_LABEL };
    const payload = buildPredictionPayload(activeModel, null, Number(activeModel?.threshold ?? threshold));
    const activeModelId = getModelId(activeModel) || DEFAULT_GENERAL_MODEL_ID;
    setAnalyzing(true);
    setError("");
    const results = [];
    for (const clip of playable) {
      try {
        const result = await predictAudioPath({ ...payload, audio_path: clip.output_audio_path });
        const normalized = normalizeAnalysisResult(result, {
          audioPath: result.audio_path || clip.output_audio_path,
          audioName: clip.clip_name || clip.audio_name || getAudioName(clip.output_audio_path),
          sourceRowId: clip.id,
          modelId: activeModelId,
          threshold: Number(activeModel?.threshold ?? threshold),
          model: activeModel,
        });
        results.push({
          status: "ok",
          source_kind: "activity_clip",
          audio_path: normalized.audio_path,
          audio_name: normalized.audio_name,
          analysis: normalized,
        });
      } catch (err) {
        results.push({
          status: "error",
          source_kind: "activity_clip",
          audio_path: clip.output_audio_path,
          audio_name: clip.clip_name || clip.audio_name || getAudioName(clip.output_audio_path),
          error: err.message,
        });
      }
    }
    setBatchResults((current) => [...results, ...current].slice(0, 100));
    setAnalysisHistory((current) => [...results.filter((item) => item.analysis).map((item) => item.analysis), ...current].slice(0, 40));
    setAnalyzing(false);
    setMessage(`Analisis de recortes completado: ${results.filter((item) => item.status === "ok").length}/${playable.length}.`);
  }

  function buildPredictionPayload(activeModel, range = null, overrideThreshold = null) {
    const activeModelId = getModelId(activeModel) || DEFAULT_GENERAL_MODEL_ID;
    const activeIsSpecialized = isSpecializedModel(activeModel);
    const modelThreshold = overrideThreshold ?? activeModel?.threshold ?? threshold;
    const payload = {
      model_id: activeModelId,
      target_mode: activeModel?.target_mode || (activeIsSpecialized ? "multiclass" : "binary_presence"),
      threshold: Number(modelThreshold),
      clip_duration: Number(clipDuration),
      step_seconds: Number(clipDuration),
      start_seconds: range ? range.start : undefined,
      end_seconds: range ? range.end : undefined,
    };
    if (!activeIsSpecialized) {
      payload.positive_label = activeModel?.positive_label || DEFAULT_POSITIVE_LABEL;
    }
    return payload;
  }

  async function runBatchAnalysis() {
    const activeModel = selectedBatchModel || { id: DEFAULT_GENERAL_MODEL_ID, target_mode: "binary_presence", positive_label: DEFAULT_POSITIVE_LABEL };
    const selectedSegments = segments.items.filter((item) => selectedBatchIds.includes(item.id));
    const manualRows = batchPaths
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
      .map((path) => ({
        id: `manual:${path}`,
        output_path: path,
        label: getAudioName(path),
        segment_id: getAudioName(path),
      }));
    const uploadRows = uploadQueue.map((item) => ({
      id: `upload:${item.id}`,
      output_path: item.stored_path,
      label: item.original_filename || getAudioName(item.stored_path),
      segment_id: item.original_filename || getAudioName(item.stored_path),
      source_kind: "upload_batch",
    }));
    const queue = [...selectedSegments, ...manualRows, ...uploadRows];
    if (!queue.length || batchRunning) return;
    const batchThreshold = Number(activeModel?.threshold ?? threshold);
    const payload = buildPredictionPayload(activeModel, null, batchThreshold);
    const activeModelId = getModelId(activeModel) || DEFAULT_GENERAL_MODEL_ID;
    setBatchRunning(true);
    setBatchProgress({ current: 0, total: queue.length });
    setError("");
    const results = [];
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      setBatchProgress({ current: index + 1, total: queue.length });
      try {
        const result = await predictAudioPath({ ...payload, audio_path: item.output_path });
        const normalized = normalizeAnalysisResult(result, {
          audioPath: result.audio_path || item.output_path,
          audioName: item.label || item.segment_id || getAudioName(item.output_path),
          sourceRowId: item.id,
          modelId: activeModelId,
          threshold: batchThreshold,
          model: activeModel,
        });
        results.push({
          status: "ok",
          source_kind: item.source_kind || (String(item.id || "").startsWith("manual:") ? "manual" : "curated"),
          audio_path: normalized.audio_path,
          audio_name: normalized.audio_name,
          analysis: normalized,
        });
      } catch (err) {
        results.push({
          status: "error",
          source_kind: item.source_kind || (String(item.id || "").startsWith("manual:") ? "manual" : "curated"),
          audio_path: item.output_path,
          audio_name: item.label || getAudioName(item.output_path),
          error: err.message,
        });
      }
    }
    setBatchResults((current) => [...results, ...current].slice(0, 100));
    setAnalysisHistory((current) => [...results.filter((item) => item.analysis).map((item) => item.analysis), ...current].slice(0, 40));
    setBatchRunning(false);
    setMessage(`Analisis por lote completado: ${results.filter((item) => item.status === "ok").length}/${queue.length} audios.`);
  }

  function buildBatchQueue() {
    const selectedSegments = segments.items.filter((item) => selectedBatchIds.includes(item.id));
    const manualRows = batchPaths
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
      .map((path) => ({
        id: `manual:${path}`,
        output_path: path,
        label: getAudioName(path),
        segment_id: getAudioName(path),
      }));
    const uploadRows = uploadQueue.map((item) => ({
      id: `upload:${item.id}`,
      output_path: item.stored_path,
      label: item.original_filename || getAudioName(item.stored_path),
      segment_id: item.original_filename || getAudioName(item.stored_path),
      source_kind: "upload_batch",
    }));
    return [...selectedSegments, ...manualRows, ...uploadRows];
  }

  async function runBatchActivityDetection() {
    const queue = buildBatchQueue();
    if (!queue.length || batchActivityRunning) return;
    setBatchActivityRunning(true);
    setBatchActivityProgress({ current: 0, total: queue.length });
    setError("");
    const results = [];
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      setBatchActivityProgress({ current: index + 1, total: queue.length });
      try {
        const result = await detectAudioLabActivity(buildActivityPayload(item.output_path));
        results.push({
          status: "ok",
          source_kind: item.source_kind || (String(item.id || "").startsWith("manual:") ? "manual" : "curated"),
          audio_path: result.audio_path || item.output_path,
          audio_name: item.label || item.segment_id || getAudioName(item.output_path),
          activity: result,
        });
      } catch (err) {
        results.push({
          status: "error",
          source_kind: item.source_kind || (String(item.id || "").startsWith("manual:") ? "manual" : "curated"),
          audio_path: item.output_path,
          audio_name: item.label || getAudioName(item.output_path),
          error: err.message,
        });
      }
    }
    setBatchActivityResults((current) => [...results, ...current].slice(0, 100));
    setBatchActivityRunning(false);
    setMessage(`Deteccion de actividad por lote completada: ${results.filter((item) => item.status === "ok").length}/${queue.length} audios.`);
  }

  function openBatchActivityInLab(item) {
    if (!item?.activity) return;
    resetAnalysisState();
    setUploadedFile(null);
    setSelectedAudio({
      kind: item.source_kind || "manual",
      title: item.audio_name || getAudioName(item.audio_path),
      audioPath: item.audio_path,
      audioUrl: getMediaFileUrl(item.audio_path),
      originalAudioPath: item.original_audio_path || item.source_audio_path || item.audio_path,
      processingPath: item.audio_path,
      originLabel: audioOriginLabel(item.source_kind || "manual"),
      isValid: true,
    });
    setActivityRun(item.activity);
    setSelectedActivityIds((item.activity.segments || []).map((segment) => segment.id));
    setActivityPanelOpen(true);
  }

  function setBatchProcessingModeValue(mode) {
    setBatchProcessingMode(mode);
    setBatchProcessingSteps(BATCH_PROCESSING_DEFAULT_STEPS[mode]);
  }

  function applyBatchProcessingPreset(preset) {
    const values = BATCH_PROCESSING_PRESETS[preset] || {};
    setBatchProcessingPreset(preset);
    setBatchProcessingParams((current) => ({
      ...current,
      ...(values.threshold_db !== undefined ? { threshold_db: values.threshold_db } : {}),
      ...(values.prop_decrease !== undefined ? { prop_decrease: values.prop_decrease } : {}),
      ...(values.detector_threshold !== undefined ? { detector_threshold: values.detector_threshold } : {}),
    }));
  }

  function toggleBatchProcessingStep(step) {
    if (batchProcessingMode === "clean_existing" && ["detect_activity", "create_segments", "discard_empty_segments"].includes(step)) return;
    setBatchProcessingSteps((current) => ({ ...current, [step]: !current[step] }));
  }

  function tableBatchProcessingItems() {
    return segments.items
      .filter((item) => selectedBatchIds.includes(item.id))
      .map((item) => ({
        id: `table:${item.id}`,
        output_path: item.output_path,
        label: item.label || item.segment_id || getAudioName(item.output_path),
        source_kind: "dataset",
        original_audio_path: item.source_path || item.output_path,
        processing_path: item.output_path,
        origin_label: "dataset",
        duration_seconds: item.duration_seconds,
        table_id: item.id,
      }));
  }

  function buildBatchProcessingItems() {
    const seen = new Set();
    return [...tableBatchProcessingItems(), ...batchProcessingQueue].filter((item) => {
      const key = normalizeAudioPathKey(item.output_path);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function batchProcessingInputPaths() {
    return buildBatchProcessingItems().map((item) => item.output_path).filter(Boolean);
  }

  function addBatchProcessingItems(items, successMessage = "Audio agregado al lote.") {
    const incoming = (items || []).filter((item) => item?.output_path);
    if (!incoming.length) {
      setBatchProcessingHelp("Primero agrega al menos un audio al lote.");
      return;
    }
    const existingKeys = new Set(buildBatchProcessingItems().map((item) => normalizeAudioPathKey(item.output_path)));
    const unique = incoming.filter((item) => !existingKeys.has(normalizeAudioPathKey(item.output_path)));
    if (!unique.length) {
      setBatchProcessingHelp("Este audio ya esta en el lote.");
      setMessage("Este audio ya esta en el lote.");
      return;
    }
    setBatchProcessingQueue((current) => [...current, ...unique]);
    setBatchProcessingHelp("");
    setMessage(unique.length === 1 ? successMessage : `${unique.length} audio(s) agregados al lote de procesamiento.`);
  }

  async function addCurrentAudioToBatchProcessing() {
    if (selectedAudio?.audioPath && selectedAudio?.isValid !== false) {
      const processingPath = selectedAudio.processingPath || selectedAudio.audioPath;
      addBatchProcessingItems([
        {
          id: `active:${processingPath}`,
          output_path: processingPath,
          label: selectedAudio.title || getAudioName(processingPath),
          source_kind: selectedAudio.originLabel || audioOriginLabel(selectedAudio.kind),
          original_audio_path: selectedAudio.originalAudioPath || selectedAudio.audioPath,
          processing_path: processingPath,
          internal_copy_path: selectedAudio.internalCopyPath || (isInternalUploadPath(processingPath) ? processingPath : ""),
          playable_url: selectedAudio.audioUrl,
          duration_seconds: duration || selectedAudio.clip?.duration_seconds || selectedAudio.segment?.duration_seconds,
        },
      ], "Audio actual agregado al lote.");
      return;
    }
    if (selectedAudio?.kind === "upload" && uploadedFile) {
      try {
        setBatchProcessingHelp("");
        const data = await uploadAudioLabBatch([uploadedFile]);
        const items = data.items || [];
        setUploadQueue((current) => [...items, ...current]);
        if (items[0]?.stored_path) {
          setSelectedAudio((current) => ({
            ...(current || {}),
            kind: "upload_batch",
            audioPath: items[0].stored_path,
            audioUrl: getMediaFileUrl(items[0].stored_path),
            title: items[0].original_filename || current?.title || getAudioName(items[0].stored_path),
            originalAudioPath: current?.originalAudioPath || items[0].original_filename || current?.title,
            processingPath: items[0].stored_path,
            internalCopyPath: items[0].stored_path,
            originLabel: "upload temporal",
            isValid: true,
          }));
        }
        addBatchProcessingItems(
          items.map((item) => ({
            id: `active-upload:${item.id}`,
            output_path: item.stored_path,
            label: item.original_filename || getAudioName(item.stored_path),
            source_kind: "upload temporal",
            original_audio_path: selectedAudio?.originalAudioPath || item.original_filename || getAudioName(item.stored_path),
            processing_path: item.stored_path,
            internal_copy_path: item.stored_path,
            duration_seconds: duration || undefined,
          })),
          "Audio actual subido y agregado al lote."
        );
      } catch (err) {
        setError(err.message || "No fue posible subir el audio activo para procesamiento.");
      }
      return;
    }
    setBatchProcessingHelp("No hay audio activo con ruta disponible para agregar.");
  }

  function addManualRoutesToBatchProcessing() {
    const items = batchPaths
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
      .map((path) => ({
        id: `manual-processing:${path}`,
        output_path: path,
        label: getAudioName(path),
        source_kind: "ruta manual",
        original_audio_path: path,
        processing_path: path,
      }));
    addBatchProcessingItems(items, "Rutas manuales agregadas al lote.");
  }

  function removeBatchProcessingItem(item) {
    if (item.source_kind === "dataset" && item.table_id) {
      setSelectedBatchIds((current) => current.filter((id) => id !== item.table_id));
      return;
    }
    const key = normalizeAudioPathKey(item.output_path);
    setBatchProcessingQueue((current) => current.filter((queued) => normalizeAudioPathKey(queued.output_path) !== key));
  }

  function activeAudioIsInBatchProcessing() {
    if (!selectedAudio?.audioPath) return false;
    const key = normalizeAudioPathKey(selectedAudio.audioPath);
    return buildBatchProcessingItems().some((item) => normalizeAudioPathKey(item.output_path) === key);
  }

  function buildBatchProcessingPayload(paths) {
    return {
      job_name: batchProcessingJobName || `procesamiento_${new Date().toISOString().slice(0, 10)}`,
      input_audio_paths: paths,
      mode: batchProcessingMode,
      preset: batchProcessingPreset,
      steps: batchProcessingSteps,
      activity_params: {
        method: "band_energy",
        threshold_db: Number(batchProcessingParams.threshold_db),
        min_activity_seconds: Number(batchProcessingParams.min_activity_seconds),
        min_silence_seconds: Number(batchProcessingParams.min_silence_seconds),
        padding_seconds: Number(batchProcessingParams.padding_seconds),
        window_seconds: Number(activityParams.window_seconds),
        hop_seconds: Number(activityParams.hop_seconds),
        frequency_min_hz: Number(batchProcessingParams.frequency_min_hz),
        frequency_max_hz: Number(batchProcessingParams.frequency_max_hz),
        merge_gap_seconds: Number(activityParams.merge_gap_seconds),
        max_segment_seconds: Number(activityParams.max_segment_seconds),
        normalize: true,
      },
      denoise_params: {
        method: "spectral_gate",
        preset: batchProcessingPreset,
        prop_decrease: Number(batchProcessingParams.prop_decrease),
        frequency_min_hz: Number(batchProcessingParams.frequency_min_hz),
        frequency_max_hz: Number(batchProcessingParams.frequency_max_hz),
        normalize: Boolean(batchProcessingSteps.normalize),
      },
      detector_params: {
        model_id: DEFAULT_GENERAL_MODEL_ID,
        threshold: Number(batchProcessingParams.detector_threshold),
        clip_duration: Number(batchProcessingParams.clip_duration),
      },
      output_policy: {
        save_segments: true,
        save_denoised: true,
        keep_intermediate: true,
        recommended_training_use: "requires_review",
      },
      job_allowed_roots: batchProcessingJobAllowedRoots,
    };
  }

  function authorizeBatchRootForPath(itemOrPath) {
    const item = typeof itemOrPath === "string" ? { output_path: itemOrPath } : itemOrPath;
    const path = item.original_audio_path && !isInternalUploadPath(item.original_audio_path) ? item.original_audio_path : item.output_path;
    if (isInternalUploadPath(item.output_path)) {
      setMessage("Este audio ya esta en una copia temporal segura dentro de storage; no requiere autorizacion externa.");
      return;
    }
    const root = parentFolderFromPath(path);
    if (!root) {
      setError("No se pudo detectar la carpeta padre de este audio.");
      return;
    }
    if (/^[A-Za-z]:[\\/]?$/.test(root.trim())) {
      const confirmed = window.confirm("Estas intentando autorizar una raiz de unidad completa. Es mas seguro elegir una carpeta especifica. Deseas continuar de todas formas?");
      if (!confirmed) return;
    }
    const confirmed = window.confirm(`Autorizar esta carpeta solo para este job?\n\n${root}\n\nNo se modificara .env ni se autorizara todo el disco.`);
    if (!confirmed) return;
    setBatchProcessingJobAllowedRoots((current) => current.includes(root) ? current : [...current, root]);
    setMessage(`Carpeta autorizada para este job: ${root}`);
  }

  async function startBatchProcessingJob() {
    const paths = batchProcessingInputPaths();
    if (!paths.length) {
      setBatchProcessingHelp("Primero agrega al menos un audio al lote.");
      return;
    }
    if (batchProcessingSubmitting) return;
    const activeSteps = Object.entries(batchProcessingSteps).filter(([, active]) => active).map(([key]) => key);
    const warning = paths.length > 100 ? "\n\nAdvertencia: el lote tiene mas de 100 audios." : "";
    const confirmed = window.confirm(
      `Iniciar procesamiento por lote?\n\nAudios: ${paths.length}\nModo: ${batchProcessingMode}\nPreset: ${batchProcessingPreset}\nPasos: ${activeSteps.join(", ")}\nDestino: backend/storage/audio_lab/batch_jobs/{job_id}\n\nNo se modificaran audios originales.${warning}`
    );
    if (!confirmed) return;
    try {
      setBatchProcessingSubmitting(true);
      setError("");
      const created = await createAudioLabBatchProcessingJob(buildBatchProcessingPayload(paths));
      setMessage("Job de procesamiento por lote creado.");
      await refreshBatchProcessingJob(created.job_id);
      await loadBatchProcessingJobs();
    } catch (err) {
      setError(err.message || "No fue posible crear el job de procesamiento por lote.");
    } finally {
      setBatchProcessingSubmitting(false);
    }
  }

  async function refreshBatchProcessingJob(jobId) {
    try {
      const [detail, logs] = await Promise.all([
        fetchAudioLabBatchProcessingJob(jobId),
        fetchAudioLabBatchProcessingLogs(jobId),
      ]);
      setActiveBatchProcessingJob(detail);
      setBatchProcessingLogs(logs.logs || "");
      setBatchProcessingJobs((current) => {
        const exists = current.some((item) => item.id === detail.id);
        return exists ? current.map((item) => (item.id === detail.id ? detail : item)) : [detail, ...current];
      });
    } catch (err) {
      setError(err.message || "No fue posible refrescar el job.");
    }
  }

  async function cancelBatchProcessingJob() {
    if (!activeBatchProcessingJob?.id) return;
    try {
      const canceled = await cancelAudioLabBatchProcessingJob(activeBatchProcessingJob.id);
      setActiveBatchProcessingJob((current) => ({ ...current, ...canceled }));
      setMessage("Cancelacion solicitada.");
    } catch (err) {
      setError(err.message || "No fue posible cancelar el job.");
    }
  }

  function updateFolderBatchField(key, value) {
    setFolderBatchForm((current) => ({ ...current, [key]: value }));
  }

  function normalizeFolderBatchConfig(config) {
    return {
      ...config,
      config_name: config.config_name || config.name || config.preset || "personalizado",
    };
  }

  function applyFolderBatchConfig(config) {
    const values = normalizeFolderBatchConfig(config);
    setFolderBatchForm((current) => ({
      ...current,
      ...values,
      preset: values.preset || current.preset || "personalizado",
    }));
  }

  function applyFolderBatchPreset(preset) {
    const values = FOLDER_BATCH_PRESETS[preset] || {};
    applyFolderBatchConfig({ ...values, preset });
  }

  function folderBatchConfigIsExploratory(config = folderBatchForm) {
    return config.config_name === "exploratory_wide" || config.name === "exploratory_wide" || config.preset === "exploratory_wide" || config.calibration_mode === "exploratory";
  }

  function folderBatchRecommendationFor(config = folderBatchForm) {
    if (folderBatchConfigIsExploratory(config)) return "too_many_candidates";
    return config.calibration_mode === "safe" ? "safe_recommended" : "recommended";
  }

  function useFolderBatchComparisonRow(config) {
    if (folderBatchConfigIsExploratory(config)) {
      const confirmed = window.confirm("Esta configuración puede generar muchos falsos candidatos. Úsala solo para una muestra pequeña.");
      if (!confirmed) return;
      const filesFound = Number(folderBatchScan?.files_found || 0);
      if (filesFound > 20) {
        const sampleConfirmed = window.confirm(`La carpeta escaneada tiene ${filesFound} audios. Esta configuración queda en modo exploratorio; confirma solo si vas a probar una muestra pequeña, no toda la carpeta.`);
        if (!sampleConfirmed) return;
      }
    }
    applyFolderBatchConfig(config);
  }

  function buildFolderBatchScanPayload() {
    return {
      folder_path: folderBatchForm.folder_path.trim(),
      recursive: Boolean(folderBatchForm.recursive),
      extensions: [".wav", ".flac", ".mp3", ".ogg", ".m4a"],
      include_patterns: [],
      exclude_patterns: [],
    };
  }

  async function scanFolderBatch() {
    if (!folderBatchForm.folder_path.trim()) {
      setError("Escribe la ruta local de la carpeta antes de escanear.");
      return;
    }
    try {
      setFolderBatchScanning(true);
      setError("");
      const scan = await scanAudioLabFolderBatch(buildFolderBatchScanPayload());
      setFolderBatchScan(scan);
      setMessage(`Carpeta escaneada: ${scan.files_found || 0} archivo(s), ${formatBytes(scan.total_size_bytes)}.`);
    } catch (err) {
      setError(err.message || "No fue posible escanear la carpeta local.");
    } finally {
      setFolderBatchScanning(false);
    }
  }

  function buildFolderBatchPayload() {
    return {
      job_name: folderBatchForm.job_name || `folder_batch_${new Date().toISOString().slice(0, 10)}`,
      folder_path: folderBatchForm.folder_path.trim(),
      recursive: Boolean(folderBatchForm.recursive),
      target_label: folderBatchForm.target_label.trim() || "target_species",
      mode: "species_folder_cleanup",
      preset: folderBatchForm.preset,
      config_name: folderBatchForm.config_name,
      calibration_mode: folderBatchForm.calibration_mode,
      frequency_min_hz: Number(folderBatchForm.frequency_min_hz),
      frequency_max_hz: Number(folderBatchForm.frequency_max_hz),
      threshold_dbfs: Number(folderBatchForm.threshold_dbfs),
      min_activity_seconds: Number(folderBatchForm.min_activity_seconds),
      min_silence_seconds: Number(folderBatchForm.min_silence_seconds),
      padding_seconds: Number(folderBatchForm.padding_seconds),
      clip_duration_seconds: Number(folderBatchForm.clip_duration_seconds),
      max_segment_seconds: Number(folderBatchForm.max_segment_seconds),
      min_band_ratio: Number(folderBatchForm.min_band_ratio),
      bandpass: Boolean(folderBatchForm.bandpass),
      noise_reduce: Boolean(folderBatchForm.noise_reduce),
      normalize: Boolean(folderBatchForm.normalize),
      discard_empty: Boolean(folderBatchForm.discard_empty),
      detect_frog: Boolean(folderBatchForm.detect_frog),
      detect_contaminants_heuristic: Boolean(folderBatchForm.detect_contaminants_heuristic),
      create_clips: Boolean(folderBatchForm.create_clips),
      create_manifest: Boolean(folderBatchForm.create_manifest),
      resource_profile: folderBatchForm.resource_profile,
    };
  }

  async function startFolderBatchJob() {
    if (!folderBatchForm.folder_path.trim()) {
      setError("Escribe la ruta local de la carpeta antes de iniciar.");
      return;
    }
    if (!folderBatchScan) {
      setError("Escanea la carpeta antes de iniciar el procesamiento.");
      return;
    }
    if (folderBatchConfigIsExploratory()) {
      const filesFound = Number(folderBatchScan.files_found || 0);
      if (filesFound > 20) {
        const confirmedExploratory = window.confirm(
          `Esta configuración puede generar muchos falsos candidatos. Úsala solo para una muestra pequeña.\n\nLa carpeta tiene ${filesFound} audios. No se recomienda procesar toda la carpeta con exploratory_wide.`
        );
        if (!confirmedExploratory) return;
      } else {
        const confirmedSample = window.confirm("Esta configuración es exploratoria. Sirve para encontrar actividad posible, no para procesar toda la carpeta.");
        if (!confirmedSample) return;
      }
    }
    const confirmed = window.confirm(
      `Iniciar procesamiento masivo por carpeta?\n\nCarpeta: ${folderBatchForm.folder_path}\nArchivos: ${folderBatchScan.files_found || 0}\nBanda: ${folderBatchForm.frequency_min_hz}-${folderBatchForm.frequency_max_hz} Hz\nDestino: backend/storage/audio_lab/folder_batch_jobs/{job_id}\n\nNo se modificaran ni borraran audios originales.`
    );
    if (!confirmed) return;
    try {
      setFolderBatchSubmitting(true);
      setError("");
      const created = await createAudioLabFolderBatchJob(buildFolderBatchPayload());
      setMessage("Job de carpeta local creado. El procesamiento queda trazado y los originales no se modifican.");
      await refreshFolderBatchJob(created.job_id || created.id);
      await loadFolderBatchJobs();
    } catch (err) {
      setError(err.message || "No fue posible crear el job de carpeta local.");
    } finally {
      setFolderBatchSubmitting(false);
    }
  }

  async function refreshFolderBatchJob(jobId, options = {}) {
    try {
      const [detail, logs, outputs, summary] = await Promise.all([
        fetchAudioLabFolderBatchJob(jobId),
        fetchAudioLabFolderBatchLogs(jobId),
        fetchAudioLabFolderBatchOutputs(jobId),
        fetchAudioLabFolderBatchSummary(jobId),
      ]);
      setActiveFolderBatchJob(detail);
      setFolderBatchLogs(logs.logs || "");
      setFolderBatchOutputs(outputs.items || []);
      setFolderBatchSummary(summary);
      setFolderBatchJobs((current) => {
        const exists = current.some((item) => item.id === detail.id);
        return exists ? current.map((item) => (item.id === detail.id ? detail : item)) : [detail, ...current];
      });
    } catch (err) {
      if (!options.quiet) setError(err.message || "No fue posible refrescar el job de carpeta local.");
    }
  }

  async function pauseFolderBatchJob() {
    if (!activeFolderBatchJob?.id) return;
    try {
      await pauseAudioLabFolderBatchJob(activeFolderBatchJob.id);
      await refreshFolderBatchJob(activeFolderBatchJob.id);
      setMessage("Pausa solicitada. El job terminara el archivo actual antes de detenerse.");
    } catch (err) {
      setError(err.message || "No fue posible pausar el job.");
    }
  }

  async function resumeFolderBatchJob() {
    if (!activeFolderBatchJob?.id) return;
    try {
      await resumeAudioLabFolderBatchJob(activeFolderBatchJob.id);
      await refreshFolderBatchJob(activeFolderBatchJob.id);
      setMessage("Job reanudado.");
    } catch (err) {
      setError(err.message || "No fue posible reanudar el job.");
    }
  }

  async function cancelFolderBatchJob() {
    if (!activeFolderBatchJob?.id) return;
    const confirmed = window.confirm("Cancelar el job de carpeta local? No se borraran originales ni outputs ya generados.");
    if (!confirmed) return;
    try {
      await cancelAudioLabFolderBatchJob(activeFolderBatchJob.id);
      await refreshFolderBatchJob(activeFolderBatchJob.id);
      setMessage("Cancelacion solicitada.");
    } catch (err) {
      setError(err.message || "No fue posible cancelar el job.");
    }
  }

  function openFolderBatchOutputInLab(output) {
    const path = output.output_audio_path || output.audio_path;
    if (!path) return;
    resetAnalysisState();
    setUploadedFile(null);
    setSelectedAudio({
      kind: "folder_batch_output",
      title: getAudioName(path),
      audioPath: path,
      audioUrl: getPlayableAudioUrl(output),
      originalAudioPath: output.original_audio_path || path,
      processingPath: path,
      originLabel: "output procesado",
      isValid: true,
    });
  }

  function feedbackRowFromFolderBatchOutput(output) {
    const path = output.output_audio_path || output.audio_path || output.original_audio_path;
    return {
      analysis_id: activeFolderBatchJob?.id || "folder-batch",
      result_row_id: output.id,
      audio_path: path,
      audio_name: getAudioName(path),
      original_source_audio_path: output.original_audio_path,
      processed_audio_path: output.output_audio_path,
      batch_job_name: activeFolderBatchJob?.job_name,
      batch_job_id: activeFolderBatchJob?.id || output.job_id,
      batch_output_id: output.id,
      processing_metadata_path: output.output_metadata_path,
      start_seconds: output.start_seconds ?? 0,
      end_seconds: output.end_seconds ?? output.duration_seconds ?? 0,
      model_id: DEFAULT_GENERAL_MODEL_ID,
      predicted_label: activeFolderBatchJob?.target_label || folderBatchForm.target_label,
      score: output.activity_score,
      score_used: output.activity_score,
      threshold: folderBatchForm.threshold_dbfs,
      raw_argmax_label: "",
      decision_rule_applied: false,
    };
  }

  function openFolderBatchFeedback(output, feedbackType, exclusionReason = "") {
    const row = feedbackRowFromFolderBatchOutput(output);
    if (feedbackType === "excluded_from_training") {
      setFeedbackDraft({
        mode: "create",
        row,
        feedbackType,
        exclusionReason: exclusionReason || "ruido",
        notes,
      });
      return;
    }
    openFeedbackDraft(feedbackType, row);
  }

  function openFolderBatchManifest() {
    if (!activeFolderBatchJob?.id) return;
    window.open(getAudioLabFolderBatchManifestUrl(activeFolderBatchJob.id), "_blank", "noopener,noreferrer");
  }

  async function copyTextToClipboard(text, successMessage = "Copiado.") {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } else {
      setMessage(text);
    }
  }

  async function diagnoseAudioPath(audioPath = selectedAudio?.audioPath) {
    if (!audioPath) {
      setError("No hay ruta de audio para diagnosticar.");
      return;
    }
    try {
      const result = await debugResolveAudio(audioPath);
      const status = result.allowed && result.exists ? "permitida" : result.exists ? "no permitida" : "no encontrada";
      setMessage(`Diagnostico de audio: ruta ${status}. ${result.reason || ""} ${result.matched_root ? `Root: ${result.matched_root}` : ""}`.trim());
      if (result.playable_url && selectedAudio?.audioPath === audioPath) {
        setSelectedAudio((current) => current ? { ...current, audioUrl: getPlayableAudioUrl({ playable_url: result.playable_url }) } : current);
      }
    } catch (err) {
      setError(err.message || "No fue posible diagnosticar la ruta de audio.");
    }
  }

  function traceFromBatchOutput(output) {
    return {
      display_name: output.display_name || output.display_label,
      display_label: output.display_label || output.display_name,
      source_audio_name: output.source_audio_name,
      processed_audio_name: output.processed_audio_name,
      source_audio_path: output.source_audio_path,
      processed_audio_path: output.processed_audio_path,
      batch_job_id: output.batch_job_id || activeBatchProcessingJob?.id || output.job_id,
      batch_job_name: output.batch_job_name || activeBatchProcessingJob?.job_name,
      batch_output_id: output.id,
      processing_metadata_path: output.processing_metadata_path,
      segment_label: output.segment_label,
      segment_start_seconds: output.segment_start_seconds,
      segment_end_seconds: output.segment_end_seconds,
      processing_method: output.processing_method,
      processing_preset: output.processing_preset,
    };
  }

  function openBatchOutputInLab(output) {
    const path = output.processed_audio_path || output.segment_audio_path;
    if (!path) return;
    resetAnalysisState();
    setUploadedFile(null);
    setSelectedAudio({
      kind: "batch_output",
      title: output.display_label || output.display_name || getAudioName(path),
      audioPath: path,
      audioUrl: getPlayableAudioUrl(output),
      originalAudioPath: output.source_audio_path || path,
      processingPath: path,
      originLabel: "output procesado",
      isValid: true,
    });
  }

  async function analyzeBatchOutput(output) {
    const path = output.processed_audio_path || output.segment_audio_path;
    if (!path) return;
    await analyzeAudioPathDirect(path, output.display_label || output.display_name || getAudioName(path), getPlayableAudioUrl(output), traceFromBatchOutput(output));
  }

  function exportBatchOutputsCsv() {
    const outputs = activeBatchProcessingJob?.outputs || [];
    if (!outputs.length) return;
    const rows = [
      ["job_name", "source_audio_name", "source_audio_path", "processed_audio_name", "processed_audio_path", "segment_start", "segment_end", "prediction", "score", "quality_label", "recommendation", "created_at"],
      ...outputs.map((output) => [
        output.batch_job_name || activeBatchProcessingJob?.job_name || "",
        output.source_audio_name || getAudioName(output.source_audio_path),
        output.source_audio_path || "",
        output.processed_audio_name || getAudioName(output.processed_audio_path || ""),
        output.processed_audio_path || "",
        output.segment_start_seconds ?? "",
        output.segment_end_seconds ?? "",
        output.frog_detector_prediction || "",
        output.frog_detector_score ?? "",
        output.quality_report_label || "",
        output.recommended_action || "",
        output.created_at || "",
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeNamePart(activeBatchProcessingJob?.job_name || activeBatchProcessingJob?.id || "batch_outputs")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function generateQualityReportForOutput(output) {
    const processedPath = output.processed_audio_path;
    const sourcePath = output.segment_audio_path || output.source_audio_path;
    if (!processedPath) {
      setError("Este output no tiene processed_audio_path para comparar.");
      return;
    }
    if (!sourcePath) {
      setError("Este output no tiene audio fuente para comparar.");
      return;
    }
    try {
      setQualityReportLoading(output.id);
      setError("");
      const report = await createAudioLabQualityReport({
        source_audio_path: sourcePath,
        processed_audio_path: processedPath,
        run_frog_detector: true,
        frog_detector_model_id: DEFAULT_GENERAL_MODEL_ID,
        frog_detector_threshold: Number(batchProcessingParams.detector_threshold),
        batch_output_id: output.id,
      });
      setQualityReport(report);
      if (activeBatchProcessingJob?.id) await refreshBatchProcessingJob(activeBatchProcessingJob.id);
      setMessage("Reporte de calidad generado.");
    } catch (err) {
      setError(`No se pudo generar el reporte de calidad. ${err.message || ""}`.trim());
    } finally {
      setQualityReportLoading("");
    }
  }

  async function openExistingQualityReport(output) {
    if (!output?.quality_report_path) return;
    try {
      setQualityReportLoading(output.id);
      setError("");
      const response = await fetch(getMediaFileUrl(output.quality_report_path));
      if (!response.ok) {
        let detail = "No se pudo abrir el reporte de calidad.";
        try {
          const data = await response.json();
          detail = data.detail || detail;
        } catch {
          // Keep readable fallback.
        }
        throw new Error(detail);
      }
      setQualityReport(await response.json());
    } catch (err) {
      setError(`No se pudo generar el reporte de calidad. ${err.message || ""}`.trim());
    } finally {
      setQualityReportLoading("");
    }
  }

  function qualityReportMarkdown(report) {
    if (!report) return "";
    const detector = report.frog_detector || {};
    return [
      `Audio: ${report.source_audio_name || getAudioName(report.source_audio_path)}`,
      `Ruta audio: ${report.source_audio_path}`,
      `Procesado: ${report.display_label || report.processed_audio_name || getAudioName(report.processed_audio_path)}`,
      `Ruta procesado: ${report.processed_audio_path}`,
      `Contraste antes/despues: ${formatNumber(report.contrast_db_source, 2)} dB / ${formatNumber(report.contrast_db_processed, 2)} dB`,
      `Mejora: ${formatNumber(report.contrast_improvement_db, 2)} dB`,
      `Clipping: source ${formatNumber(report.clipping_source_ratio, 6)} / processed ${formatNumber(report.clipping_processed_ratio, 6)}`,
      "Bandas:",
      ...(report.band_energy || []).map((band) => `- ${band.band_hz} Hz: ${formatNumber(band.source_db, 2)} -> ${formatNumber(band.processed_db, 2)} dB (${formatNumber(band.delta_db, 2)} dB, ${band.interpretation})`),
      `Detector: ${detector.source_prediction || "-"} ${formatNumber(detector.source_score, 3)} -> ${detector.processed_prediction || "-"} ${formatNumber(detector.processed_score, 3)} (delta ${formatNumber(detector.delta_score, 3)})`,
      `Recomendacion: ${qualityLabelText(report.recommendation?.label)} - ${report.recommendation?.summary || ""}`,
      `Uso entrenamiento: ${report.recommendation?.training_use || "requires_review"}`,
    ].join("\n");
  }

  async function copyQualityReport() {
    if (!qualityReport) return;
    const text = qualityReportMarkdown(qualityReport);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setMessage("Reporte copiado en Markdown.");
    }
  }

  function downloadQualityReportJson() {
    if (!qualityReport) return;
    const blob = new Blob([JSON.stringify(qualityReport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeNamePart(getAudioStem(qualityReport.processed_audio_path), "quality_report")}.quality.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function feedbackRowFromBatchOutput(output) {
    const path = output.processed_audio_path || output.segment_audio_path || output.source_audio_path;
    return {
      analysis_id: activeBatchProcessingJob?.id || "batch-processing",
      result_row_id: output.id,
      audio_path: path,
      audio_name: output.display_label || output.display_name || getAudioName(path),
      source_row_id: output.item_id,
      original_source_audio_path: output.source_audio_path,
      processed_audio_path: output.processed_audio_path,
      source_audio_name: output.source_audio_name,
      processed_audio_name: output.processed_audio_name,
      display_name: output.display_name,
      display_label: output.display_label,
      batch_job_name: output.batch_job_name || activeBatchProcessingJob?.job_name,
      batch_job_id: activeBatchProcessingJob?.id || output.job_id,
      batch_output_id: output.id,
      processing_metadata_path: output.processing_metadata_path,
      start_seconds: output.segment_start_seconds ?? 0,
      end_seconds: output.segment_end_seconds ?? 0,
      model_id: DEFAULT_GENERAL_MODEL_ID,
      predicted_label: output.frog_detector_prediction || output.recommended_action || "",
      score: output.frog_detector_score,
      score_used: output.frog_detector_score,
      threshold: batchProcessingParams.detector_threshold,
      raw_argmax_label: "",
      decision_rule_applied: false,
    };
  }

  async function handleBatchFiles(files) {
    if (!files?.length) return;
    try {
      setError("");
      const data = await uploadAudioLabBatch(files);
      const items = data.items || [];
      setUploadQueue((current) => [...items, ...current]);
      if (items[0]?.stored_path) {
        resetAnalysisState();
        setUploadedFile(null);
        setSelectedAudio({
          kind: "upload_batch",
          title: items[0].original_filename || getAudioName(items[0].stored_path),
          audioPath: items[0].stored_path,
          audioUrl: getMediaFileUrl(items[0].stored_path),
          originalAudioPath: items[0].original_filename || getAudioName(items[0].stored_path),
          processingPath: items[0].stored_path,
          internalCopyPath: items[0].stored_path,
          originLabel: "upload temporal",
          isValid: true,
        });
      }
      addBatchProcessingItems(
        items.map((item) => ({
          id: `upload-processing:${item.id}`,
          output_path: item.stored_path,
          label: item.original_filename || getAudioName(item.stored_path),
          source_kind: "upload temporal",
          original_audio_path: item.original_filename || getAudioName(item.stored_path),
          processing_path: item.stored_path,
          internal_copy_path: item.stored_path,
        })),
        `${items.length} audio(s) subidos y agregados al lote.`
      );
      setMessage(`${items.length} audio(s) subidos temporalmente y agregados al lote de procesamiento.`);
    } catch (err) {
      setError(err.message || "No fue posible subir los audios.");
    }
  }

  function openBatchResultInActiveView(item) {
    if (!item?.analysis) return;
    resetAnalysisState();
    setUploadedFile(null);
    setSelectedAudio({
      kind: item.source_kind || "manual",
      title: item.audio_name || getAudioName(item.audio_path),
      audioPath: item.audio_path,
      audioUrl: getMediaFileUrl(item.audio_path),
      originalAudioPath: item.original_audio_path || item.source_audio_path || item.audio_path,
      processingPath: item.audio_path,
      originLabel: audioOriginLabel(item.source_kind || "manual"),
      isValid: true,
    });
    setPrediction(item.analysis);
  }

  function batchFeedbackRow(item, summary) {
    const segment = summary.segment || firstAnalysisSegment(item.analysis);
    return {
      ...(segment || {}),
      analysis_id: item.analysis?.analysis_id || `batch:${Date.now()}`,
      result_row_id: segment?.result_row_id || `batch:${item.audio_path}`,
      audio_path: item.audio_path,
      audio_name: item.audio_name || getAudioName(item.audio_path),
      start_seconds: segment?.start_seconds ?? 0,
      end_seconds: segment?.end_seconds ?? item.analysis?.duration_seconds ?? 0,
      model_id: item.analysis?.model_id || getModelId(selectedBatchModel),
      predicted_label: segment?.predicted_label || summary.predictedLabel,
      raw_argmax_label: segment?.raw_argmax_label || "",
      decision_rule_applied: Boolean(segment?.decision_rule_applied || item.analysis?.decision_rule_applied),
      score_used: segment?.score_used ?? summary.score,
      threshold: item.analysis?.threshold ?? summary.threshold,
    };
  }

  function feedbackRowFromCurrentSelection() {
    const activeModel = selectedModel || { id: DEFAULT_GENERAL_MODEL_ID, positive_label: DEFAULT_POSITIVE_LABEL };
    const modelId = prediction?.model_id || getModelId(activeModel) || DEFAULT_GENERAL_MODEL_ID;
    const audioPath = selectedAudio?.audioPath || prediction?.uploaded_temp_file;
    const fallbackLabel = selectedModelIsSpecialized
      ? prediction?.summary?.top_label || selectedModelClasses[0] || ""
      : prediction?.summary?.detected
        ? selectedPositiveLabel
        : `no_${selectedPositiveLabel}`;
    if (!audioPath) return null;
    const active = {
      start_seconds: selectedRange?.start ?? 0,
      end_seconds: selectedRange?.end ?? duration,
      predicted_label: fallbackLabel,
      score: selectedModelIsSpecialized ? prediction?.summary?.max_confidence : prediction?.summary?.max_score_rana_sapo,
    };
    const row = {
      ...active,
      analysis_id: prediction?.analysis_id || "manual-feedback",
      result_row_id: `manual-feedback:${Date.now()}`,
      audio_path: audioPath,
      audio_name: selectedAudio?.title || getAudioName(audioPath),
      source_row_id: selectedAudio?.segment?.id || prediction?.source_row_id || "",
      model_id: modelId,
      raw_argmax_label: "",
      decision_rule_applied: Boolean(prediction?.decision_rule_applied),
      threshold: prediction?.threshold ?? threshold,
    };
    return {
      ...row,
      score_used: row.score ?? primarySegmentScore(row, activeModel) ?? row.score_rana_sapo,
    };
  }

  function openFeedbackDraft(userFeedback, row = null) {
    const activeRow = row || feedbackRowFromCurrentSelection();
    if (!activeRow?.audio_path) {
      setError("No hay ruta de audio disponible para guardar feedback.");
      return;
    }
    setFeedbackDraft({
      mode: "create",
      row: activeRow,
      feedbackType: userFeedback,
      exclusionReason: userFeedback === "excluded_from_training" ? "voz_humana" : "",
      notes,
    });
  }

  function editFeedbackDraft(annotation) {
    setFeedbackDraft({
      mode: "edit",
      annotationId: annotation.id,
      row: {
        audio_path: annotation.audio_path,
        audio_name: annotation.audio_name || getAudioName(annotation.audio_path),
        start_seconds: annotation.segment_start_seconds ?? annotation.start_seconds,
        end_seconds: annotation.segment_end_seconds ?? annotation.end_seconds,
        model_id: annotation.model_id,
        predicted_label: annotation.predicted_label,
        raw_argmax_label: annotation.raw_argmax_label,
        decision_rule_applied: Boolean(annotation.decision_rule_applied),
        score_used: annotation.score_used ?? annotation.score,
        threshold: annotation.threshold,
      },
      feedbackType: annotation.user_feedback,
      previousFeedback: annotation.user_feedback,
      exclusionReason: annotation.exclusion_reason || "",
      notes: annotation.notes || "",
    });
  }

  async function saveFeedbackDraft() {
    if (!feedbackDraft?.row?.audio_path) return;
    const row = feedbackDraft.row;
    const excludedVoice =
      feedbackDraft.feedbackType === "excluded_from_training" && feedbackDraft.exclusionReason === "voz_humana";
    const payload = {
      audio_path: row.audio_path,
      audio_name: row.audio_name || getAudioName(row.audio_path),
      source_row_id: row.source_row_id || "",
      start_seconds: row.start_seconds,
      end_seconds: row.end_seconds,
      segment_start_seconds: row.start_seconds,
      segment_end_seconds: row.end_seconds,
      model_id: row.model_id || prediction?.model_id || getModelId(selectedModel),
      predicted_label: row.predicted_label,
      raw_argmax_label: row.raw_argmax_label || "",
      decision_rule_applied: Boolean(row.decision_rule_applied),
      threshold: row.threshold ?? prediction?.threshold ?? threshold,
      score: row.score_used ?? row.score,
      score_used: row.score_used ?? row.score,
      user_feedback: feedbackDraft.feedbackType,
      feedback_type: feedbackDraft.feedbackType,
      exclusion_reason: feedbackDraft.exclusionReason || null,
      label_type: excludedVoice ? "human_voice" : null,
      recommended_training_use: excludedVoice ? "exclude_species_training" : null,
      hard_negative_candidate: false,
      user_label: row.predicted_label,
      notes: feedbackDraft.notes || "",
      status: feedbackDraft.mode === "edit" ? "corrected" : "active",
      previous_feedback: feedbackDraft.previousFeedback || null,
      new_feedback: feedbackDraft.feedbackType,
      correction_note: feedbackDraft.mode === "edit" ? feedbackDraft.notes || "" : null,
      processed_audio_path: row.processed_audio_path || null,
      batch_job_id: row.batch_job_id || null,
      batch_output_id: row.batch_output_id || null,
      processing_metadata_path: row.processing_metadata_path || null,
      original_source_audio_path: row.original_source_audio_path || row.source_audio_path || null,
      final_label: row.final_label || null,
      pipeline_stages_json: row.pipeline_stages_json || null,
      model_ids_json: row.model_ids_json || null,
    };
    try {
      const saved =
        feedbackDraft.mode === "edit"
          ? await updateAudioLabAnnotation(feedbackDraft.annotationId, payload)
          : await createAudioLabAnnotation(payload);
      setAnnotations((current) =>
        feedbackDraft.mode === "edit"
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current]
      );
      setFeedbackDraft(null);
      setNotes("");
      setMessage(`Feedback guardado: ${feedbackLabel(payload.user_feedback)}.`);
    } catch (err) {
      setError(err.message || "No fue posible guardar el feedback.");
    }
  }

  async function retractFeedback(annotationId) {
    try {
      const saved = await retractAudioLabAnnotation(annotationId);
      setAnnotations((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setMessage("Feedback anulado.");
    } catch (err) {
      setError(err.message || "No fue posible anular el feedback.");
    }
  }

  function findAnnotationForRow(row) {
    const key = `${row.model_id || ""}:${Number(row.start_seconds || 0).toFixed(2)}-${Number(row.end_seconds || 0).toFixed(2)}`;
    return annotationsByRange.get(key);
  }

  function openClipDraft() {
    if (!selectedAudio?.audioPath || !selectedRange) {
      setError("Selecciona un tramo antes de crear un recorte.");
      return;
    }
    const overlappedPrediction = activeTableRows.find(
      (row) => row.start_seconds < selectedRange.end && row.end_seconds > selectedRange.start
    );
    const normalizedLabel = selectedAudio.segment?.normalized_label || selectedAudio.segment?.canonical_label || "";
    const predictedLabel = overlappedPrediction?.predicted_label || prediction?.summary?.top_label || "";
    const visibleLabel = selectedAudio.segment?.label || selectedAudio.title || "";
    setClipDraft({
      source_audio_path: selectedAudio.audioPath,
      audio_name: selectedAudio.title || getAudioName(selectedAudio.audioPath),
      start_seconds: selectedRange.start,
      end_seconds: selectedRange.end,
      suggested_name: buildSuggestedClipName(
        {
          audioPath: selectedAudio.audioPath,
          normalizedLabel,
          predictedLabel,
          visibleLabel,
        },
        selectedRange
      ),
      purpose: "revision",
      notes: "",
    });
  }

  async function saveClipDraft() {
    if (!clipDraft || clipSaving) return;
    try {
      setClipSaving(true);
      const saved = await createAudioLabClip(clipDraft);
      if (!clipIsPlayable(saved)) {
        setError("El backend no devolvio un WAV fisico valido para el recorte. No se abrira ni analizara.");
        return;
      }
      setClipDraft(null);
      setLastClip(saved);
      setClipHistory((current) => [saved, ...current]);
      setMessage(`Recorte registrado: ${saved.output_audio_path}. No se modifico el audio original.`);
    } catch (err) {
      setError(err.message || "No fue posible crear el recorte.");
    } finally {
      setClipSaving(false);
    }
  }

  async function saveClipDraftAndOpen() {
    if (!clipDraft || clipSaving) return;
    try {
      setClipSaving(true);
      const saved = await createAudioLabClip(clipDraft);
      if (!clipIsPlayable(saved)) {
        setError("El backend no devolvio un WAV fisico valido para el recorte. No se abrira en laboratorio.");
        return;
      }
      setClipDraft(null);
      setClipHistory((current) => [saved, ...current]);
      if (openClipInLab(saved)) {
        setLastClip(saved);
        setMessage(`Recorte creado y cargado en laboratorio: ${saved.output_audio_path}.`);
      }
    } catch (err) {
      setError(err.message || "No fue posible crear el recorte.");
    } finally {
      setClipSaving(false);
    }
  }

  async function analyzeClip(clip) {
    if (!clip?.output_audio_path) {
      setError("El recorte no tiene output_audio_path.");
      return;
    }
    if (!clipIsPlayable(clip)) {
      setError("El recorte no tiene un WAV fisico disponible para analizar.");
      return;
    }
    await analyzeAudioPathDirect(
      clip.output_audio_path,
      clip.clip_name || clip.audio_name || getAudioName(clip.output_audio_path),
      getAudioLabClipAudioUrl(clip)
    );
  }

  function exportCsv() {
    if (!activeTableRows.length) return;
    const annotationByRange = new Map(
      annotations.map((item) => [`${Number(item.start_seconds).toFixed(2)}-${Number(item.end_seconds).toFixed(2)}`, item])
    );
    const scoreColumns = Array.from(
      new Set(
        activeTableRows
          .flatMap((segment) => Object.keys(segment).filter((key) => key.startsWith("score_")))
          .concat((prediction.classes || selectedModelClasses).map((label) => `score_${label}`))
      )
    );
    const rows = [
      [
        "audio_path",
        "start_seconds",
        "end_seconds",
        "predicted_label",
        "raw_argmax_label",
        "decision_rule_applied",
        "decision_rule_score",
        "operational_confidence",
        "argmax_override_warning",
        "threshold",
        "model_id",
        ...scoreColumns,
        "human_feedback",
      ],
      ...activeTableRows.map((segment) => {
        const key = `${Number(segment.start_seconds).toFixed(2)}-${Number(segment.end_seconds).toFixed(2)}`;
        const annotation = annotationByRange.get(key);
        return [
          segment.audio_path || prediction.audio_path,
          segment.start_seconds,
          segment.end_seconds,
          segment.predicted_label,
          segment.raw_argmax_label || "",
          segment.decision_rule_applied ?? "",
          ruleScoreForSegment(segment, selectedModel) ?? "",
          operationalConfidenceLabel(segment, selectedModel),
          didRuleChangeArgmax(segment)
            ? "La regla calibrada cambio la prediccion del argmax. Revisar si es un caso sensible."
            : "",
          prediction.threshold,
          prediction.model_id,
          ...scoreColumns.map((column) => segment[column] ?? ""),
          annotation?.user_feedback || "",
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "acusticafauna_audio_lab_resultados.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const summary = prediction?.summary;
  const predictionClasses = prediction?.classes || selectedModelClasses;
  const representativeSegment = activeTableRows[0] || null;
  const batchProcessingItems = buildBatchProcessingItems();
  const batchProcessingSourceCounts = {
    dataset: batchProcessingItems.filter((item) => item.source_kind === "dataset").length,
    upload: batchProcessingItems.filter((item) => item.source_kind === "upload temporal").length,
    manual: batchProcessingItems.filter((item) => item.source_kind === "ruta manual").length,
    local: batchProcessingItems.filter((item) => item.source_kind === "ruta local").length,
  };
  const hasActiveAudioForBatch = Boolean((selectedAudio?.isValid !== false && selectedAudio?.audioPath) || (selectedAudio?.kind === "upload" && uploadedFile));
  const activeAudioMissingFromBatch = hasActiveAudioForBatch && !activeAudioIsInBatchProcessing();
  const normalizedBatchJobSearch = batchJobSearch.trim().toLowerCase();
  const filteredBatchProcessingJobs = batchProcessingJobs.filter((job) => {
    const summary = job.summary || {};
    const matchesSearch = !normalizedBatchJobSearch || [
      job.job_name,
      job.id,
      job.current_file,
      job.output_dir,
      job.output_search_text,
      job.mode,
      job.status,
      ...(job.outputs || []).flatMap((output) => [
        output.source_audio_name,
        output.processed_audio_name,
        output.display_name,
        output.source_audio_path,
        output.processed_audio_path,
      ]),
    ].some((value) => String(value || "").toLowerCase().includes(normalizedBatchJobSearch));
    const matchesStatus = !batchJobStatusFilter || job.status === batchJobStatusFilter;
    const matchesMode = !batchJobModeFilter || job.mode === batchJobModeFilter;
    const matchesDate = !batchJobDateFilter || String(job.created_at || "").startsWith(batchJobDateFilter);
    const matchesFlag =
      !batchJobFlagFilter ||
      (batchJobFlagFilter === "errors" && Number(summary.errors || 0) > 0) ||
      (batchJobFlagFilter === "probable_rana" && Number(summary.probable_rana || 0) > 0);
    return matchesSearch && matchesStatus && matchesMode && matchesDate && matchesFlag;
  });
  const normalizedFolderBatchSearch = folderBatchSearch.trim().toLowerCase();
  const filteredFolderBatchJobs = folderBatchJobs.filter((job) => {
    const matchesSearch = !normalizedFolderBatchSearch || [
      job.job_name,
      job.id,
      job.folder_path,
      job.target_label,
      job.status,
      job.output_dir,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedFolderBatchSearch));
    const matchesStatus = !folderBatchStatusFilter || job.status === folderBatchStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const folderBatchProgress = activeFolderBatchJob?.total_files
    ? Math.round((Number(activeFolderBatchJob.processed_files || 0) / Number(activeFolderBatchJob.total_files || 1)) * 100)
    : 0;
  const filteredFolderBatchOutputs = folderBatchOutputs.filter((output) => {
    const searchTerm = normalizedFolderBatchSearch;
    const flags = output.contaminant_flags || output.contaminant_flags_json || "";
    const recommendation = output.recommendation || "";
    const ratio = Number(output.band_energy_ratio || 0);
    const score = Number(output.activity_score || 0);
    const durationValue = Number(output.duration_seconds || 0);
    const matchesSearch = !searchTerm || [
      output.original_audio_path,
      output.output_audio_path,
      recommendation,
      flags,
    ].some((value) => String(value || "").toLowerCase().includes(searchTerm));
    const matchesMode =
      folderBatchOutputFilter === "all" ||
      (folderBatchOutputFilter === "candidates" && recommendation === "candidate") ||
      (folderBatchOutputFilter === "excluded" && recommendation !== "candidate") ||
      (folderBatchOutputFilter === "contaminants" && flags && flags !== "{}" && flags !== "[]") ||
      (folderBatchOutputFilter === "errors" && recommendation === "error") ||
      (folderBatchOutputFilter === "review" && recommendation.includes("review"));
    const matchesScore = folderBatchMinScore === "" || score >= Number(folderBatchMinScore);
    const matchesRatio = folderBatchMinRatio === "" || ratio >= Number(folderBatchMinRatio);
    return matchesSearch && matchesMode && matchesScore && matchesRatio && durationValue >= 0;
  });

  return (
    <div className="space-y-6 p-6 text-slate-800 dark:text-slate-100">
      <SectionCard
        title="Laboratorio de audio"
        subtitle="Prueba audios locales con el detector rana/sapo y guarda revision humana para entrenamiento futuro"
        rightContent={
          <button
            type="button"
            onClick={checkMlService}
            disabled={mlStatus.state === "loading"}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LoadingText loading={mlStatus.state === "loading"} loadingText="Reintentando...">Reintentar conexion</LoadingText>
          </button>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={mlStatus.state === "connected" ? "success" : mlStatus.state === "loading" ? "info" : "danger"}>
                {mlStatus.state === "connected" ? "ML conectada" : mlStatus.state === "loading" ? "ML cargando" : "ML desconectada"}
              </Badge>
              <span className="text-sm text-slate-600">{mlStatus.message}</span>
              <span className="text-xs text-slate-500">Ultima verificacion: {formatCheckTime(mlStatus.checkedAt)}</span>
              {mlStatus.stale ? <Badge tone="warning">datos posiblemente desactualizados</Badge> : null}
            </div>
            {mlStatus.state !== "connected" && mlStatus.state !== "loading" ? (
              <>
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  ML API no disponible. Revisa que acusticafauna-ML este corriendo.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`cd "F:/PROYECTO de cosa de sonido/acusticafauna-ML"
source .venv-ml/Scripts/activate
python -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload`}
                </pre>
              </>
            ) : null}
            <p className="mt-3 text-sm text-slate-600">
              Usa el detector general para encontrar presencia probable de rana/sapo o un clasificador especializado cuando este disponible.
              Los resultados son experimentales.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="grid gap-2">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Modelo seleccionado</span>
                <strong className="max-w-72 truncate text-right">{modelDisplayName(selectedModel)}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Modo</span>
                <strong>{selectedModel?.target_mode || "-"}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Threshold recomendado</span>
                <strong>{formatNumber(selectedModel?.threshold ?? threshold, 2)}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Modelos disponibles</span>
                <strong>{models.length}</strong>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>
      ) : null}

      <SectionCard title="Identificacion automatica" subtitle="Ejecuta detector rana/sapo, genero y clasificador especializado segun modelos registrados">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={runAutomaticIdentification} disabled={!selectedAudio?.audioPath || autoIdentifyRunning || !mlStatus.connected} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <LoadingText loading={autoIdentifyRunning} loadingText="Identificando...">Identificar automaticamente</LoadingText>
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoIdentifyExperimental} onChange={(event) => setAutoIdentifyExperimental(event.target.checked)} />
              Usar modelos experimentales
            </label>
            {autoIdentifyExperimental ? <Badge tone="warning">experimental</Badge> : null}
          </div>
          {autoIdentifyResult ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-indigo-700">Resultado final</div>
                  <h3 className="text-lg font-bold text-indigo-950">{autoIdentifyResult.final_label}</h3>
                  <p className="text-sm text-indigo-900">{autoIdentifyResult.final_level} - confianza {autoIdentifyResult.confidence_level} - {autoIdentifyResult.recommendation}</p>
                </div>
                <button type="button" onClick={() => openFeedbackDraft("uncertain", {
                  audio_path: selectedAudio.audioPath,
                  audio_name: selectedAudio.title || getAudioName(selectedAudio.audioPath),
                  start_seconds: selection?.start ?? 0,
                  end_seconds: selection?.end ?? duration,
                  model_id: (autoIdentifyResult.model_ids || []).join(","),
                  predicted_label: autoIdentifyResult.final_label,
                  score: autoIdentifyResult.confidence,
                  score_used: autoIdentifyResult.score_used ?? autoIdentifyResult.confidence,
                  threshold: autoIdentifyResult.threshold,
                  final_label: autoIdentifyResult.final_label,
                  pipeline_stages_json: JSON.stringify(autoIdentifyResult.stages || []),
                  model_ids_json: JSON.stringify(autoIdentifyResult.model_ids || []),
                })} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold">Feedback</button>
              </div>
              {autoIdentifyResult.message ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{autoIdentifyResult.message} Puedes registrar/promover uno desde Modelos ML.</p> : null}
              {autoIdentifyResult.warnings?.length ? (
                <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
                  {autoIdentifyResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : null}
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {(autoIdentifyResult.stages || []).map((stage) => (
                  <div key={stage.stage} className="rounded-lg bg-white p-3 text-sm">
                    <div className="text-xs font-semibold uppercase text-slate-500">{stage.stage}</div>
                    <div className="mt-1 font-bold">{stage.predicted_label || "-"}</div>
                    <div className="text-xs text-slate-500">{stage.model_id}</div>
                    <div className="mt-2 text-xs">score {formatNumber(stage.score, 3)} - threshold {formatNumber(stage.threshold, 2)}</div>
                    <div className="mt-1 text-xs">BA historica {formatNumber(stage.balanced_accuracy, 3)} - {stage.is_reliable === false ? "No confiable" : "Confiable"}</div>
                    {stage.is_reliable === false ? <Badge tone="danger">No confiable</Badge> : null}
                    {stage.decision_rule_applied ? <Badge tone="info">regla calibrada</Badge> : null}
                    {stage.reliability_warnings?.length ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                        {stage.reliability_warnings.join(" ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Modelos ML" subtitle="Elige el modelo que se usara para analizar el audio completo o la seleccion">
        <div className="space-y-4">
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="checkbox" checked={showExperimentalModels} onChange={(event) => setShowExperimentalModels(event.target.checked)} />
            <span>Mostrar modelos experimentales</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">Modelo activo</span>
            <select
              value={selectedModelId}
              onChange={(event) => {
                setSelectedModelId(event.target.value);
                setPrediction(null);
              }}
              disabled={!models.length}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {!models.length ? <option value={DEFAULT_GENERAL_MODEL_ID}>Sin modelos disponibles</option> : null}
              {selectedModel && !selectableModels.some((item) => getModelId(item) === getModelId(selectedModel)) ? (
                <option value={getModelId(selectedModel)}>{modelDisplayName(selectedModel)} - {selectedModel.registry_status}</option>
              ) : null}
              {selectableModels.map((item) => (
                <option key={getModelId(item)} value={getModelId(item)}>
                  {modelDisplayName(item)}{item.is_default_for_task ? " - activo/default" : isExperimentalModel(item) ? " - experimental" : ""}
                </option>
              ))}
            </select>
          </label>
          {isExperimentalModel(selectedModel) ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Modelo experimental; no es el activo recomendado.
            </p>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-emerald-950">Detector general rana/sapo</h3>
                <Badge tone="success">{generalModels.length || 0}</Badge>
              </div>
              <div className="space-y-3">
                {generalModels.length ? (
                  generalModels.map((item) => (
                    <button
                      key={getModelId(item)}
                      type="button"
                      onClick={() => {
                        setSelectedModelId(getModelId(item));
                        setPrediction(null);
                      }}
                      className={`w-full rounded-lg border p-3 text-left text-sm ${
                        getModelId(item) === getModelId(selectedModel)
                          ? "border-emerald-500 bg-white shadow-sm"
                          : "border-emerald-100 bg-white/70"
                      }`}
                    >
                      <div className="font-semibold text-slate-900">{modelDisplayName(item)}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {item.is_default_for_task ? <Badge tone="success">activo/default</Badge> : null}
                        {isExperimentalModel(item) ? <Badge tone="info">experimental</Badge> : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Detecta presencia probable de {item.positive_label || DEFAULT_POSITIVE_LABEL}. No identifica especie.
                      </div>
                      <div className="mt-2 text-xs text-slate-500">Threshold recomendado: {formatNumber(item.threshold ?? 0.3, 2)}</div>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No hay detector general listado por la ML API.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-blue-950">Clasificadores especializados</h3>
                <Badge tone="info">{specializedModels.length || 0}</Badge>
              </div>
              <div className="space-y-3">
                {specializedModels.length ? (
                  specializedModels.map((item) => (
                    <button
                      key={getModelId(item)}
                      type="button"
                      onClick={() => {
                        setSelectedModelId(getModelId(item));
                        setPrediction(null);
                      }}
                      className={`w-full rounded-lg border p-3 text-left text-sm ${
                        getModelId(item) === getModelId(selectedModel)
                          ? "border-blue-500 bg-white shadow-sm"
                          : "border-blue-100 bg-white/70"
                      }`}
                    >
                      <div className="font-semibold text-slate-900">{modelDisplayName(item)}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {item.is_default_for_task ? <Badge tone="success">activo/default</Badge> : null}
                        {isExperimentalModel(item) ? <Badge tone="info">experimental</Badge> : null}
                        {(item.classes || []).map((label) => (
                          <Badge key={label} tone="info">{label}</Badge>
                        ))}
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-slate-600">
                        <span>Grupo: {item.group || "-"} {item.genus ? `· Genus: ${item.genus}` : ""}</span>
                        <span>Threshold recomendado: {formatNumber(item.threshold ?? 0.03, 2)}</span>
                        <span>Regla: {describeDecisionRule(item.decision_rule)}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">Cuando la ML API liste clasificadores de especie, apareceran aqui.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Selector de audio" subtitle="Abre un segmento del Dataset Curado, sube un audio temporal o pega una ruta local">
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Buscar</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Etiqueta, ruta o id"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={labelFilter}
                onChange={(event) => setLabelFilter(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Todas las labels</option>
                {labelOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="candidato">Candidato</option>
                <option value="gold">Gold</option>
                <option value="revisar">Revisar</option>
                <option value="ruido">Ruido</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                placeholder="F:/ruta/audio.wav"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={openManualPath}
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900"
              >
                Abrir
              </button>
            </div>
            <input ref={uploadInputRef} type="file" accept="audio/*" className="hidden" onChange={openUpload} />
            <div
              onClick={() => uploadInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (!event.dataTransfer.files?.length) {
                  setMessage("Para carpetas grandes pega la ruta en Procesamiento masivo por carpeta local.");
                  return;
                }
                handleBatchFiles(event.dataTransfer.files);
              }}
              className="cursor-pointer rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Arrastra audios aqui o haz clic para seleccionar
              <p className="mt-1 text-xs font-normal text-emerald-800">Soporta .wav, .flac, .mp3, .ogg, .m4a. Si es una carpeta grande, pega la ruta abajo en procesamiento masivo.</p>
            </div>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Subir audio temporal
            </button>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Lote</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Duracion</th>
                  <th className="px-3 py-2">Accion</th>
                </tr>
              </thead>
              <tbody>
                {filteredSegments.map((segment) => (
                  <tr key={segment.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedBatchIds.includes(segment.id)}
                        onChange={() => toggleBatchSegment(segment.id)}
                        aria-label="Seleccionar para lote"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-800">{segment.label}</div>
                      <div className="max-w-md truncate font-mono text-xs text-slate-500">{segment.output_path}</div>
                    </td>
                    <td className="px-3 py-2">{segment.training_status || segment.group_type || "-"}</td>
                    <td className="px-3 py-2">{formatTime(segment.duration_seconds)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openCuratedAudio(segment)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Abrir audio
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredSegments.length ? (
                  <tr>
                    <td colSpan="5" className="px-3 py-8 text-center text-slate-500">
                      No hay audios con estos filtros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Analisis por lote" subtitle="Analiza varios audios secuencialmente y conserva resultados agrupados por audio">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <strong>{selectedBatchIds.length}</strong> audio(s) seleccionados desde la tabla.
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-slate-700">Modelo para lote</span>
              <select
                value={getModelId(selectedBatchModel) || selectedBatchModelId}
                onChange={(event) => setSelectedBatchModelId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {selectedBatchModel && !selectableModels.some((item) => getModelId(item) === getModelId(selectedBatchModel)) ? (
                  <option value={getModelId(selectedBatchModel)}>{modelDisplayName(selectedBatchModel)} - {selectedBatchModel.registry_status}</option>
                ) : null}
                {selectableModels.map((item) => (
                  <option key={getModelId(item)} value={getModelId(item)}>
                    {isGeneralDetector(item) ? "Detector rana/sapo" : isSpecializedModel(item) ? "Clasificador especializado" : "Modelo"} - {modelDisplayName(item)}{item.is_default_for_task ? " - activo/default" : isExperimentalModel(item) ? " - experimental" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Se usara {modelDisplayName(selectedBatchModel)} con threshold {formatNumber(selectedBatchModel?.threshold ?? threshold, 2)}.
              </span>
            </label>
            {selectedBatchModelIsSpecialized ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Este modelo no detecta si hay rana/sapo. Solo clasifica entre {selectedBatchModel?.classes?.join(" y ") || "sus clases configuradas"}.
              </p>
            ) : null}
            {isExperimentalModel(selectedBatchModel) ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Modelo experimental; no es el activo recomendado.
              </p>
            ) : null}
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-slate-700">Rutas manuales, una por linea</span>
              <textarea
                value={batchPaths}
                onChange={(event) => setBatchPaths(event.target.value)}
                placeholder="F:/ruta/audio_1.wav&#10;F:/ruta/audio_2.flac"
                className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleBatchFiles(event.dataTransfer.files);
              }}
              className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm"
            >
              <label className="block font-semibold text-slate-700">Subir varios audios</label>
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={(event) => handleBatchFiles(event.target.files)}
                className="mt-2 w-full text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">Tambien puedes arrastrar varios archivos aqui. Se guardan temporalmente en storage/audio_lab/uploads.</p>
            </div>
            {uploadQueue.length ? (
              <div className="max-h-32 overflow-auto rounded-lg border border-slate-200 text-xs">
                <div className="border-b border-slate-100 bg-slate-50 p-2 font-semibold text-slate-700">
                  Cola de archivos subidos ({uploadQueue.length}). No se copian a rutas manuales.
                </div>
                {uploadQueue.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-b border-slate-100 p-2 last:border-b-0">
                    <span className="truncate" title={item.stored_path}>{item.original_filename}</span>
                    <button type="button" onClick={() => openAudioPath(item.stored_path, item.original_filename)} className="rounded border border-slate-300 px-2 py-1 font-semibold">
                      Abrir
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={runBatchAnalysis} disabled={batchRunning || (!selectedBatchIds.length && !batchPaths.trim() && !uploadQueue.length) || !mlStatus.connected} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <LoadingText loading={batchRunning} loadingText="Analizando lote...">Analizar lote</LoadingText>
              </button>
              <button type="button" onClick={runBatchAutomaticIdentification} disabled={batchAutoIdentifyRunning || (!selectedBatchIds.length && !batchPaths.trim() && !uploadQueue.length) || !mlStatus.connected} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <LoadingText loading={batchAutoIdentifyRunning} loadingText="Identificando lote...">Identificacion automatica por lote</LoadingText>
              </button>
              <button type="button" onClick={runBatchActivityDetection} disabled={batchActivityRunning || (!selectedBatchIds.length && !batchPaths.trim() && !uploadQueue.length)} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <LoadingText loading={batchActivityRunning} loadingText="Detectando actividad...">Detectar actividad en lote</LoadingText>
              </button>
              <button type="button" onClick={() => { setSelectedBatchIds([]); setBatchPaths(""); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
                Limpiar tabla/rutas manuales
              </button>
              <button type="button" onClick={() => setUploadQueue([])} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">
                Limpiar lista de uploads
              </button>
            </div>
            {batchRunning ? <p className="text-sm text-slate-600">Progreso: {batchProgress.current} / {batchProgress.total}</p> : null}
            {batchActivityRunning ? <p className="text-sm text-slate-600">Progreso actividad: {batchActivityProgress.current} / {batchActivityProgress.total}</p> : null}
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
            {batchFrogSummary ? (
              <div className="grid gap-2 border-b border-slate-200 bg-emerald-50 p-3 text-xs text-emerald-950 sm:grid-cols-5">
                <span>Total: <strong>{batchFrogSummary.total}</strong></span>
                <span>rana_sapo: <strong>{batchFrogSummary.detected}</strong></span>
                <span>no_rana_sapo: <strong>{batchFrogSummary.notDetected}</strong></span>
                <span>Errores: <strong>{batchFrogSummary.errors}</strong></span>
                <span>Score prom.: <strong>{formatNumber(batchFrogSummary.averageScore)}</strong></span>
              </div>
            ) : null}
            {batchAutoIdentifyResults.length ? (
              <div className="space-y-2">
                {batchAutoIdentifyResults.map((item) => (
                  <div key={`auto-${item.id}`} className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={item.audio_path}>{item.label || getAudioName(item.audio_path)}</div>
                        {item.error ? (
                          <div className="text-red-700">{item.error}</div>
                        ) : (
                          <div className="text-indigo-900">{item.result?.final_label} - {item.result?.final_level} - {item.result?.confidence_level} - {item.result?.recommendation}</div>
                        )}
                      </div>
                      {!item.error ? (
                        <button type="button" onClick={() => openFeedbackDraft("uncertain", {
                          audio_path: item.audio_path,
                          audio_name: item.label || getAudioName(item.audio_path),
                          start_seconds: 0,
                          end_seconds: item.result?.duration_seconds || 0,
                          model_id: (item.result?.model_ids || []).join(","),
                          predicted_label: item.result?.final_label,
                          score: item.result?.confidence,
                          score_used: item.result?.score_used ?? item.result?.confidence,
                          threshold: item.result?.threshold,
                          final_label: item.result?.final_label,
                          pipeline_stages_json: JSON.stringify(item.result?.stages || []),
                          model_ids_json: JSON.stringify(item.result?.model_ids || []),
                        })} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold">Feedback</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {batchResults.length ? (
              batchResults.map((item) => {
                const resultModel = models.find((model) => getModelId(model) === item.analysis?.model_id) || selectedBatchModel;
                const summary = summarizeBatchResult(item, resultModel);
                return (
                  <div key={`${item.audio_path}-${item.analysis?.analysis_id || item.error}`} className="border-b border-slate-100 p-3 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={item.audio_path}>{item.audio_name || getAudioName(item.audio_path)}</div>
                        <div className="truncate text-xs text-slate-500" title={item.audio_path}>{item.audio_path}</div>
                        {item.error ? (
                          <p className="mt-1 text-xs text-red-700">{item.error}</p>
                        ) : (
                          <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                            <span>Modelo: <strong>{item.analysis?.model_id}</strong></span>
                            <span>Prediccion: <strong>{summary.predictedLabel}</strong></span>
                            <span>Score principal: <strong>{formatNumber(summary.score)}</strong></span>
                            <span>Threshold: <strong>{formatNumber(summary.threshold, 2)}</strong></span>
                            <span>Estado: <strong>{summary.statusLabel}</strong></span>
                            <span>{item.analysis?.segments?.length || 0} segmento(s)</span>
                          </div>
                        )}
                      </div>
                      {item.analysis ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openBatchResultInActiveView(item)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                            Abrir en vista activa
                          </button>
                          <button type="button" onClick={() => generateSpectrogram(summary.segment || batchFeedbackRow(item, summary))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                            Ver espectrograma
                          </button>
                          <button type="button" onClick={() => openFeedbackDraft("uncertain", batchFeedbackRow(item, summary))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                            Feedback
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="p-4 text-sm text-slate-500">Sin resultados de lote todavia.</p>
            )}
          </div>
          <div className="xl:col-span-2">
            <div className="max-h-72 overflow-auto rounded-lg border border-amber-200">
              <div className="border-b border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                Resultados de actividad por lote
              </div>
              {batchActivityResults.length ? (
                batchActivityResults.map((item) => (
                  <div key={`${item.audio_path}-${item.activity?.run_id || item.error}`} className="border-b border-amber-100 p-3 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={item.audio_path}>{item.audio_name || getAudioName(item.audio_path)}</div>
                        <div className="truncate text-xs text-slate-500" title={item.audio_path}>{item.audio_path}</div>
                        {item.error ? (
                          <p className="mt-1 text-xs text-red-700">{item.error}</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                            <span>Segmentos: <strong>{item.activity?.summary?.segments_detected ?? 0}</strong></span>
                            <span>Activo: <strong>{formatNumber(item.activity?.summary?.active_seconds, 1)} s</strong></span>
                            <span>Silencio: <strong>{formatNumber(item.activity?.summary?.silent_seconds, 1)} s</strong></span>
                            <span>Ratio: <strong>{formatNumber((item.activity?.summary?.active_ratio || 0) * 100, 1)}%</strong></span>
                          </div>
                        )}
                      </div>
                      {item.activity ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openBatchActivityInLab(item)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                            Abrir segmentos
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-4 text-sm text-slate-500">Sin detecciones de actividad por lote todavia.</p>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Procesamiento masivo por carpeta local" subtitle="Limpia, segmenta y filtra carpetas grandes sin subir archivos uno por uno">
        <div className="space-y-5">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <p className="font-semibold">Para carpetas grandes, no subas archivos uno por uno. Escribe o pega la ruta local de la carpeta. El backend procesara los audios desde tu computador.</p>
            <p className="mt-1">Los audios originales no se modifican ni se borran. Los derivados y manifests se guardan en backend/storage/audio_lab/folder_batch_jobs.</p>
            {mlStatus.state !== "connected" ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                ML API no disponible; se omitira detector rana/sapo. El procesamiento DSP puede correr igual.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Ruta de carpeta local</span>
                <input
                  value={folderBatchForm.folder_path}
                  onChange={(event) => updateFolderBatchField("folder_path", event.target.value)}
                  placeholder="C:\\Datos\\Ranas\\lote_01"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                <span className="mt-1 block text-xs text-slate-500">La ruta debe existir en este computador. Ejemplo: C:\Datos\Ranas\lote_01.</span>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-semibold text-slate-700">Nombre del job</span>
                  <input value={folderBatchForm.job_name} onChange={(event) => updateFolderBatchField("job_name", event.target.value)} placeholder="boana_lote_mayo_2026" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold text-slate-700">Label objetivo / especie</span>
                  <input value={folderBatchForm.target_label} onChange={(event) => updateFolderBatchField("target_label", event.target.value)} placeholder="Boana_boans" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
              </div>

              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={folderBatchForm.recursive} onChange={(event) => updateFolderBatchField("recursive", event.target.checked)} />
                Buscar en subcarpetas
              </label>

              <div className={`rounded-lg border p-3 text-sm ${folderBatchIsExploratory ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{folderBatchIsExploratory ? "Configuración exploratoria actual" : "Recomendación actual"}</h3>
                    <p className="mt-1">
                      Frecuencia: <strong>{folderBatchForm.frequency_min_hz}-{folderBatchForm.frequency_max_hz} Hz</strong> · Threshold: <strong>{folderBatchForm.threshold_dbfs} dBFS</strong> · Ratio banda: <strong>{folderBatchForm.min_band_ratio}</strong>
                    </p>
                  </div>
                  <Badge tone={folderBatchIsExploratory ? "warning" : "success"}>{folderBatchForm.config_name || folderBatchForm.preset}</Badge>
                </div>
                {folderBatchIsExploratory ? (
                  <div className="mt-3 space-y-2">
                    <p className="font-semibold">Esta configuración es exploratoria. Sirve para encontrar actividad posible, no para procesar toda la carpeta.</p>
                    <p>No usar para entrenamiento ni procesamiento masivo sin revisar.</p>
                    {folderBatchCandidateCount > 0 ? (
                      <p>Hay actividad, pero la configuración es demasiado abierta. Siguiente paso: probar una configuración intermedia.</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {folderBatchHasSafeRecommendation ? (
                    <button type="button" onClick={() => applyFolderBatchConfig(FOLDER_BATCH_SAFE_RECOMMENDED_CONFIG)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                      Usar configuración segura en carpeta
                    </button>
                  ) : (
                    <button type="button" disabled className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-500 opacity-60">
                      Usar configuración segura en carpeta
                    </button>
                  )}
                  {folderBatchIsExploratory ? (
                    <>
                      <button type="button" onClick={() => applyFolderBatchConfig(FOLDER_BATCH_EXPLORATORY_WIDE_CONFIG)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900">
                        Usar exploratoria solo en muestra
                      </button>
                      <button type="button" onClick={() => applyFolderBatchConfig(FOLDER_BATCH_INTERMEDIATE_CONFIG)} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800">
                        Crear configuración intermedia
                      </button>
                    </>
                  ) : null}
                </div>
                {folderBatchBestNextStep === "try_intermediate_config" ? (
                  <p className="mt-2 text-xs font-semibold">best_next_step: try_intermediate_config</p>
                ) : null}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Preset</div>
                <div className="flex flex-wrap gap-2">
                  {["conservador", "normal", "agresivo", "intermedia_exploratoria", "exploratory_wide", "personalizado"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyFolderBatchPreset(preset)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${folderBatchForm.preset === preset ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700"}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-sm font-bold text-slate-800">Comparación de configuraciones</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 uppercase text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Config</th>
                        <th className="px-2 py-2">Tipo</th>
                        <th className="px-2 py-2">Frecuencia</th>
                        <th className="px-2 py-2">Threshold</th>
                        <th className="px-2 py-2">Ratio</th>
                        <th className="px-2 py-2">Recomendación</th>
                        <th className="px-2 py-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {folderBatchComparisonRows.map((row) => (
                        <tr key={row.name} className="border-t border-slate-100">
                          <td className="px-2 py-2 font-semibold">{row.label}</td>
                          <td className="px-2 py-2"><Badge tone={row.tone}>{row.badge}</Badge></td>
                          <td className="px-2 py-2">{row.frequency_min_hz}-{row.frequency_max_hz} Hz</td>
                          <td className="px-2 py-2">{row.threshold_dbfs} dBFS</td>
                          <td className="px-2 py-2">{row.min_band_ratio}</td>
                          <td className="px-2 py-2">{row.recommendationText}</td>
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => useFolderBatchComparisonRow(row)} className="rounded-lg border border-slate-300 px-2 py-1 font-semibold">
                              Usar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["frequency_min_hz", "Frecuencia minima Hz", "10"],
                  ["frequency_max_hz", "Frecuencia maxima Hz", "10"],
                  ["threshold_dbfs", "Threshold dBFS", "1"],
                  ["min_band_ratio", "Ratio minimo energia banda", "0.05"],
                  ["min_activity_seconds", "Min actividad s", "0.1"],
                  ["min_silence_seconds", "Min silencio s", "0.1"],
                  ["padding_seconds", "Padding s", "0.1"],
                  ["clip_duration_seconds", "Duracion clip s", "0.5"],
                  ["max_segment_seconds", "Max segmento s", "0.5"],
                ].map(([key, label, step]) => (
                  <label key={key} className="text-sm">
                    <span className="mb-1 block font-semibold">{label}</span>
                    <input type="number" step={step} value={folderBatchForm[key]} onChange={(event) => updateFolderBatchField(key, Number(event.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                ))}
              </div>

              <div className="grid gap-2 text-sm md:grid-cols-2">
                {[
                  ["bandpass", "Bandpass"],
                  ["noise_reduce", "Reduccion de ruido"],
                  ["normalize", "Normalizar"],
                  ["discard_empty", "Descartar vacios"],
                  ["detect_frog", "Detector rana/sapo si ML API esta disponible"],
                  ["detect_contaminants_heuristic", "Marcar contaminantes heuristico"],
                  ["create_clips", "Crear clips derivados"],
                  ["create_manifest", "Crear manifest CSV"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                    <input type="checkbox" checked={Boolean(folderBatchForm[key])} onChange={(event) => updateFolderBatchField(key, event.target.checked)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Perfil de recursos</span>
                <select value={folderBatchForm.resource_profile} onChange={(event) => updateFolderBatchField("resource_profile", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="auto">auto</option>
                  <option value="eco">eco</option>
                  <option value="balanceado">balanceado</option>
                  <option value="rendimiento">rendimiento</option>
                </select>
              </label>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p><strong>Frecuencia:</strong> si la especie canta entre 2 y 3 kHz, escribe 2000 y 3000 Hz.</p>
                <p className="mt-1"><strong>dBFS:</strong> este valor es nivel digital relativo del archivo; no es dB SPL calibrado.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={scanFolderBatch} disabled={folderBatchScanning} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  <LoadingText loading={folderBatchScanning} loadingText="Escaneando...">Escanear carpeta</LoadingText>
                </button>
                <button type="button" onClick={startFolderBatchJob} disabled={folderBatchSubmitting || !folderBatchScan} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  <LoadingText loading={folderBatchSubmitting} loadingText="Creando job...">Iniciar procesamiento</LoadingText>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {folderBatchScan ? (
                <div className="rounded-lg border border-emerald-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-emerald-950">Resumen de escaneo</h3>
                      <p className="mt-1 max-w-2xl truncate text-xs text-slate-500" title={folderBatchScan.folder_path}>{folderBatchScan.folder_path}</p>
                    </div>
                    <Badge tone="success">{folderBatchScan.files_found || 0} archivos</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                    <span>Tamano: <strong>{formatBytes(folderBatchScan.total_size_bytes)}</strong></span>
                    <span>Duracion est.: <strong>{formatTime(folderBatchScan.estimated_duration_seconds)}</strong></span>
                    <span>Espacio recomendado: <strong>{formatBytes(Number(folderBatchScan.total_size_bytes || 0) * 0.35)}</strong></span>
                    <span>Extensiones: <strong>{Object.keys(folderBatchScan.extensions_count || {}).length}</strong></span>
                  </div>
                  {folderBatchScan.warnings?.length ? (
                    <ul className="mt-3 list-disc pl-5 text-xs text-amber-800">
                      {folderBatchScan.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  ) : null}
                  <div className="mt-3 max-h-28 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
                    {(folderBatchScan.sample_files || []).map((path) => <div key={path} className="truncate" title={path}>{path}</div>)}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Escanea una carpeta para ver archivos encontrados, tamano, duracion estimada y advertencias antes de iniciar.</p>
              )}

              {activeFolderBatchJob ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-blue-950">{activeFolderBatchJob.job_name || activeFolderBatchJob.id}</h3>
                      <p className="text-sm text-blue-900">{activeFolderBatchJob.status} - {activeFolderBatchJob.target_label || "-"}</p>
                      <p className="mt-1 truncate text-xs text-blue-800" title={activeFolderBatchJob.current_file || activeFolderBatchJob.folder_path}>{activeFolderBatchJob.current_file || activeFolderBatchJob.folder_path}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => refreshFolderBatchJob(activeFolderBatchJob.id)} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold">Refrescar</button>
                      <button type="button" onClick={pauseFolderBatchJob} disabled={activeFolderBatchJob.status !== "running"} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">Pausar</button>
                      <button type="button" onClick={resumeFolderBatchJob} disabled={activeFolderBatchJob.status !== "paused"} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">Reanudar</button>
                      <button type="button" onClick={cancelFolderBatchJob} disabled={!["pending", "running", "paused"].includes(activeFolderBatchJob.status)} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Cancelar</button>
                    </div>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                    <div className="h-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, folderBatchProgress))}%` }} />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-blue-950 sm:grid-cols-4">
                    <span>Archivos: <strong>{activeFolderBatchJob.processed_files || 0}/{activeFolderBatchJob.total_files || 0}</strong></span>
                    <span>Candidatos: <strong>{activeFolderBatchJob.candidates_count || 0}</strong></span>
                    <span>Descartados: <strong>{activeFolderBatchJob.discarded_count || 0}</strong></span>
                    <span>Errores: <strong>{activeFolderBatchJob.errors_count || 0}</strong></span>
                    <span>Contaminantes: <strong>{activeFolderBatchJob.contaminant_suspect_count || 0}</strong></span>
                    <span>Rana/sapo ML: <strong>{activeFolderBatchJob.frog_positive_count || 0}</strong></span>
                    <span>Duracion proc.: <strong>{formatTime(activeFolderBatchJob.processed_duration_seconds)}</strong></span>
                    <span>Progreso: <strong>{folderBatchProgress}%</strong></span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setFolderBatchLogs((current) => current || "")} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold">Ver logs</button>
                    <button type="button" onClick={openFolderBatchManifest} disabled={!activeFolderBatchJob.manifest_path} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Exportar manifest</button>
                    <button type="button" onClick={() => copyTextToClipboard(activeFolderBatchJob.output_dir, "Ruta de outputs copiada.")} disabled={!activeFolderBatchJob.output_dir} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Abrir carpeta de outputs</button>
                  </div>
                  {folderBatchLogs ? <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{folderBatchLogs}</pre> : null}
                </div>
              ) : (
                <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Inicia un job o selecciona uno del historial para ver progreso, logs y resultados.</p>
              )}

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Buscar job/audio
                    <input type="search" value={folderBatchSearch} onChange={(event) => setFolderBatchSearch(event.target.value)} placeholder="Nombre, ruta, id..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Estado
                    <select value={folderBatchStatusFilter} onChange={(event) => setFolderBatchStatusFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                      <option value="">Todos</option>
                      {["pending", "running", "paused", "completed", "failed", "cancelled"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 max-h-44 overflow-auto rounded-lg border border-slate-200">
                  {filteredFolderBatchJobs.length ? (
                    filteredFolderBatchJobs.map((job) => (
                      <button key={job.id} type="button" onClick={() => refreshFolderBatchJob(job.id)} className="block w-full border-b border-slate-100 p-3 text-left text-sm last:border-b-0 hover:bg-slate-50">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{job.job_name || job.id}</strong>
                          <Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : job.status === "cancelled" ? "warning" : "info"}>{job.status}</Badge>
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500" title={job.folder_path}>{job.target_label || "-"} - {job.folder_path}</div>
                      </button>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-slate-500">{folderBatchJobs.length ? "No hay jobs que coincidan con los filtros." : "Sin jobs de carpeta local."}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {activeFolderBatchJob ? (
            <div className="space-y-3">
              <div className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-4">
                <label className="text-xs font-semibold text-slate-600">
                  Resultados
                  <select value={folderBatchOutputFilter} onChange={(event) => setFolderBatchOutputFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                    <option value="candidates">Solo candidatos</option>
                    <option value="excluded">Solo excluidos</option>
                    <option value="contaminants">Solo contaminantes</option>
                    <option value="errors">Solo errores</option>
                    <option value="review">Enviar/revisar</option>
                    <option value="all">Todos</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Score minimo
                  <input type="number" step="0.05" value={folderBatchMinScore} onChange={(event) => setFolderBatchMinScore(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Ratio banda minimo
                  <input type="number" step="0.05" value={folderBatchMinRatio} onChange={(event) => setFolderBatchMinRatio(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <div className="text-xs text-slate-600">
                  <span className="block font-semibold">Summary</span>
                  <span>{folderBatchSummary?.summary?.candidates || activeFolderBatchJob.candidates_count || 0} candidatos, {folderBatchSummary?.summary?.contaminants || activeFolderBatchJob.contaminant_suspect_count || 0} sospechosos</span>
                </div>
              </div>

              <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Audio original</th>
                      <th className="px-3 py-2">Segmento</th>
                      <th className="px-3 py-2">Score</th>
                      <th className="px-3 py-2">Ratio banda</th>
                      <th className="px-3 py-2">RMS dBFS</th>
                      <th className="px-3 py-2">Flags</th>
                      <th className="px-3 py-2">Recomendacion</th>
                      <th className="px-3 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFolderBatchOutputs.length ? (
                      filteredFolderBatchOutputs.map((output) => (
                        <tr key={output.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <div className="max-w-56 truncate font-semibold" title={output.original_audio_path}>{getAudioName(output.original_audio_path)}</div>
                            <div className="max-w-56 truncate text-xs text-slate-500" title={output.original_audio_path}>{output.original_audio_path}</div>
                          </td>
                          <td className="px-3 py-2">{formatTime(output.start_seconds)} - {formatTime(output.end_seconds)}<div className="text-xs text-slate-500">{formatNumber(output.duration_seconds, 1)} s</div></td>
                          <td className="px-3 py-2">{formatNumber(output.activity_score, 3)}</td>
                          <td className="px-3 py-2">{formatNumber(output.band_energy_ratio, 3)}</td>
                          <td className="px-3 py-2">{formatNumber(output.rms_dbfs, 1)}</td>
                          <td className="px-3 py-2"><div className="max-w-48 truncate text-xs" title={output.contaminant_flags_json || ""}>{output.contaminant_flags_json || "[]"}</div></td>
                          <td className="px-3 py-2"><Badge tone={output.recommendation === "candidate" ? "success" : output.recommendation === "error" ? "danger" : "warning"}>{output.recommendation || "review"}</Badge></td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button type="button" disabled={!output.output_audio_path} onClick={() => { openFolderBatchOutputInLab(output); window.setTimeout(() => audioRef.current?.play(), 150); }} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Reproducir</button>
                              <button type="button" disabled={!output.output_audio_path} onClick={() => generateSpectrogram({ audio_path: output.output_audio_path, start_seconds: 0, end_seconds: undefined })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Espectrograma</button>
                              <button type="button" disabled={!output.quality_report_path} onClick={() => fetch(getMediaFileUrl(output.quality_report_path)).then((response) => response.json()).then(setQualityReport).catch(() => setError("No se pudo abrir reporte de calidad."))} className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 disabled:opacity-50">Reporte calidad</button>
                              <button type="button" onClick={() => openFolderBatchFeedback(output, "confirmed_positive")} className="rounded-lg border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-800">Confirmar</button>
                              <button type="button" onClick={() => openFolderBatchFeedback(output, "excluded_from_training", "ruido")} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Excluir</button>
                              <button type="button" onClick={() => openFolderBatchFeedback(output, "excluded_from_training", "voz_humana")} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Voz humana</button>
                              <button type="button" onClick={() => openFolderBatchFeedback(output, "excluded_from_training", "ruido")} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Carro/motor</button>
                              <button type="button" onClick={() => openFolderBatchFeedback(output, "excluded_from_training", "otro")} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Ave</button>
                              <button type="button" onClick={() => openFolderBatchFeedback(output, "uncertain")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Enviar a revisar</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="px-3 py-8 text-center text-slate-500">Sin resultados con estos filtros todavia.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Procesamiento por lote" subtitle="Limpia clips existentes o prepara audios crudos sin modificar originales">
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setBatchProcessingModeValue("clean_existing")}
              className={`rounded-lg border p-4 text-left ${batchProcessingMode === "clean_existing" ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
            >
              <div className="font-bold text-slate-900">Solo limpiar lote existente</div>
              <p className="mt-1 text-sm text-slate-600">Para recortes o audios cortos ya preparados. No detecta actividad ni corta segmentos.</p>
            </button>
            <button
              type="button"
              onClick={() => setBatchProcessingModeValue("full_auto")}
              className={`rounded-lg border p-4 text-left ${batchProcessingMode === "full_auto" ? "border-amber-500 bg-amber-50" : "border-slate-200 bg-white"}`}
            >
              <div className="font-bold text-slate-900">Procesamiento completo automatico</div>
              <p className="mt-1 text-sm text-slate-600">Para audios crudos/largos: detecta actividad, crea segmentos, limpia y analiza con detector rana/sapo.</p>
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {batchProcessingItems.length ? (
              <p><strong>{batchProcessingItems.length}</strong> audio(s) listos para procesar.</p>
            ) : (
              <p>No hay audios en el lote. Selecciona audios con el checkbox LOTE, sube archivos, pega rutas o agrega el audio activo.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge tone={batchProcessingSourceCounts.dataset ? "info" : "default"}>Dataset: {batchProcessingSourceCounts.dataset}</Badge>
              <Badge tone={batchProcessingSourceCounts.upload ? "info" : "default"}>Uploads: {batchProcessingSourceCounts.upload}</Badge>
              <Badge tone={batchProcessingSourceCounts.manual ? "info" : "default"}>Rutas manuales: {batchProcessingSourceCounts.manual}</Badge>
              <Badge tone={batchProcessingSourceCounts.local ? "info" : "default"}>Rutas locales: {batchProcessingSourceCounts.local}</Badge>
            </div>
          </div>

          {activeAudioMissingFromBatch ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <span>Tienes un audio abierto, pero aun no esta agregado al lote.</span>
              <button type="button" onClick={addCurrentAudioToBatchProcessing} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white">
                Agregar audio actual
              </button>
            </div>
          ) : null}

          {batchProcessingHelp ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{batchProcessingHelp}</p>
          ) : null}

          {batchProcessingJobAllowedRoots.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="font-semibold">Carpetas autorizadas solo para este job</div>
              {batchProcessingJobAllowedRoots.map((root) => (
                <div key={root} className="mt-1 flex items-center justify-between gap-3">
                  <span className="truncate font-mono" title={root}>{root}</span>
                  <button type="button" onClick={() => setBatchProcessingJobAllowedRoots((current) => current.filter((item) => item !== root))} className="rounded border border-amber-300 bg-white px-2 py-1 font-semibold">
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-bold text-slate-900">Agregar al lote</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={addCurrentAudioToBatchProcessing} disabled={!hasActiveAudioForBatch} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Agregar audio actual al lote
                </button>
                <button type="button" onClick={addManualRoutesToBatchProcessing} disabled={!batchPaths.trim()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                  Agregar rutas al lote
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Los uploads multiples se agregan automaticamente a esta cola y se pueden quitar aqui.</p>
            </div>

            <div className="rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 p-3 text-sm font-bold text-slate-900">
                Audios listos para procesamiento
              </div>
              {batchProcessingItems.length ? (
                <div className="max-h-56 overflow-auto">
                  {batchProcessingItems.map((item) => (
                    <div key={`${item.source_kind}:${item.output_path}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 text-sm last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold" title={item.label || getAudioName(item.output_path)}>{item.label || getAudioName(item.output_path)}</div>
                        <div className="mt-1 grid gap-1 text-xs text-slate-600 md:grid-cols-2">
                          <div className="min-w-0">
                            <span className="font-semibold">Origen:</span> {item.source_kind}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold">Duracion:</span> {item.duration_seconds ? `${formatNumber(item.duration_seconds, 1)} s` : "-"}
                          </div>
                          <div className="min-w-0 md:col-span-2">
                            <span className="font-semibold">Ruta original:</span>{" "}
                            <span className="break-all font-mono">{item.original_audio_path || item.output_path}</span>
                          </div>
                          <div className="min-w-0 md:col-span-2">
                            <span className="font-semibold">Ruta usada para procesamiento:</span>{" "}
                            <span className="break-all font-mono">{item.processing_path || item.output_path}</span>
                          </div>
                          {item.internal_copy_path ? (
                            <div className="min-w-0 md:col-span-2">
                              <span className="font-semibold">Copia interna:</span>{" "}
                              <span className="break-all font-mono">{item.internal_copy_path}</span>
                            </div>
                          ) : null}
                          <div className="min-w-0 md:col-span-2">
                            <span className="font-semibold">Estado autorizacion:</span> {batchAuthorizationStatus(item)}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                          <details>
                            <summary className="cursor-pointer font-semibold text-slate-700">Detalles</summary>
                            <pre className="mt-2 max-w-full overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-100">{JSON.stringify(item, null, 2)}</pre>
                          </details>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeBatchProcessingItem(item)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700">
                        Quitar
                      </button>
                      <button type="button" onClick={() => authorizeBatchRootForPath(item)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                        Autorizar carpeta para este job
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-sm text-slate-500">La cola esta vacia.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Nombre del job</span>
                <input value={batchProcessingJobName} onChange={(event) => setBatchProcessingJobName(event.target.value)} placeholder="lote_raspberry_mayo_2026" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Preset</div>
                <div className="flex flex-wrap gap-2">
                  {["conservador", "normal", "agresivo", "personalizado"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyBatchProcessingPreset(preset)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${batchProcessingPreset === preset ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700"}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                {batchProcessingPreset === "agresivo" ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    Agresivo puede borrar informacion util de llamadas suaves.
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Pasos del pipeline</div>
                <div className="grid gap-2 text-sm">
                  {[
                    ["detect_activity", "Detectar actividad"],
                    ["create_segments", "Crear segmentos"],
                    ["discard_empty_segments", "Descartar vacios"],
                    ["denoise", "Reducir ruido"],
                    ["normalize", "Normalizar"],
                    ["bandpass", "Bandpass"],
                    ["run_frog_detector", "Analizar con detector rana/sapo"],
                  ].map(([key, label]) => {
                    const disabled = batchProcessingMode === "clean_existing" && ["detect_activity", "create_segments", "discard_empty_segments"].includes(key);
                    return (
                      <label key={key} className={`flex items-center gap-2 rounded-lg border border-slate-200 p-2 ${disabled ? "bg-slate-100 text-slate-400" : "bg-white"}`}>
                        <input type="checkbox" checked={Boolean(batchProcessingSteps[key])} disabled={disabled} onChange={() => toggleBatchProcessingStep(key)} />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button type="button" onClick={() => setBatchProcessingAdvancedOpen((value) => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                {batchProcessingAdvancedOpen ? "Ocultar parametros avanzados" : "Parametros avanzados"}
              </button>
              {batchProcessingAdvancedOpen ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["threshold_db", "threshold dB", "1"],
                    ["min_activity_seconds", "min actividad s", "0.1"],
                    ["min_silence_seconds", "min silencio s", "0.1"],
                    ["padding_seconds", "padding s", "0.1"],
                    ["frequency_min_hz", "frecuencia min Hz", "10"],
                    ["frequency_max_hz", "frecuencia max Hz", "10"],
                    ["prop_decrease", "prop decrease", "0.05"],
                    ["detector_threshold", "detector threshold", "0.01"],
                    ["clip_duration", "clip duration", "1"],
                  ].map(([key, label, step]) => (
                    <label key={key} className="text-sm">
                      <span className="mb-1 block font-semibold">{label}</span>
                      <input type="number" step={step} value={batchProcessingParams[key]} onChange={(event) => setBatchProcessingParams((current) => ({ ...current, [key]: Number(event.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={startBatchProcessingJob} disabled={batchProcessingSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  <LoadingText loading={batchProcessingSubmitting} loadingText="Creando job...">Iniciar procesamiento</LoadingText>
                </button>
                <button type="button" onClick={loadBatchProcessingJobs} title="Actualiza la lista de jobs, logs y resultados desde el backend." className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
                  Refrescar jobs
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {activeBatchProcessingJob ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-blue-950">{activeBatchProcessingJob.job_name || activeBatchProcessingJob.id}</h3>
                      <p className="text-sm text-blue-900">{activeBatchProcessingJob.mode} · {activeBatchProcessingJob.status} · {activeBatchProcessingJob.phase || "-"}</p>
                      <p className="mt-1 truncate text-xs text-blue-800" title={activeBatchProcessingJob.current_file || ""}>{activeBatchProcessingJob.current_file || "Sin archivo activo"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => refreshBatchProcessingJob(activeBatchProcessingJob.id)} title="Actualiza la lista de jobs, logs y resultados desde el backend." className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold">Refrescar</button>
                      <button type="button" onClick={cancelBatchProcessingJob} disabled={!["queued", "running"].includes(activeBatchProcessingJob.status)} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Cancelar</button>
                    </div>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                    <div className="h-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, Number(activeBatchProcessingJob.progress || 0)))}%` }} />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-blue-950 sm:grid-cols-4">
                    <span>Audios: <strong>{activeBatchProcessingJob.summary?.audios_processed || 0}</strong></span>
                    <span>Segmentos: <strong>{activeBatchProcessingJob.summary?.segments_created || 0}</strong></span>
                    <span>Probable rana: <strong>{activeBatchProcessingJob.summary?.probable_rana || 0}</strong></span>
                    <span>Errores: <strong>{activeBatchProcessingJob.summary?.errors || 0}</strong></span>
                  </div>
                  {batchProcessingLogs ? (
                    <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{batchProcessingLogs}</pre>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Selecciona un job existente o inicia uno nuevo.</p>
              )}

              <div className="grid gap-2 rounded-lg border border-slate-200 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Buscar job/audio
                    <input type="search" value={batchJobSearch} onChange={(event) => setBatchJobSearch(event.target.value)} placeholder="Nombre, id, archivo..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Fecha
                    <input type="date" value={batchJobDateFilter} onChange={(event) => setBatchJobDateFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                  </label>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="text-xs font-semibold text-slate-600">
                    Estado
                    <select value={batchJobStatusFilter} onChange={(event) => setBatchJobStatusFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                      <option value="">Todos</option>
                      {["queued", "running", "completed", "failed", "canceled"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Modo
                    <select value={batchJobModeFilter} onChange={(event) => setBatchJobModeFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                      <option value="">Todos</option>
                      <option value="clean_existing">Solo limpiar lote existente</option>
                      <option value="full_auto">Procesamiento completo automatico</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Filtro rapido
                    <select value={batchJobFlagFilter} onChange={(event) => setBatchJobFlagFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                      <option value="">Todos</option>
                      <option value="errors">Con errores</option>
                      <option value="probable_rana">Probable rana</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
                {filteredBatchProcessingJobs.length ? (
                  filteredBatchProcessingJobs.map((job) => (
                    <button key={job.id} type="button" onClick={() => refreshBatchProcessingJob(job.id)} className="block w-full border-b border-slate-100 p-3 text-left text-sm last:border-b-0 hover:bg-slate-50">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{job.job_name || job.id}</strong>
                        <Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : job.status === "canceled" ? "warning" : "info"}>{job.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{job.mode} · {formatNumber(job.progress || 0, 0)}% · {job.created_at}</div>
                    </button>
                  ))
                ) : (
                  <p className="p-4 text-sm text-slate-500">{batchProcessingJobs.length ? "No hay jobs que coincidan con los filtros." : "Sin jobs registrados."}</p>
                )}
              </div>
            </div>
          </div>

          {activeBatchProcessingJob?.outputs?.length ? (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button type="button" onClick={exportBatchOutputsCsv} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Exportar outputs CSV</button>
              </div>
            <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Original</th>
                    <th className="px-3 py-2">Segmento</th>
                    <th className="px-3 py-2">Procesado</th>
                    <th className="px-3 py-2">Prediccion</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Accion</th>
                    <th className="px-3 py-2">Calidad</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBatchProcessingJob.outputs.map((output) => {
                    const playablePath = output.processed_audio_path || output.segment_audio_path;
                    return (
                      <tr key={output.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="max-w-56 truncate font-semibold" title={output.source_audio_path}>{output.display_name || output.source_audio_name || getAudioName(output.source_audio_path)}</div>
                          <div className="text-xs text-slate-500">origen: {output.source_origin || "batch"}</div>
                        </td>
                        <td className="px-3 py-2">{output.segment_start_seconds !== null && output.segment_start_seconds !== undefined ? `${formatTime(output.segment_start_seconds)} - ${formatTime(output.segment_end_seconds)}` : "audio completo"}</td>
                        <td className="px-3 py-2">
                          <div className="max-w-56 truncate font-semibold" title={playablePath || ""}>{output.display_label || output.display_name || output.processed_audio_name || (playablePath ? getAudioName(playablePath) : "-")}</div>
                          <div className="text-xs text-slate-500">{output.processing_label || [output.processing_preset, output.processing_method].filter(Boolean).join(" · ") || "-"}</div>
                        </td>
                        <td className="px-3 py-2">{output.frog_detector_prediction || "-"}</td>
                        <td className="px-3 py-2">{formatNumber(output.frog_detector_score, 3)}</td>
                        <td className="px-3 py-2"><Badge tone={output.recommended_action === "probable_rana" ? "success" : output.recommended_action === "error" ? "danger" : output.recommended_action === "revisar" ? "warning" : "default"}>{output.recommended_action || "requires_review"}</Badge></td>
                        <td className="px-3 py-2">
                          <Badge tone={output.quality_report_label === "bueno_para_revision" ? "success" : output.quality_report_label === "mejora_ligera" ? "warning" : output.quality_report_label ? "danger" : "default"}>
                            {output.quality_report_label ? qualityLabelText(output.quality_report_label) : "Sin reporte"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={!playablePath} onClick={() => { openBatchOutputInLab(output); window.setTimeout(() => audioRef.current?.play(), 150); }} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Reproducir</button>
                            <button type="button" disabled={!playablePath} onClick={() => openBatchOutputInLab(output)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Abrir</button>
                            <button type="button" disabled={!playablePath} onClick={() => generateSpectrogram({ audio_path: playablePath, start_seconds: 0, end_seconds: undefined })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Espectrograma</button>
                            <button type="button" disabled={!playablePath || !mlStatus.connected} onClick={() => analyzeBatchOutput(output)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-50">Analizar</button>
                            <button type="button" onClick={() => setBatchOutputDetails(output)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Detalles</button>
                            {output.quality_report_path ? (
                              <button type="button" disabled={Boolean(qualityReportLoading)} onClick={() => openExistingQualityReport(output)} className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 disabled:opacity-50">
                                {qualityReportLoading === output.id ? "Abriendo..." : "Ver reporte"}
                              </button>
                            ) : null}
                            <button type="button" disabled={!output.processed_audio_path || Boolean(qualityReportLoading)} onClick={() => generateQualityReportForOutput(output)} className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 disabled:opacity-50">
                              {qualityReportLoading === output.id ? "Generando reporte..." : output.quality_report_path ? "Regenerar reporte" : "Reporte de calidad"}
                            </button>
                            <button type="button" onClick={() => openFeedbackDraft("uncertain", feedbackRowFromBatchOutput(output))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Feedback</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Reproductor avanzado" subtitle={selectedAudio ? selectedAudio.title : "Selecciona un audio para empezar"}>
        {selectedAudio ? (
          <div className="space-y-5">
            <audio
              ref={audioRef}
              src={selectedAudio.audioUrl}
              preload="metadata"
              onLoadedMetadata={handleAudioLoaded}
              onTimeUpdate={handleTimeUpdate}
              onError={() => {
                setSelectedAudio((current) => current ? { ...current, isValid: false, loadError: "No se pudo reproducir el audio." } : current);
                setError("No se pudo reproducir el audio. El archivo puede no existir, estar fuera de las carpetas permitidas del backend o tener un formato no soportado por el navegador. Usa Diagnosticar ruta para revisar la configuracion.");
              }}
              className="hidden"
            />
            {selectedAudio.loadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {selectedAudio.loadError} El audio actual no se agregara al lote hasta que vuelva a cargar correctamente.
              </div>
            ) : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="flex flex-wrap gap-2">
                <Badge tone="info">Origen: {selectedAudio.originLabel || audioOriginLabel(selectedAudio.kind)}</Badge>
                {selectedAudio.internalCopyPath ? <Badge>copia temporal segura</Badge> : null}
              </div>
              <div className="mt-2 grid gap-1">
                <div><strong>Ruta original:</strong> <span className="break-all font-mono">{selectedAudio.originalAudioPath || selectedAudio.audioPath || selectedAudio.title}</span></div>
                <div><strong>Ruta usada para reproducir/procesar:</strong> <span className="break-all font-mono">{selectedAudio.processingPath || selectedAudio.audioPath || selectedAudio.audioUrl}</span></div>
                {selectedAudio.internalCopyPath ? <div><strong>Copia interna:</strong> <span className="break-all font-mono">{selectedAudio.internalCopyPath}</span></div> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => audioRef.current?.play()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                Play
              </button>
              <button type="button" onClick={() => audioRef.current?.pause()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
                Pause
              </button>
              <button type="button" onClick={() => seek(0)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Inicio
              </button>
              <button type="button" onClick={() => seek(duration)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Fin
              </button>
              <span className="px-2 text-sm font-semibold text-slate-700">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.05"
              value={currentTime}
              onChange={(event) => seek(Number(event.target.value))}
              className="w-full"
            />
            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Volumen</span>
                <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-full" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Velocidad</span>
                <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={1.5}>1.5x</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Zoom waveform</span>
                <input type="range" min="1" max="5" step="0.25" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-full" />
              </label>
              <label className="flex items-end gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={loopSelection} onChange={(event) => setLoopSelection(event.target.checked)} />
                Loop de seleccion
              </label>
            </div>
            <WaveformCanvas
              audioUrl={selectedAudio.audioUrl}
              audioPath={selectedAudio.audioPath}
              duration={duration}
              currentTime={currentTime}
              selection={selection}
              detections={detectionSegments}
              activitySegments={activitySegments}
              threshold={threshold}
              zoom={zoom}
              onSelectionChange={setSelection}
              onSeek={seek}
              onDetectionClick={playResultRow}
              onActivitySegmentClick={selectActivitySegment}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={selectedRange ? "info" : "default"}>
                {selectedRange
                  ? `${formatTime(selectedRange.start)} - ${formatTime(selectedRange.end)} (${formatNumber(selectedRange.end - selectedRange.start, 1)} s)`
                  : "Sin seleccion"}
              </Badge>
              <button type="button" disabled={!selectedRange} onClick={() => playRange(selectedRange.start, selectedRange.end)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                Reproducir seleccion
              </button>
              <button type="button" disabled={!selectedRange} onClick={() => analyze("selection")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Analizar seleccion
              </button>
              <button type="button" disabled={!selectedRange} onClick={openClipDraft} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50">
                Crear recorte
              </button>
              <button type="button" disabled={!selectedAudio || activityRunning} onClick={() => setActivityPanelOpen(true)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50">
                Detectar actividad
              </button>
              <button type="button" onClick={() => setSelection(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                Limpiar seleccion
              </button>
              <button type="button" onClick={() => copyTextToClipboard(selectedAudio.audioPath, "Ruta de audio copiada.")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                Copiar ruta
              </button>
              <button type="button" onClick={() => diagnoseAudioPath(selectedAudio.audioPath)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                Diagnosticar ruta
              </button>
            </div>
          </div>
        ) : (
          <p className="py-8 text-sm text-slate-500">Abre un audio del selector para activar reproductor, waveform y analisis.</p>
        )}
      </SectionCard>

      {activityPanelOpen ? (
        <SectionCard title="Segmentar audio / detectar silencios" subtitle="Detecta actividad acustica server-side y crea recortes derivados trazables">
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Esto no modifica el audio original. Solo detecta zonas con actividad y permite crear recortes derivados.</p>
              <p className="mt-1">Si el audio viene de otra grabadora y detecta demasiado o muy poco, ajusta sensibilidad o threshold dB.</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(ACTIVITY_PRESETS).map(([presetId, preset]) => (
                  <button
                    key={presetId}
                    type="button"
                    onClick={() => applyActivityPreset(presetId)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      activityPreset === presetId
                        ? "border-amber-500 bg-amber-100 text-amber-950"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setActivityAdvancedOpen((value) => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                  {activityAdvancedOpen ? "Ocultar avanzado" : "Modo avanzado"}
                </button>
                <button type="button" onClick={runActivityDetection} disabled={!selectedAudio?.audioPath || activityRunning} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  <LoadingText loading={activityRunning} loadingText="Detectando...">Detectar actividad</LoadingText>
                </button>
              </div>
            </div>

            {activityAdvancedOpen ? (
              <div className="grid gap-3 md:grid-cols-4">
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Metodo</span>
                  <select value={activityParams.method} onChange={(event) => updateActivityParam("method", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    <option value="energy">energy</option>
                    <option value="band_energy">band_energy</option>
                  </select>
                </label>
                {[
                  ["threshold_db", "Threshold dB", "-1"],
                  ["min_activity_seconds", "Min actividad s", "0.1"],
                  ["min_silence_seconds", "Min silencio s", "0.1"],
                  ["padding_seconds", "Padding s", "0.1"],
                  ["window_seconds", "Ventana s", "0.005"],
                  ["hop_seconds", "Hop s", "0.005"],
                  ["frequency_min_hz", "Frecuencia min Hz", "10"],
                  ["frequency_max_hz", "Frecuencia max Hz", "10"],
                  ["merge_gap_seconds", "Unir gaps s", "0.1"],
                  ["max_segment_seconds", "Max segmento s", "0.5"],
                ].map(([key, label, step]) => (
                  <label key={key} className="text-sm">
                    <span className="mb-1 block font-semibold">{label}</span>
                    <input type="number" step={step} value={activityParams[key]} onChange={(event) => updateActivityParam(key, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                ))}
                <label className="flex items-end gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={activityParams.normalize} onChange={(event) => updateActivityParam("normalize", event.target.checked)} />
                  Normalizar para deteccion
                </label>
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p><strong>Guia rapida:</strong> si detecta demasiado ruido, sube threshold_db o usa Conservador. Si no detecta llamadas suaves, baja threshold_db o usa Muy sensible. Si corta llamadas, aumenta padding_seconds. Si une demasiados eventos, baja merge_gap_seconds. Si divide demasiado, sube merge_gap_seconds.</p>
            </div>

            {activityRun ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Duracion total</div><strong>{formatNumber(activityRun.duration_seconds, 1)} s</strong></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Segmentos</div><strong>{activityRun.summary?.segments_detected ?? 0}</strong></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Activos</div><strong>{formatNumber(activityRun.summary?.active_seconds, 1)} s</strong></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Silenciosos</div><strong>{formatNumber(activityRun.summary?.silent_seconds, 1)} s</strong></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Activo</div><strong>{formatNumber((activityRun.summary?.active_ratio || 0) * 100, 1)}%</strong></div>
                </div>

                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold">Nombre prefijo</span>
                    <input value={activityClipPrefix} onChange={(event) => setActivityClipPrefix(event.target.value)} className="w-72 max-w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold">Proposito</span>
                    <select value={activityClipPurpose} onChange={(event) => setActivityClipPurpose(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">
                      <option value="revision">revision</option>
                      <option value="analisis_lote">analisis_lote</option>
                      <option value="clasificador_especializado">clasificador_especializado</option>
                    </select>
                  </label>
                  <button type="button" onClick={createSelectedActivityClips} disabled={!selectedActivitySegments.length || activityClipSaving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    <LoadingText loading={activityClipSaving} loadingText="Creando recortes...">Crear recortes de segmentos seleccionados</LoadingText>
                  </button>
                  <span className="text-sm text-slate-600">{selectedActivitySegments.length} seleccionado(s), {formatNumber(selectedActivitySegments.reduce((sum, segment) => sum + Number(segment.duration_seconds || 0), 0), 1)} s</span>
                </div>

                <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Sel</th>
                        <th className="px-3 py-2">Segmento</th>
                        <th className="px-3 py-2">Start</th>
                        <th className="px-3 py-2">End</th>
                        <th className="px-3 py-2">Duracion</th>
                        <th className="px-3 py-2">Peak dB</th>
                        <th className="px-3 py-2">Mean dB</th>
                        <th className="px-3 py-2">Score</th>
                        <th className="px-3 py-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activitySegments.map((segment) => (
                        <tr key={segment.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={selectedActivityIds.includes(segment.id)} onChange={() => toggleActivitySegment(segment.id)} />
                          </td>
                          <td className="px-3 py-2 font-semibold">{segment.id}</td>
                          <td className="px-3 py-2">{formatTime(segment.start_seconds)}</td>
                          <td className="px-3 py-2">{formatTime(segment.end_seconds)}</td>
                          <td className="px-3 py-2">{formatNumber(segment.duration_seconds, 1)} s</td>
                          <td className="px-3 py-2">{formatNumber(segment.peak_db, 1)}</td>
                          <td className="px-3 py-2">{formatNumber(segment.mean_db, 1)}</td>
                          <td className="px-3 py-2">{formatNumber(segment.score, 2)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => playActivitySegment(segment)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Reproducir</button>
                              <button type="button" onClick={() => generateSpectrogram({ ...segment, audio_path: selectedAudio.audioPath })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Espectrograma</button>
                              <button type="button" onClick={() => analyzeActivitySegment(segment)} disabled={analyzing || !mlStatus.connected} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-50">Analizar</button>
                              <button type="button" onClick={() => openActivitySegmentClipDraft(segment)} className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">Crear recorte</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {lastActivityClipBatch?.clips?.length ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="font-semibold">{lastActivityClipBatch.clips.length} recorte(s) creados en {lastActivityClipBatch.output_dir}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openClipInLab(lastActivityClipBatch.clips[0])} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold">Abrir primer recorte</button>
                      <button type="button" onClick={() => analyzeActivityClipBatch(lastActivityClipBatch.clips)} disabled={!mlStatus.connected || analyzing} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Analizar recortes en lote</button>
                      <button type="button" onClick={() => document.getElementById("audio-lab-clip-history")?.scrollIntoView({ behavior: "smooth" })} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold">Ver historial de recortes</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Sin deteccion ejecutada todavia.</p>
            )}
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="Espectrograma" subtitle="Genera una imagen bajo demanda del audio completo, seleccion o segmento detectado">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!selectedAudio || spectrogramLoading} onClick={() => generateSpectrogram()} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {spectrogramLoading ? "Generando..." : spectrogramUrl ? "Regenerar" : "Generar espectrograma"}
              </button>
              {spectrogramUrl ? (
                <a href={spectrogramUrl} download="espectrograma_acusticafauna.png" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                  Descargar PNG
                </a>
              ) : null}
            </div>
            <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
              {spectrogramUrl ? (
                <img src={spectrogramUrl} alt="Espectrograma generado" className="h-auto w-full" />
              ) : (
                <span className="px-6 text-center text-sm text-slate-300">
                  {spectrogramLoading ? "Generando espectrograma..." : "Sin espectrograma generado."}
                </span>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={selectedModelIsSpecialized ? "Clasificador especializado" : "Detector rana/sapo"}
          subtitle="Analiza audio completo o seleccion con el modelo activo"
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Threshold recomendado</span>
                <input type="number" min="0" max="1" step="0.01" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Clip duration</span>
                <input type="number" min="1" step="1" value={clipDuration} onChange={(event) => setClipDuration(Number(event.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Modelo</span>
                <input value={getModelId(selectedModel) || DEFAULT_GENERAL_MODEL_ID} readOnly className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              </label>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {selectedModelIsSpecialized ? (
                <div className="space-y-2">
                  <p className="font-semibold">Modelo especializado experimental; usa regla calibrada, no argmax simple.</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedModelClasses.map((label) => (
                      <Badge key={label} tone="info">{label}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600">Regla: {describeDecisionRule(selectedModel?.decision_rule)}</p>
                </div>
              ) : (
                <p>Este modelo detecta presencia probable de rana/sapo. No identifica especie todavia.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!selectedAudio || analyzing || !mlStatus.connected} onClick={() => analyze("full")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {analyzing ? "Analizando..." : "Analizar con modelo"}
              </button>
              <button type="button" disabled={!selectedAudio || !selectedRange || analyzing || !mlStatus.connected} onClick={() => analyze("selection")} className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">
                Analizar seleccion
              </button>
              <button type="button" disabled={!activeTableRows.length} onClick={exportCsv} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
                Exportar resultados CSV
              </button>
            </div>
            {hasMixedActiveResults ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p className="font-semibold">Hay resultados de audios diferentes mezclados. Se limpiara la vista activa para evitar feedback incorrecto.</p>
                <button type="button" onClick={() => setPrediction(null)} className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white">
                  Limpiar resultados activos
                </button>
              </div>
            ) : null}
            {summary && !hasMixedActiveResults ? (
              selectedModelIsSpecialized ? (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Prediccion final</div>
                      <strong>{representativeSegment?.predicted_label || summary.top_label || "-"}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Argmax crudo</div>
                      <strong>{representativeSegment?.raw_argmax_label || "-"}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Regla aplicada</div>
                      <strong>{representativeSegment?.decision_rule_applied || prediction?.decision_rule_applied ? "Si" : "No"}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Score usado</div>
                      <strong>{formatNumber(ruleScoreForSegment(representativeSegment, selectedModel))}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Threshold</div>
                      <strong>{formatNumber(prediction?.threshold ?? threshold, 2)}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Confianza operacional</div>
                      <strong>{operationalConfidenceLabel(representativeSegment, selectedModel)}</strong>
                    </div>
                  </div>
                  {didRuleChangeArgmax(representativeSegment) ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                      La regla calibrada cambio la prediccion del argmax. Revisar si es un caso sensible.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Detectado</div>
                    <strong>{summary.detected ? "Si" : "No"}</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Grupo detectado</div>
                    <strong>{summary.detected ? "rana_sapo" : "no_rana_sapo"}</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Score maximo</div>
                    <strong>{formatNumber(summary.max_score_rana_sapo)}</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Segmentos detectados</div>
                    <strong>{summary.detected_segments}</strong>
                  </div>
                </div>
              )
            ) : null}
            {activeTableRows.length ? (
              <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Audio</th>
                      <th className="px-3 py-2">Start</th>
                      <th className="px-3 py-2">End</th>
                      {selectedModelIsSpecialized ? (
                        <>
                          <th className="px-3 py-2">Prediccion</th>
                          <th className="px-3 py-2">Argmax</th>
                          <th className="px-3 py-2">Regla</th>
                          <th className="px-3 py-2">Score usado</th>
                          <th className="px-3 py-2">Threshold</th>
                          <th className="px-3 py-2">Confianza operacional</th>
                          {predictionClasses.map((label) => (
                            <th key={label} className="px-3 py-2">{label}</th>
                          ))}
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2">Score</th>
                          <th className="px-3 py-2">Label</th>
                        </>
                      )}
                      <th className="px-3 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTableRows.map((segment) => (
                      <tr key={segment.result_row_id || `${segment.audio_path}-${segment.start_seconds}-${segment.end_seconds}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <AudioTraceInfo trace={segment} compact />
                        </td>
                        <td className="px-3 py-2">{formatTime(segment.start_seconds)}</td>
                        <td className="px-3 py-2">{formatTime(segment.end_seconds)}</td>
                        {selectedModelIsSpecialized ? (
                          <>
                            <td className="px-3 py-2">
                              <Badge tone="info">{segment.predicted_label}</Badge>
                              {didRuleChangeArgmax(segment) ? (
                                <div className="mt-2 max-w-64 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
                                  La regla calibrada cambio la prediccion del argmax. Revisar si es un caso sensible.
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">{segment.raw_argmax_label || "-"}</td>
                            <td className="px-3 py-2">{segment.decision_rule_applied ? "Si" : "No"}</td>
                            <td className="px-3 py-2">{formatNumber(ruleScoreForSegment(segment, selectedModel))}</td>
                            <td className="px-3 py-2">{formatNumber(prediction?.threshold ?? threshold, 2)}</td>
                            <td className="px-3 py-2">
                              <Badge tone={operationalConfidenceLabel(segment, selectedModel).includes("baja confianza") ? "warning" : "success"}>
                                {operationalConfidenceLabel(segment, selectedModel)}
                              </Badge>
                            </td>
                            {predictionClasses.map((label) => (
                              <td key={label} className="px-3 py-2">{formatNumber(segmentScoreForLabel(segment, label))}</td>
                            ))}
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2">{formatNumber(segment.score_rana_sapo)}</td>
                            <td className="px-3 py-2">
                              <Badge tone={segment.detected ? "success" : "default"}>{segment.predicted_label}</Badge>
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => playResultRow(segment)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                              Reproducir
                            </button>
                            <button type="button" onClick={() => generateSpectrogram(segment)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                              Espectrograma
                            </button>
                            <button type="button" onClick={() => setActionRow(segment)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                              Acciones
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Informacion taxonomica" subtitle="Interpretacion del label producido por el modelo actual">
          <div className="space-y-3 text-sm">
            {selectedModelIsSpecialized ? (
              <>
                <div className="grid gap-2">
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Grupo</span><strong>{selectedModel?.group || "Anfibio"}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Genus</span><strong>{selectedModel?.genus || "-"}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Tipo</span><strong>clasificador especializado</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Clases</span><strong>{selectedModelClasses.join(", ") || "-"}</strong></div>
                </div>
                <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
                  Modelo especializado experimental; usa regla calibrada, no argmax simple.
                </p>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Grupo</span><strong>Anfibio</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Etiqueta</span><strong>rana_sapo</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Tipo</span><strong>grupo general</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Especie</span><strong>No identificada por este modelo</strong></div>
                </div>
                <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
                  Este detector solo decide si el audio parece contener rana/sapo. Para especie se necesita un clasificador especializado.
                </p>
              </>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Retroalimentacion" subtitle="Guarda anotaciones nuevas; no se modifica ni borra ningun audio original">
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notas opcionales para revision humana"
              className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {["confirmed_positive", "false_positive", "false_negative", "uncertain", "hard_negative", "excluded_from_training"].map((type) => (
                <button key={type} type="button" onClick={() => openFeedbackDraft(type)} disabled={!selectedAudio} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                  {feedbackLabel(type)}
                </button>
              ))}
            </div>
            <div className="max-h-48 overflow-auto rounded-lg border border-slate-200">
              {annotations.length ? (
                annotations.map((item) => (
                  <div key={item.id} className="border-b border-slate-100 p-3 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={item.user_feedback === "hard_negative" ? "warning" : item.user_feedback === "excluded_from_training" ? "danger" : "info"}>{item.user_feedback}</Badge>
                        <Badge tone={item.status === "retracted" ? "danger" : item.status === "corrected" ? "warning" : "default"}>{item.status || "active"}</Badge>
                      </div>
                      <span className="text-xs text-slate-500">{item.created_at}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500" title={item.audio_path}>
                      {getAudioName(item.audio_path)} · {formatTime(item.segment_start_seconds ?? item.start_seconds)} - {formatTime(item.segment_end_seconds ?? item.end_seconds)} · score usado {formatNumber(item.score_used ?? item.score)}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {formatTime(item.start_seconds)} - {formatTime(item.end_seconds)} · score {formatNumber(item.score)}
                    </p>
                    {item.exclusion_reason ? <p className="mt-1 text-xs text-red-700">Exclusion: {item.exclusion_reason}</p> : null}
                    {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => editFeedbackDraft(item)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                        Editar
                      </button>
                      <button type="button" onClick={() => retractFeedback(item.id)} disabled={item.status === "retracted"} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50">
                        Anular
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-4 text-sm text-slate-500">Sin feedback guardado para este audio.</p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {analysisHistory.length ? (
        <SectionCard title="Historial de analisis" subtitle="Historial visual separado; cargarlo reemplaza la vista activa">
          <div className="space-y-2">
            {analysisHistory.map((item) => (
              <div key={item.analysis_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold" title={item.audio_path}>{item.display_name || item.audio_name || getAudioName(item.audio_path)}</div>
                  <div className="truncate text-xs text-slate-500" title={item.audio_path}>{item.audio_path}</div>
                  <div className="text-xs text-slate-500">{item.model_id} · {new Date(item.analyzed_at).toLocaleString()} · {item.segments?.length || 0} fila(s)</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" title="Carga este resultado historico en la vista activa. No modifica audios ni anotaciones." onClick={() => setPrediction(item)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                    Restaurar este analisis
                  </button>
                  <button type="button" onClick={() => setAnalysisHistory((current) => current.filter((entry) => entry.analysis_id !== item.analysis_id))} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700">
                    Eliminar del historial visual
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Historial de recortes" subtitle="Recortes derivados con trazabilidad; no modifican audios originales">
        <div id="audio-lab-clip-history" />
        {clipHistory.length ? (
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
            {clipHistory.map((clip) => (
              <div key={clip.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 text-sm last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate font-semibold" title={clip.output_audio_path}>{clip.audio_name || getAudioName(clip.output_audio_path)}</div>
                  <div className="truncate text-xs text-slate-500" title={clip.output_audio_path}>{clip.output_audio_path}</div>
                  <div className="text-xs text-slate-500">
                    {formatTime(clip.start_seconds)} - {formatTime(clip.end_seconds)} · {formatNumber(clip.duration_seconds, 1)} s · {clip.purpose || "revision"} · {clipIsPlayable(clip) ? "audio disponible" : "audio faltante"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openClipInLab(clip)} disabled={!clipIsPlayable(clip)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                    Abrir recorte
                  </button>
                  <button type="button" onClick={() => analyzeClip(clip)} disabled={!clipIsPlayable(clip)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    Analizar recorte
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Sin recortes registrados todavia.</p>
        )}
      </SectionCard>

      {actionRow ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Acciones del resultado</h2>
                <p className="text-sm text-slate-600">Cada accion se aplica solo a este audio y tramo.</p>
              </div>
              <button type="button" onClick={() => setActionRow(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold">
                Cerrar
              </button>
            </div>
            <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Audio</span><strong className="truncate text-right" title={actionRow.audio_path}>{actionRow.audio_name || getAudioName(actionRow.audio_path)}</strong></div>
              <div className="truncate text-xs text-slate-500" title={actionRow.audio_path}>{actionRow.audio_path}</div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Tramo</span><strong>{formatTime(actionRow.start_seconds)} - {formatTime(actionRow.end_seconds)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Modelo</span><strong>{actionRow.model_id}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Prediccion</span><strong>{actionRow.predicted_label || "-"}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Argmax</span><strong>{actionRow.raw_argmax_label || "-"}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Score usado</span><strong>{formatNumber(actionRow.score_used ?? ruleScoreForSegment(actionRow, selectedModel))}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Threshold</span><strong>{formatNumber(actionRow.threshold ?? threshold, 2)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Feedback actual</span><strong>{findAnnotationForRow(actionRow)?.feedback_type || findAnnotationForRow(actionRow)?.user_feedback || "Sin feedback"}</strong></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => playResultRow(actionRow)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Reproducir tramo</button>
              <button type="button" onClick={() => generateSpectrogram(actionRow)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Ver espectrograma</button>
              {[
                ["confirmed_positive", "Confirmar deteccion"],
                ["false_positive", "Falso positivo"],
                ["false_negative", "Falso negativo"],
                ["uncertain", "Enviar a revisar"],
                ["excluded_from_training", "Excluir de entrenamiento"],
                ["hard_negative", "Marcar como hard negative"],
              ].map(([type, label]) => (
                <button key={type} type="button" onClick={() => { setActionRow(null); openFeedbackDraft(type, actionRow); }} className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm font-semibold">
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => {
                const annotation = findAnnotationForRow(actionRow);
                setActionRow(null);
                if (annotation) editFeedbackDraft(annotation);
                else openFeedbackDraft("uncertain", actionRow);
              }} className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Editar feedback</button>
              <button type="button" onClick={() => {
                const annotation = findAnnotationForRow(actionRow);
                setActionRow(null);
                if (annotation) retractFeedback(annotation.id);
                else setError("No hay feedback guardado para esta fila.");
              }} className="rounded-lg border border-red-300 px-3 py-2 text-left text-sm font-semibold text-red-700">Anular feedback</button>
            </div>
          </div>
        </div>
      ) : null}

      {batchOutputDetails ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Detalles del output</h2>
                <p className="text-sm text-slate-600">Identidad legible y rutas tecnicas completas.</p>
              </div>
              <button type="button" onClick={() => setBatchOutputDetails(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold">Cerrar</button>
            </div>
            <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div><span className="text-slate-500">Nombre original</span><div className="font-semibold">{batchOutputDetails.source_audio_name || getAudioName(batchOutputDetails.source_audio_path)}</div></div>
              <div><span className="text-slate-500">Ruta original completa</span><div className="break-all text-xs">{batchOutputDetails.source_audio_path || "-"}</div></div>
              <div><span className="text-slate-500">Nombre procesado</span><div className="font-semibold">{batchOutputDetails.display_label || batchOutputDetails.processed_audio_name || "-"}</div></div>
              <div><span className="text-slate-500">Ruta procesada completa</span><div className="break-all text-xs">{batchOutputDetails.processed_audio_path || "-"}</div></div>
              <div className="grid gap-2 md:grid-cols-2">
                <div><span className="text-slate-500">Job</span><div className="font-semibold">{batchOutputDetails.batch_job_name || activeBatchProcessingJob?.job_name || "-"} / {batchOutputDetails.batch_job_id || activeBatchProcessingJob?.id || batchOutputDetails.job_id}</div></div>
                <div><span className="text-slate-500">Output id</span><div className="font-mono text-xs">{batchOutputDetails.id}</div></div>
                <div><span className="text-slate-500">Segmento</span><div>{batchOutputDetails.segment_start_seconds !== null && batchOutputDetails.segment_start_seconds !== undefined ? `${formatTime(batchOutputDetails.segment_start_seconds)} - ${formatTime(batchOutputDetails.segment_end_seconds)}` : "audio completo"}</div></div>
                <div><span className="text-slate-500">Procesamiento</span><div>{batchOutputDetails.processing_label || [batchOutputDetails.processing_preset, batchOutputDetails.processing_method].filter(Boolean).join(" · ") || "-"}</div></div>
              </div>
              <div>
                <span className="text-slate-500">Parametros</span>
                <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(activeBatchProcessingJob?.params || {}, null, 2)}</pre>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => copyTextToClipboard(batchOutputDetails.source_audio_path, "Ruta original copiada.")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Copiar ruta original</button>
              <button type="button" disabled={!batchOutputDetails.processed_audio_path} onClick={() => copyTextToClipboard(batchOutputDetails.processed_audio_path, "Ruta procesada copiada.")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Copiar ruta procesada</button>
              <button type="button" onClick={() => copyTextToClipboard([
                `Original: ${batchOutputDetails.source_audio_name || getAudioName(batchOutputDetails.source_audio_path)}`,
                `Ruta original: ${batchOutputDetails.source_audio_path || "-"}`,
                `Procesado: ${batchOutputDetails.display_label || batchOutputDetails.processed_audio_name || "-"}`,
                `Ruta procesada: ${batchOutputDetails.processed_audio_path || "-"}`,
                `Job: ${batchOutputDetails.batch_job_name || activeBatchProcessingJob?.job_name || "-"} / ${batchOutputDetails.batch_job_id || activeBatchProcessingJob?.id || batchOutputDetails.job_id}`,
                `Segmento: ${batchOutputDetails.segment_start_seconds !== null && batchOutputDetails.segment_start_seconds !== undefined ? `${formatTime(batchOutputDetails.segment_start_seconds)} - ${formatTime(batchOutputDetails.segment_end_seconds)}` : "audio completo"}`,
              ].join("\n"), "Resumen copiado.")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Copiar resumen</button>
              <button type="button" onClick={() => { openBatchOutputInLab(batchOutputDetails); setBatchOutputDetails(null); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Abrir en laboratorio</button>
            </div>
          </div>
        </div>
      ) : null}

      {feedbackDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Confirmar feedback</h2>
                <p className="text-sm text-slate-600">Se guardara asociado exactamente a este audio y tramo.</p>
              </div>
              <button type="button" onClick={() => setFeedbackDraft(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold">
                Cancelar
              </button>
            </div>
            <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Audio analizado</span><strong className="truncate text-right" title={feedbackDraft.row.audio_path}>{feedbackDraft.row.display_label || feedbackDraft.row.display_name || feedbackDraft.row.audio_name || getAudioName(feedbackDraft.row.audio_path)}</strong></div>
              <div className="truncate text-xs text-slate-500" title={feedbackDraft.row.audio_path}>{feedbackDraft.row.audio_path}</div>
              {feedbackDraft.row.processed_audio_path ? (
                <>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Audio original</span><strong className="truncate text-right" title={feedbackDraft.row.original_source_audio_path || feedbackDraft.row.source_audio_path || feedbackDraft.row.audio_path}>{feedbackDraft.row.source_audio_name || getAudioName(feedbackDraft.row.original_source_audio_path || feedbackDraft.row.source_audio_path || feedbackDraft.row.audio_path)}</strong></div>
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">Ruta original</summary>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="max-w-full break-all">{feedbackDraft.row.original_source_audio_path || feedbackDraft.row.source_audio_path || "-"}</span>
                      <button type="button" onClick={() => copyTextToClipboard(feedbackDraft.row.original_source_audio_path || feedbackDraft.row.source_audio_path, "Ruta original copiada.")} className="rounded border border-slate-300 px-2 py-1 font-semibold">Copiar</button>
                    </div>
                  </details>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Audio procesado</span><strong className="truncate text-right" title={feedbackDraft.row.processed_audio_path}>{feedbackDraft.row.display_label || feedbackDraft.row.processed_audio_name || getAudioName(feedbackDraft.row.processed_audio_path)}</strong></div>
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">Ruta procesada</summary>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="max-w-full break-all">{feedbackDraft.row.processed_audio_path}</span>
                      <button type="button" onClick={() => copyTextToClipboard(feedbackDraft.row.processed_audio_path, "Ruta procesada copiada.")} className="rounded border border-slate-300 px-2 py-1 font-semibold">Copiar</button>
                    </div>
                  </details>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Job</span><strong className="truncate text-right">{feedbackDraft.row.batch_job_name || "-"} / {feedbackDraft.row.batch_job_id || "-"}</strong></div>
                </>
              ) : null}
              <div className="flex justify-between gap-3"><span className="text-slate-500">Tramo</span><strong>{formatTime(feedbackDraft.row.start_seconds)} - {formatTime(feedbackDraft.row.end_seconds)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Modelo</span><strong>{feedbackDraft.row.model_id}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Prediccion</span><strong>{feedbackDraft.row.predicted_label || "-"}</strong></div>
              {feedbackDraft.row.final_label ? (
                <div className="flex justify-between gap-3"><span className="text-slate-500">Identificacion automatica</span><strong>{feedbackDraft.row.final_label}</strong></div>
              ) : null}
              <div className="flex justify-between gap-3"><span className="text-slate-500">Argmax crudo</span><strong>{feedbackDraft.row.raw_argmax_label || "-"}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Score</span><strong>{formatNumber(feedbackDraft.row.score_used)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Threshold</span><strong>{formatNumber(feedbackDraft.row.threshold, 2)}</strong></div>
            </div>
            {feedbackDraft.row.processed_audio_path ? (
              <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                Este feedback queda asociado al audio procesado y conserva trazabilidad al original.
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Tipo</span>
                <select value={feedbackDraft.feedbackType} onChange={(event) => setFeedbackDraft((draft) => ({ ...draft, feedbackType: event.target.value, exclusionReason: event.target.value === "excluded_from_training" ? (draft.exclusionReason || "voz_humana") : draft.exclusionReason }))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  {["confirmed_positive", "false_positive", "false_negative", "uncertain", "hard_negative", "excluded_from_training"].map((type) => (
                    <option key={type} value={type}>{feedbackLabel(type)}</option>
                  ))}
                </select>
              </label>
              {feedbackDraft.feedbackType === "excluded_from_training" ? (
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Razon</span>
                  <select value={feedbackDraft.exclusionReason || "voz_humana"} onChange={(event) => setFeedbackDraft((draft) => ({ ...draft, exclusionReason: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    {["voz_humana", "ruido", "sin_vocalizacion", "audio_equivocado", "etiqueta_incorrecta", "otro"].map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <p><strong>Confirmar deteccion:</strong> la prediccion parece correcta.</p>
              <p><strong>Falso positivo:</strong> el modelo detecto algo que no corresponde.</p>
              <p><strong>Falso negativo:</strong> el modelo no detecto algo que si estaba.</p>
              <p><strong>Excluir de entrenamiento:</strong> no usar este audio/segmento para entrenamiento.</p>
              <p><strong>Hard negative:</strong> usar como negativo dificil solo si el pipeline lo soporta.</p>
            </div>
            {feedbackDraft.feedbackType === "excluded_from_training" && feedbackDraft.exclusionReason === "voz_humana" ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Voz humana se guardara como human_voice y exclude_species_training. No se marcara automaticamente como hard negative para clasificadores cerrados de especie.
              </p>
            ) : null}
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-semibold">Notas</span>
              <textarea value={feedbackDraft.notes} onChange={(event) => setFeedbackDraft((draft) => ({ ...draft, notes: event.target.value }))} className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setFeedbackDraft(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
                Cancelar
              </button>
              <button type="button" onClick={saveFeedbackDraft} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                Guardar feedback
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clipDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-[760px] overflow-y-auto rounded-lg bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-950 dark:text-slate-100">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Crear recorte</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">Puedes cambiar este nombre antes de crear el recorte. El audio original no se modifica.</p>
              </div>
              <button type="button" onClick={() => setClipDraft(null)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold dark:border-slate-700">
                Cancelar
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <span className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Audio original</span>
                <strong className="mt-1 block truncate text-slate-900 dark:text-slate-100" title={clipDraft.audio_name}>{clipDraft.audio_name}</strong>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" title={clipDraft.source_audio_path} style={{ overflowWrap: "anywhere" }}>
                  {shortPath(clipDraft.source_audio_path)}
                </p>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <span className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Tramo</span>
                  <strong className="mt-1 block">{formatTime(clipDraft.start_seconds)} - {formatTime(clipDraft.end_seconds)}</strong>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <span className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Duracion</span>
                  <strong className="mt-1 block">{formatNumber(clipDraft.end_seconds - clipDraft.start_seconds, 1)} s</strong>
                </div>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <span className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Carpeta destino</span>
                <strong className="mt-1 block truncate" title="backend/storage/audio_lab/clips">backend/storage/audio_lab/clips</strong>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <span className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Formato</span>
                <strong className="mt-1 block">WAV reproducible</strong>
              </div>
            </div>
            <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
              Se crea una copia WAV nueva con metadata de trazabilidad. No se modifica el audio original.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="min-w-0 text-sm md:col-span-2">
                <span className="mb-1 block font-semibold">Nombre sugerido</span>
                <input
                  value={clipDraft.suggested_name}
                  onChange={(event) => setClipDraft((draft) => ({ ...draft, suggested_name: event.target.value }))}
                  title={clipDraft.suggested_name}
                  className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Proposito</span>
                <select value={clipDraft.purpose} onChange={(event) => setClipDraft((draft) => ({ ...draft, purpose: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  {["revision", "entrenamiento futuro", "excluir", "exportar"].map((purpose) => (
                    <option key={purpose} value={purpose}>{purpose}</option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Se guardara como archivo WAV fisico y un JSON de metadata en la carpeta de recortes.
              </div>
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-semibold">Notas</span>
              <textarea value={clipDraft.notes} onChange={(event) => setClipDraft((draft) => ({ ...draft, notes: event.target.value }))} className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setClipDraft(null)} disabled={clipSaving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">
                Cancelar
              </button>
              <button type="button" onClick={saveClipDraft} disabled={clipSaving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <LoadingText loading={clipSaving} loadingText="Creando recorte...">Crear recorte</LoadingText>
              </button>
              <button type="button" onClick={saveClipDraftAndOpen} disabled={clipSaving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <LoadingText loading={clipSaving} loadingText="Creando y cargando...">Crear y abrir en laboratorio</LoadingText>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qualityReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-[980px] overflow-auto rounded-lg bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-950 dark:text-slate-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Reporte de calidad original vs procesado</h2>
                <p className="text-sm text-slate-500">Comparacion automatica; no reemplaza revision humana.</p>
                <div className="mt-2 grid gap-1 text-sm">
                  <div><span className="text-slate-500">Original:</span> <strong>{qualityReport.source_audio_name || getAudioName(qualityReport.source_audio_path)}</strong></div>
                  <div><span className="text-slate-500">Procesado:</span> <strong>{qualityReport.display_label || qualityReport.processed_audio_name || getAudioName(qualityReport.processed_audio_path)}</strong></div>
                </div>
              </div>
              <button type="button" onClick={() => setQualityReport(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Cerrar</button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Nivel general</div>
                <strong>{formatNumber(qualityReport.rms_db_source, 1)} &rarr; {formatNumber(qualityReport.rms_db_processed, 1)} dBFS</strong>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Ruido de fondo</div>
                <strong>{formatNumber(qualityReport.noise_floor_db_source, 1)} &rarr; {formatNumber(qualityReport.noise_floor_db_processed, 1)} dBFS</strong>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Contraste</div>
                <strong>{formatNumber(qualityReport.contrast_db_source, 1)} &rarr; {formatNumber(qualityReport.contrast_db_processed, 1)} dB</strong>
                <div className="text-xs text-slate-500">Mejora {formatNumber(qualityReport.contrast_improvement_db, 2)} dB</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Clipping procesado</div>
                <strong>{formatNumber(qualityReport.clipping_processed_ratio, 6)}</strong>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Detector rana/sapo</div>
                <strong>{formatNumber(qualityReport.frog_detector?.source_score, 3)} &rarr; {formatNumber(qualityReport.frog_detector?.processed_score, 3)}</strong>
                <div className="text-xs text-slate-500">Delta {formatNumber(qualityReport.frog_detector?.delta_score, 3)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Recomendacion</div>
                <Badge tone={qualityTone(qualityReport.recommendation?.severity)}>{qualityLabelText(qualityReport.recommendation?.label)}</Badge>
                <div className="mt-1 text-xs text-slate-500">{qualityReport.recommendation?.training_use || "requires_review"}</div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 p-3 text-sm font-bold">Energia por bandas</div>
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Banda</th>
                      <th className="px-3 py-2">Original</th>
                      <th className="px-3 py-2">Procesado</th>
                      <th className="px-3 py-2">Delta</th>
                      <th className="px-3 py-2">Interpretacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(qualityReport.band_energy || []).map((band) => (
                      <tr key={band.band_hz} className="border-t border-slate-100">
                        <td className="px-3 py-2">{band.band_hz} Hz</td>
                        <td className="px-3 py-2">{formatNumber(band.source_db, 1)} dB</td>
                        <td className="px-3 py-2">{formatNumber(band.processed_db, 1)} dB</td>
                        <td className="px-3 py-2">{formatNumber(band.delta_db, 1)} dB</td>
                        <td className="px-3 py-2">{band.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">{qualityReport.recommendation?.summary}</p>
              {qualityReport.recommendation?.warnings?.length ? (
                <ul className="mt-2 list-disc pl-5">
                  {qualityReport.recommendation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : null}
              <p className="mt-2 text-xs">Nunca usar automaticamente para entrenamiento: requiere revision humana.</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={copyQualityReport} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Copiar reporte</button>
              <button type="button" onClick={downloadQualityReportJson} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Descargar JSON</button>
              <button type="button" onClick={() => generateSpectrogram({ audio_path: qualityReport.processed_audio_path, start_seconds: 0, end_seconds: undefined })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Ver espectrograma procesado</button>
            </div>
          </div>
        </div>
      ) : null}

      {lastClip ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-[640px] rounded-lg bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-950 dark:text-slate-100">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Recorte creado correctamente</h2>
            <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Nombre</span>
                <strong className="max-w-full truncate font-mono" title={lastClip.clip_name || lastClip.audio_name}>{lastClip.clip_name || lastClip.audio_name || getAudioName(lastClip.output_audio_path)}</strong>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Duracion</span>
                <strong>{formatNumber(lastClip.duration_seconds, 1)} s</strong>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300" title={lastClip.output_audio_path} style={{ overflowWrap: "anywhere" }}>
                {shortPath(lastClip.output_audio_path)}
              </p>
            </div>
            <p className={`mt-2 rounded-lg p-3 text-sm ${clipIsPlayable(lastClip) ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
              {clipIsPlayable(lastClip) ? "WAV disponible para reproducir y analizar." : "El WAV del recorte no esta disponible. No se abrira como audio activo."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={!clipIsPlayable(lastClip)} onClick={() => { if (openClipInLab(lastClip)) window.setTimeout(() => audioRef.current?.play(), 100); setLastClip(null); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                Reproducir
              </button>
              <button type="button" disabled={!clipIsPlayable(lastClip)} onClick={() => { openClipInLab(lastClip); setLastClip(null); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                Abrir recorte
              </button>
              <button type="button" disabled={!clipIsPlayable(lastClip)} onClick={() => { analyzeClip(lastClip); setLastClip(null); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Analizar recorte
              </button>
              <button type="button" onClick={() => { setLastClip(null); loadClipHistory(); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                Ver historial de recortes
              </button>
              <button type="button" onClick={() => setLastClip(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
