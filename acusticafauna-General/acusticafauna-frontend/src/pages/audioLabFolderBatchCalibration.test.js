import assert from "node:assert/strict";
import {
  DEFAULT_FOLDER_BATCH_CONFIG,
  ZERO_CANDIDATE_VARIANTS,
  advancedSweepPayloadForType,
  applyAudioBatchPresetToForm,
  buildFolderBatchBulkPayload,
  buildUserPresetFromFolderBatchForm,
  buildFolderBatchFormFromCalibration,
  calibrationReportHasExploratoryWide,
  calibrationRowIsLowCandidateStrictProbe,
  defaultAudioLabDatasetExportForm,
  deleteUserPreset,
  duplicateAudioBatchPreset,
  folderBatchSelectionAfterFilteredSelect,
  folderBatchSelectionAfterPageSelect,
  folderBatchSelectionCountLabel,
  folderBatchJobConfig,
  folderBatchJobFinishedWithoutCandidates,
  FOLDER_BATCH_BULK_ACTIONS,
  isRecommendedBroaderDetectionConfig,
  normalizeFolderBatchOutputsResponse,
  paginateFolderBatchOutputs,
  RECOMMENDED_BROADER_DETECTION_CONFIG,
  recommendedCalibrationNextStep,
  selectZeroCandidateRecovery,
  shouldSkipHeavyFolderBatchRefresh,
  updateFolderBatchDraftField,
  upsertUserPreset,
  zeroCandidateConfigKey,
} from "./audioLabFolderBatchCalibration.js";

const currentForm = {
  folder_path: "C:\\Datos\\Ranas\\lote_01",
  target_label: "Boana_boans",
  preset: "normal",
  frequency_min_hz: 1800,
  frequency_max_hz: 3000,
  threshold_dbfs: -45,
  min_band_ratio: 0.45,
  min_activity_seconds: 0.4,
  min_silence_seconds: 1,
  padding_seconds: 0.3,
  clip_duration_seconds: 5,
  max_segment_seconds: 10,
  bandpass: true,
  noise_reduce: true,
  normalize: true,
  discard_empty: true,
  create_clips: false,
  create_manifest: false,
};

const result = buildFolderBatchFormFromCalibration({
  currentForm,
  calibration: {
    folder_path: "F:\\PROYECTO de cosa de sonido\\prueba de Pristimantis simoterus",
    label: "Pristimantis_simoterus",
  },
  params: {
    name: "balanceada",
    frequency_min_hz: 2500,
    frequency_max_hz: 4500,
    threshold_dbfs: -50,
    min_band_energy_ratio: 0.3,
    bandpass: true,
    noise_reduce: false,
    normalize: false,
  },
});

assert.equal(result.folder_path, "F:\\PROYECTO de cosa de sonido\\prueba de Pristimantis simoterus");
assert.equal(result.target_label, "Pristimantis_simoterus");
assert.equal(result.preset, "personalizado");
assert.equal(result.frequency_min_hz, 2500);
assert.equal(result.frequency_max_hz, 4500);
assert.equal(result.threshold_dbfs, -50);
assert.equal(result.min_band_ratio, 0.3);
assert.equal(result.create_clips, true);
assert.equal(result.create_manifest, true);

const smallSampleResult = buildFolderBatchFormFromCalibration({
  currentForm,
  calibration: {
    folder_path: "F:\\PROYECTO de cosa de sonido\\prueba de Pristimantis simoterus",
    label: "Pristimantis_simoterus",
  },
  params: {
    name: "intermedia_cerrada_mas_selectiva",
    frequency_min_hz: 2200,
    frequency_max_hz: 3300,
    threshold_dbfs: -51,
    min_band_energy_ratio: 0.23,
    bandpass: true,
    noise_reduce: false,
    normalize: false,
  },
  exploratory: true,
  configName: "intermedia_cerrada_mas_selectiva",
});

assert.equal(smallSampleResult.frequency_min_hz, 2200);
assert.equal(smallSampleResult.frequency_max_hz, 3300);
assert.equal(smallSampleResult.threshold_dbfs, -51);
assert.equal(smallSampleResult.min_band_ratio, 0.23);
assert.equal(smallSampleResult.bandpass, true);
assert.equal(smallSampleResult.noise_reduce, false);
assert.equal(smallSampleResult.normalize, false);

