export default function MetricCard({ title, value, detail }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {detail ? <p className="mt-2 text-sm text-emerald-700">{detail}</p> : null}
    </div>
  );
}