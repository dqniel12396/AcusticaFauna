export const FOLDER_BATCH_APPLIED_MESSAGE =
  "Parámetros aplicados al procesamiento masivo. Escanea la carpeta para iniciar un nuevo job.";

export const ZERO_CANDIDATE_VARIANTS = {
  sensitive: {
    name: "more_sensitive_variant",
    label: "Variante mas sensible",
    frequency_min_hz: 2500,
    frequency_max_hz: 5000,
    threshold_dbfs: -52,
    min_band_energy_ratio: 0.22,
    min_band_ratio: 0.22,
    bandpass: true,
    noise_reduce: true,
    normalize: false,
    min_activity_seconds: 0.2,
    min_silence_seconds: 0.3,
    padding_seconds: 0.15,
    clip_duration_seconds: 5,
    max_segment_seconds: 10,
    preset: "personalizado",
  },
  noNoise: {
    name: "no_noise_reduction_variant",
    label: "Variante sensible sin reduccion de ruido",
    frequency_min_hz: 2500,
    frequency_max_hz: 5000,
    threshold_dbfs: -52,
    min_band_energy_ratio: 0.22,
    min_band_ratio: 0.22,
    bandpass: true,
    noise_reduce: false,
    normalize: false,
    min_activity_seconds: 0.2,
    min_silence_seconds: 0.3,
    padding_seconds: 0.15,
    clip_duration_seconds: 5,
    max_segment_seconds: 10,
    preset: "personalizado",
  },
  widerDetection: {
    name: "broader_detection",
    label: "Volver a deteccion mas amplia",
    frequency_min_hz: 2200,
    frequency_max_hz: 3300,
    threshold_dbfs: -51,
    min_band_energy_ratio: 0.23,
    min_band_ratio: 0.23,
    bandpass: true,
    noise_reduce: false,
    normalize: false,
    min_activity_seconds: 0.25,
    min_silence_seconds: 0.35,
    padding_seconds: 0.12,
    clip_duration_seconds: 3,
    max_segment_seconds: 5,
    preset: "personalizado",
  },
};

export const RECOMMENDED_BROADER_DETECTION_CONFIG = {
  ...ZERO_CANDIDATE_VARIANTS.widerDetection,
  name: "amplia_2200_3300_m51_r023_no_noise",
  label: "Amplia 2200-3300 sin reduccion",
  purpose: "Recomendada cuando 2500-5000 Hz da pocos candidatos. Revisar previews antes de entrenamiento.",
};

export const ZERO_CANDIDATE_RECOVERY_MESSAGE =
  "Parámetros aplicados. Escanea la carpeta y ejecuta un nuevo job.";

export const DEFAULT_FOLDER_BATCH_CONFIG = {
  frequency_min_hz: 1800,
  frequency_max_hz: 3000,
  threshold_dbfs: -45,
  min_band_energy_ratio: 0.45,
  min_band_ratio: 0.45,
  min_activity_seconds: 0.4,
  min_silence_seconds: 1,
  padding_seconds: 0.3,
  clip_duration_seconds: 5,
  max_segment_seconds: 10,
  bandpass: true,
  noise_reduce: true,
  normalize: true,
};

export const FOLDER_BATCH_CALIBRATION_PARAM_KEYS = [
  "frequency_min_hz",
  "frequency_max_hz",
  "threshold_dbfs",
  "min_band_energy_ratio",
  "min_band_ratio",
  "min_activity_seconds",
  "min_silence_seconds",
  "padding_seconds",
  "clip_duration_seconds",
  "max_segment_seconds",
  "bandpass",
  "noise_reduce",
  "normalize",
  "discard_empty",
  "discard_silence",
  "create_clips",
  "create_manifest",
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function valueOrFallback(object, key, fallback) {
  return hasOwn(object, key) ? object[key] : fallback;
}

function numberOrFallback(object, key, fallback) {
  return hasOwn(object, key) ? Number(object[key]) : fallback;
}

function closeEnough(left, right, tolerance = 0.001) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" ? value : {};
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return objectOrEmpty(parsed);
  } catch {
    return {};
  }
}

export function parseFolderBatchJobParams(job = {}) {
  return parseJsonObject(objectOrEmpty(job).params_json);
}

export function normalizeFolderBatchOutputsResponse(payload = {}) {
  const source = objectOrEmpty(payload);
  const outputs = Array.isArray(source.items) ? source.items : Array.isArray(source.outputs) ? source.outputs : [];
  return {
    ...source,
    items: outputs,
    outputs,
    count: Number(source.count ?? source.total ?? outputs.length),
    total: Number(source.total ?? source.count ?? outputs.length),
    empty: outputs.length === 0,
    message: source.message || (outputs.length === 0 ? "No hay clips generados para este job. La configuracion no produjo candidatos." : ""),
  };
}

