from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.core.config import settings
from app.db.database import get_connection
from app.schemas.curated_dataset import CuratedImportRequest, CuratedReviewRequest
from app.services.curated_dataset_service import (
    get_curated_dataset_stats,
    get_curated_segment_detail,
    import_curated_manifest,
    list_curated_segments,
    list_labels,
    mark_segment_review,
)
from app.services.spectrogram_service import (
    clear_temporary_spectrograms,
    generate_spectrogram_png,
    target_path_for,
)


router = APIRouter(prefix="/curated-dataset", tags=["curated-dataset"])


def is_path_inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def ensure_allowed_media_path(path: Path) -> Path:
    resolved = path.expanduser().resolve()

    if not any(is_path_inside(resolved, root) for root in settings.MEDIA_ALLOWED_ROOTS):
        raise HTTPException(status_code=403, detail="Ruta de audio fuera de raices permitidas.")

    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Archivo de audio no encontrado.")

    return resolved


@router.post("/import")
def import_curated_dataset(payload: CuratedImportRequest):
    return import_curated_manifest(Path(payload.dataset_root))


@router.get("/stats")
def curated_dataset_stats():
    return get_curated_dataset_stats()


@router.get("/labels")
def curated_dataset_labels():
    return list_labels()


@router.get("/segments")
def curated_dataset_segments(
    label: str | None = None,
    group_type: str | None = None,
    negative_for: str | None = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    status: str | None = None,
    review_status: str | None = None,
    pending_real: bool = False,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    filters: dict[str, Any] = {
        "label": label,
        "group_type": group_type,
        "negative_for": negative_for,
        "min_duration": min_duration,
        "max_duration": max_duration,
        "status": status,
        "review_status": review_status,
        "pending_real": pending_real,
        "limit": limit,
        "offset": offset,
    }
    return list_curated_segments(filters)


@router.get("/segments/{segment_id}")
def curated_dataset_segment_detail(segment_id: str):
    return get_curated_segment_detail(segment_id)


@router.get("/segments/{segment_id}/audio")
def curated_dataset_segment_audio(segment_id: str):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT output_path FROM curated_audio_segments WHERE id = ?",
            (segment_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Segmento curado no encontrado.")

    audio_path = ensure_allowed_media_path(Path(row["output_path"]))
    return FileResponse(audio_path)


def latest_review_status(conn, segment_id: str) -> str | None:
    row = conn.execute(
        """
        SELECT review_status
        FROM human_reviews
        WHERE curated_segment_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
        """,
        (segment_id,),
    ).fetchone()
    return row["review_status"] if row else None


def update_segment_spectrogram(
    segment_id: str,
    path: Path | None,
    status: str,
    error: str | None = None,
) -> None:
    conn = get_connection()
    try:
        conn.execute(
            """
            UPDATE curated_audio_segments
            SET spectrogram_path = ?,
                spectrogram_status = ?,
                spectrogram_error = ?
            WHERE id = ?
            """,
            (str(path) if path else None, status, error, segment_id),
        )
        conn.commit()
    finally:
        conn.close()


@router.get("/segments/{segment_id}/spectrogram")
def curated_dataset_segment_spectrogram(
    segment_id: str,
    mode: str = "preview",
    force: bool = False,
):
    if mode not in {"preview", "confirmed"}:
        raise HTTPException(status_code=400, detail="mode debe ser preview o confirmed.")

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, segment_id, output_path FROM curated_audio_segments WHERE id = ?",
            (segment_id,),
        ).fetchone()
        review_status = latest_review_status(conn, segment_id)
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Segmento curado no encontrado.")

    if mode == "confirmed" and review_status not in {"accepted", "corrected"}:
        raise HTTPException(
            status_code=409,
            detail="Solo se guarda espectrograma permanente para segmentos accepted o corrected.",
        )

    try:
        audio_path = ensure_allowed_media_path(Path(row["output_path"]))
        spectrogram_path = generate_spectrogram_png(
            audio_path=audio_path,
            segment_id=row["segment_id"],
            mode=mode,
            force=force,
        )
        update_segment_spectrogram(
            segment_id=segment_id,
            path=spectrogram_path,
            status="confirmed_saved" if mode == "confirmed" else "temporary_generated",
        )
        return FileResponse(spectrogram_path)
    except HTTPException:
        raise
    except Exception as exc:
        update_segment_spectrogram(segment_id, None, "error", str(exc))
        raise HTTPException(status_code=500, detail=f"No fue posible generar espectrograma: {exc}")


@router.delete("/spectrograms/tmp")
def delete_temporary_curated_spectrograms():
    result = clear_temporary_spectrograms()
    conn = get_connection()
    try:
        conn.execute(
            """
            UPDATE curated_audio_segments
            SET spectrogram_path = NULL,
                spectrogram_status = 'none',
                spectrogram_error = NULL
            WHERE spectrogram_status = 'temporary_generated'
            """
        )
        conn.commit()
    finally:
        conn.close()

    return result


@router.delete("/segments/{segment_id}/spectrogram")
def delete_curated_dataset_segment_spectrogram(
    segment_id: str,
    mode: str = "preview",
):
    if mode not in {"preview", "confirmed", "all"}:
        raise HTTPException(status_code=400, detail="mode debe ser preview, confirmed o all.")

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, segment_id, output_path, spectrogram_path FROM curated_audio_segments WHERE id = ?",
            (segment_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Segmento curado no encontrado.")

    audio_path = Path(row["output_path"]).expanduser().resolve()
    if not any(is_path_inside(audio_path, root) for root in settings.MEDIA_ALLOWED_ROOTS):
        raise HTTPException(status_code=403, detail="Ruta de audio fuera de raices permitidas.")
    deleted: list[str] = []

    modes = ["preview", "confirmed"] if mode == "all" else [mode]
    for current_mode in modes:
        candidate = target_path_for(row["segment_id"], audio_path, current_mode)
        if candidate.exists():
            candidate.unlink()
            deleted.append(str(candidate))

    preview_path = target_path_for(row["segment_id"], audio_path, "preview")
    confirmed_path = target_path_for(row["segment_id"], audio_path, "confirmed")

    if confirmed_path.exists():
        update_segment_spectrogram(segment_id, confirmed_path, "confirmed_saved", None)
        next_status = "confirmed_saved"
    elif preview_path.exists():
        update_segment_spectrogram(segment_id, preview_path, "temporary_generated", None)
        next_status = "temporary_generated"
    else:
        update_segment_spectrogram(segment_id, None, "none", None)
        next_status = "none"

    return {"deleted": deleted, "spectrogram_status": next_status}


@router.post("/segments/{segment_id}/review")
def review_curated_dataset_segment(segment_id: str, payload: CuratedReviewRequest):
    return mark_segment_review(
        segment_id=segment_id,
        reviewed_label=payload.reviewed_label,
        review_status=payload.review_status,
        reviewer=payload.reviewer,
        notes=payload.notes,
    )
