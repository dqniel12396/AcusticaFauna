import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard", icon: "D" },
  { to: "/eventos", label: "Eventos", icon: "E" },
  { to: "/dataset-curado", label: "Dataset Curado", icon: "C" },
  { to: "/laboratorio-audio", label: "Laboratorio de audio", icon: "L" },
  { to: "/auditoria-retroalimentacion", label: "Auditoria feedback", icon: "A" },
  { to: "/explorador-ml", label: "Explorador ML", icon: "EX" },
  { to: "/modelos-ml", label: "Modelos ML", icon: "ML" },
  { to: "/taxonomia", label: "Taxonomia", icon: "X" },
  { to: "/datasets-entrenamiento", label: "Entrenamiento", icon: "N" },
  { to: "/sesiones", label: "Sesiones de analisis", icon: "S" },
  { to: "/mapa", label: "Mapa", icon: "M" },
  { to: "/estadisticas", label: "Estadisticas", icon: "T" },
  { to: "/sincronizacion", label: "Importacion local", icon: "I" },
  { to: "/configuracion", label: "Configuracion", icon: "O" },
];

export default function Sidebar({ collapsed = false, onToggle }) {
  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-900 text-white transition-[width,border-color] duration-200 dark:border-slate-800 dark:bg-slate-950 lg:flex"
      style={{ width: collapsed ? "3.5rem" : "16.25rem" }}
      aria-label="Navegacion principal"
    >
      <div className={`border-b border-slate-800 ${collapsed ? "px-2 py-4" : "px-4 py-4"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between gap-3"}`}>
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-bold">
                AF
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold tracking-tight">AcusticaFauna</h1>
                <p className="mt-1 truncate text-xs text-slate-400">Analisis bioacustico local</p>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? "Abrir barra lateral" : "Ocultar barra lateral"}
            aria-label={collapsed ? "Abrir barra lateral" : "Ocultar barra lateral"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-lg font-bold text-slate-100 shadow-sm transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-emerald-800 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            {collapsed ? ">" : "<"}
          </button>
        </div>
      </div>

      <nav className={`flex-1 space-y-2 overflow-y-auto ${collapsed ? "px-1 py-5" : "px-4 py-6"}`}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl py-3 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              } ${collapsed ? "justify-center px-0" : "px-3"}`
            }
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs font-bold">
              {item.icon}
            </span>
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </NavLink>
        ))}
      </nav>

      <div className={`border-t border-slate-800 text-sm text-slate-400 ${collapsed ? "px-2 py-4 text-center" : "px-4 py-4"}`}>
        {collapsed ? "Local" : "Modo local - importacion automatica"}
      </div>
    </aside>
  );
}