const zeroCandidateJob = {
  id: "job_zero",
  status: "completed",
  processed_files: 10,
  candidates_count: 0,
  errors_count: 0,
  frequency_min_hz: 2500,
  frequency_max_hz: 4500,
  threshold_dbfs: -50,
  params_json: JSON.stringify({
    min_band_ratio: 0.3,
    bandpass: true,
    noise_reduce: true,
    normalize: false,
  }),
};

assert.equal(folderBatchJobFinishedWithoutCandidates(zeroCandidateJob), true);
assert.equal(zeroCandidateConfigKey(folderBatchJobConfig(zeroCandidateJob)), "balanceada_safe");
assert.equal(ZERO_CANDIDATE_VARIANTS.sensitive.frequency_min_hz, 2500);
assert.equal(ZERO_CANDIDATE_VARIANTS.sensitive.frequency_max_hz, 5000);
assert.equal(ZERO_CANDIDATE_VARIANTS.sensitive.threshold_dbfs, -52);
assert.equal(ZERO_CANDIDATE_VARIANTS.sensitive.min_band_energy_ratio, 0.22);
assert.equal(ZERO_CANDIDATE_VARIANTS.sensitive.noise_reduce, true);
assert.equal(ZERO_CANDIDATE_VARIANTS.noNoise.noise_reduce, false);
assert.equal(ZERO_CANDIDATE_VARIANTS.widerDetection.frequency_min_hz, 2200);
assert.equal(ZERO_CANDIDATE_VARIANTS.widerDetection.frequency_max_hz, 3300);
assert.equal(ZERO_CANDIDATE_VARIANTS.widerDetection.min_band_energy_ratio, 0.23);

const nullConfig = folderBatchJobConfig(null);
assert.equal(nullConfig.min_band_ratio, DEFAULT_FOLDER_BATCH_CONFIG.min_band_ratio);
assert.equal(nullConfig.frequency_min_hz, DEFAULT_FOLDER_BATCH_CONFIG.frequency_min_hz);
assert.equal(nullConfig.has_saved_config, false);

const undefinedConfig = folderBatchJobConfig(undefined);
assert.equal(undefinedConfig.min_band_ratio, DEFAULT_FOLDER_BATCH_CONFIG.min_band_ratio);
assert.equal(undefinedConfig.has_saved_config, false);

assert.equal(folderBatchJobConfig({ min_band_energy_ratio: 0.25 }).min_band_ratio, 0.25);
assert.equal(folderBatchJobConfig({ parameters: { min_band_energy_ratio: 0.25 } }).min_band_ratio, 0.25);
assert.equal(folderBatchJobConfig({ params: { min_band_ratio: 0.26 } }).min_band_ratio, 0.26);
assert.equal(folderBatchJobConfig({ config: { min_band_ratio: 0.27 } }).min_band_ratio, 0.27);
assert.equal(folderBatchJobConfig({ request: { min_band_energy_ratio: 0.28 } }).min_band_ratio, 0.28);

const oldJobWithoutConfig = {
  id: "old_job",
  status: "completed",
  processed_files: 10,
  candidates_count: 0,
  errors_count: 0,
};
const oldJobConfig = folderBatchJobConfig(oldJobWithoutConfig);
assert.equal(oldJobConfig.min_band_ratio, DEFAULT_FOLDER_BATCH_CONFIG.min_band_ratio);
assert.equal(oldJobConfig.has_saved_config, false);
assert.equal(folderBatchJobFinishedWithoutCandidates(oldJobWithoutConfig), true);
assert.equal(folderBatchJobFinishedWithoutCandidates(null), false);
assert.equal(zeroCandidateConfigKey(null), "other");
assert.equal(Boolean(ZERO_CANDIDATE_VARIANTS.sensitive && ZERO_CANDIDATE_VARIANTS.noNoise), true);

const emptyOutputs = normalizeFolderBatchOutputsResponse({
  job_id: "job_empty_outputs",
  outputs: [],
  count: 0,
  message: "No se generaron clips porque ningun tramo paso los filtros.",
});
assert.deepEqual(emptyOutputs.items, []);
assert.equal(emptyOutputs.empty, true);
assert.equal(emptyOutputs.count, 0);
assert.equal(emptyOutputs.message.includes("No se generaron clips"), true);

