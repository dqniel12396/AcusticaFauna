export const FOLDER_BATCH_APPLIED_MESSAGE =
  "Parámetros aplicados al procesamiento masivo. Escanea la carpeta para iniciar un nuevo job.";

export const ADVANCED_SWEEP_APPLIED_MESSAGE =
  "Par\u00e1metros aplicados. Escanea la carpeta y ejecuta un nuevo job.";

export const USER_AUDIO_BATCH_PRESETS_STORAGE_KEY = "user_audio_batch_presets";

export const ADVANCED_SWEEP_PROFILE_CONFIGS = [
  ["high_confidence_config", "Alta confianza", 2300, 3300, -50, 0.27],
  ["balanced_config", "Equilibrada recomendada", 2200, 3200, -50, 0.25],
  ["high_recall_config", "Mayor cobertura", 2200, 3300, -51, 0.23],
  ["exploratory_config", "Exploratoria", 2000, 3500, -52, 0.2],
].map(([name, label, frequency_min_hz, frequency_max_hz, threshold_dbfs, min_band_ratio]) => ({
  name,
  label,
  frequency_min_hz,
  frequency_max_hz,
  threshold_dbfs,
  min_band_energy_ratio: min_band_ratio,
  min_band_ratio,
  min_activity_seconds: 0.25,
  min_silence_seconds: 0.35,
  padding_seconds: 0.12,
  clip_duration_seconds: 3,
  max_segment_seconds: 5,
  bandpass: true,
  noise_reduce: false,
  normalize: false,
  preset: "personalizado",
  detection_only: false,
}));

export function advancedSweepPayloadForType(basePayload = {}, sweepType = "adaptive_general") {
  if (sweepType === "pristimantis_simoterus_rain_wind") {
    return {
      ...basePayload,
      mode: "advanced_sweep",
      calibration_mode: "advanced_sweep",
      species_profile: "pristimantis_simoterus_rain_wind",
      configs: [],
      detection_only: false,
    };
  }
  if (sweepType === "custom") {
    return { ...basePayload, mode: "adaptive_advanced_sweep", calibration_mode: "adaptive_advanced_sweep", configs: [], detection_only: false };
  }
  return {
    ...basePayload,
    mode: "adaptive_advanced_sweep",
    calibration_mode: "adaptive_advanced_sweep",
    configs: [],
    detection_only: false,
  };
}

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

export const FOLDER_BATCH_BULK_ACTIONS = {
  confirm: {
    review_status: "confirmed",
    label: "Confirmar seleccionados como especie objetivo",
    requiresStrongConfirmation: true,
  },
  exclude: {
    review_status: "excluded",
    label: "Excluir seleccionados",
    requiresStrongConfirmation: false,
  },
  human_voice: {
    review_status: "human_voice",
    label: "Marcar como voz humana",
    requiresStrongConfirmation: false,
  },
  car_motor: {
    review_status: "car_motor",
    label: "Marcar como carro/motor",
    requiresStrongConfirmation: false,
  },
  bird: {
    review_status: "bird",
    label: "Marcar como ave",
    requiresStrongConfirmation: false,
  },
  unsure: {
    review_status: "unsure",
    label: "Enviar seleccionados a revisar",
    requiresStrongConfirmation: false,
  },
};

export function selectedFolderBatchOutputs(outputs = [], selectedIds = new Set()) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  return outputs.filter((output) => selected.has(output.id));
}

export function folderBatchSelectionCountLabel(selectedIds = new Set(), filteredCount = 0, allFilteredSelected = false) {
  const count = selectedIds instanceof Set ? selectedIds.size : Number(selectedIds?.length || 0);
  if (allFilteredSelected) return `${filteredCount} seleccionados filtrados`;
  return `${count} seleccionados`;
}

export function folderBatchSelectionAfterPageSelect(current = new Set(), pageItems = []) {
  const next = new Set(current);
  pageItems.forEach((item) => {
    if (item?.id) next.add(item.id);
  });
  return next;
}

export function folderBatchSelectionAfterFilteredSelect(filteredItems = []) {
  return new Set(filteredItems.map((item) => item?.id).filter(Boolean));
}

export function buildFolderBatchBulkPayload({
  actionKey,
  jobId,
  selectedOutputs = [],
  speciesLabel = "",
  reviewer = "web",
  notes = "",
  confirmationText = "",
} = {}) {
  const action = FOLDER_BATCH_BULK_ACTIONS[actionKey];
  if (!action) throw new Error("Accion masiva no soportada.");
  return {
    job_id: jobId,
    output_ids: selectedOutputs.map((output) => output.id).filter(Boolean),
    review_status: action.review_status,
    species_label: speciesLabel,
    reviewer,
    notes,
    confirmation_text: confirmationText,
  };
}

