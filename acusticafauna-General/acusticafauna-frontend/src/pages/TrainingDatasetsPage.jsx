import { useEffect, useMemo, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import {
  archiveTrainingDatasetVersion,
  buildTrainingDatasetVersion,
  createTrainingDatasetVersion,
  fetchTrainingDatasetAudit,
  fetchTrainingDatasetItems,
  fetchTrainingDatasetPresets,
  fetchTrainingDatasetStats,
  fetchTrainingDatasetVersions,
  getTrainingDatasetExportUrl,
  lockTrainingDatasetVersion,
} from "../services/api";

const DEFAULT_FORM = {
  version_name: "dataset_v0_1",
  description: "Primer dataset entrenable desde dataset_curado y taxonomia",
  include_imported_candidates: true,
  include_gold: true,
  include_corrected: true,
  include_background: true,
  include_target_negatives: true,
  exclude_needs_review: true,
  exclude_uncertain: true,
  exclude_rejected: true,
  min_duration_seconds: 0.25,
  max_duration_seconds: 10.0,
  min_examples_per_label: 10,
  max_examples_per_label: "",
  max_background_examples: "",
  include_label_types: [],
  exclude_label_types: [],
  include_group_names: [],
  exclude_group_names: [],
  map_species_to_group: false,
  target_mode: "custom",
  balance_strategy: "none",
  background_ratio: "",
  split_strategy: "stratified",
  train_ratio: 0.7,
  val_ratio: 0.15,
  test_ratio: 0.15,
  random_seed: 42,
};

function formatSeconds(value) {
  return `${Number(value || 0).toFixed(1)} s`;
}

function statusTone(status) {
  if (status === "built") return "success";
  if (status === "locked") return "info";
  if (status === "archived") return "warning";
  return "default";
}

function roleTone(role) {
  if (role === "positive") return "success";
  if (role === "negative") return "info";
  if (role === "background") return "warning";
  if (role === "excluded") return "danger";
  return "default";
}

function sourceTone(source) {
  if (source === "gold" || source === "corrected") return "success";
  if (source === "negative_target") return "info";
  return "default";
}

function warningTone(severity) {
  if (severity === "warning") return "warning";
  if (severity === "error") return "danger";
  return "info";
}

function listToText(value) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function textToList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanPayload(form) {
  const payload = { ...form };
  ["max_examples_per_label", "max_background_examples", "background_ratio"].forEach((key) => {
    if (payload[key] === "" || payload[key] === null || payload[key] === undefined) {
      delete payload[key];
    }
  });
  return payload;
}

function CountList({ rows, empty = "Sin datos" }) {
  if (!rows?.length) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((item) => (
        <div key={`${item.value || item.label || "sin_valor"}-${item.count}`} className="flex justify-between gap-3 text-sm">
          <span className="truncate">{item.value || item.label || "sin valor"}</span>
          <strong>{item.count ?? item.count_total ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}

function ToastStack({ messages, onDismiss }) {
  if (!messages.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`rounded-2xl border p-4 text-sm shadow-lg backdrop-blur ${
            message.type === "error"
              ? "border-red-200 bg-red-50/95 text-red-800 dark:border-red-900 dark:bg-red-950/95 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/95 dark:text-emerald-200"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{message.text}</span>
            <button className="font-semibold opacity-70 hover:opacity-100" onClick={() => onDismiss(message.id)}>
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TrainingDatasetsPage() {
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState(null);
  const [presets, setPresets] = useState({});
  const [items, setItems] = useState({ items: [], total: 0 });
  const [form, setForm] = useState(DEFAULT_FORM);
  const [filters, setFilters] = useState({
    normalized_label: "",
    item_role: "",
    split: "",
    confidence_source: "",
    included_state: "",
  });
  const [loading, setLoading] = useState(false);
  const [operationKey, setOperationKey] = useState("");
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);

  const selectedId = selectedVersion?.id || "";
  const includedLabelStats = stats?.included_label_stats || [];
  const excludedLabelStats = stats?.excluded_label_stats || [];
  const includedRoleCounts = stats?.included_by_role || [];
  const splitCounts = stats?.by_split || [];
  const excludeCounts = stats?.by_exclude_reason || [];
  const labelTypeCounts = stats?.by_label_type || [];
  const groupCounts = stats?.by_group_name || [];
  const confidenceCounts = stats?.by_confidence_source || [];
  const warnings = audit?.warnings || [];

  const itemFilters = useMemo(() => {
    const next = {
      normalized_label: filters.normalized_label,
      item_role: filters.item_role,
      split: filters.split,
      confidence_source: filters.confidence_source,
      limit: 100,
      offset: 0,
    };
    if (filters.included_state === "included") {
      next.item_role = "";
    }
    if (filters.included_state === "excluded") {
      next.item_role = "excluded";
    }
    return next;
  }, [filters]);

  function pushToast(text, type = "success") {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current.slice(-3), { id, text, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  async function loadVersions() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchTrainingDatasetVersions();
      setVersions(data);
      if (!selectedVersion && data.length) {
        setSelectedVersion(data[0]);
      } else if (selectedVersion) {
        const refreshed = data.find((item) => item.id === selectedVersion.id);
        setSelectedVersion(refreshed || data[0] || null);
      }
    } catch (err) {
      setError(err.message || "No fue posible cargar versiones.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPresets() {
    try {
      const data = await fetchTrainingDatasetPresets();
      setPresets(data);
    } catch (err) {
      pushToast(err.message || "No fue posible cargar presets.", "error");
    }
  }

  async function loadSelected(versionId = selectedId) {
    if (!versionId) {
      setStats(null);
      setAudit(null);
      setItems({ items: [], total: 0 });
      return;
    }
    try {
      setLoading(true);
      setError("");
      const [statsData, itemsData, auditData] = await Promise.all([
        fetchTrainingDatasetStats(versionId),
        fetchTrainingDatasetItems(versionId, itemFilters),
        fetchTrainingDatasetAudit(versionId),
      ]);
      setStats(statsData);
      setAudit(auditData);
      setItems(
        filters.included_state === "included"
          ? { ...itemsData, items: itemsData.items.filter((item) => item.item_role !== "excluded") }
          : itemsData
      );
    } catch (err) {
      setError(err.message || "No fue posible cargar la version.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVersions();
    loadPresets();
  }, []);

  useEffect(() => {
    loadSelected();
  }, [
    selectedId,
    filters.normalized_label,
    filters.item_role,
    filters.split,
    filters.confidence_source,
    filters.included_state,
  ]);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(presetName) {
    const preset = presets[presetName];
    if (!preset) {
      pushToast("Preset no disponible.", "error");
      return;
    }
    const suffix = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
    setForm({
      ...DEFAULT_FORM,
      ...preset,
      version_name: `${preset.version_name}_${suffix}`,
    });
    pushToast("Preset cargado. Revisa reglas y crea la version.");
  }

  async function createVersion() {
    try {
      setOperationKey("create");
      setError("");
      const created = await createTrainingDatasetVersion(cleanPayload(form));
      pushToast("Version creada.");
      setSelectedVersion(created);
      await loadVersions();
    } catch (err) {
      setError(err.message || "No fue posible crear la version.");
      pushToast(err.message || "No fue posible crear la version.", "error");
    } finally {
      setOperationKey("");
    }
  }

  async function buildVersion(version) {
    try {
      setOperationKey(`build-${version.id}`);
      const built = await buildTrainingDatasetVersion(version.id);
      pushToast("Dataset construido.");
      setSelectedVersion(built);
      await loadVersions();
      await loadSelected(version.id);
    } catch (err) {
      setError(err.message || "No fue posible construir el dataset.");
      pushToast(err.message || "No fue posible construir el dataset.", "error");
    } finally {
      setOperationKey("");
    }
  }

  async function lockVersion(version) {
    if (!window.confirm(`Bloquear ${version.version_name}? No podra reconstruirse mientras este locked.`)) return;
    try {
      setOperationKey(`lock-${version.id}`);
      await lockTrainingDatasetVersion(version.id);
      pushToast("Version bloqueada.");
      await loadVersions();
      await loadSelected(version.id);
    } catch (err) {
      setError(err.message || "No fue posible bloquear la version.");
      pushToast(err.message || "No fue posible bloquear la version.", "error");
    } finally {
      setOperationKey("");
    }
  }

  async function archiveVersion(version) {
    if (!window.confirm(`Archivar ${version.version_name}?`)) return;
    try {
      setOperationKey(`archive-${version.id}`);
      await archiveTrainingDatasetVersion(version.id);
      pushToast("Version archivada.");
      await loadVersions();
      await loadSelected(version.id);
    } catch (err) {
      setError(err.message || "No fue posible archivar la version.");
      pushToast(err.message || "No fue posible archivar la version.", "error");
    } finally {
      setOperationKey("");
    }
  }

  return (
    <div className="space-y-6 p-6 text-slate-800 dark:text-slate-100">
      <ToastStack messages={toasts} onDismiss={dismissToast} />

      <SectionCard title="Datasets de entrenamiento" subtitle="Versiones auditables para entrenamiento futuro">
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          Esta seccion no entrena modelos. Solo crea versiones auditables del dataset que luego se usaran para
          entrenamiento. La auditoria ayuda a detectar mezcla de especies, grupos, codigos, ruido dominante y clases
          con pocos ejemplos antes de entrenar.
        </p>
        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Crear version" subtitle="Configura reglas de inclusion, exclusion, balance y splits">
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <p className="font-semibold">Presets de auditoria y balance</p>
          <p className="mt-1 text-emerald-800 dark:text-emerald-200">
            Estos botones solo precargan reglas. Revisa la configuracion y luego crea la version.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => applyPreset("general_detector_v0")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
              Crear detector general
            </button>
            <button type="button" onClick={() => applyPreset("amphibian_species_v0")} className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700">
              Crear clasificador de especies anfibias
            </button>
            <button type="button" onClick={() => applyPreset("audit_gold_only")} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
              Crear gold-only
            </button>
            <button type="button" onClick={() => applyPreset("general_detector_strict_balanced")} className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
              Detector estricto balanceado
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-slate-600 dark:text-slate-300">
            Nombre de version
            <input value={form.version_name} onChange={(event) => setField("version_name", event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            Descripcion
            <input value={form.description} onChange={(event) => setField("description", event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900" />
          </label>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["include_imported_candidates", "Incluir candidatos importados"],
            ["include_gold", "Incluir gold"],
            ["include_corrected", "Incluir corregidos"],
            ["include_background", "Incluir background/ruido"],
            ["include_target_negatives", "Incluir negativos por objetivo"],
            ["exclude_needs_review", "Excluir taxonomia por revisar"],
            ["exclude_uncertain", "Excluir inciertos"],
            ["exclude_rejected", "Excluir rechazados"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => setField(key, event.target.checked)} />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["min_duration_seconds", "Duracion min."],
            ["max_duration_seconds", "Duracion max."],
            ["min_examples_per_label", "Min. ejemplos"],
            ["max_examples_per_label", "Max. por label"],
            ["max_background_examples", "Max. background"],
            ["background_ratio", "Ratio background"],
            ["train_ratio", "Train"],
            ["val_ratio", "Val"],
            ["test_ratio", "Test"],
            ["random_seed", "Seed"],
          ].map(([key, label]) => (
            <label key={key} className="text-sm text-slate-600 dark:text-slate-300">
              {label}
              <input
                type="number"
                step={key.includes("ratio") || key.includes("duration") ? "0.01" : "1"}
                value={form[key]}
                onChange={(event) => setField(key, event.target.value === "" ? "" : Number(event.target.value))}
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-slate-600 dark:text-slate-300">
            Tipos incluidos
            <input value={listToText(form.include_label_types)} onChange={(event) => setField("include_label_types", textToList(event.target.value))} placeholder="species, noise" className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            Tipos excluidos
            <input value={listToText(form.exclude_label_types)} onChange={(event) => setField("exclude_label_types", textToList(event.target.value))} placeholder="unknown, code, group" className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            Grupos incluidos
            <input value={listToText(form.include_group_names)} onChange={(event) => setField("include_group_names", textToList(event.target.value))} placeholder="anfibio, ruido" className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            Grupos excluidos
            <input value={listToText(form.exclude_group_names)} onChange={(event) => setField("exclude_group_names", textToList(event.target.value))} placeholder="humano, desconocido" className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            Modo objetivo
            <select value={form.target_mode} onChange={(event) => setField("target_mode", event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
              <option value="custom">custom</option>
              <option value="general_detector">general_detector</option>
              <option value="species_classifier">species_classifier</option>
            </select>
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            Balance
            <select value={form.balance_strategy} onChange={(event) => setField("balance_strategy", event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
              <option value="none">none</option>
              <option value="cap_per_label">cap_per_label</option>
              <option value="balanced_downsample">balanced_downsample</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-7 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={Boolean(form.map_species_to_group)} onChange={(event) => setField("map_species_to_group", event.target.checked)} />
            Mapear especies a grupo
          </label>
        </div>

        <button onClick={createVersion} disabled={Boolean(operationKey)} className="mt-5 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {operationKey === "create" ? "Creando..." : "Crear version"}
        </button>
      </SectionCard>

      <SectionCard title="Versiones existentes" subtitle={`${versions.length} versiones registradas`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="px-3 py-3">Version</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Items</th>
                <th className="px-3 py-3">Labels</th>
                <th className="px-3 py-3">Duracion</th>
                <th className="px-3 py-3">Creada</th>
                <th className="px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
                  <td className="px-3 py-4">
                    <button onClick={() => setSelectedVersion(version)} className="text-left font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
                      {version.version_name}
                    </button>
                    <p className="mt-1 max-w-96 text-xs text-slate-500 dark:text-slate-400">{version.description}</p>
                  </td>
                  <td className="px-3 py-4"><Badge tone={statusTone(version.status)}>{version.status}</Badge></td>
                  <td className="px-3 py-4 font-semibold">{version.total_items || 0}</td>
                  <td className="px-3 py-4 font-semibold">{version.total_labels || 0}</td>
                  <td className="px-3 py-4">{formatSeconds(version.total_duration_seconds)}</td>
                  <td className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">{version.created_at}</td>
                  <td className="min-w-[34rem] px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => buildVersion(version)} disabled={Boolean(operationKey) || version.status === "locked"} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                        {operationKey === `build-${version.id}` ? "Construyendo..." : "Construir dataset"}
                      </button>
                      <a href={getTrainingDatasetExportUrl(version.id, false)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        CSV completo de auditoria
                      </a>
                      <a href={getTrainingDatasetExportUrl(version.id, true)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                        CSV solo incluidos
                      </a>
                      <button onClick={() => lockVersion(version)} disabled={Boolean(operationKey) || version.status === "locked"} className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-60 dark:bg-slate-700">
                        Lock
                      </button>
                      <button onClick={() => archiveVersion(version)} disabled={Boolean(operationKey) || version.status === "archived"} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!versions.length ? (
                <tr>
                  <td colSpan="7" className="px-3 py-8 text-center text-slate-500">
                    No hay versiones todavia. Crea una version para empezar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {selectedVersion ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <SectionCard title="Items" subtitle={selectedVersion.version_name}>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{stats?.version?.total_items || 0}</p>
            </SectionCard>
            <SectionCard title="Labels" subtitle="Etiquetas normalizadas">
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{stats?.version?.total_labels || 0}</p>
            </SectionCard>
            <SectionCard title="Duracion" subtitle="Audio incluido">
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{formatSeconds(stats?.version?.total_duration_seconds)}</p>
            </SectionCard>
            <SectionCard title="Estado" subtitle="Version">
              <Badge tone={statusTone(stats?.version?.status)}>{stats?.version?.status || selectedVersion.status}</Badge>
            </SectionCard>
          </div>

          <SectionCard title="Auditoria y balance" subtitle="Advertencias antes de entrenar">
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-1">
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Advertencias automaticas</h3>
                <div className="space-y-3">
                  {warnings.map((warning) => (
                    <div key={warning.code} className="rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <strong>{warning.message}</strong>
                        <Badge tone={warningTone(warning.severity)}>{warning.severity}</Badge>
                      </div>
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{warning.code}</p>
                    </div>
                  ))}
                  {!warnings.length ? <p className="text-sm text-slate-500 dark:text-slate-400">Sin advertencias para esta version.</p> : null}
                </div>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Incluidos por rol</h3>
                <CountList rows={includedRoleCounts} />
                <h3 className="mb-3 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-200">Excluidos por razon</h3>
                <CountList rows={excludeCounts.slice(0, 8)} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Tipo taxonomico</h3>
                <CountList rows={labelTypeCounts} />
                <h3 className="mb-3 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-200">Grupo</h3>
                <CountList rows={groupCounts} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Stats de version" subtitle="Distribucion por rol, split, fuente y etiqueta">
            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-5">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Splits</h3>
                <CountList rows={splitCounts} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Fuente</h3>
                <CountList rows={confidenceCounts} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Labels incluidos principales</h3>
                <CountList rows={includedLabelStats.slice(0, 10)} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Labels excluidos principales</h3>
                <CountList rows={excludedLabelStats.slice(0, 10)} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Labels con pocos ejemplos</h3>
                <CountList rows={(stats?.few_examples || []).slice(0, 10)} empty="Sin labels por debajo del minimo" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Items de version" subtitle={`${items.total || 0} items con los filtros actuales`}>
            <div className="mb-4 grid gap-3 md:grid-cols-5">
              <input value={filters.normalized_label} onChange={(event) => setFilter("normalized_label", event.target.value)} placeholder="normalized_label" className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900" />
              <select value={filters.item_role} onChange={(event) => setFilter("item_role", event.target.value)} className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
                <option value="">Todos los roles</option>
                <option value="positive">positive</option>
                <option value="negative">negative</option>
                <option value="background">background</option>
                <option value="excluded">excluded</option>
              </select>
              <select value={filters.split} onChange={(event) => setFilter("split", event.target.value)} className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
                <option value="">Todos los splits</option>
                <option value="train">train</option>
                <option value="val">val</option>
                <option value="test">test</option>
                <option value="unassigned">unassigned</option>
              </select>
              <select value={filters.confidence_source} onChange={(event) => setFilter("confidence_source", event.target.value)} className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
                <option value="">Todas las fuentes</option>
                <option value="imported">imported</option>
                <option value="gold">gold</option>
                <option value="corrected">corrected</option>
                <option value="negative_target">negative_target</option>
              </select>
              <select value={filters.included_state} onChange={(event) => setFilter("included_state", event.target.value)} className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
                <option value="">Incluidos y excluidos</option>
                <option value="included">Solo incluidos</option>
                <option value="excluded">Solo excluidos</option>
              </select>
            </div>

            {loading ? <div className="py-8 text-sm text-slate-500">Cargando...</div> : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                    <th className="px-3 py-3">Label</th>
                    <th className="px-3 py-3">Rol</th>
                    <th className="px-3 py-3">Fuente</th>
                    <th className="px-3 py-3">Split</th>
                    <th className="px-3 py-3">Duracion</th>
                    <th className="px-3 py-3">Razon</th>
                    <th className="px-3 py-3">Audio</th>
                  </tr>
                </thead>
                <tbody>
                  {items.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
                      <td className="px-3 py-4">
                        <p className="font-semibold text-slate-900 dark:text-slate-50">{item.normalized_label}</p>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{item.original_label}</p>
                      </td>
                      <td className="px-3 py-4"><Badge tone={roleTone(item.item_role)}>{item.item_role}</Badge></td>
                      <td className="px-3 py-4"><Badge tone={sourceTone(item.confidence_source)}>{item.confidence_source}</Badge></td>
                      <td className="px-3 py-4">{item.split}</td>
                      <td className="px-3 py-4">{formatSeconds(item.duration_seconds)}</td>
                      <td className="max-w-72 px-3 py-4 text-xs text-slate-500 dark:text-slate-400">{item.exclude_reason || item.include_reason || "-"}</td>
                      <td className="max-w-96 truncate px-3 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">{item.audio_path}</td>
                    </tr>
                  ))}
                  {!items.items.length ? (
                    <tr>
                      <td colSpan="7" className="px-3 py-8 text-center text-slate-500">
                        No hay items con los filtros actuales.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