function configSources(value = {}) {
  const source = objectOrEmpty(value);
  const paramsJson = parseFolderBatchJobParams(source);
  const nestedConfig = objectOrEmpty(source.config);
  const nestedRequest = objectOrEmpty(source.request);
  const jsonConfig = objectOrEmpty(paramsJson.config);
  const jsonRequest = objectOrEmpty(paramsJson.request);

  return [
    source,
    objectOrEmpty(source.params),
    objectOrEmpty(source.parameters),
    nestedConfig,
    objectOrEmpty(nestedConfig.params),
    objectOrEmpty(nestedConfig.parameters),
    objectOrEmpty(source.request),
    paramsJson,
    objectOrEmpty(paramsJson.params),
    objectOrEmpty(paramsJson.parameters),
    jsonConfig,
    objectOrEmpty(jsonConfig.params),
    objectOrEmpty(jsonConfig.parameters),
    jsonRequest,
    objectOrEmpty(nestedRequest.params),
    objectOrEmpty(nestedRequest.parameters),
  ];
}

function firstDefined(sources, keys, fallback) {
  for (const source of sources) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) return source[key];
    }
  }
  return fallback;
}

function hasSavedConfig(sources) {
  const keys = [
    "frequency_min_hz",
    "frequency_max_hz",
    "threshold_dbfs",
    "min_band_ratio",
    "min_band_energy_ratio",
    "min_activity_seconds",
    "min_silence_seconds",
    "padding_seconds",
    "clip_duration_seconds",
    "max_segment_seconds",
    "bandpass",
    "noise_reduce",
    "normalize",
  ];
  return sources.some((source) => keys.some((key) => source[key] !== undefined && source[key] !== null));
}

export function folderBatchJobConfig(config = {}) {
  const sources = configSources(config);
  const minBandRatio = Number(firstDefined(
    sources,
    ["min_band_ratio", "min_band_energy_ratio"],
    DEFAULT_FOLDER_BATCH_CONFIG.min_band_ratio
  ));
  return {
    frequency_min_hz: Number(firstDefined(sources, ["frequency_min_hz"], DEFAULT_FOLDER_BATCH_CONFIG.frequency_min_hz)),
    frequency_max_hz: Number(firstDefined(sources, ["frequency_max_hz"], DEFAULT_FOLDER_BATCH_CONFIG.frequency_max_hz)),
    threshold_dbfs: Number(firstDefined(sources, ["threshold_dbfs"], DEFAULT_FOLDER_BATCH_CONFIG.threshold_dbfs)),
    min_band_energy_ratio: minBandRatio,
    min_band_ratio: minBandRatio,
    min_activity_seconds: Number(firstDefined(sources, ["min_activity_seconds"], DEFAULT_FOLDER_BATCH_CONFIG.min_activity_seconds)),
    min_silence_seconds: Number(firstDefined(sources, ["min_silence_seconds"], DEFAULT_FOLDER_BATCH_CONFIG.min_silence_seconds)),
    padding_seconds: Number(firstDefined(sources, ["padding_seconds"], DEFAULT_FOLDER_BATCH_CONFIG.padding_seconds)),
    clip_duration_seconds: Number(firstDefined(sources, ["clip_duration_seconds"], DEFAULT_FOLDER_BATCH_CONFIG.clip_duration_seconds)),
    max_segment_seconds: Number(firstDefined(sources, ["max_segment_seconds"], DEFAULT_FOLDER_BATCH_CONFIG.max_segment_seconds)),
    bandpass: firstDefined(sources, ["bandpass"], DEFAULT_FOLDER_BATCH_CONFIG.bandpass),
    noise_reduce: firstDefined(sources, ["noise_reduce"], DEFAULT_FOLDER_BATCH_CONFIG.noise_reduce),
    normalize: firstDefined(sources, ["normalize"], DEFAULT_FOLDER_BATCH_CONFIG.normalize),
    has_saved_config: hasSavedConfig(sources),
  };
}

export function folderBatchJobFinishedWithoutCandidates(job = {}) {
  const source = objectOrEmpty(job);
  const processedFiles = Number(source.processed_files ?? source.files_processed ?? 0);
  return (
    source.status === "completed" &&
    processedFiles > 0 &&
    Number(source.candidates_count || 0) === 0 &&
    Number(source.errors_count || 0) === 0
  );
}

