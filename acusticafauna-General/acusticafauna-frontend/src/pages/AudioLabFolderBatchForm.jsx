import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Badge from "../components/shared/Badge";
import {
  applyPresetToFolderBatchDraft,
  updateFolderBatchDraftField,
} from "./audioLabFolderBatchCalibration";

function LoadingText({ loading, loadingText, children }) {
  return loading ? loadingText : children;
}

const NUMBER_FIELDS = [
  ["frequency_min_hz", "Frecuencia minima Hz", "10"],
  ["frequency_max_hz", "Frecuencia maxima Hz", "10"],
  ["threshold_dbfs", "Threshold dBFS", "1"],
  ["min_band_ratio", "Ratio minimo energia banda", "0.05"],
  ["min_activity_seconds", "Min actividad s", "0.1"],
  ["min_silence_seconds", "Min silencio s", "0.1"],
  ["padding_seconds", "Padding s", "0.1"],
  ["clip_duration_seconds", "Duracion clip s", "0.5"],
  ["max_segment_seconds", "Max segmento s", "0.5"],
];

const CHECKBOX_FIELDS = [
  ["bandpass", "Bandpass"],
  ["noise_reduce", "Reduccion de ruido"],
  ["normalize", "Normalizar"],
  ["discard_empty", "Descartar vacios"],
  ["detect_frog", "Detector rana/sapo si ML API esta disponible"],
  ["detect_contaminants_heuristic", "Marcar contaminantes heuristico"],
  ["create_clips", "Crear clips derivados"],
  ["create_manifest", "Crear manifest CSV"],
];

