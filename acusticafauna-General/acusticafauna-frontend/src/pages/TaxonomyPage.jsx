import { useEffect, useMemo, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import {
  createTaxonomyItem,
  deactivateTaxonomyItem,
  fetchTaxonomy,
  fetchTaxonomyExamples,
  fetchTaxonomyStats,
  mergeTaxonomyLabels,
  suggestTaxonomyFromCurated,
  updateTaxonomyItem,
} from "../services/api";

const EMPTY_FORM = {
  label: "",
  display_name: "",
  scientific_name: "",
  common_name: "",
  group_name: "",
  family: "",
  genus: "",
  species: "",
  label_type: "group",
  parent_label: "",
  aliases: "",
  code: "",
  use_for_training: true,
  needs_review: false,
  notes: "",
};

function typeTone(type) {
  if (type === "species") return "success";
  if (type === "noise") return "warning";
  if (type === "code") return "info";
  if (type === "unknown") return "danger";
  return "default";
}

function yesNo(value) {
  return value ? "Si" : "No";
}

function normalizeForm(item) {
  return {
    ...EMPTY_FORM,
    ...item,
    aliases: item?.aliases || "",
    use_for_training: Boolean(item?.use_for_training),
    needs_review: Boolean(item?.needs_review),
  };
}

export default function TaxonomyPage() {
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState({ items: [], total: 0 });
  const [filters, setFilters] = useState({
    search: "",
    group_name: "",
    label_type: "",
    use_for_training: "",
    needs_review: "",
    few_examples: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAliasForm, setNewAliasForm] = useState({
    ...EMPTY_FORM,
    label_type: "code",
    use_for_training: false,
  });
  const [mergeTarget, setMergeTarget] = useState({});
  const [examples, setExamples] = useState(null);

  const groups = useMemo(
    () => (stats?.by_group || []).map((item) => item.value).filter(Boolean),
    [stats]
  );

  async function loadAll() {
    try {
      setLoading(true);
      setError("");
      const [statsData, itemsData] = await Promise.all([
        fetchTaxonomyStats(),
        fetchTaxonomy({ ...filters, limit: 100, offset: 0 }),
      ]);
      setStats(statsData);
      setItems(itemsData);
    } catch (err) {
      setError(err.message || "No fue posible cargar la taxonomia.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [
    filters.search,
    filters.group_name,
    filters.label_type,
    filters.use_for_training,
    filters.needs_review,
    filters.few_examples,
  ]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function startEdit(item) {
    setEditing(item);
    setForm(normalizeForm(item));
    setMessage("");
    setError("");
  }

  async function saveEdit() {
    if (!editing?.id) return;
    try {
      setError("");
      await updateTaxonomyItem(editing.id, form);
      setMessage("Taxonomia actualizada.");
      setEditing(null);
      await loadAll();
    } catch (err) {
      setError(err.message || "No fue posible guardar la taxonomia.");
    }
  }

  async function createAlias() {
    try {
      setError("");
      await createTaxonomyItem(newAliasForm);
      setMessage("Alias taxonomico creado.");
      setShowCreateForm(false);
      setNewAliasForm({ ...EMPTY_FORM, label_type: "code", use_for_training: false });
      await loadAll();
    } catch (err) {
      setError(err.message || "No fue posible crear el alias.");
    }
  }

  async function suggestFromDataset() {
    try {
      setLoading(true);
      setError("");
      const result = await suggestTaxonomyFromCurated();
      setMessage(
        `Taxonomia sugerida creada. Nuevas: ${result.created}; existentes revisadas: ${result.existing}.`
      );
      await loadAll();
    } catch (err) {
      setError(err.message || "No fue posible crear sugerencias.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleTraining(item) {
    await updateTaxonomyItem(item.id, {
      ...item,
      use_for_training: !item.use_for_training,
    });
    await loadAll();
  }

  async function toggleNeedsReview(item) {
    await updateTaxonomyItem(item.id, {
      ...item,
      needs_review: !item.needs_review,
    });
    await loadAll();
  }

  async function deactivate(item) {
    if (!window.confirm(`Desactivar ${item.label}? No se borran segmentos.`)) return;
    await deactivateTaxonomyItem(item.id);
    setMessage("Etiqueta desactivada.");
    await loadAll();
  }

  async function merge(item) {
    const target = (mergeTarget[item.id] || "").trim();
    if (!target) {
      setError("Escribe una etiqueta destino para mapear/fusionar.");
      return;
    }
    await mergeTaxonomyLabels({ source_label: item.label, target_label: target });
    setMessage(`${item.label} mapeada hacia ${target}.`);
    await loadAll();
  }

  async function showExamples(item) {
    const data = await fetchTaxonomyExamples(item.label, 20);
    setExamples(data);
  }

  return (
    <div className="space-y-6 p-6 text-slate-800 dark:text-slate-100">
      <SectionCard
        title="Taxonomia"
        subtitle="Administracion de especies, grupos, codigos, alias y uso futuro en entrenamiento"
        rightContent={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCreateForm((current) => !current)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Nuevo alias
            </button>
            <button
              onClick={suggestFromDataset}
              disabled={loading}
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? "Procesando..." : "Crear taxonomia desde dataset"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Esta capa no cambia los labels originales del dataset. Ordena nombres, codigos y alias
          para que un constructor de dataset futuro pueda normalizar sin perder trazabilidad.
        </p>
        {message ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </SectionCard>

      {showCreateForm ? (
        <SectionCard title="Nuevo alias" subtitle="Registra un codigo antiguo y su canonical label sin tocar audios">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Codigo o alias
              <input
                value={newAliasForm.label}
                onChange={(event) => setNewAliasForm((current) => ({ ...current, label: event.target.value, code: event.target.value }))}
                placeholder="BOAPLA"
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Canonical label
              <input
                value={newAliasForm.parent_label}
                onChange={(event) => setNewAliasForm((current) => ({ ...current, parent_label: event.target.value }))}
                placeholder="Boana_platanera"
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Tipo
              <select
                value={newAliasForm.label_type}
                onChange={(event) => setNewAliasForm((current) => ({ ...current, label_type: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                {["code", "species", "noise", "group", "unknown"].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Grupo
              <input
                value={newAliasForm.group_name}
                onChange={(event) => setNewAliasForm((current) => ({ ...current, group_name: event.target.value }))}
                placeholder="anfibio"
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Nombre cientifico
              <input
                value={newAliasForm.scientific_name}
                onChange={(event) => setNewAliasForm((current) => ({ ...current, scientific_name: event.target.value }))}
                placeholder="Boana platanera"
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            <label className="flex items-end gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={newAliasForm.use_for_training}
                onChange={(event) => setNewAliasForm((current) => ({ ...current, use_for_training: event.target.checked }))}
              />
              entrenable directo
            </label>
            <label className="flex items-end gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={newAliasForm.needs_review}
                onChange={(event) => setNewAliasForm((current) => ({ ...current, needs_review: event.target.checked }))}
              />
              necesita revision
            </label>
          </div>
          <textarea
            value={newAliasForm.notes}
            onChange={(event) => setNewAliasForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Notas"
            className="mt-3 min-h-20 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
          <button onClick={createAlias} className="mt-3 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
            Guardar alias
          </button>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SectionCard title="Etiquetas" subtitle="Total">
          <p className="text-3xl font-bold text-slate-900">{stats?.total_labels || 0}</p>
        </SectionCard>
        <SectionCard title="Especies" subtitle="label_type species">
          <p className="text-3xl font-bold text-slate-900">{stats?.species_count || 0}</p>
        </SectionCard>
        <SectionCard title="Incompletas" subtitle="Revisar">
          <p className="text-3xl font-bold text-slate-900">{stats?.incomplete_count || 0}</p>
        </SectionCard>
        <SectionCard title="Entrenables" subtitle="Activas">
          <p className="text-3xl font-bold text-slate-900">{stats?.trainable_count || 0}</p>
        </SectionCard>
        <SectionCard title="Pocos ejemplos" subtitle="< 5 clips">
          <p className="text-3xl font-bold text-slate-900">{stats?.few_examples_count || 0}</p>
        </SectionCard>
        <SectionCard title="Alias/codigo" subtitle="Mapeadas">
          <p className="text-3xl font-bold text-slate-900">{stats?.with_alias_or_code_count || 0}</p>
        </SectionCard>
      </div>

      <SectionCard title="Filtros" subtitle="Busca etiquetas por texto, grupo o uso">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Buscar label, nombre o alias"
            className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
          <select
            value={filters.group_name}
            onChange={(event) => updateFilter("group_name", event.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          >
            <option value="">Todos los grupos</option>
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <select
            value={filters.label_type}
            onChange={(event) => updateFilter("label_type", event.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          >
            <option value="">Todos los tipos</option>
            {["species", "group", "noise", "human_activity", "unknown", "code", "negative"].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={filters.use_for_training}
            onChange={(event) => updateFilter("use_for_training", event.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          >
            <option value="">Entrenamiento: todos</option>
            <option value="true">Aptas</option>
            <option value="false">No entrenar</option>
          </select>
          <select
            value={filters.needs_review}
            onChange={(event) => updateFilter("needs_review", event.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          >
            <option value="">Revision: todas</option>
            <option value="true">Necesita revision</option>
            <option value="false">Sin alerta</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={filters.few_examples === "true"}
              onChange={(event) => updateFilter("few_examples", event.target.checked ? "true" : "")}
            />
            pocos ejemplos
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Etiquetas" subtitle={`${items.total || 0} registros`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-3">Label interno</th>
                <th className="px-3 py-3">Nombre</th>
                <th className="px-3 py-3">Grupo</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Canonical</th>
                <th className="px-3 py-3">Alias/codigo</th>
                <th className="px-3 py-3">Segmentos</th>
                <th className="px-3 py-3">Estados</th>
                <th className="px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-4 font-mono text-xs">{item.label}</td>
                  <td className="px-3 py-4">
                    <p className="font-semibold text-slate-900">{item.display_name || "-"}</p>
                    <p className="text-xs text-slate-500">{item.scientific_name || item.common_name || "-"}</p>
                  </td>
                  <td className="px-3 py-4">{item.group_name || "-"}</td>
                  <td className="px-3 py-4">
                    <Badge tone={typeTone(item.label_type)}>{item.label_type || "sin tipo"}</Badge>
                  </td>
                  <td className="px-3 py-4 font-mono text-xs">
                    {item.parent_label || item.label}
                  </td>
                  <td className="px-3 py-4 text-xs">
                    <p>{item.code || "-"}</p>
                    <p className="mt-1 max-w-56 truncate text-slate-500">{item.aliases || ""}</p>
                  </td>
                  <td className="px-3 py-4 font-semibold">{item.segment_count || 0}</td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={item.use_for_training ? "success" : "warning"}>
                        {item.use_for_training ? "Entrenable" : "No entrenar"}
                      </Badge>
                      {item.needs_review ? <Badge tone="danger">Revisar</Badge> : null}
                      {!item.is_active ? <Badge tone="danger">Inactiva</Badge> : null}
                    </div>
                  </td>
                  <td className="min-w-96 px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => startEdit(item)}>
                        Editar
                      </button>
                      <button className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700" onClick={() => toggleTraining(item)}>
                        {item.use_for_training ? "No entrenar" : "Marcar entrenable"}
                      </button>
                      <button className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600" onClick={() => toggleNeedsReview(item)}>
                        {item.needs_review ? "Quitar revision" : "Necesita revision"}
                      </button>
                      <button className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => showExamples(item)}>
                        Ejemplos
                      </button>
                      <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100" onClick={() => deactivate(item)}>
                        Desactivar
                      </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={mergeTarget[item.id] || ""}
                        onChange={(event) =>
                          setMergeTarget((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        placeholder="Normalizar como..."
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-emerald-500"
                      />
                      <button className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 dark:bg-slate-700" onClick={() => merge(item)}>
                        Mapear
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.items.length ? (
                <tr>
                  <td colSpan="9" className="px-3 py-8 text-center text-slate-500">
                    No hay etiquetas con los filtros seleccionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {editing ? (
        <SectionCard
          title={`Editar ${editing.label}`}
          subtitle="Los cambios afectan la capa taxonomica, no los labels originales de segmentos"
          rightContent={
            <button className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => setEditing(null)}>
              Cerrar
            </button>
          }
        >
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["label", "Label interno"],
              ["display_name", "Nombre visible"],
              ["scientific_name", "Nombre cientifico"],
              ["common_name", "Nombre comun"],
              ["group_name", "Grupo"],
              ["family", "Familia"],
              ["genus", "Genero"],
              ["species", "Especie"],
              ["parent_label", "Etiqueta padre"],
              ["aliases", "Alias JSON o separados por coma"],
              ["code", "Codigo corto"],
            ].map(([key, label]) => (
              <label key={key} className="text-sm text-slate-600 dark:text-slate-300">
                {label}
                <input
                  value={form[key] || ""}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </label>
            ))}
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Tipo
              <select
                value={form.label_type}
                onChange={(event) => setForm((current) => ({ ...current, label_type: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                {["species", "group", "noise", "human_activity", "unknown", "code", "negative"].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-7 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={form.use_for_training} onChange={(event) => setForm((current) => ({ ...current, use_for_training: event.target.checked }))} />
              apta para entrenamiento
            </label>
            <label className="flex items-center gap-2 pt-7 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={form.needs_review} onChange={(event) => setForm((current) => ({ ...current, needs_review: event.target.checked }))} />
              necesita revision
            </label>
          </div>
          <label className="mt-3 block text-sm text-slate-600 dark:text-slate-300">
            Notas
            <textarea
              value={form.notes || ""}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className="mt-1 min-h-24 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
          </label>
          <button onClick={saveEdit} className="mt-4 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
            Guardar cambios
          </button>
        </SectionCard>
      ) : null}

      {examples ? (
        <SectionCard title={`Ejemplos de ${examples.label}`} subtitle="Segmentos asociados por label o negativos por objetivo">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {examples.items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="font-mono text-xs text-slate-500">{item.segment_id}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{item.label}</p>
                <p className="text-xs text-slate-500">{item.group_type} · {Number(item.duration_seconds || 0).toFixed(1)} s</p>
                {item.latest_review_status ? (
                  <Badge tone={item.latest_review_status === "accepted" ? "success" : "info"}>
                    {item.latest_review_status}
                  </Badge>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