export function zeroCandidateConfigKey(config = {}) {
  const normalized = folderBatchJobConfig(config);
  const ratio = normalized.min_band_ratio ?? normalized.min_band_energy_ratio;
  if (
    closeEnough(normalized.frequency_min_hz, 2500) &&
    closeEnough(normalized.frequency_max_hz, 4500) &&
    closeEnough(normalized.threshold_dbfs, -50) &&
    closeEnough(ratio, 0.3) &&
    normalized.bandpass === true &&
    normalized.noise_reduce === true &&
    normalized.normalize === false
  ) {
    return "balanceada_safe";
  }
  if (
    closeEnough(normalized.frequency_min_hz, 2500) &&
    closeEnough(normalized.frequency_max_hz, 5000) &&
    closeEnough(normalized.threshold_dbfs, -52) &&
    closeEnough(ratio, 0.22) &&
    normalized.bandpass === true &&
    normalized.noise_reduce === true &&
    normalized.normalize === false
  ) {
    return "zero_candidates_sensitive";
  }
  if (
    closeEnough(normalized.frequency_min_hz, 2500) &&
    closeEnough(normalized.frequency_max_hz, 5000) &&
    closeEnough(normalized.threshold_dbfs, -52) &&
    closeEnough(ratio, 0.22) &&
    normalized.bandpass === true &&
    normalized.noise_reduce === false &&
    normalized.normalize === false
  ) {
    return "zero_candidates_no_noise";
  }
  if (
    closeEnough(normalized.frequency_min_hz, 2500) &&
    closeEnough(normalized.frequency_max_hz, 5000) &&
    closeEnough(normalized.threshold_dbfs, -51) &&
    closeEnough(ratio, 0.25) &&
    normalized.bandpass === true &&
    normalized.noise_reduce === false &&
    normalized.normalize === false
  ) {
    return "zero_candidates_review_no_noise";
  }
  return "other";
}

