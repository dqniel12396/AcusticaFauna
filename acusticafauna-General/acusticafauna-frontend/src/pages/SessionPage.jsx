import { useEffect, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import { fetchImportSessions } from "../services/api";

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSessions() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchImportSessions();
      setSessions(data);
    } catch (err) {
      setError(err.message || "No fue posible cargar las sesiones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="p-6">
      <SectionCard
        title="Sesiones de análisis"
        subtitle="Lotes importados y registrados en la base local"
        rightContent={
          <button
            onClick={loadSessions}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Recargar
          </button>
        }
      >
        {loading ? (
          <div className="py-8 text-sm text-slate-500">Cargando sesiones...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-3 py-3 font-medium">ID</th>
                  <th className="px-3 py-3 font-medium">Nombre</th>
                  <th className="px-3 py-3 font-medium">Importado en</th>
                  <th className="px-3 py-3 font-medium">Fuente</th>
                  <th className="px-3 py-3 font-medium">Modo</th>
                  <th className="px-3 py-3 font-medium">Tablas</th>
                  <th className="px-3 py-3 font-medium">Predicciones</th>
                  <th className="px-3 py-3 font-medium">Eventos</th>
                  <th className="px-3 py-3 font-medium">Segmentos</th>
                  <th className="px-3 py-3 font-medium">Espectrogramas</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="px-3 py-8 text-center text-slate-500">
                      Aún no hay sesiones importadas.
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => (
                    <tr key={session.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-4 font-mono text-xs text-slate-700">{session.id}</td>
                      <td className="px-3 py-4 font-semibold text-slate-800">{session.name}</td>
                      <td className="px-3 py-4">{session.imported_at}</td>
                      <td className="px-3 py-4">{session.source_type}</td>
                      <td className="px-3 py-4">{session.import_mode}</td>
                      <td className="px-3 py-4">{session.total_selection_files}</td>
                      <td className="px-3 py-4">{session.total_predictions}</td>
                      <td className="px-3 py-4">{session.total_events}</td>
                      <td className="px-3 py-4">{session.imported_segments}</td>
                      <td className="px-3 py-4">{session.imported_spectrograms}</td>
                      <td className="px-3 py-4">
                        <Badge tone="success">{session.status}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}