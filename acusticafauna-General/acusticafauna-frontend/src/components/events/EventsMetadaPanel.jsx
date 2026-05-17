import InfoCard from "../shared/InfoCard";
import Badge from "../shared/Badge";

function getSyncTone(syncState) {
  if (syncState === "importado_al_pc") return "success";
  if (syncState === "pendiente") return "info";
  return "warning";
}

function getSyncLabel(syncState) {
  if (syncState === "importado_al_pc") return "Importado al PC";
  if (syncState === "pendiente") return "Pendiente";
  if (syncState === "error") return "Error";
  return syncState || "Sin estado";
}

export default function EventMetadataPanel({ event }) {
  return (
    <div className="rounded-3xl border border-slate-200 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-slate-900">Metadatos del evento</h4>
          <p className="text-sm text-slate-500">Información local del fragmento</p>
        </div>
        <Badge tone={getSyncTone(event.syncState)}>
          {getSyncLabel(event.syncState)}
        </Badge>
      </div>

      <div className="grid gap-4">
        <InfoCard label="ID" value={event.id} />
        <InfoCard label="Especie principal" value={event.species} />
        <InfoCard label="Confianza" value={event.confidenceLabel} />
        <InfoCard label="Inicio (s)" value={String(event.begin_time ?? "-")} />
        <InfoCard label="Fin (s)" value={String(event.end_time ?? "-")} />
        <InfoCard label="Duración (s)" value={String(event.duration_seconds ?? "-")} />
        <InfoCard label="Hábitat" value={event.habitat || "-"} />
        <InfoCard label="Ubicación" value={event.location || "-"} />
        <InfoCard label="Latitud" value={event.latitude != null ? String(event.latitude) : "-"} />
        <InfoCard label="Longitud" value={event.longitude != null ? String(event.longitude) : "-"} />
        <InfoCard label="Sesión" value={event.session_id} />
        <InfoCard label="Audio fuente" value={event.source_audio_path || "-"} />
        <InfoCard label="Segmento de audio" value={event.audioPath || "-"} />
        <InfoCard label="Espectrograma" value={event.spectrogramImage || "-"} />
      </div>
    </div>
  );
}