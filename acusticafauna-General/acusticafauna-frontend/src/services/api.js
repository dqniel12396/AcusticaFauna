const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
const ML_API_BASE = import.meta.env.VITE_ML_API_BASE_URL || "http://127.0.0.1:8010";
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

async function handleResponse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.detail;
    if (detail && typeof detail === "object") {
      const error = new Error(detail.message || detail.error || "Ocurrio un error en la API.");
      error.detail = detail;
      error.status = response.status;
      throw error;
    }
    throw new Error(detail || "Ocurrio un error en la API.");
  }

  return data;
}

export async function healthCheck() {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse(response);
}

export async function importLocalDatasetAdvanced(payload) {
  const response = await fetch(`${API_BASE}/imports/local-advanced`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
}

export async function fetchImportSessions() {
  const response = await fetch(`${API_BASE}/sessions`);
  return handleResponse(response);
}

export async function diagnoseImportSessionRoutes(sessionId) {
  const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/diagnose-routes`);
  return handleResponse(response);
}

export async function fetchEvents(sessionId = "") {
  const url = sessionId
    ? `${API_BASE}/events?session_id=${encodeURIComponent(sessionId)}`
    : `${API_BASE}/events`;

  const response = await fetch(url);
  return handleResponse(response);
}

export async function fetchEventDetail(eventId) {
  const response = await fetch(`${API_BASE}/events/${eventId}`);
  return handleResponse(response);
}

export async function fetchHardwareProfile() {
  const response = await fetch(`${API_BASE}/system/hardware-profile`);
  return handleResponse(response);
}

export async function fetchSystemPaths() {
  const response = await fetch(`${API_BASE}/system/paths`);
  return handleResponse(response);
}

export async function importCuratedDataset(payload) {
  const response = await fetch(`${API_BASE}/curated-dataset/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
}

export async function fetchCuratedDatasetStats() {
  const response = await fetch(`${API_BASE}/curated-dataset/stats`);
  return handleResponse(response);
}

export async function fetchCuratedDatasetLabels() {
  const response = await fetch(`${API_BASE}/curated-dataset/labels`);
  return handleResponse(response);
}

export async function fetchCuratedSegments(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/curated-dataset/segments${suffix}`);
  return handleResponse(response);
}

export async function fetchCuratedSegmentDetail(segmentId) {
  const response = await fetch(`${API_BASE}/curated-dataset/segments/${segmentId}`);
  return handleResponse(response);
}

export async function reviewCuratedSegment(segmentId, payload) {
  const response = await fetch(`${API_BASE}/curated-dataset/segments/${segmentId}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
}

export function getCuratedSegmentAudioUrl(segmentId) {
  return `${API_BASE}/curated-dataset/segments/${segmentId}/audio`;
}

export function getMediaFileUrl(path) {
  return `${API_BASE}/media/file?path=${encodeURIComponent(path)}`;
}

export function getApiUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith("/api") ? `${API_ORIGIN}${path}` : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getPlayableAudioUrl(item) {
  if (!item) return "";
  const direct = item.playable_url || item.audio_url || item.output_audio_url || item.backend_audio_url;
  if (direct) return getApiUrl(direct);
  const audioPath = item.output_audio_path || item.processed_audio_path || item.segment_audio_path || item.stored_path || item.audio_path || item.output_path;
  return audioPath ? getMediaFileUrl(audioPath) : "";
}

export function getAudioLabClipAudioUrl(clip) {
  return getPlayableAudioUrl(clip) || getApiUrl(`/audio-lab/clips/${clip?.id}/audio`);
}

export async function debugResolveAudio(audioPath) {
  const payload = typeof audioPath === "object" ? audioPath : { audio_path: audioPath };
  const response = await fetch(`${API_BASE}/audio-lab/debug/resolve-audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export function getCuratedSegmentSpectrogramUrl(segmentId, mode = "preview", force = false) {
  const params = new URLSearchParams({ mode });
  if (force) {
    params.set("force", "true");
  }
  return `${API_BASE}/curated-dataset/segments/${segmentId}/spectrogram?${params.toString()}`;
}

export async function fetchCuratedSegmentSpectrogramBlob(segmentId, mode = "preview", force = false) {
  const response = await fetch(getCuratedSegmentSpectrogramUrl(segmentId, mode, force));

  if (!response.ok) {
    let message = "No fue posible generar el espectrograma.";
    try {
      const data = await response.json();
      message = typeof data.detail === "object" ? data.detail.message || data.detail.error || message : data.detail || message;
    } catch {
      // Keep generic message when the backend did not return JSON.
    }
    throw new Error(message);
  }

  return response.blob();
}

export async function deleteCuratedSegmentSpectrogram(segmentId, mode = "preview") {
  const response = await fetch(
    `${API_BASE}/curated-dataset/segments/${segmentId}/spectrogram?mode=${encodeURIComponent(mode)}`,
    { method: "DELETE" }
  );
  return handleResponse(response);
}

export async function clearTemporaryCuratedSpectrograms() {
  const response = await fetch(`${API_BASE}/curated-dataset/spectrograms/tmp`, {
    method: "DELETE",
  });
  return handleResponse(response);
}

export async function fetchTaxonomy(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/taxonomy${suffix}`);
  return handleResponse(response);
}

export async function fetchTaxonomyStats() {
  const response = await fetch(`${API_BASE}/taxonomy/stats`);
  return handleResponse(response);
}

export async function suggestTaxonomyFromCurated() {
  const response = await fetch(`${API_BASE}/taxonomy/suggest-from-curated`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function createTaxonomyItem(payload) {
  const response = await fetch(`${API_BASE}/taxonomy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateTaxonomyItem(id, payload) {
  const response = await fetch(`${API_BASE}/taxonomy/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function deactivateTaxonomyItem(id) {
  const response = await fetch(`${API_BASE}/taxonomy/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
}

export async function mergeTaxonomyLabels(payload) {
  const response = await fetch(`${API_BASE}/taxonomy/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function fetchTaxonomyExamples(label, limit = 25) {
  const response = await fetch(
    `${API_BASE}/taxonomy/${encodeURIComponent(label)}/examples?limit=${encodeURIComponent(limit)}`
  );
  return handleResponse(response);
}

export async function fetchTrainingDatasetVersions() {
  const response = await fetch(`${API_BASE}/training-datasets`);
  return handleResponse(response);
}

export async function fetchTrainingDatasetPresets() {
  const response = await fetch(`${API_BASE}/training-datasets/presets`);
  return handleResponse(response);
}

export async function createTrainingDatasetVersion(payload) {
  const response = await fetch(`${API_BASE}/training-datasets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function buildTrainingDatasetVersion(versionId) {
  const response = await fetch(`${API_BASE}/training-datasets/${versionId}/build`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function fetchTrainingDatasetStats(versionId) {
  const response = await fetch(`${API_BASE}/training-datasets/${versionId}/stats`);
  return handleResponse(response);
}

export async function fetchTrainingDatasetAudit(versionId) {
  const response = await fetch(`${API_BASE}/training-datasets/${versionId}/audit`);
  return handleResponse(response);
}

export async function fetchTrainingDatasetItems(versionId, filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/training-datasets/${versionId}/items${suffix}`);
  return handleResponse(response);
}

export async function assignTrainingDatasetSplits(versionId, payload) {
  const response = await fetch(`${API_BASE}/training-datasets/${versionId}/splits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function lockTrainingDatasetVersion(versionId) {
  const response = await fetch(`${API_BASE}/training-datasets/${versionId}/lock`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function archiveTrainingDatasetVersion(versionId) {
  const response = await fetch(`${API_BASE}/training-datasets/${versionId}/archive`, {
    method: "POST",
  });
  return handleResponse(response);
}

export function getTrainingDatasetExportUrl(versionId, includedOnly = false) {
  const params = new URLSearchParams({ format: "csv" });
  if (includedOnly) {
    params.set("included_only", "true");
  }
  return `${API_BASE}/training-datasets/${versionId}/export?${params.toString()}`;
}

export async function fetchMlHealth() {
  const response = await fetch(`${API_BASE}/ml/health`);
  return handleResponse(response);
}

export async function fetchMlModels() {
  const response = await fetch(`${API_BASE}/ml/models`);
  return handleResponse(response);
}

export async function fetchMlModelRegistry() {
  const response = await fetch(`${API_BASE}/ml/models/registry`);
  return handleResponse(response);
}

export async function promoteMlModel(modelId, payload = {}) {
  const response = await fetch(`${API_BASE}/ml/models/${encodeURIComponent(modelId)}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function archiveMlModel(modelId, payload = {}) {
  const response = await fetch(`${API_BASE}/ml/models/${encodeURIComponent(modelId)}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function rejectMlModel(modelId, payload = {}) {
  const response = await fetch(`${API_BASE}/ml/models/${encodeURIComponent(modelId)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateMlModelNotes(modelId, notes) {
  const response = await fetch(`${API_BASE}/ml/models/${encodeURIComponent(modelId)}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  return handleResponse(response);
}

export async function fetchMlTrainingPresets() {
  const response = await fetch(`${API_BASE}/ml/training/presets`);
  return handleResponse(response);
}

export async function fetchMlTrainingManifests() {
  const response = await fetch(`${API_BASE}/ml/training/manifests`);
  return handleResponse(response);
}

export async function fetchMlManifestSummary(manifestCsv) {
  const params = new URLSearchParams({ manifest_csv: manifestCsv });
  const response = await fetch(`${API_BASE}/ml/training/manifest-summary?${params.toString()}`);
  return handleResponse(response);
}

export async function fetchMlManifestCandidates(manifestCsv) {
  const params = new URLSearchParams({ manifest_csv: manifestCsv });
  const response = await fetch(`${API_BASE}/ml/training/manifest-candidates?${params.toString()}`);
  return handleResponse(response);
}

export async function dryRunMlTrainingCleanManifest(payload) {
  const response = await fetch(`${API_BASE}/ml/training/clean-manifest/dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function createMlTrainingCleanManifest(payload) {
  const response = await fetch(`${API_BASE}/ml/training/clean-manifest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function dryRunMlSpecializedManifest(payload) {
  const response = await fetch(`${API_BASE}/ml/training/specialized-manifest/dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function createMlSpecializedManifest(payload) {
  const response = await fetch(`${API_BASE}/ml/training/specialized-manifest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function fetchMlTrainingJobs() {
  const response = await fetch(`${API_BASE}/ml/training/jobs`);
  return handleResponse(response);
}

export async function createMlTrainingJob(payload) {
  const response = await fetch(`${API_BASE}/ml/training/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function fetchMlTrainingJob(jobId) {
  const response = await fetch(`${API_BASE}/ml/training/jobs/${encodeURIComponent(jobId)}`);
  return handleResponse(response);
}

export async function fetchMlTrainingJobLogs(jobId) {
  const response = await fetch(`${API_BASE}/ml/training/jobs/${encodeURIComponent(jobId)}/logs`);
  return handleResponse(response);
}

export async function downloadMlTrainingJobArtifact(jobId, filename) {
  const response = await fetch(`${API_BASE}/ml/training/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(filename)}`);
  if (!response.ok) {
    let message = "No fue posible descargar el artefacto.";
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return response.blob();
}

export async function cancelMlTrainingJob(jobId) {
  const response = await fetch(`${API_BASE}/ml/training/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  return handleResponse(response);
}

export async function evaluateMlTrainingJob(jobId, payload = {}) {
  const response = await fetch(`${API_BASE}/ml/training/jobs/${encodeURIComponent(jobId)}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function calibrateMlTrainingJobThreshold(jobId, payload = {}) {
  const response = await fetch(`${API_BASE}/ml/training/jobs/${encodeURIComponent(jobId)}/calibrate-threshold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function registerMlTrainingJobModel(jobId, payload = {}) {
  const response = await fetch(`${API_BASE}/ml/training/jobs/${encodeURIComponent(jobId)}/register-model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function predictAudioPath(payload) {
  const response = await fetch(`${API_BASE}/ml/predict/audio-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function predictUploadedAudio(file, payload = {}) {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, value);
    }
  });

  const response = await fetch(`${ML_API_BASE}/predict/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(response);
}

export async function fetchMlSpectrogramBlob(payload) {
  const response = await fetch(`${API_BASE}/ml/spectrogram/audio-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = "No fue posible generar el espectrograma.";
    try {
      const data = await response.json();
      const detail = data.detail;
      if (response.status === 503 || detail?.detail === "ml_service_unavailable") {
        message = "El servicio de espectrograma no est\u00e1 disponible. Inicia acusticafauna-ml-api o revisa ML_API_BASE_URL.";
      } else {
        message = detail?.message || detail || data.message || message;
      }
    } catch {
      // Keep generic message for non-JSON errors.
    }
    throw new Error(message);
  }

  return response.blob();
}

export async function createAudioLabAnnotation(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function fetchAudioLabAnnotations(audioPathOrFilters) {
  const params = new URLSearchParams();
  if (typeof audioPathOrFilters === "string") {
    if (audioPathOrFilters) params.set("audio_path", audioPathOrFilters);
  } else if (audioPathOrFilters && typeof audioPathOrFilters === "object") {
    Object.entries(audioPathOrFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, value);
    });
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/audio-lab/annotations${suffix}`);
  return handleResponse(response);
}

export async function createAudioLabAnnotationsBulk(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/annotations/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function undoLastAudioLabBulkAnnotation(jobId = "") {
  const suffix = jobId ? `?job_id=${encodeURIComponent(jobId)}` : "";
  const response = await fetch(`${API_BASE}/audio-lab/annotations/undo-last-bulk${suffix}`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function createAudioLabCuratedDataset(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/curated-datasets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateAudioLabAnnotation(annotationId, payload) {
  const response = await fetch(`${API_BASE}/audio-lab/annotations/${encodeURIComponent(annotationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function retractAudioLabAnnotation(annotationId) {
  const response = await fetch(`${API_BASE}/audio-lab/annotations/${encodeURIComponent(annotationId)}/retract`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function createAudioLabClip(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function detectAudioLabActivity(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/activity/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function createAudioLabActivityClips(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/activity/create-clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function createAudioLabBatchProcessingJob(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function scanAudioLabFolderBatch(payload, options = {}) {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  return handleResponse(response);
}

export async function profileAudioLabCalibrationFolder(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/calibration/profile-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function testAudioLabCalibrationConfigs(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/calibration/test-configs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function fetchAudioLabCalibrationReports() {
  const response = await fetch(`${API_BASE}/audio-lab/calibration/reports`);
  return handleResponse(response);
}

export async function fetchAudioLabCalibrationReport(reportId) {
  const response = await fetch(`${API_BASE}/audio-lab/calibration/reports/${encodeURIComponent(reportId)}`);
  return handleResponse(response);
}

export async function createAudioLabFolderBatchJob(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function fetchAudioLabFolderBatchJobs() {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs`);
  return handleResponse(response);
}

export async function fetchAudioLabFolderBatchJob(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs/${encodeURIComponent(jobId)}`);
  return handleResponse(response);
}

export async function fetchAudioLabFolderBatchLogs(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs/${encodeURIComponent(jobId)}/logs`);
  return handleResponse(response);
}

export async function pauseAudioLabFolderBatchJob(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs/${encodeURIComponent(jobId)}/pause`, { method: "POST" });
  return handleResponse(response);
}

export async function resumeAudioLabFolderBatchJob(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs/${encodeURIComponent(jobId)}/resume`, { method: "POST" });
  return handleResponse(response);
}

export async function cancelAudioLabFolderBatchJob(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  return handleResponse(response);
}

export async function fetchAudioLabFolderBatchOutputs(jobId, options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", options.limit);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs/${encodeURIComponent(jobId)}/outputs${suffix}`);
  return handleResponse(response);
}

export async function fetchAudioLabFolderBatchSummary(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/folder-batch/jobs/${encodeURIComponent(jobId)}/summary`);
  return handleResponse(response);
}

export function getAudioLabFolderBatchManifestUrl(jobId) {
  return `${API_BASE}/audio-lab/folder-batch/jobs/${encodeURIComponent(jobId)}/manifest`;
}

export async function fetchAudioLabBatchProcessingJobs() {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/jobs`);
  return handleResponse(response);
}

export async function fetchAudioLabBatchProcessingJob(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/jobs/${encodeURIComponent(jobId)}`);
  return handleResponse(response);
}

export async function fetchAudioLabBatchProcessingLogs(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/jobs/${encodeURIComponent(jobId)}/logs`);
  return handleResponse(response);
}

export async function cancelAudioLabBatchProcessingJob(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function fetchAudioLabMaintenance() {
  const response = await fetch(`${API_BASE}/audio-lab/maintenance`);
  return handleResponse(response);
}

export async function markAudioLabBatchJobAsTest(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/jobs/${encodeURIComponent(jobId)}/mark-test`, { method: "POST" });
  return handleResponse(response);
}

export async function deleteAudioLabBatchJobOutputs(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/jobs/${encodeURIComponent(jobId)}/outputs`, { method: "DELETE" });
  return handleResponse(response);
}

export async function deleteAudioLabBatchJobUploads(jobId) {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/jobs/${encodeURIComponent(jobId)}/uploads`, { method: "DELETE" });
  return handleResponse(response);
}

export async function deleteAudioLabOutputQualityReport(outputId) {
  const response = await fetch(`${API_BASE}/audio-lab/batch-processing/outputs/${encodeURIComponent(outputId)}/quality-report`, { method: "DELETE" });
  return handleResponse(response);
}

export async function cleanupAudioLabTestDerivatives() {
  const response = await fetch(`${API_BASE}/audio-lab/maintenance/cleanup-tests`, { method: "POST" });
  return handleResponse(response);
}

export async function createAudioLabQualityReport(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/audio-processing/quality-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function fetchAudioLabWaveform(audioPath, points = 1400) {
  const params = new URLSearchParams({ audio_path: audioPath, points: String(points) });
  const response = await fetch(`${API_BASE}/audio-lab/waveform?${params.toString()}`);
  return handleResponse(response);
}

export async function fetchAudioLabClips() {
  const response = await fetch(`${API_BASE}/audio-lab/clips`);
  return handleResponse(response);
}

export async function uploadAudioLabBatch(files) {
  const encoded = await Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const value = String(reader.result || "");
            resolve({
              original_filename: file.name,
              content_base64: value.includes(",") ? value.split(",").pop() : value,
            });
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
  const response = await fetch(`${API_BASE}/audio-lab/uploads/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: encoded }),
  });
  return handleResponse(response);
}

export async function fetchAudioLabFeedbackAudit(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/audio-lab/feedback/audit${suffix}`);
  return handleResponse(response);
}

export async function fetchAudioLabAnnotationFacets() {
  const response = await fetch(`${API_BASE}/audio-lab/annotations/facets`);
  return handleResponse(response);
}

export async function dryRunAudioLabCleanManifest(payload = {}) {
  const response = await fetch(`${API_BASE}/audio-lab/clean-manifest/dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function createAudioLabCleanManifest(payload) {
  const response = await fetch(`${API_BASE}/audio-lab/clean-manifest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}
