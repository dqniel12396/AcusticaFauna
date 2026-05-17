export default function Topbar({
  title,
  subtitle,
  darkMode,
  onToggleDarkMode,
  manualHref,
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {manualHref ? (
            <a
              href={manualHref}
              target="_blank"
              rel="noreferrer"
              title="Abre el manual de esta pagina en una nueva pestaña."
              className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900"
            >
              Manual de esta pagina
            </a>
          ) : null}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? "Activar modo claro" : "Activar modo oscuro"}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {darkMode ? "Modo claro" : "Modo oscuro"}
          </button>
        </div>
      </div>
    </header>
  );
}
