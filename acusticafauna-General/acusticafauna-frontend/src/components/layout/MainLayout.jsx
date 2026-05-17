import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const headerConfig = {
  "/": {
    title: "Dashboard principal",
    subtitle: "Resumen del analisis bioacustico local, eventos importados y sesiones recientes",
  },
  "/eventos": {
    title: "Eventos",
    subtitle: "Detecciones importadas automaticamente desde resultados BirdNET y segmentos asociados",
  },
  "/dataset-curado": {
    title: "Dataset Curado",
    subtitle: "Segmentos limpios importados desde manifest_segmentos.csv para inspeccion y revision",
  },
  "/taxonomia": {
    title: "Taxonomia",
    subtitle: "Catalogo de especies, grupos, codigos, alias y uso en entrenamiento",
  },
  "/datasets-entrenamiento": {
    title: "Datasets de entrenamiento",
    subtitle: "Versiones auditables del dataset para entrenamiento futuro",
  },
  "/auditoria-retroalimentacion": {
    title: "Auditoria de retroalimentacion",
    subtitle: "Feedback acumulado, conflictos y manifests limpios sin modificar audios",
  },
  "/explorador-ml": {
    title: "Explorador ML",
    subtitle: "Explora manifests, detecta candidatos y prepara nuevos modelos especializados desde la web",
  },
  "/modelos-ml": {
    title: "Modelos ML",
    subtitle: "Registry de modelos activos, experimentales, archivados y descartados",
  },
  "/sesiones": {
    title: "Sesiones de analisis",
    subtitle: "Lotes importados desde una ruta raiz con su resumen de audios, espectrogramas y eventos",
  },
  "/mapa": {
    title: "Mapa",
    subtitle: "Vista geografica basada en latitud y longitud cuando esos metadatos esten disponibles",
  },
  "/estadisticas": {
    title: "Estadisticas",
    subtitle: "Metricas generales del flujo local de deteccion, clasificacion e importacion",
  },
  "/sincronizacion": {
    title: "Importacion local",
    subtitle: "Lectura automatica de carpetas, archivos BirdNET, CSV de resumen y registro en base local",
  },
  "/configuracion": {
    title: "Configuracion",
    subtitle: "Parametros del sistema local, rutas por defecto y opciones de importacion",
  },
};

const manualRoutes = {
  "/": "/manual/general",
  "/eventos": "/manual/sesiones-analisis",
  "/dataset-curado": "/manual/dataset-curado",
  "/laboratorio-audio": "/manual/laboratorio-audio",
  "/auditoria-retroalimentacion": "/manual/auditoria-feedback",
  "/explorador-ml": "/manual/explorador-ml",
  "/modelos-ml": "/manual/modelos-ml",
  "/taxonomia": "/manual/taxonomia",
  "/datasets-entrenamiento": "/manual/entrenamiento",
  "/sincronizacion": "/manual/importacion-local",
  "/configuracion": "/manual/configuracion",
  "/estadisticas": "/manual/general",
  "/dispositivos": "/manual/general",
};

function getStoredBoolean(key, fallback) {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  return value === "true";
}

function getInitialDarkMode() {
  const stored = localStorage.getItem("acusticafauna_dark_mode");
  if (stored !== null) return stored === "true";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false;
}

export default function MainLayout() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    getStoredBoolean("acusticafauna_sidebar_collapsed", false)
  );
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);

  useEffect(() => {
    localStorage.setItem("acusticafauna_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("acusticafauna_dark_mode", String(darkMode));
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const currentHeader =
    location.pathname.startsWith("/manual/")
      ? {
          title: "Manual de uso",
          subtitle: "Guia contextual para operar la pagina seleccionada",
        }
      : location.pathname.startsWith("/eventos/")
      ? {
          title: "Detalle del evento",
          subtitle: "Audio, espectrograma, predicciones y metadatos del fragmento seleccionado",
        }
      : headerConfig[location.pathname] || headerConfig["/"];
  const manualHref = location.pathname.startsWith("/eventos/")
    ? "/manual/sesiones-analisis"
    : manualRoutes[location.pathname] || "/manual/general";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title={currentHeader.title}
            subtitle={currentHeader.subtitle}
            manualHref={manualHref}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((value) => !value)}
          />
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
