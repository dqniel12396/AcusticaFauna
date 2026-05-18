import SectionCard from "../components/shared/SectionCard";
import MetricCard from "../components/shared/MetricCard";
import { mockMetrics } from "../data/mockMetrics";

export default function StatsPage() {
  const metrics = [
    { title: "Precisión", value: mockMetrics.precision, detail: "Eventos correctos sobre positivos detectados" },
    { title: "Recall", value: mockMetrics.recall, detail: "Eventos relevantes recuperados" },
    { title: "F1 Score", value: mockMetrics.f1Score, detail: "Balance general del clasificador" },
    { title: "Falsos positivos", value: mockMetrics.falsePositives, detail: "Ruido o clases incorrectas" },
  ].filter((metric) => metric.value !== undefined && metric.value !== null && metric.value !== "");
  const hasMetrics = metrics.length > 0;

  return (
    <div className="space-y-6 p-6">
      {hasMetrics ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.title}
              title={metric.title}
              value={metric.value}
              detail={metric.detail}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          No hay métricas disponibles todavía.
        </div>
      )}

      <SectionCard
        title="Resumen de evaluación"
        subtitle="Espacio para curvas, matrices de confusión y análisis de desempeño"
      >
        <div className="flex h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
          {hasMetrics ? (
            <>
              Aquí irán las gráficas de evaluación
              <br />
              precisión, recall, F1, falsos positivos y distribución por especie
            </>
          ) : (
            "No hay métricas disponibles todavía."
          )}
        </div>
      </SectionCard>
    </div>
  );
}