const pageSelection = folderBatchSelectionAfterPageSelect(new Set(["old"]), [{ id: "a" }, { id: "b" }]);
assert.equal(pageSelection.has("old"), true);
assert.equal(pageSelection.has("a"), true);
assert.equal(pageSelection.has("b"), true);

const filteredSelection = folderBatchSelectionAfterFilteredSelect([{ id: "a" }, { id: "b" }, { id: "" }]);
assert.deepEqual([...filteredSelection].sort(), ["a", "b"]);
assert.equal(folderBatchSelectionCountLabel(new Set(["a"]), 2, false), "1 seleccionados");
assert.equal(folderBatchSelectionCountLabel(new Set(["a", "b"]), 2, true), "2 seleccionados filtrados");

assert.equal(FOLDER_BATCH_BULK_ACTIONS.confirm.review_status, "confirmed");
assert.equal(FOLDER_BATCH_BULK_ACTIONS.confirm.requiresStrongConfirmation, true);
const bulkPayload = buildFolderBatchBulkPayload({
  actionKey: "confirm",
  jobId: "job-1",
  selectedOutputs: [{ id: "out-1" }, { id: "out-2" }],
  speciesLabel: "Pristimantis_simoterus",
  confirmationText: "CONFIRMAR",
});
assert.equal(bulkPayload.job_id, "job-1");
assert.deepEqual(bulkPayload.output_ids, ["out-1", "out-2"]);
assert.equal(bulkPayload.review_status, "confirmed");
assert.equal(bulkPayload.confirmation_text, "CONFIRMAR");

const exportForm = defaultAudioLabDatasetExportForm("Pristimantis_simoterus");
assert.equal(exportForm.species_label, "Pristimantis_simoterus");
assert.equal(exportForm.copy_clips, false);
assert.equal(exportForm.split_by_source_audio_path, true);

assert.equal(selectZeroCandidateRecovery(zeroCandidateJob).actionLabel, "Probar variante más sensible");

const sensitiveNoiseJob = {
  ...zeroCandidateJob,
  frequency_max_hz: 5000,
  threshold_dbfs: -52,
  params_json: JSON.stringify({
    min_band_ratio: 0.22,
    bandpass: true,
    noise_reduce: true,
    normalize: false,
  }),
};
assert.equal(zeroCandidateConfigKey(folderBatchJobConfig(sensitiveNoiseJob)), "zero_candidates_sensitive");
assert.equal(selectZeroCandidateRecovery(sensitiveNoiseJob).actionLabel, "Probar sin reducción de ruido");

const sensitiveNoNoiseJob = {
  ...sensitiveNoiseJob,
  params_json: JSON.stringify({
    min_band_ratio: 0.22,
    bandpass: true,
    noise_reduce: false,
    normalize: false,
  }),
};
assert.equal(zeroCandidateConfigKey(folderBatchJobConfig(sensitiveNoNoiseJob)), "zero_candidates_no_noise");
assert.equal(selectZeroCandidateRecovery(sensitiveNoNoiseJob).actionLabel, "Volver a detección más amplia recomendada");
assert.equal(selectZeroCandidateRecovery(sensitiveNoNoiseJob).variant.frequency_min_hz, 2200);
assert.equal(selectZeroCandidateRecovery(sensitiveNoNoiseJob).variant.frequency_max_hz, 3300);
assert.equal(selectZeroCandidateRecovery(sensitiveNoNoiseJob).variant.threshold_dbfs, -51);
assert.equal(selectZeroCandidateRecovery(sensitiveNoNoiseJob).variant.min_band_ratio, 0.23);
assert.equal(selectZeroCandidateRecovery(sensitiveNoNoiseJob).variant.noise_reduce, false);
assert.equal(selectZeroCandidateRecovery(sensitiveNoNoiseJob).variant.name, "amplia_2200_3300_m51_r023_no_noise");

