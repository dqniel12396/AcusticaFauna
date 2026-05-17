import SectionCard from "../components/shared/SectionCard";
import MetricCard from "../components/shared/MetricCard";
import { mockMetrics } from "../data/mockMetrics";

export default function StatsPage() {
  const metrics = [
    { title: "Precisión", value: mockMetrics.precision, detail: "Eventos correctos sobre positivos detectados" },
    { title: "Recall", value: mockMetrics.recall, detail: "Eventos relevantes recuperados" },
    { title: "F1 Score", value: mockMetrics.f1Score, detail: "Balance general del clasificador" },
    { title: "Falsos positivos", value: mockMetrics.falsePositives, detail: "Ruido o clases incorrectas" },
  ];

  return (
    <div className="space-y-6 p-6">
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

      <SectionCard
        title="Resumen de evaluación"
        subtitle="Espacio para curvas, matrices de confusión y análisis de desempeño"
      >
        <div className="flex h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
          Aquí irán las gráficas de evaluación
          <br />
          precisión, recall, F1, falsos positivos y distribución por especie
        </div>
      </SectionCard>
    </div>
  );
}