export function defaultAudioLabDatasetExportForm(speciesLabel = "") {
  return {
    dataset_name: `${speciesLabel || "dataset"}_semilla`,
    species_label: speciesLabel || "",
    version: "v0.1",
    include_confirmed_positives: true,
    include_negatives_excluded: true,
    include_hard_negatives: true,
    exclude_unsure: true,
    include_contaminants: true,
    contaminants_as_negative: false,
    copy_clips: false,
    split_by_source_audio_path: true,
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

const USER_PRESET_FIELDS = [
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
  "create_clips",
  "create_manifest",
  "discard_empty",
  "mark_contaminants",
  "detect_contaminants_heuristic",
];

export function sanitizeUserPreset(raw = {}) {
  const now = new Date().toISOString();
  const preset = {
    id: String(raw.id || `preset_${Date.now()}`),
    name: String(raw.name || "Preset usuario").trim() || "Preset usuario",
    species_label: String(raw.species_label || raw.target_label || "").trim(),
    description: String(raw.description || "").trim(),
    favorite: Boolean(raw.favorite),
    source: "user",
    created_at: raw.created_at || now,
    updated_at: raw.updated_at || now,
  };
  for (const key of USER_PRESET_FIELDS) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") preset[key] = raw[key];
  }
  if (preset.min_band_energy_ratio === undefined && preset.min_band_ratio !== undefined) preset.min_band_energy_ratio = preset.min_band_ratio;
  if (preset.min_band_ratio === undefined && preset.min_band_energy_ratio !== undefined) preset.min_band_ratio = preset.min_band_energy_ratio;
  return preset;
}

export function buildUserPresetFromFolderBatchForm(form = {}, overrides = {}) {
  const picked = {};
  for (const key of USER_PRESET_FIELDS) {
    if (form[key] !== undefined && form[key] !== null) picked[key] = form[key];
  }
  return sanitizeUserPreset({
    ...picked,
    id: overrides.id,
    name: overrides.name || "Preset usuario",
    species_label: overrides.species_label ?? form.target_label,
    description: overrides.description,
    favorite: overrides.favorite,
    mark_contaminants: form.detect_contaminants_heuristic,
  });
}

export function applyAudioBatchPresetToForm(currentForm = {}, preset = {}) {
  const picked = {};
  for (const key of USER_PRESET_FIELDS) {
    if (preset[key] !== undefined && preset[key] !== null) picked[key] = preset[key];
  }
  return {
    ...currentForm,
    ...picked,
    preset: preset.id || preset.name || "personalizado",
    target_label: preset.species_label || currentForm.target_label,
    detect_contaminants_heuristic: valueOrFallback(preset, "mark_contaminants", valueOrFallback(preset, "detect_contaminants_heuristic", currentForm.detect_contaminants_heuristic)),
  };
}

export function upsertUserPreset(presets = [], preset = {}) {
  const normalized = sanitizeUserPreset(preset);
  return [...presets.filter((item) => item.id !== normalized.id), { ...normalized, updated_at: new Date().toISOString() }];
}

export function deleteUserPreset(presets = [], preset = {}) {
  if (preset.source === "system" || preset.system) return presets;
  return presets.filter((item) => item.id !== preset.id);
}

export function duplicateAudioBatchPreset(preset = {}, overrides = {}) {
  return sanitizeUserPreset({
    ...preset,
    ...overrides,
    id: overrides.id || `preset_${Date.now()}`,
    name: overrides.name || `${preset.name || "Preset"} copia`,
    source: "user",
    created_at: undefined,
    updated_at: undefined,
  });
}

export function updateFolderBatchDraftField(draft = {}, key, value) {
  const next = { ...draft, [key]: value };
  if (key === "min_band_ratio") next.min_band_energy_ratio = value;
  if (key === "min_band_energy_ratio") next.min_band_ratio = value;
  return next;
}

export function applyPresetToFolderBatchDraft(draft = {}, preset = {}) {
  return applyAudioBatchPresetToForm(draft, preset);
}

export function shouldSkipHeavyFolderBatchRefresh({ batchEditing = false, quiet = false, forceHeavy = false, status = "" } = {}) {
  if (forceHeavy) return false;
  return Boolean(batchEditing && quiet && ["pending", "running", "paused"].includes(String(status || "")));
}

export function paginateFolderBatchOutputs(outputs = [], page = 1, pageSize = 50) {
  const safeOutputs = Array.isArray(outputs) ? outputs : [];
  const safePageSize = Math.max(1, Number(pageSize) || 50);
  const totalPages = Math.max(1, Math.ceil(safeOutputs.length / safePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * safePageSize;
  return {
    items: safeOutputs.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total: safeOutputs.length,
    totalPages,
  };
}