const reviewNoNoiseZeroJob = {
  ...zeroCandidateJob,
  frequency_max_hz: 5000,
  threshold_dbfs: -51,
  params_json: JSON.stringify({
    min_band_ratio: 0.25,
    bandpass: true,
    noise_reduce: false,
    normalize: false,
  }),
};
assert.equal(zeroCandidateConfigKey(folderBatchJobConfig(reviewNoNoiseZeroJob)), "zero_candidates_review_no_noise");
assert.equal(selectZeroCandidateRecovery(reviewNoNoiseZeroJob).actionLabel, "Volver a detección más amplia recomendada");

const reviewReport = {
  recommended_config: "intermedia_sin_norm",
  configs: [{
    config: "intermedia_sin_norm",
    total_candidates: 1,
    possible_damage_count: 0,
    clipping_count: 0,
    recommendation: "requires_review",
  }],
};
assert.equal(recommendedCalibrationNextStep(reviewReport), "review_previews");

const exploratoryAlreadyExists = {
  configs: [
    { config: "exploratory_wide", label: "Exploratoria amplia", total_candidates: 0 },
    { config: "balanceada", total_candidates: 0 },
  ],
};
assert.equal(calibrationReportHasExploratoryWide(exploratoryAlreadyExists), true);
assert.notEqual(recommendedCalibrationNextStep(exploratoryAlreadyExists), "try_exploratory_wide");

const rowExactParams = buildFolderBatchFormFromCalibration({
  currentForm,
  calibration: {
    folder_path: "F:\\PROYECTO de cosa de sonido\\prueba de Pristimantis simoterus",
    label: "Pristimantis_simoterus",
  },
  params: {
    frequency_min_hz: 2500,
    frequency_max_hz: 5000,
    threshold_dbfs: -52,
    min_band_ratio: 0.22,
    noise_reduce: true,
    normalize: false,
  },
});
assert.equal(rowExactParams.frequency_max_hz, 5000);
assert.equal(rowExactParams.threshold_dbfs, -52);
assert.equal(rowExactParams.min_band_ratio, 0.22);
assert.equal(rowExactParams.noise_reduce, true);

const strictFewCandidatesReport = {
  configs: [
    {
      config: "revision_2500_5000_m51_r025_no_noise",
      parameters: {
        frequency_min_hz: 2500,
        frequency_max_hz: 5000,
        threshold_dbfs: -51,
        min_band_energy_ratio: 0.25,
        noise_reduce: false,
        normalize: false,
      },
      total_candidates: 1,
      possible_damage_count: 0,
      clipping_count: 0,
      recommendation: "requires_review",
    },
  ],
};
assert.equal(calibrationRowIsLowCandidateStrictProbe(strictFewCandidatesReport.configs[0]), true);
assert.equal(recommendedCalibrationNextStep(strictFewCandidatesReport), "try_broader_detection");
assert.equal(RECOMMENDED_BROADER_DETECTION_CONFIG.frequency_min_hz, 2200);
assert.equal(RECOMMENDED_BROADER_DETECTION_CONFIG.frequency_max_hz, 3300);
assert.equal(RECOMMENDED_BROADER_DETECTION_CONFIG.threshold_dbfs, -51);
assert.equal(RECOMMENDED_BROADER_DETECTION_CONFIG.min_band_ratio, 0.23);
assert.equal(RECOMMENDED_BROADER_DETECTION_CONFIG.noise_reduce, false);
assert.equal(RECOMMENDED_BROADER_DETECTION_CONFIG.normalize, false);

const broaderSafeReport = {
  recommended_config: "amplia_2200_3300_m51_r023_no_noise",
  configs: [{
    config: "amplia_2200_3300_m51_r023_no_noise",
    parameters: RECOMMENDED_BROADER_DETECTION_CONFIG,
    total_candidates: 8,
    possible_damage_count: 0,
    clipping_count: 0,
    recommendation: "safe_for_review",
  }],
};
assert.equal(isRecommendedBroaderDetectionConfig(broaderSafeReport.configs[0]), true);
assert.equal(recommendedCalibrationNextStep(broaderSafeReport), "review_previews");

const adaptiveSweepPayload = advancedSweepPayloadForType({
  folder_path: "F:\\PROYECTO de cosa de sonido\\wetransfer_prisim-40-wav_2026-05-18_2228",
  label: "Otra_rana",
  sample_size: 30,
}, "adaptive_general");
assert.equal(adaptiveSweepPayload.mode, "adaptive_advanced_sweep");
assert.equal(adaptiveSweepPayload.sample_size, 30);
assert.equal(adaptiveSweepPayload.species_profile, undefined);

