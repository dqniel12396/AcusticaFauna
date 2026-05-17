import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AudioPlayerCard from "../components/events/AudioPlayerCard";
import DetectionTimeline from "../components/events/DetectionTimeline";
import EventMetadataPanel from "../components/events/EventsMetadaPanel";
import EventPredictionTable from "../components/events/EventPredictionTable";
import SpectrogramPanel from "../components/events/SpectrogramPanel";
import SectionCard from "../components/shared/SectionCard";
import { fetchEventDetail } from "../services/api";

function mapPredictions(predictions) {
  return predictions.map((prediction) => ({
    rank: prediction.rank_order,
    species: prediction.species_code || prediction.common_name || "Sin etiqueta",
    confidence: prediction.confidence,
    confidenceLabel:
      prediction.confidence != null
        ? `${(Number(prediction.confidence) * 100).toFixed(2)}%`
        : "-",
    start: prediction.begin_time != null ? `${prediction.begin_time}s` : "-",
    end: prediction.end_time != null ? `${prediction.end_time}s` : "-",
  }));
}

function mapEventToMetadata(event) {
  return {
    ...event,
    species: event.main_species_code || event.main_common_name || "Sin etiqueta",
    confidenceLabel:
      event.main_confidence != null
        ? `${(Number(event.main_confidence) * 100).toFixed(2)}%`
        : "-",
    audioPath: event.segment_audio_path || "",
    spectrogramImage: event.spectrogram_path || "",
    syncState: event.imported_status,
    location: event.location_name,
  };
}

export default function EventDetailPage() {
  const { id } = useParams();

  const [eventDetail, setEventDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadEventDetail() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchEventDetail(id);
      setEventDetail(data);
    } catch (err) {
      setError(err.message || "No fue posible cargar el detalle del evento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEventDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Cargando detalle del evento...</p>
        </div>
      </div>
    );
  }

  if (error || !eventDetail?.event) {
    return (
      <div className="p-6">
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
          <h3 className="text-xl font-semibold text-slate-900">Evento no disponible</h3>
          <p className="mt-2 text-sm text-slate-500">
            {error || "No se encontró información para este evento."}
          </p>
          <Link
            to="/eventos"
            className="mt-4 inline-block rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Volver a eventos
          </Link>
        </div>
      </div>
    );
  }

  const event = mapEventToMetadata(eventDetail.event);
  const predictions = mapPredictions(eventDetail.predictions || []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          to="/eventos"
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Volver
        </Link>

        <button
          onClick={loadEventDetail}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Recargar
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <AudioPlayerCard audioPath={event.audioPath} />
          <SpectrogramPanel imagePath={event.spectrogramImage} eventId={event.id} />
          <DetectionTimeline predictions={predictions} />
        </div>

        <div className="space-y-6">
          <EventMetadataPanel event={event} />
        </div>
      </div>

      <SectionCard
        title="Clasificación del evento"
        subtitle="Predicciones reales guardadas en la base local"
      >
        <EventPredictionTable predictions={predictions} />
      </SectionCard>
    </div>
  );
}