import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import { fetchEvents } from "../services/api";

function getImportTone(importedStatus) {
  if (importedStatus === "importado_al_pc") return "success";
  if (importedStatus === "pendiente") return "info";
  return "warning";
}

function getImportLabel(importedStatus) {
  if (importedStatus === "importado_al_pc") return "Importado al PC";
  if (importedStatus === "pendiente") return "Pendiente";
  if (importedStatus === "error") return "Error";
  return importedStatus || "Sin estado";
}

function buildDateTime(event) {
  if (!event.created_at) return 0;
  return new Date(event.created_at).getTime();
}

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [habitatFilter, setHabitatFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");

  async function loadEvents() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchEvents();
      setEvents(data);
    } catch (err) {
      setError(err.message || "No fue posible cargar los eventos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  const speciesOptions = useMemo(
    () =>
      [...new Set(events.map((event) => event.main_species_code).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [events]
  );

  const habitatOptions = useMemo(
    () =>
      [...new Set(events.map((event) => event.habitat).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [events]
  );

  const locationOptions = useMemo(
    () =>
      [...new Set(events.map((event) => event.location_name).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [events]
  );

  const sessionOptions = useMemo(
    () =>
      [...new Set(events.map((event) => event.session_id).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [events]
  );

  const filteredEvents = useMemo(() => {
    let results = [...events];
    const searchValue = normalizeText(search);

    if (searchValue) {
      results = results.filter((event) => {
        const searchableFields = [
          event.id,
          event.main_common_name,
          event.main_species_code,
          event.source_audio_name,
          event.location_name,
          event.habitat,
          event.segment_audio_path,
          event.spectrogram_path,
          event.session_id,
        ]
          .join(" ")
          .toLowerCase();

        return searchableFields.includes(searchValue);
      });
    }

    if (speciesFilter) {
      results = results.filter((event) => event.main_species_code === speciesFilter);
    }

    if (habitatFilter) {
      results = results.filter((event) => event.habitat === habitatFilter);
    }

    if (locationFilter) {
      results = results.filter((event) => event.location_name === locationFilter);
    }

    if (sessionFilter) {
      results = results.filter((event) => event.session_id === sessionFilter);
    }

    if (statusFilter) {
      results = results.filter((event) => event.imported_status === statusFilter);
    }

    if (minConfidence !== "") {
      const min = Number(minConfidence);
      results = results.filter(
        (event) => Number(event.main_confidence || 0) * 100 >= min
      );
    }

    results.sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return buildDateTime(a) - buildDateTime(b);
        case "date_desc":
          return buildDateTime(b) - buildDateTime(a);
        case "confidence_desc":
          return Number(b.main_confidence || 0) - Number(a.main_confidence || 0);
        case "confidence_asc":
          return Number(a.main_confidence || 0) - Number(b.main_confidence || 0);
        case "duration_desc":
          return Number(b.duration_seconds || 0) - Number(a.duration_seconds || 0);
        case "duration_asc":
          return Number(a.duration_seconds || 0) - Number(b.duration_seconds || 0);
        case "species_asc":
          return String(a.main_species_code || "").localeCompare(
            String(b.main_species_code || "")
          );
        case "species_desc":
          return String(b.main_species_code || "").localeCompare(
            String(a.main_species_code || "")
          );
        default:
          return buildDateTime(b) - buildDateTime(a);
      }
    });

    return results;
  }, [
    events,
    search,
    speciesFilter,
    habitatFilter,
    locationFilter,
    sessionFilter,
    statusFilter,
    minConfidence,
    sortBy,
  ]);

  function clearFilters() {
    setSearch("");
    setSpeciesFilter("");
    setHabitatFilter("");
    setLocationFilter("");
    setSessionFilter("");
    setStatusFilter("");
    setMinConfidence("");
    setSortBy("date_desc");
  }

  return (
    <div className="p-6">
      <SectionCard
        title="Eventos"
        subtitle="Eventos reales importados desde el backend local"
        rightContent={
          <button
            onClick={loadEvents}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Recargar
          </button>
        }
      >
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Búsqueda general
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por especie, audio, ubicación, sesión..."
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todos</option>
              <option value="importado_al_pc">Importado al PC</option>
              <option value="pendiente">Pendiente</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Ordenar por
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="date_desc">Más nuevo a más antiguo</option>
              <option value="date_asc">Más antiguo a más nuevo</option>
              <option value="confidence_desc">Mayor confianza</option>
              <option value="confidence_asc">Menor confianza</option>
              <option value="duration_desc">Mayor duración</option>
              <option value="duration_asc">Menor duración</option>
              <option value="species_asc">Especie A-Z</option>
              <option value="species_desc">Especie Z-A</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Especie
            </label>
            <select
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todas</option>
              {speciesOptions.map((species) => (
                <option key={species} value={species}>
                  {species}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Hábitat
            </label>
            <select
              value={habitatFilter}
              onChange={(e) => setHabitatFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todos</option>
              {habitatOptions.map((habitat) => (
                <option key={habitat} value={habitat}>
                  {habitat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Ubicación
            </label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todas</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Sesión
            </label>
            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todas</option>
              {sessionOptions.map((sessionId) => (
                <option key={sessionId} value={sessionId}>
                  {sessionId}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Confianza mínima (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value)}
              placeholder="Ej: 80"
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-sm text-slate-500">Cargando eventos...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-slate-500">
                Resultados encontrados:{" "}
                <span className="font-semibold text-slate-800">{filteredEvents.length}</span>
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-3 py-3 font-medium">ID</th>
                    <th className="px-3 py-3 font-medium">Especie</th>
                    <th className="px-3 py-3 font-medium">Confianza</th>
                    <th className="px-3 py-3 font-medium">Duración</th>
                    <th className="px-3 py-3 font-medium">Hábitat</th>
                    <th className="px-3 py-3 font-medium">Ubicación</th>
                    <th className="px-3 py-3 font-medium">Sesión</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-3 py-3 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="px-3 py-8 text-center text-slate-500">
                        No se encontraron eventos con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((event) => (
                      <tr key={event.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-4 font-mono text-xs text-slate-700">{event.id}</td>
                        <td className="px-3 py-4">{event.main_species_code || event.main_common_name}</td>
                        <td className="px-3 py-4">
                          {event.main_confidence != null
                            ? `${(Number(event.main_confidence) * 100).toFixed(2)}%`
                            : "-"}
                        </td>
                        <td className="px-3 py-4">{event.duration_seconds ?? "-"}</td>
                        <td className="px-3 py-4">{event.habitat || "-"}</td>
                        <td className="px-3 py-4">{event.location_name || "-"}</td>
                        <td className="px-3 py-4 font-mono text-xs">{event.session_id}</td>
                        <td className="px-3 py-4">
                          <Badge tone={getImportTone(event.imported_status)}>
                            {getImportLabel(event.imported_status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-4">
                          <Link
                            to={`/eventos/${event.id}`}
                            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            Abrir análisis
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}