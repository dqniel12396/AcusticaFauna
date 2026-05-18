import { useEffect, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import { fetchHardwareProfile, fetchSystemPaths } from "../services/api";

const RESOURCE_PROFILES = {
  auto: "Detecta CPU/RAM/GPU y elige un modo conservador.",
  eco: "Reduce threads/workers y prefiere CPU para no saturar el equipo.",
  balanceado: "Deja recursos libres y usa CUDA solo si esta disponible.",
  rendimiento: "Usa mas recursos; recomendado solo si aceptas mayor consumo.",
};

export default function SettingsPage() {
  const [defaultPath, setDefaultPath] = useState(localStorage.getItem("acusticafauna_root_path") || "");
  const [resourceProfile, setResourceProfile] = useState(localStorage.getItem("acusticafauna_resource_profile") || "auto");
  const [hardwareProfile, setHardwareProfile] = useState(null);
  const [systemPaths, setSystemPaths] = useState(null);
  const [pathsLoading, setPathsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchHardwareProfile()
      .then((data) => {
        setHardwareProfile(data);
        setError("");
      })
      .catch((err) => setError(err.message || "No fue posible consultar el perfil de hardware."));
    loadSystemPaths();
  }, []);

  async function loadSystemPaths() {
    try {
      setPathsLoading(true);
      const data = await fetchSystemPaths();
      setSystemPaths(data);
    } catch (err) {
      setError(err.message || "No fue posible consultar las rutas locales.");
    } finally {
      setPathsLoading(false);
    }
  }

  function savePath() {
    localStorage.setItem("acusticafauna_root_path", defaultPath);
    alert("Ruta por defecto guardada localmente.");
  }

  function saveResourceProfile() {
    localStorage.setItem("acusticafauna_resource_profile", resourceProfile);
    alert("Perfil guardado en este navegador. Para aplicarlo al backend/ML, define ACUSTICAFAUNA_RESOURCE_PROFILE en .env.");
  }

  function copyEnvExample() {
    const datasetDir = systemPaths?.dataset_dir?.path || "C:\\AcusticaFauna\\data\\dataset_curado";
    const text = [
      `ACUSTICAFAUNA_DATASET_DIR=${datasetDir}`,
      "ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\\PC202601\\Descargasreal;D:\\AudiosCampo",
    ].join("\n");
    navigator.clipboard?.writeText(text);
    alert("Ejemplo .env copiado.");
  }

  const pathRows = systemPaths
    ? [
        ["ACUSTICAFAUNA_DATASET_DIR", systemPaths.dataset_dir],
        ["ACUSTICAFAUNA_STORAGE_DIR", systemPaths.storage_dir],
        ["sample_data", systemPaths.sample_data_dir],
        ["models_dir", systemPaths.models_dir],
        ["manifests_dir", systemPaths.manifests_dir],
      ]
    : [];

  return (
    <div className="space-y-6 p-6">
      <SectionCard title="Configuracion general" subtitle="Parametros locales del sistema">
        {error ? <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-2xl border border-slate-200 p-5">
            <label className="mb-2 block text-sm text-slate-500">Ruta raiz por defecto para importar</label>
            <input
              type="text"
              value={defaultPath}
              onChange={(event) => setDefaultPath(event.target.value)}
              placeholder="Opcional. Tambien puedes configurarla en .env."
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />
            <p className="mt-2 text-xs text-slate-500">Si no hay dataset configurado, puedes trabajar con uploads temporales en Laboratorio de audio.</p>
            <button onClick={savePath} className="mt-4 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Guardar ruta
            </button>
          </div>

          <div className="md:col-span-2 rounded-2xl border border-slate-200 p-5">
            <label className="mb-2 block text-sm text-slate-500">Perfil de recursos</label>
            <select
              value={resourceProfile}
              onChange={(event) => setResourceProfile(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            >
              {Object.keys(RESOURCE_PROFILES).map((profile) => <option key={profile} value={profile}>{profile}</option>)}
            </select>
            <p className="mt-2 text-sm text-slate-600">{RESOURCE_PROFILES[resourceProfile]}</p>
            <button onClick={saveResourceProfile} className="mt-4 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Guardar perfil
            </button>
            {hardwareProfile ? (
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <Badge>recomendado: {hardwareProfile.recommended_profile}</Badge>
                <Badge>CPU: {hardwareProfile.cpu_count}</Badge>
                <Badge>RAM: {hardwareProfile.ram_gb ?? "?"} GB</Badge>
                <Badge>device: {hardwareProfile.device}</Badge>
                <Badge>threads: {hardwareProfile.max_cpu_threads}</Badge>
                <Badge>workers: {hardwareProfile.max_workers}</Badge>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Modo de operacion</p>
            <p className="mt-2 font-semibold text-slate-900">Local / offline</p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Importacion automatica</p>
            <p className="mt-2 font-semibold text-slate-900">Selection tables + CSV + segmentos + espectrogramas</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Rutas de audio permitidas" subtitle="Carpetas desde donde el backend puede servir audios">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          El navegador no puede reproducir rutas locales directamente. Todo audio debe pasar por el backend y estar dentro de una ruta permitida. Para datasets reales, configura ACUSTICAFAUNA_DATASET_DIR o ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS en .env.
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-3 font-medium">Variable / ruta</th>
                <th className="px-3 py-3 font-medium">Valor actual</th>
                <th className="px-3 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pathRows.map(([name, item]) => (
                <tr key={name} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 font-semibold text-slate-800">{name}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-700">{item?.path || "-"}</td>
                  <td className="px-3 py-3">
                    <Badge tone={item?.exists ? "success" : "warning"}>{item?.exists ? "existe" : "no existe"}</Badge>
                  </td>
                </tr>
              ))}
              {systemPaths?.allowed_audio_roots?.map((item, index) => (
                <tr key={`${item.path}-${index}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 font-semibold text-slate-800">ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-700">{item.path}</td>
                  <td className="px-3 py-3">
                    <Badge tone={item.exists ? "success" : "warning"}>{item.exists ? "existe" : "no existe"}</Badge>
                  </td>
                </tr>
              ))}
              {!systemPaths ? (
                <tr>
                  <td colSpan="3" className="px-3 py-8 text-center text-slate-500">
                    {pathsLoading ? "Consultando rutas..." : "No se han cargado rutas."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={loadSystemPaths} className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Probar rutas
          </button>
          <button onClick={copyEnvExample} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
            Copiar ejemplo .env
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
