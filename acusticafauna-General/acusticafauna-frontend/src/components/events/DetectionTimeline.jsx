export default function DetectionTimeline({ predictions = [] }) {
  return (
    <div className="rounded-3xl border border-slate-200 p-5">
      <h4 className="text-base font-semibold text-slate-900">Línea de tiempo de detecciones</h4>
      <p className="mt-1 text-sm text-slate-500">
        Segmentos detectados dentro del fragmento analizado
      </p>

      <div className="mt-4 space-y-3">
        {predictions.length === 0 ? (
          <p className="text-sm text-slate-500">No hay segmentos registrados.</p>
        ) : (
          predictions.map((prediction) => (
            <div key={`${prediction.rank}-${prediction.species}`} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-800">
                  #{prediction.rank} · {prediction.species}
                </p>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {prediction.confidenceLabel}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Inicio: {prediction.start} · Fin: {prediction.end}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}