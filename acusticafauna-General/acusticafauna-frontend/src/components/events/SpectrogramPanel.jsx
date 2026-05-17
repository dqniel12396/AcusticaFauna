import { buildMediaUrl } from "../../utils/media";

export default function SpectrogramPanel({ imagePath, eventId }) {
  const imageUrl = buildMediaUrl(imagePath);

  return (
    <div className="rounded-3xl border border-slate-200 p-5">
      <h4 className="text-base font-semibold text-slate-900">Espectrograma</h4>
      <p className="mt-1 text-sm text-slate-500">
        Vista del espectrograma asociada al evento
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        {imagePath ? (
          <>
            <img
              src={imageUrl}
              alt={`Espectrograma del evento ${eventId}`}
              className="block max-h-[500px] w-full object-contain bg-slate-100"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <div className="hidden h-[300px] w-full items-center justify-center text-center text-sm text-slate-500">
              No se pudo cargar la imagen del espectrograma.
              <br />
              Revisa que la ruta exista en el PC local.
            </div>
          </>
        ) : (
          <div className="flex h-[300px] w-full items-center justify-center text-center text-sm text-slate-500">
            Este evento no tiene ruta de espectrograma asociada.
          </div>
        )}
      </div>

      {imagePath ? (
        <p className="mt-3 break-all text-xs text-slate-500">{imagePath}</p>
      ) : null}
    </div>
  );
}