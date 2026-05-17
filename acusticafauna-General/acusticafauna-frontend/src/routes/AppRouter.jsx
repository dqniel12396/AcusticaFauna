import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";
import DashboardPage from "../pages/DashboardPage";
import CuratedDatasetPage from "../pages/CuratedDatasetPage";
import AudioLabPage from "../pages/AudioLabPage";
import AudioLabAuditPage from "../pages/AudioLabAuditPage";
import MlExplorerPage from "../pages/MlExplorerPage";
import ManualPage from "../pages/ManualPage";
import MlModelsPage from "../pages/MlModelsPage";
import DevicesPage from "../pages/DevicesPage";
import EventDetailPage from "../pages/EventDetailPage";
import EventsPage from "../pages/EventsPage";
import SettingsPage from "../pages/SettingsPage";
import StatsPage from "../pages/StatsPage";
import SyncPage from "../pages/SyncPage";
import TaxonomyPage from "../pages/TaxonomyPage";
import TrainingDatasetsPage from "../pages/TrainingDatasetsPage";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="eventos" element={<EventsPage />} />
        <Route path="eventos/:id" element={<EventDetailPage />} />
        <Route path="dataset-curado" element={<CuratedDatasetPage />} />
        <Route path="laboratorio-audio" element={<AudioLabPage />} />
        <Route path="auditoria-retroalimentacion" element={<AudioLabAuditPage />} />
        <Route path="explorador-ml" element={<MlExplorerPage />} />
        <Route path="modelos-ml" element={<MlModelsPage />} />
        <Route path="taxonomia" element={<TaxonomyPage />} />
        <Route path="datasets-entrenamiento" element={<TrainingDatasetsPage />} />
        <Route path="dispositivos" element={<DevicesPage />} />
        <Route path="estadisticas" element={<StatsPage />} />
        <Route path="sincronizacion" element={<SyncPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
        <Route path="manual/:manualId" element={<ManualPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
