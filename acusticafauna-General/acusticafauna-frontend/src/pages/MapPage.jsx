import SectionCard from "../components/shared/SectionCard";
import MapPlaceholder from "../components/map/MapPlaceholder";
import { mockEvents } from "../data/mockEvents";

export default function MapPage() {
  const points = mockEvents.map((event) => ({
    id: event.id,
    name: `${event.species} · ${event.location}`,
    latitude: event.latitude,
    longitude: event.longitude,
  }));

  return (
    <div className="p-6">
      <SectionCard
        title="Mapa de eventos"
        subtitle="Vista geográfica preparada para integrar Leaflet más adelante"
      >
        <MapPlaceholder points={points} />
      </SectionCard>
    </div>
  );
}