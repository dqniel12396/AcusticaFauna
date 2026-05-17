import { useEffect, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import { fetchHardwareProfile } from "../services/api";

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
  const [error, setError] = useState("");

  useEffect(() => {
    fetchHardwareProfile()
      .then((data) => {
        setHardwareProfile(data);
        setError("");
      })
      .catch((err) => setError(err.message || "No fue posible consultar el perfil de hardware."));
  }, []);

  function savePath() {
    localStorage.setItem("acusticafauna_root_path", defaultPath);
    alert("Ruta por defecto guardada localmente.");
  }

  function saveResourceProfile() {
    localStorage.setItem("acusticafauna_resource_profile", resourceProfile);
    alert("Perfil guardado en este navegador. Para aplicarlo al backend/ML, define ACUSTICAFAUNA_RESOURCE_PROFILE en .env.");
  }

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
    </div>
  );
}
