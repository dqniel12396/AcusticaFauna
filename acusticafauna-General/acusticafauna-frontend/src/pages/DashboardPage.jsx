import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MetricCard from "../components/shared/MetricCard";
import SectionCard from "../components/shared/SectionCard";
import Badge from "../components/shared/Badge";
import { fetchEvents, fetchImportSessions } from "../services/api";

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

export default function DashboardPage() {
  const [events, setEvents] = useState([]);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [eventsData, sessionsData] = await Promise.all([
          fetchEvents(),
          fetchImportSessions(),
        ]);
        setEvents(eventsData);
        setSessions(sessionsData);
      } catch (err) {
        console.error(err);
      }
    }

    loadData();
  }, []);

  const importedCount = events.filter(
    (event) => event.imported_status === "importado_al_pc"
  ).length;

  const pendingCount = events.filter(
    (event) => event.imported_status === "pendiente"
  ).length;

  const summaryStats = [
    { title: "Eventos importados", value: events.length, detail: "Registrados en base local" },
    { title: "Importados al PC", value: importedCount, detail: "Consolidación local" },
    { title: "Pendientes", value: pendingCount, detail: "Revisión o importación pendiente" },
    { title: "Sesiones", value: sessions.length, detail: "Lotes importados" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryStats.map((stat) => (
          <MetricCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            detail={stat.detail}
          />
        ))}
      </div>

      <SectionCard
        title="Eventos recientes"
        subtitle="Últimos eventos registrados en la base local"
        rightContent={
          <Link to="/eventos" className="text-sm font-semibold text-emerald-700">
            Ver todos
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-3 font-medium">ID</th>
                <th className="px-3 py-3 font-medium">Especie</th>
                <th className="px-3 py-3 font-medium">Confianza</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 10).map((event) => (
                <tr key={event.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-4 font-mono text-xs text-slate-700">{event.id}</td>
                  <td className="px-3 py-4">
                    {event.main_species_code || event.main_common_name || "-"}
                  </td>
                  <td className="px-3 py-4">
                    {event.main_confidence != null
                      ? `${(Number(event.main_confidence) * 100).toFixed(2)}%`
                      : "-"}
                  </td>
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
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}

              {events.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-3 py-8 text-center text-slate-500">
                    Aún no hay eventos importados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Sesiones recientes"
        subtitle="Últimos lotes importados"
        rightContent={
          <Link to="/sesiones" className="text-sm font-semibold text-emerald-700">
            Ver sesiones
          </Link>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {sessions.slice(0, 4).map((session) => (
            <div key={session.id} className="rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{session.name}</p>
                  <p className="text-sm text-slate-500">{session.imported_at}</p>
                </div>
                <Badge tone="success">{session.status}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                <p>Eventos: {session.total_events}</p>
                <p>Predicciones: {session.total_predictions}</p>
                <p>Segmentos: {session.imported_segments}</p>
                <p>Espectrogramas: {session.imported_spectrograms}</p>
              </div>
            </div>
          ))}

          {sessions.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay sesiones importadas.</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}