const PresetManager = memo(function PresetManager({
  draft,
  presets,
  speciesFilter,
  favoritesOnly,
  onSpeciesFilterChange,
  onFavoritesOnlyChange,
  onApplyPreset,
  onSave,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onExport,
  onImport,
}) {
  const visiblePresets = useMemo(() => {
    const term = speciesFilter.trim().toLowerCase();
    return presets.filter((preset) => {
      const matchesSpecies = !term || String(preset.species_label || preset.name || "").toLowerCase().includes(term);
      const matchesFavorite = !favoritesOnly || Boolean(preset.favorite);
      return matchesSpecies && matchesFavorite;
    });
  }, [favoritesOnly, presets, speciesFilter]);

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-700">Preset</div>
      <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
        <label className="text-xs font-semibold text-slate-600">
          Filtrar por especie
          <input value={speciesFilter} onChange={(event) => onSpeciesFilterChange(event.target.value)} placeholder="Pristimantis, ave, insecto..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={favoritesOnly} onChange={(event) => onFavoritesOnlyChange(event.target.checked)} />
          Favoritos
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onSave(draft)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Guardar preset actual</button>
          <button type="button" onClick={() => onEdit(draft)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Editar preset</button>
          <button type="button" onClick={onDuplicate} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Duplicar preset</button>
          <button type="button" onClick={onDelete} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Eliminar preset</button>
          <button type="button" onClick={onToggleFavorite} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Favorito</button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={onExport} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">Exportar presets JSON</button>
        <label className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800">
          Importar presets JSON
          <input type="file" accept="application/json,.json" onChange={onImport} className="hidden" />
        </label>
      </div>
      <div className="flex max-h-48 flex-wrap gap-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
        {visiblePresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyPreset(preset)}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${draft.preset === preset.id ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700"}`}
          >
            <span className="block">{preset.favorite ? "* " : ""}{preset.name}</span>
            <span className="mt-1 block text-[11px] font-semibold text-slate-500">{preset.source === "system" ? "Sistema" : "Usuario"}{preset.species_label ? ` - ${preset.species_label}` : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

function AudioLabFolderBatchForm({
  form,
  mlUnavailable,
  presets,
  presetSpeciesFilter,
  presetFavoritesOnly,
  calibrationModeInfo,
  scanState,
  scanning,
  submitting,
  startDisabledReason,
  activeJobFinished,
  onCommitDraft,
  onEditingFocus,
  onEditingBlur,
  onApplyPreset,
  onSavePreset,
  onEditPreset,
  onDuplicatePreset,
  onDeletePreset,
  onTogglePresetFavorite,
  onExportPresets,
  onImportPresets,
  onPresetSpeciesFilterChange,
  onPresetFavoritesOnlyChange,
  onScan,
  onCancelScan,
  onStart,
}) {
  const [draft, setDraft] = useState(form);
  const focusedRef = useRef(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!focusedRef.current) setDraft(form);
  }, [form]);

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, []);

  const commit = useCallback((nextDraft = draft, reason = "blur") => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    onCommitDraft(nextDraft, reason);
  }, [draft, onCommitDraft]);

  const scheduleSecondaryCommit = useCallback((nextDraft) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => onCommitDraft(nextDraft, "debounced"), 450);
  }, [onCommitDraft]);

  const updateDraft = useCallback((key, value) => {
    setDraft((current) => {
      const next = updateFolderBatchDraftField(current, key, value);
      scheduleSecondaryCommit(next);
      return next;
    });
  }, [scheduleSecondaryCommit]);

  const handleFocus = useCallback(() => {
    focusedRef.current = true;
    onEditingFocus();
  }, [onEditingFocus]);

  const handleBlur = useCallback(() => {
    focusedRef.current = false;
    commit(draft, "blur");
    onEditingBlur();
  }, [commit, draft, onEditingBlur]);

  const applyPreset = useCallback((preset) => {
    setDraft((current) => {
      const next = applyPresetToFolderBatchDraft(current, preset);
      onApplyPreset(preset, next);
      return next;
    });
  }, [onApplyPreset]);

  const scan = useCallback(() => {
    commit(draft, "scan");
    onScan(draft);
  }, [commit, draft, onScan]);

  const start = useCallback(() => {
    commit(draft, "start");
    onStart(draft);
  }, [commit, draft, onStart]);

  if (import.meta.env.DEV && window.__ACUSTICAFAUNA_DEBUG_RENDERS__) {
    console.debug("[AudioLabFolderBatchForm] render");
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-slate-700">Ruta de carpeta local</span>
        <input value={draft.folder_path || ""} onFocus={handleFocus} onBlur={handleBlur} onChange={(event) => updateDraft("folder_path", event.target.value)} placeholder="C:\\Datos\\Ranas\\lote_01" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <span className="mt-1 block text-xs text-slate-500">La ruta debe existir en este computador. Ejemplo: C:\Datos\Ranas\lote_01.</span>
      </label>

      {draft.exploratory_mode ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">Modo exploratorio</Badge>
            <span className="font-semibold">Recomendado procesar primero una muestra pequena.</span>
          </div>
          <p className="mt-1">Esta configuracion puede incluir lluvia, viento o falsos candidatos. No usar para entrenamiento sin revision manual.</p>
        </div>
      ) : null}

      {draft.calibration_trace?.reason === "zero_candidates_after_batch" ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Trazabilidad</Badge>
            <span className="font-semibold">Parametros copiados desde un job terminado sin candidatos.</span>
          </div>
          <p className="mt-1"><strong>Job anterior:</strong> <span className="font-mono">{draft.calibration_trace.previous_job_id}</span></p>
          <p className="mt-1"><strong>Configuracion aplicada:</strong> {draft.calibration_trace.applied_variant_label || draft.calibration_trace.applied_variant}</p>
          <p className="mt-1"><strong>Razon:</strong> zero_candidates_after_batch</p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-slate-700">Nombre del job</span>
          <input value={draft.job_name || ""} onFocus={handleFocus} onBlur={handleBlur} onChange={(event) => updateDraft("job_name", event.target.value)} placeholder="boana_lote_mayo_2026" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-slate-700">Label objetivo / especie</span>
          <input value={draft.target_label || ""} onFocus={handleFocus} onBlur={handleBlur} onChange={(event) => updateDraft("target_label", event.target.value)} placeholder="Boana_boans" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
      </div>

      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <input type="checkbox" checked={Boolean(draft.recursive)} onFocus={handleFocus} onBlur={handleBlur} onChange={(event) => updateDraft("recursive", event.target.checked)} />
        Buscar en subcarpetas
      </label>

      <PresetManager
        draft={draft}
        presets={presets}
        speciesFilter={presetSpeciesFilter}
        favoritesOnly={presetFavoritesOnly}
        onSpeciesFilterChange={onPresetSpeciesFilterChange}
        onFavoritesOnlyChange={onPresetFavoritesOnlyChange}
        onApplyPreset={applyPreset}
        onSave={onSavePreset}
        onEdit={onEditPreset}
        onDuplicate={onDuplicatePreset}
        onDelete={onDeletePreset}
        onToggleFavorite={onTogglePresetFavorite}
        onExport={onExportPresets}
        onImport={onImportPresets}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {NUMBER_FIELDS.map(([key, label, step]) => (
          <label key={key} className="text-sm">
            <span className="mb-1 block font-semibold">{label}</span>
            <input type="number" step={step} value={draft[key] ?? ""} onFocus={handleFocus} onBlur={handleBlur} onChange={(event) => updateDraft(key, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        ))}
      </div>

      <div className="grid gap-2 text-sm md:grid-cols-2">
        {CHECKBOX_FIELDS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <input type="checkbox" checked={Boolean(draft[key])} onFocus={handleFocus} onBlur={handleBlur} onChange={(event) => updateDraft(key, event.target.checked)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-slate-700">Perfil de recursos</span>
        <select value={draft.resource_profile || "auto"} onFocus={handleFocus} onBlur={handleBlur} onChange={(event) => updateDraft("resource_profile", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
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
        {calibrationModeInfo ? (
          <div className="basis-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
            <Badge tone={calibrationModeInfo.tone}>{calibrationModeInfo.badge}</Badge>
            <span className="ml-2">{calibrationModeInfo.message}</span>
          </div>
        ) : null}
        <button type="button" onClick={scan} disabled={scanning} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <LoadingText loading={scanning} loadingText="Escaneando...">Escanear carpeta</LoadingText>
        </button>
        {scanning ? (
          <button type="button" onClick={onCancelScan} className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">
            Cancelar escaneo
          </button>
        ) : null}
        <button type="button" onClick={start} disabled={Boolean(startDisabledReason) || submitting} title={startDisabledReason || "Crear un job nuevo con la carpeta y parametros actuales."} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <LoadingText loading={submitting} loadingText="Creando job...">Iniciar procesamiento</LoadingText>
        </button>
      </div>
      {scanning ? <p className="text-xs font-semibold text-amber-800">Espera a que termine el escaneo o cancelalo.</p> : null}
      {startDisabledReason ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">{startDisabledReason}</p> : null}
      {scanState.message ? <p className="text-xs text-slate-600">{scanState.message}</p> : null}
      {activeJobFinished ? <p className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs font-semibold text-blue-800">Este job ya termino. Para iniciar uno nuevo, escanea la carpeta actual.</p> : null}
      {mlUnavailable ? null : null}
    </div>
  );
}

export default memo(AudioLabFolderBatchForm);
