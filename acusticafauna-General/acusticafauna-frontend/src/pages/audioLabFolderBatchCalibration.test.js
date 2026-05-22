import assert from "node:assert/strict";
import {
  DEFAULT_FOLDER_BATCH_CONFIG,
  ZERO_CANDIDATE_VARIANTS,
  buildFolderBatchFormFromCalibration,
  folderBatchJobConfig,
  folderBatchJobFinishedWithoutCandidates,
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
assert.equal(ZERO_CANDIDATE_VARIANTS.sensitive.frequency_max_hz, 4500);
assert.equal(ZERO_CANDIDATE_VARIANTS.sensitive.threshold_dbfs, -51);
assert.equal(ZERO_CANDIDATE_VARIANTS.sensitive.min_band_energy_ratio, 0.25);
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

console.log("audioLabFolderBatchCalibration.test.js passed");