const pristimantisSweepPayload = advancedSweepPayloadForType({
  folder_path: adaptiveSweepPayload.folder_path,
  label: "Pristimantis_simoterus",
  sample_size: 50,
}, "pristimantis_simoterus_rain_wind");
assert.equal(pristimantisSweepPayload.mode, "advanced_sweep");
assert.equal(pristimantisSweepPayload.species_profile, "pristimantis_simoterus_rain_wind");
assert.equal(pristimantisSweepPayload.sample_size, 50);

const userPreset = buildUserPresetFromFolderBatchForm(currentForm, {
  id: "preset_user_1",
  name: "Boana lluvia noche",
  species_label: "Boana_boans",
  favorite: true,
});
assert.equal(userPreset.source, "user");
assert.equal(userPreset.name, "Boana lluvia noche");
assert.equal(userPreset.favorite, true);

const savedPresets = upsertUserPreset([], userPreset);
assert.equal(savedPresets.length, 1);
const appliedPresetForm = applyAudioBatchPresetToForm(currentForm, {
  ...userPreset,
  frequency_min_hz: 2200,
  frequency_max_hz: 3200,
  threshold_dbfs: -50,
  min_band_energy_ratio: 0.25,
  min_band_ratio: 0.25,
  noise_reduce: false,
  normalize: false,
});
assert.equal(appliedPresetForm.preset, "preset_user_1");
assert.equal(appliedPresetForm.frequency_min_hz, 2200);
assert.equal(appliedPresetForm.min_band_ratio, 0.25);
assert.equal(appliedPresetForm.noise_reduce, false);

const editedPreset = buildUserPresetFromFolderBatchForm(appliedPresetForm, {
  id: "preset_user_1",
  name: "Boana lluvia editado",
  species_label: "Boana_boans",
});
const editedPresets = upsertUserPreset(savedPresets, editedPreset);
assert.equal(editedPresets.length, 1);
assert.equal(editedPresets[0].name, "Boana lluvia editado");

const duplicatedPreset = duplicateAudioBatchPreset({ ...editedPreset, source: "system" }, { id: "preset_copy_1", name: "Copia editable" });
assert.equal(duplicatedPreset.source, "user");
assert.equal(duplicatedPreset.id, "preset_copy_1");

const afterDeleteUser = deleteUserPreset(editedPresets, editedPresets[0]);
assert.equal(afterDeleteUser.length, 0);
const afterDeleteSystem = deleteUserPreset([{ ...editedPreset, source: "system" }], { ...editedPreset, source: "system" });
assert.equal(afterDeleteSystem.length, 1);

let refreshCalls = 0;
const draftJobName = updateFolderBatchDraftField(currentForm, "job_name", "trabajoprueba52");
assert.equal(draftJobName.job_name, "trabajoprueba52");
assert.equal(refreshCalls, 0);

const draftRatio = updateFolderBatchDraftField(currentForm, "min_band_ratio", 0.25);
assert.equal(draftRatio.min_band_ratio, 0.25);
assert.equal(draftRatio.min_band_energy_ratio, 0.25);

const skipHeavy = shouldSkipHeavyFolderBatchRefresh({ batchEditing: true, quiet: true, status: "running" });
assert.equal(skipHeavy, true);
const allowProgressRefresh = shouldSkipHeavyFolderBatchRefresh({ batchEditing: true, quiet: true, status: "completed" });
assert.equal(allowProgressRefresh, false);

const fiftyOutputs = Array.from({ length: 50 }, (_, index) => ({ id: `out_${index + 1}` }));
const firstPage = paginateFolderBatchOutputs(fiftyOutputs, 1, 25);
assert.equal(firstPage.items.length, 25);
assert.equal(firstPage.totalPages, 2);
assert.equal(firstPage.items[0].id, "out_1");
const secondPage = paginateFolderBatchOutputs(fiftyOutputs, 2, 25);
assert.equal(secondPage.items[0].id, "out_26");
assert.equal(paginateFolderBatchOutputs([], 1, 25).items.length, 0);

console.log("audioLabFolderBatchCalibration.test.js passed");
