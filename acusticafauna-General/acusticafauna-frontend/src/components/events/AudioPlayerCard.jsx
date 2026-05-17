import { buildMediaUrl } from "../../utils/media";

export default function AudioPlayerCard({ audioPath }) {
  const audioUrl = buildMediaUrl(audioPath);

  return (
    <div className="rounded-3xl border border-slate-200 p-5">
      <h4 className="text-base font-semibold text-slate-900">Audio del evento</h4>
      <p className="mt-1 text-sm text-slate-500">
        Reproductor local del fragmento almacenado
      </p>

      {audioPath ? (
        <>
          <div className="mt-4">
            <audio controls className="w-full">
              <source src={audioUrl} type="audio/wav" />
              Tu navegador no soporta audio.
            </audio>
          </div>

          <p className="mt-3 break-all text-xs text-slate-500">{audioPath}</p>
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No hay ruta de audio disponible para este evento.
        </div>
      )}
    </div>
  );
}