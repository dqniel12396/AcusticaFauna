import { useEffect, useMemo, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import {
  archiveMlModel,
  fetchMlModelRegistry,
  promoteMlModel,
  rejectMlModel,
  updateMlModelNotes,
} from "../services/api";

const STATUS_TONE = {
  active: "success",
  experimental: "info",
  archived: "warning",
  rejected: "danger",
};
const STATUS_ORDER = ["active", "experimental", "archived", "rejected"];
const STATUS_LABELS = {
  active: "Modelo activo/default",
  experimental: "Modelos experimentales",
  archived: "Archivados",
  rejected: "Rechazados",
};

function modelId(model) {
  return model?.model_id || model?.id || "";
}

function metric(model) {
  return (
    model?.calibrated_metrics?.balanced_accuracy ??
    model?.calibration?.test_metrics?.balanced_accuracy ??
    model?.raw_argmax_metrics?.balanced_accuracy ??
    model?.metrics?.balanced_accuracy ??
    model?.balanced_accuracy
  );
}

function isUnreliable(model) {
  const value = metric(model);
  return typeof value === "number" && value < 0.6;
}

function fmt(value) {
  return typeof value === "number" ? value.toFixed(3) : value ?? "-";
}

function describeRule(rule) {
  if (!rule) return "Sin regla";
  return `${rule.score_column || "score"} >= ${rule.threshold ?? "-"} => ${rule.if_score_gte_threshold || "-"}; si no => ${rule.else || "-"}`;
}

function flattenTask(task) {
  return Object.values(task.statuses || {}).flat();
}

function statusModels(task, status) {
  return task.statuses?.[status] || [];
}

export default function MlModelsPage() {
  const [registry, setRegistry] = useState({ tasks: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notesDraft, setNotesDraft] = useState({});
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    loadRegistry();
  }, []);

  async function loadRegistry() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchMlModelRegistry();
      setRegistry(data);
      const drafts = {};
      (data.tasks || []).forEach((task) => {
        flattenTask(task).forEach((model) => {
          drafts[modelId(model)] = model.notes || "";
        });
      });
      setNotesDraft(drafts);
    } catch (err) {
      setError(err.message || "No fue posible cargar el registry ML.");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(label, fn) {
    try {
      setError("");
      await fn();
      setMessage(label);
      await loadRegistry();
    } catch (err) {
      setError(err.message || "No fue posible actualizar el modelo.");
    }
  }

  async function handlePromote(model) {
    const comparison = model.comparison_against_active;
    let forcePromote = false;
    if (isUnreliable(model)) {
      const confirmed = window.confirm(`ALERTA FUERTE: balanced_accuracy ${fmt(metric(model))} < 0.600.\n\nNo promover: bajo rendimiento. Promoverlo puede romper la identificacion automatica.`);
      if (!confirmed) return;
      const typed = window.prompt("Escribe PROMOVER BAJO RENDIMIENTO para forzar la promocion.");
      if (typed !== "PROMOVER BAJO RENDIMIENTO") return;
      forcePromote = true;
    }
    if (comparison && comparison.improves_active === false) {
      const confirmed = window.confirm("Este modelo no supera al activo actual. ¿Seguro que quieres promoverlo?");
      if (!confirmed) return;
    }
    await runAction("Modelo promovido a activo.", () => promoteMlModel(modelId(model), { notes: notesDraft[modelId(model)], force_promote_unreliable: forcePromote }));
  }

  const boanaModels = useMemo(() => {
    const task = (registry.tasks || []).find((item) => item.task === "boana_boans_pugnax");
    return task ? flattenTask(task) : [];
  }, [registry]);
  const boanaActive = boanaModels.find((model) => model.is_default_for_task || model.registry_status === "active");
  const boanaV4 = boanaModels.find((model) => modelId(model) === "boana_boans_pugnax_v4_feedback");

  return (
    <div className="space-y-6 p-6 text-slate-800">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}

      <SectionCard title="Modelos ML" subtitle="Administra modelos activos, experimentales, archivados y descartados sin borrar archivos">
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={loadRegistry} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
          <button type="button" onClick={() => setShowComparison((value) => !value)} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800">
            Comparar modelos
          </button>
        </div>
        {showComparison ? (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <strong>Comparacion Boana</strong>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg bg-white/70 p-3">
                <div className="text-xs text-blue-700">Activo</div>
                <strong>{modelId(boanaActive) || "boana_boans_pugnax_v3_quality045"}</strong>
                <p>balanced_accuracy calibrado aprox: {fmt(metric(boanaActive) ?? 0.91)}</p>
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <div className="text-xs text-blue-700">Candidato feedback</div>
                <strong>{modelId(boanaV4) || "boana_boans_pugnax_v4_feedback"}</strong>
                <p>balanced_accuracy calibrado: {fmt(metric(boanaV4) ?? 0.817)}</p>
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <div className="text-xs text-blue-700">Decision sugerida</div>
                <strong>Mantener v3 activo</strong>
                <p>v4 esta calibrado, pero no supera v3 en balanced_accuracy test.</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-4" aria-busy={loading}>
          {(registry.tasks || []).map((task) => {
            const models = flattenTask(task);
            return (
              <div key={task.task} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-slate-950">{task.label || task.task}</h2>
                    <p className="text-xs text-slate-500">{models.length} modelo(s)</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {STATUS_ORDER.map((status) => {
                    const statusItems = statusModels(task, status);
                    return (
                      <div key={`${task.task}-${status}`} className="rounded-lg border border-slate-100 bg-white p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-800">{STATUS_LABELS[status]}</h3>
                          <Badge tone={STATUS_TONE[status] || "default"}>{statusItems.length}</Badge>
                        </div>
                        {statusItems.length ? (
                          <div className="grid gap-3 xl:grid-cols-2">
                            {statusItems.map((model) => {
                              const isCurrentDefault = model.registry_status === "active" && model.is_default_for_task === true;
                              return (
                              <div key={modelId(model)} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <strong className="break-all">{modelId(model)}</strong>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      <Badge tone={STATUS_TONE[model.registry_status] || "default"}>{model.registry_status || "experimental"}</Badge>
                                      {model.is_default_for_task ? <Badge tone="success">default</Badge> : null}
                                      {isCurrentDefault ? <Badge tone="success">Activo actual</Badge> : null}
                                      {isUnreliable(model) ? <Badge tone="danger">No confiable</Badge> : null}
                                      <Badge>{model.task || task.task}</Badge>
                                      {model.uses_calibrated_decision_rule ? <Badge tone="success">calibrado</Badge> : <Badge tone="warning">argmax/no calibrado</Badge>}
                                    </div>
                                  </div>
                                  <a href={`/laboratorio-audio?model_id=${encodeURIComponent(modelId(model))}`} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold">Abrir en laboratorio</a>
                                </div>
                                {isCurrentDefault ? (
                                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                                    Este es el modelo recomendado actualmente para esta tarea.
                                  </div>
                                ) : null}
                                {isUnreliable(model) ? (
                                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                                    No promover: bajo rendimiento. Score alto no implica confianza para ruteo automatico.
                                  </div>
                                ) : null}
                                <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                                  <div><span className="text-slate-500">model_id</span><br /><strong className="break-all">{modelId(model)}</strong></div>
                                  <div><span className="text-slate-500">task</span><br /><strong>{model.task || task.task}</strong></div>
                                  <div><span className="text-slate-500">registry_status</span><br /><strong>{model.registry_status || "-"}</strong></div>
                                  <div><span className="text-slate-500">is_default_for_task</span><br /><strong>{model.is_default_for_task ? "true" : "false"}</strong></div>
                                  <div><span className="text-slate-500">balanced_accuracy</span><br /><strong>{fmt(metric(model))}</strong></div>
                                  <div><span className="text-slate-500">threshold</span><br /><strong>{fmt(model.threshold)}</strong></div>
                                  <div><span className="text-slate-500">uses_calibrated_decision_rule</span><br /><strong>{model.uses_calibrated_decision_rule ? "true" : "false"}</strong></div>
                                  <div><span className="text-slate-500">parent_model_id</span><br /><strong>{model.parent_model_id || "-"}</strong></div>
                                  <div className="md:col-span-2"><span className="text-slate-500">decision_rule</span><br /><strong>{describeRule(model.decision_rule)}</strong></div>
                                </div>
                                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                                  <strong>Bitacora</strong>
                                  <div className="mt-1 grid gap-1 md:grid-cols-2">
                                    <span>Registrado: {model.registered_at || "-"}</span>
                                    <span>Promovido: {model.promoted_at || "-"}</span>
                                    <span>Archivado: {model.archived_at || "-"}</span>
                                    <span>Rechazado: {model.rejected_at || "-"}</span>
                                  </div>
                                </div>
                                {model.comparison_against_active ? (
                                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                    <strong>Comparacion contra activo</strong>
                                    <div className="mt-1 grid gap-1 md:grid-cols-2">
                                      <span>Activo: {model.comparison_against_active.active_model_id || "-"}</span>
                                      <span>Recomendacion: {model.comparison_against_active.recommendation || "-"}</span>
                                      <span>BA activo: {fmt(model.comparison_against_active.active_balanced_accuracy)}</span>
                                      <span>BA candidato: {fmt(model.comparison_against_active.candidate_balanced_accuracy)}</span>
                                    </div>
                                    <p className="mt-1">{model.comparison_against_active.warning || "Comparado contra activo."}</p>
                                  </div>
                                ) : null}
                                <label className="mt-3 block text-xs">
                                  <span className="mb-1 block font-semibold text-slate-600">Notas</span>
                                  <textarea
                                    value={notesDraft[modelId(model)] || ""}
                                    onChange={(event) => setNotesDraft((current) => ({ ...current, [modelId(model)]: event.target.value }))}
                                    className="min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                  />
                                </label>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {!isCurrentDefault ? (
                                    <button type="button" onClick={() => handlePromote(model)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Promover a activo</button>
                                  ) : null}
                                  <button type="button" onClick={() => runAction("Modelo archivado.", () => archiveMlModel(modelId(model), { notes: notesDraft[modelId(model)] }))} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">Archivar</button>
                                  <button type="button" onClick={() => runAction("Modelo marcado como descartado.", () => rejectMlModel(modelId(model), { notes: notesDraft[modelId(model)] }))} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700">Marcar como descartado</button>
                                  <button type="button" onClick={() => runAction("Notas actualizadas.", () => updateMlModelNotes(modelId(model), notesDraft[modelId(model)] || ""))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">Guardar notas</button>
                                </div>
                              </div>
                            );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">Sin modelos en este estado.</p>
                        )}
                      </div>
                    );
                  })}
                  {!models.length ? <p className="text-sm text-slate-500">Sin modelos para esta tarea.</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
