import { useEffect, useMemo, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import { fetchImportSessions, importLocalDatasetAdvanced } from "../services/api";

const DEFAULT_ROOT_PATH = "F:\\PROYECTO de cosa de sonido\\PROYECTOGIT\\Proyecto_Ranas_Aves\\espectogramas";

export default function SyncPage() {
  const [mode, setMode] = useState("automatico");
  const [rootPath, setRootPath] = useState(
    localStorage.getItem("acusticafauna_root_path") || DEFAULT_ROOT_PATH
  );
  const [sessionName, setSessionName] = useState("");
  const [sourceType, setSourceType] = useState("carpeta_local");

  const [selectionTablesPath, setSelectionTablesPath] = useState("");
  const [csvSummaryPath, setCsvSummaryPath] = useState("");
  const [segmentsPath, setSegmentsPath] = useState("");
  const [spectrogramsPath, setSpectrogramsPath] = useState("");

  const [loading, setLoading] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [error, setError] = useState("");
  const [successData, setSuccessData] = useState(null);
  const [sessions, setSessions] = useState([]);

  async function loadSessions() {
    try {
      const data = await fetchImportSessions();
      setSessions(data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (!loading) {
      setFakeProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setFakeProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 400);

    return () => clearInterval(interval);
  }, [loading]);

  const tips = useMemo(() => {
    const baseTips = [
      "Consejo: el sistema funciona mejor si encuentra archivos .BirdNET.selection.table.txt y el CSV resumen.",
      "Consejo: si la estructura no es estándar, use el modo avanzado y asigne rutas manualmente.",
      "Consejo: el emparejamiento principal se hace por audio original + inicio + fin.",
      "Consejo: si los audios y espectrogramas están en rutas distintas, use el modo avanzado.",
    ];

    if (mode === "automatico") {
      return [
        ...baseTips,
        "Modo automático: seleccione una carpeta raíz y el sistema buscará recursivamente tablas, CSV, segmentos y espectrogramas.",
      ];
    }

    return [
      ...baseTips,
      "Modo avanzado: úselo cuando las tablas, el CSV, los segmentos y los espectrogramas estén en carpetas separadas.",
    ];
  }, [mode]);

  async function handleImport() {
    try {
      setLoading(true);
      setError("");
      setSuccessData(null);

      localStorage.setItem("acusticafauna_root_path", rootPath);

      const payload =
        mode === "automatico"
          ? {
              mode,
              root_path: rootPath,
              session_name: sessionName || null,
              source_type: sourceType,
            }
          : {
              mode,
              root_path: rootPath || null,
              session_name: sessionName || null,
              source_type: sourceType,
              selection_tables_path: selectionTablesPath || null,
              csv_summary_path: csvSummaryPath || null,
              segments_path: segmentsPath || null,
              spectrograms_path: spectrogramsPath || null,
            };

      const result = await importLocalDatasetAdvanced(payload);

      setFakeProgress(100);
      setSuccessData(result);
      setSessionName("");
      await loadSessions();
    } catch (err) {
      setError(err.message || "No fue posible importar la información.");
    } finally {
      setTimeout(() => {
        setLoading(false);
      }, 300);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <SectionCard
        title="Importación local"
        subtitle="Importe automáticamente desde una ruta raíz o asigne rutas manuales"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Modo de importación
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            >
              <option value="automatico">Automático</option>
              <option value="avanzado">Avanzado</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tipo de fuente
            </label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            >
              <option value="carpeta_local">Carpeta local</option>
              <option value="raspberry_usb">Raspberry por USB</option>
              <option value="tarjeta_sd">Tarjeta SD</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Nombre de sesión
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Carpeta raíz
          </label>
          <input
            type="text"
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="Ej: F:\Proyecto_Ranas_Aves\espectogramas"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        {mode === "avanzado" ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Ruta de selection tables
              </label>
              <input
                type="text"
                value={selectionTablesPath}
                onChange={(e) => setSelectionTablesPath(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Ruta de CSV resumen
              </label>
              <input
                type="text"
                value={csvSummaryPath}
                onChange={(e) => setCsvSummaryPath(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Ruta de segmentos de audio
              </label>
              <input
                type="text"
                value={segmentsPath}
                onChange={(e) => setSegmentsPath(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Ruta de espectrogramas
              </label>
              <input
                type="text"
                value={spectrogramsPath}
                onChange={(e) => setSpectrogramsPath(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={handleImport}
            disabled={loading}
            className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Importando..." : "Importar"}
          </button>

          <button
            onClick={loadSessions}
            className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Recargar sesiones
          </button>
        </div>

        {loading ? (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
              <span>Procesando importación...</span>
              <span>{fakeProgress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${fakeProgress}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {successData ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <h4 className="font-semibold text-emerald-800">Importación completada</h4>
            <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-3">
              <p><strong>Sesión:</strong> {successData.session_name}</p>
              <p><strong>Eventos:</strong> {successData.total_events}</p>
              <p><strong>Predicciones:</strong> {successData.total_predictions}</p>
              <p><strong>Tablas:</strong> {successData.total_selection_files}</p>
              <p><strong>Segmentos enlazados:</strong> {successData.imported_segments}</p>
              <p><strong>Espectrogramas enlazados:</strong> {successData.imported_spectrograms}</p>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Consejos de estructura"
        subtitle="Mensajes para ayudar a mantener una importación correcta"
      >
        <div className="space-y-3">
          {tips.map((tip, index) => (
            <div
              key={index}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
            >
              {tip}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Sesiones importadas"
        subtitle="Historial de importaciones registradas en la base local"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-3 font-medium">Nombre</th>
                <th className="px-3 py-3 font-medium">Fuente</th>
                <th className="px-3 py-3 font-medium">Modo</th>
                <th className="px-3 py-3 font-medium">Ruta</th>
                <th className="px-3 py-3 font-medium">Eventos</th>
                <th className="px-3 py-3 font-medium">Predicciones</th>
                <th className="px-3 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-3 py-8 text-center text-slate-500">
                    Aún no hay sesiones importadas.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-4 font-semibold text-slate-800">{session.name}</td>
                    <td className="px-3 py-4">{session.source_type}</td>
                    <td className="px-3 py-4">{session.import_mode}</td>
                    <td className="px-3 py-4">{session.root_path}</td>
                    <td className="px-3 py-4">{session.total_events}</td>
                    <td className="px-3 py-4">{session.total_predictions}</td>
                    <td className="px-3 py-4">
                      <Badge tone="success">{session.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}