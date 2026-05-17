export default function MapPlaceholder({ points = [] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="flex h-[420px] items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
          Aquí irá el mapa local del proyecto
          <br />
          con marcadores por latitud y longitud
        </div>
      </div>

      <div className="space-y-3">
        {points.map((point) => (
          <div key={point.id} className="rounded-2xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-800">{point.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              Lat: {point.latitude} · Lon: {point.longitude}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}