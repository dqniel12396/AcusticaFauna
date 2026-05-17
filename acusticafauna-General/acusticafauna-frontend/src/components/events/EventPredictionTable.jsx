export default function EventPredictionTable({ predictions = [] }) {
  return (
    <div className="rounded-3xl border border-slate-200 p-5">
      <h4 className="text-base font-semibold text-slate-900">Predicciones del clasificador</h4>
      <p className="mt-1 text-sm text-slate-500">
        Ranking de especies y ventanas temporales detectadas
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-3 font-medium">Rank</th>
              <th className="px-3 py-3 font-medium">Especie / clase</th>
              <th className="px-3 py-3 font-medium">Confianza</th>
              <th className="px-3 py-3 font-medium">Inicio</th>
              <th className="px-3 py-3 font-medium">Fin</th>
            </tr>
          </thead>
          <tbody>
            {predictions.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-3 py-6 text-center text-slate-500">
                  No hay predicciones disponibles.
                </td>
              </tr>
            ) : (
              predictions.map((prediction) => (
                <tr key={`${prediction.rank}-${prediction.species}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-4 font-semibold text-slate-800">{prediction.rank}</td>
                  <td className="px-3 py-4">{prediction.species}</td>
                  <td className="px-3 py-4">{prediction.confidenceLabel}</td>
                  <td className="px-3 py-4">{prediction.start}</td>
                  <td className="px-3 py-4">{prediction.end}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}