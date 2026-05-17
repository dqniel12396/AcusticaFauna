import { mockDevices } from "../data/mockDevices";
import Badge from "../components/shared/Badge";

export default function DevicesPage() {
  return (
    <div className="p-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Dispositivos registrados</h3>
        <p className="mb-5 text-sm text-slate-500">
          Resumen de estado, batería y última sincronización
        </p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mockDevices.map((device) => (
            <div key={device.name} className="rounded-3xl border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-slate-800">{device.name}</h4>
                <Badge tone={device.state === "En línea" ? "success" : "warning"}>
                  {device.state}
                </Badge>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>Batería: {device.battery}</p>
                <p>Última sincronización: {device.sync}</p>
                <p>Almacenamiento usado: {device.storage}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}