export function selectZeroCandidateRecovery(job = {}) {
  if (!folderBatchJobFinishedWithoutCandidates(job)) return null;
  const key = zeroCandidateConfigKey(folderBatchJobConfig(job));
  if (key === "zero_candidates_sensitive") {
    return {
      key: "no_noise_reduction_variant",
      actionLabel: "Probar sin reducción de ruido",
      variant: ZERO_CANDIDATE_VARIANTS.noNoise,
    };
  }
  if (key === "zero_candidates_no_noise" || key === "zero_candidates_review_no_noise") {
    return {
      key: "broader_detection",
      actionLabel: "Volver a detección más amplia recomendada",
      variant: RECOMMENDED_BROADER_DETECTION_CONFIG,
    };
  }
  return {
    key: "more_sensitive_variant",
    actionLabel: "Probar variante más sensible",
    variant: ZERO_CANDIDATE_VARIANTS.sensitive,
  };
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function calibrationRowKeys(item = {}) {
  return [
    item.config,
    item.name,
    item.label,
    item.parameters?.name,
    item.parameters?.label,
  ].map(normalizedText).filter(Boolean);
}

function calibrationRowMatches(item, value) {
  const normalizedValue = normalizedText(value);
  return Boolean(normalizedValue && calibrationRowKeys(item).includes(normalizedValue));
}

export function isRecommendedBroaderDetectionConfig(value = {}) {
  const source = objectOrEmpty(value);
  const params = objectOrEmpty(source.parameters);
  const config = { ...source, ...params };
  const ratio = config.min_band_ratio ?? config.min_band_energy_ratio;
  return Boolean(
    config.name === "amplia_2200_3300_m51_r023_no_noise" ||
      config.config === "amplia_2200_3300_m51_r023_no_noise" ||
      config.name === "broader_detection" ||
      config.config === "broader_detection" ||
      (
        closeEnough(config.frequency_min_hz, 2200) &&
        closeEnough(config.frequency_max_hz, 3300) &&
        closeEnough(config.threshold_dbfs, -51) &&
        closeEnough(ratio, 0.23) &&
        config.noise_reduce === false &&
        config.normalize === false
      )
  );
}

export function calibrationRowIsLowCandidateStrictProbe(item = {}) {
  const source = objectOrEmpty(item);
  const params = objectOrEmpty(source.parameters);
  const config = { ...source, ...params };
  const ratio = config.min_band_ratio ?? config.min_band_energy_ratio;
  return Boolean(
    closeEnough(config.frequency_min_hz, 2500) &&
      (closeEnough(config.frequency_max_hz, 4500) || closeEnough(config.frequency_max_hz, 5000)) &&
      Number(ratio || 0) >= 0.22 &&
      Number(source.total_candidates || source.candidates || 0) <= 1 &&
      Number(source.possible_damage_count || 0) === 0 &&
      Number(source.clipping_count || 0) === 0
  );
}

export function calibrationReportHasExploratoryWide(report = {}) {
  return (report.configs || []).some((item) => {
    const keys = calibrationRowKeys(item);
    return keys.includes("exploratory_wide") || keys.includes("exploratoria amplia");
  });
}

export function recommendedCalibrationNextStep(report = {}) {
  const rows = report.configs || [];
  if (report.best_next_step === "try_broader_detection") return "try_broader_detection";
  const recommendedName = report.recommended_config || report.recommended_parameters?.name || "";
  const recommendedRow = rows.find((item) => calibrationRowMatches(item, recommendedName));
  const hasExploratoryWide = calibrationReportHasExploratoryWide(report);
  const hasRecommendedBroaderCleanCandidates = Boolean(
    recommendedRow &&
      isRecommendedBroaderDetectionConfig(recommendedRow) &&
      Number(recommendedRow.total_candidates || 0) > 0 &&
      Number(recommendedRow.possible_damage_count || 0) === 0 &&
      Number(recommendedRow.clipping_count || 0) === 0
  );
  const hasCleanCandidates = Boolean(
    recommendedRow &&
      Number(recommendedRow.total_candidates || 0) > 0 &&
      Number(recommendedRow.possible_damage_count || 0) === 0 &&
      Number(recommendedRow.clipping_count || 0) === 0
  );
  if (hasRecommendedBroaderCleanCandidates) return "review_previews";
  if (!rows.some(isRecommendedBroaderDetectionConfig) && rows.some(calibrationRowIsLowCandidateStrictProbe)) {
    return "try_broader_detection";
  }
  if (
    hasCleanCandidates &&
    ["requires_review", "candidate_for_review"].includes(recommendedRow.recommendation)
  ) {
    return "review_previews";
  }
  if (!hasExploratoryWide && rows.length && rows.every((item) => Number(item.total_candidates || 0) === 0)) {
    return "try_exploratory_wide";
  }
  if (hasExploratoryWide && rows.some((item) => Number(item.total_candidates || 0) > 0)) {
    return "try_more_sensitive_variant";
  }
  if (rows.length) return "review_results";
  return "run_config_comparison";
}

export function pickCalibrationFolderBatchParams(params = {}) {
  const picked = {};
  for (const key of FOLDER_BATCH_CALIBRATION_PARAM_KEYS) {
    if (params[key] !== undefined && params[key] !== null) picked[key] = params[key];
  }
  return picked;
}

export function calibrationFolderBatchPath(calibration = {}, params = {}) {
  return (
    calibration.folder_path_resolved ||
    calibration.folder_path ||
    params.folder_path_resolved ||
    params.folder_path ||
    ""
  );
}

export function buildFolderBatchFormFromCalibration({
  currentForm,
  params = {},
  calibration = {},
  copyFolderPath = true,
  copyLabel = true,
  exploratory = false,
  configName = "",
}) {
  const picked = pickCalibrationFolderBatchParams(params);
  const folderPath = calibrationFolderBatchPath(calibration, params);
  const label = calibration.label || params.label || currentForm.target_label;
  const minBandRatio = hasOwn(picked, "min_band_ratio")
    ? Number(picked.min_band_ratio)
    : hasOwn(picked, "min_band_energy_ratio")
      ? Number(picked.min_band_energy_ratio)
      : currentForm.min_band_ratio;
  const discardEmpty = hasOwn(picked, "discard_empty")
    ? picked.discard_empty
    : hasOwn(picked, "discard_silence")
      ? picked.discard_silence
      : currentForm.discard_empty;

  return {
    ...currentForm,
    folder_path: copyFolderPath && folderPath ? folderPath : currentForm.folder_path,
    target_label: copyLabel && label ? label : currentForm.target_label,
    preset: "personalizado",
    frequency_min_hz: numberOrFallback(picked, "frequency_min_hz", currentForm.frequency_min_hz),
    frequency_max_hz: numberOrFallback(picked, "frequency_max_hz", currentForm.frequency_max_hz),
    threshold_dbfs: numberOrFallback(picked, "threshold_dbfs", currentForm.threshold_dbfs),
    min_band_ratio: minBandRatio,
    min_activity_seconds: numberOrFallback(picked, "min_activity_seconds", currentForm.min_activity_seconds),
    min_silence_seconds: numberOrFallback(picked, "min_silence_seconds", currentForm.min_silence_seconds),
    padding_seconds: numberOrFallback(picked, "padding_seconds", currentForm.padding_seconds),
    clip_duration_seconds: numberOrFallback(picked, "clip_duration_seconds", currentForm.clip_duration_seconds),
    max_segment_seconds: numberOrFallback(picked, "max_segment_seconds", currentForm.max_segment_seconds),
    bandpass: valueOrFallback(picked, "bandpass", currentForm.bandpass),
    noise_reduce: valueOrFallback(picked, "noise_reduce", currentForm.noise_reduce),
    normalize: valueOrFallback(picked, "normalize", currentForm.normalize),
    discard_empty: discardEmpty,
    create_clips: true,
    create_manifest: true,
    exploratory_mode: Boolean(exploratory),
    calibration_mode_tag: exploratory ? configName : "",
  };
}
