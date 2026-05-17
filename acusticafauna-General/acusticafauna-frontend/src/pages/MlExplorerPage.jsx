import { useEffect, useMemo, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import {
  createMlSpecializedManifest,
  dryRunMlSpecializedManifest,
  fetchMlManifestCandidates,
  fetchMlManifestSummary,
  fetchMlTrainingManifests,
} from "../services/api";

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

function fmt(value) {
  if (typeof value === "number") return value.toLocaleString();
  return value ?? "-";
}

function safeSlug(value) {
  return String(value || "modelo_especializado")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function outputPathFromName(name) {
  const clean = safeSlug(String(name || "manifest_especializado").replace(/\.csv$/i, ""));
  return `manifests/clean/${clean}.csv`;
}

function suggestedName(candidate) {
  if (!candidate?.group) return "manifest_especializado";
  const mode = candidate.recommendation === "binario" ? "binary" : "species";
  return `${safeSlug(candidate.group)}_${mode}_v1_manifest`;
}

function recommendationTone(value) {
  if (value === "binario" || value === "multiclase") return "success";
  if (value === "necesita_mas_datos") return "warning";
  return "info";
}

function splitText(splitClassCounts, label) {
  return ["train", "val", "test"].map((split) => `${split}: ${splitClassCounts?.[split]?.[label] || 0}`).join(" / ");
}

export default function MlExplorerPage() {
  const [manifests, setManifests] = useState([]);
  const [selectedManifest, setSelectedManifest] = useState("");
  const [summary, setSummary] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [manifestName, setManifestName] = useState("manifest_especializado");
  const [options, setOptions] = useState({
    apply_feedback: true,
    exclude_human_voice: true,
    exclude_retracted: true,
    exclude_excluded_from_training: true,
    block_conflicts: true,
  });
  const [dryRun, setDryRun] = useState(null);
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.group === selectedGroup) || null,
    [candidates, selectedGroup]
  );
  const outputCsv = outputPathFromName(manifestName);
  const classifierKind = selectedLabels.length > 2 ? "multiclase" : selectedLabels.length === 2 ? "binario especializado" : "review";
  const targetMode = selectedLabels.length >= 2 ? "multiclass" : "review";
  const trainingHref = created
    ? `/auditoria-retroalimentacion?training_manifest=${encodeURIComponent(created.output_csv)}&target_mode=${encodeURIComponent(created.target_mode || targetMode)}&preset=amphibian_species&model_slug=${encodeURIComponent(safeSlug(manifestName))}`
    : "";

  useEffect(() => {
    loadManifests();
  }, []);

  useEffect(() => {
    if (selectedManifest) {
      loadSummary(selectedManifest);
    }
  }, [selectedManifest]);

  useEffect(() => {
    if (!selectedCandidate) return;
    const trainable = selectedCandidate.trainable_classes?.length >= 2 ? selectedCandidate.trainable_classes : selectedCandidate.classes || [];
    setSelectedLabels(trainable);
    setManifestName(suggestedName(selectedCandidate));
    setDryRun(null);
    setCreated(null);
  }, [selectedCandidate]);

  async function runLocked(key, callback) {
    if (loading[key]) return;
    try {
      setLoading((current) => ({ ...current, [key]: true }));
      setError("");
      await callback();
    } catch (err) {
      setError(err.message || "No fue posible completar la accion.");
    } finally {
      setLoading((current) => ({ ...current, [key]: false }));
    }
  }

  async function loadManifests() {
    await runLocked("manifests", async () => {
      const data = await fetchMlTrainingManifests();
      const items = data.items || [];
      setManifests(items);
      const preferred = items.find((item) => item.path === "manifests/amphibian_species_v2_aliases_top_manifest.csv") || items[0];
      if (preferred) setSelectedManifest(preferred.path);
    });
  }

  async function loadSummary(manifestCsv) {
    await runLocked("summary", async () => {
      setCandidates([]);
      setSelectedGroup("");
      setSelectedLabels([]);
      setDryRun(null);
      setCreated(null);
      const data = await fetchMlManifestSummary(manifestCsv);
      setSummary(data);
      setMessage("Resumen de manifest cargado.");
    });
  }

  async function searchCandidates() {
    await runLocked("candidates", async () => {
      const data = await fetchMlManifestCandidates(selectedManifest);
      setCandidates(data.candidates || []);
      setSelectedGroup(data.candidates?.[0]?.group || "");
      setMessage("Candidatos entrenables calculados.");
    });
  }

  function toggleLabel(label) {
    setSelectedLabels((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
    );
    setDryRun(null);
    setCreated(null);
  }

  function payload(strategy = "fail") {
    return {
      base_manifest_csv: selectedManifest,
      output_csv: outputCsv,
      include_labels: selectedLabels,
      filter_mode: "labels",
      ...options,
      output_conflict_strategy: strategy,
    };
  }

  async function runDryRun() {
    await runLocked("dryRun", async () => {
      const data = await dryRunMlSpecializedManifest(payload());
      setDryRun(data);
      setCreated(null);
      setMessage(data.can_train ? "Dry-run apto para entrenamiento." : "Dry-run completado con advertencias.");
    });
  }

  async function createManifest(strategy = "fail") {
    await runLocked("create", async () => {
      const data = await createMlSpecializedManifest(payload(strategy));
      setCreated(data);
      setDryRun(data);
      setMessage("Manifest especializado creado correctamente.");
    });
  }

  return (
    <div className="space-y-6 p-6">
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <strong>No se pudo completar la accion.</strong>
          <p>{error}</p>
          <p className="mt-1">Revisa que la ML API este activa, que el manifest exista y que el destino no exista ya. Puedes crear con sufijo nuevo si hay conflicto.</p>
        </div>
      ) : null}

      <SectionCard title="A. Seleccionar manifest base" subtitle="Elige un CSV disponible en acusticafauna-ML/manifests; no se modifican audios ni dataset_curado.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-slate-600">Manifest base</span>
            <select value={selectedManifest} onChange={(event) => setSelectedManifest(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {manifests.map((item) => (
                <option key={item.path} value={item.path}>{item.name}</option>
              ))}
            </select>
            <span className="mt-1 block truncate text-xs text-slate-500" title={selectedManifest}>{selectedManifest || "Sin manifest seleccionado"}</span>
          </label>
          <button type="button" onClick={() => selectedManifest && loadSummary(selectedManifest)} disabled={!selectedManifest || loading.summary} className="self-end rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            <LoadingText loading={loading.summary} loadingText="Cargando...">Actualizar resumen</LoadingText>
          </button>
        </div>
      </SectionCard>

      <SectionCard title="B. Resumen del manifest" subtitle="Vista rapida de filas, columnas, clases, splits y archivos faltantes.">
        {summary ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">Filas</span><br /><strong>{fmt(summary.rows)}</strong></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">Clases</span><br /><strong>{fmt(summary.total_classes)}</strong></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">Duracion total</span><br /><strong>{fmt(summary.duration_total)} s</strong></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">Faltantes</span><br /><strong>{fmt(summary.missing_files)}</strong></div>
              {Object.entries(summary.split_counts || {}).map(([split, count]) => (
                <div key={split} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">{split}</span><br /><strong>{fmt(count)}</strong></div>
              ))}
            </div>
            <div>
              <strong className="text-sm">Columnas disponibles</strong>
              <div className="mt-2 flex flex-wrap gap-2">{(summary.columns || []).map((column) => <Badge key={column}>{column}</Badge>)}</div>
            </div>
            <div>
              <strong className="text-sm">Labels principales</strong>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {(summary.top_labels || []).slice(0, 12).map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span className="truncate">{item.label || "(vacio)"}</span>
                    <Badge>{item.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Selecciona un manifest para ver el resumen.</p>
        )}
      </SectionCard>

      <SectionCard title="C. Candidatos entrenables" subtitle="Agrupa por genero inferido y aplica minimos recomendados por clase y split.">
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={searchCandidates} disabled={!selectedManifest || loading.candidates} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <LoadingText loading={loading.candidates} loadingText="Buscando...">Buscar candidatos entrenables</LoadingText>
          </button>
          {candidates.length ? <Badge tone="info">{candidates.length} grupos</Badge> : null}
        </div>
        {candidates.length ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="max-h-96 space-y-2 overflow-auto pr-1">
              {candidates.map((candidate) => (
                <button
                  type="button"
                  key={candidate.group}
                  onClick={() => setSelectedGroup(candidate.group)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedGroup === candidate.group ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong>{candidate.group}</strong>
                    <Badge tone={recommendationTone(candidate.recommendation)}>{candidate.recommendation}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{candidate.classes.length} especies, {candidate.rows} filas</div>
                </button>
              ))}
            </div>
            {selectedCandidate ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{selectedCandidate.group}</h3>
                    <p className="text-sm text-slate-600">{selectedCandidate.recommendation_message}</p>
                  </div>
                  <Badge tone={selectedCandidate.minimums_ok ? "success" : "warning"}>{selectedCandidate.minimums_ok ? "minimos ok" : "revisar minimos"}</Badge>
                </div>
                <div className="space-y-2">
                  {selectedCandidate.classes.map((label) => (
                    <label key={label} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <input type="checkbox" checked={selectedLabels.includes(label)} onChange={() => toggleLabel(label)} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <strong className="break-all">{label}</strong>
                        <span className="block text-xs text-slate-500">
                          Total: {selectedCandidate.class_counts?.[label] || 0} | {splitText(selectedCandidate.split_class_counts, label)}
                        </span>
                      </span>
                      <Badge tone={selectedCandidate.trainable_classes?.includes(label) ? "success" : "warning"}>
                        {selectedCandidate.trainable_classes?.includes(label) ? "entrenable" : "pocos datos"}
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Presiona Buscar candidatos entrenables para ver generos como Boana, Dendropsophus, Pristimantis o Nymphargus si estan en el manifest.</p>
        )}
      </SectionCard>

      <SectionCard title="D. Preparar manifest especializado" subtitle="Selecciona clases, opciones de limpieza y nombre de salida; primero ejecuta dry-run.">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-slate-600">Nombre del manifest</span>
            <input value={manifestName} onChange={(event) => { setManifestName(event.target.value); setDryRun(null); setCreated(null); }} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            <span className="mt-1 block truncate font-mono text-xs text-slate-500">{outputCsv}</span>
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <strong>Preset sugerido</strong>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={targetMode === "review" ? "warning" : "success"}>{classifierKind}</Badge>
              <Badge>{targetMode}</Badge>
              <Badge>{selectedLabels.length} clases seleccionadas</Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["apply_feedback", "Aplicar feedback acumulado"],
            ["exclude_human_voice", "Excluir voz_humana"],
            ["exclude_retracted", "Excluir retracted"],
            ["exclude_excluded_from_training", "Excluir excluded_from_training"],
            ["block_conflicts", "Bloquear conflictos"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={Boolean(options[key])} onChange={(event) => { setOptions((current) => ({ ...current, [key]: event.target.checked })); setDryRun(null); setCreated(null); }} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={runDryRun} disabled={!selectedManifest || selectedLabels.length < 2 || loading.dryRun} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            <LoadingText loading={loading.dryRun} loadingText="Ejecutando dry-run...">Dry-run especializado</LoadingText>
          </button>
          <button type="button" onClick={() => createManifest("fail")} disabled={!dryRun || !dryRun.can_train || loading.create} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <LoadingText loading={loading.create} loadingText="Creando manifest...">Crear manifest especializado</LoadingText>
          </button>
          {error?.includes("destino ya existe") || error?.includes("existe") ? (
            <button type="button" onClick={() => createManifest("suffix")} disabled={!dryRun || loading.create} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50">
              Crear con sufijo nuevo
            </button>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="E. Resultado dry-run" subtitle="Revisa filas, splits, exclusiones, conflictos y recomendacion final antes de crear.">
        {dryRun ? (
          <div className="space-y-4">
            <div className={`rounded-lg border p-3 text-sm ${dryRun.can_train ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <strong>{dryRun.recommendation_final}</strong>
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {["rows_before", "rows_after", "feedback_applied", "excluded_by_filter", "excluded_by_human_voice", "conflicts_detected"].map((key) => (
                <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><span className="text-xs text-slate-500">{key}</span><br /><strong>{dryRun[key] ?? 0}</strong></div>
              ))}
            </div>
            <div>
              <strong className="text-sm">Clases y splits</strong>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {(dryRun.classes || []).map((label) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                    <strong>{label}</strong>
                    <p className="text-xs text-slate-500">Total: {dryRun.class_counts?.[label] || 0} | {splitText(dryRun.split_class_counts, label)}</p>
                  </div>
                ))}
              </div>
            </div>
            {dryRun.warnings?.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {dryRun.warnings.map((item) => <p key={item}>{item}</p>)}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Aun no hay dry-run. Selecciona al menos dos clases y ejecuta la validacion.</p>
        )}
      </SectionCard>

      <SectionCard title="F. Crear manifest y usar para entrenamiento" subtitle="La creacion solo escribe un nuevo CSV en manifests/clean; el entrenamiento no se inicia automaticamente.">
        {created ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <strong>Manifest especializado creado correctamente</strong>
            <div className="grid gap-2 md:grid-cols-2">
              <div><span className="text-emerald-700">Destino</span><br /><strong className="break-all font-mono">{created.output_csv}</strong></div>
              <div><span className="text-emerald-700">Resumen JSON</span><br /><strong className="break-all font-mono">{created.summary_json}</strong></div>
              <div><span className="text-emerald-700">rows_after</span><br /><strong>{created.rows_after}</strong></div>
              <div><span className="text-emerald-700">target_mode sugerido</span><br /><strong>{created.target_mode}</strong></div>
            </div>
            <a href={trainingHref} className="inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
              Usar este manifest para entrenar
            </a>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Cuando el dry-run sea apto, crea el manifest y luego envialo al flujo de entrenamiento web.</p>
        )}
      </SectionCard>
    </div>
  );
}
