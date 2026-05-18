from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.db.database import get_connection
from app.schemas.curated_dataset import CuratedImportRequest, CuratedReviewRequest
from app.services.audio_path_service import (
    allowed_audio_roots,
    debug_resolve_audio_path,
    media_type_for_path,
    resolve_allowed_audio_path,
)
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


def ensure_allowed_media_path(path: Path) -> Path:
    return resolve_allowed_audio_path(path)


def fetch_curated_segment_audio_paths(segment_id: str):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, segment_id, source_path, output_path FROM curated_audio_segments WHERE id = ?",
            (segment_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Segmento curado no encontrado.")
    return row


def combined_suggested_env_line(errors: list[HTTPException]) -> str | None:
    lines: list[str] = []
    for exc in errors:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        line = detail.get("suggested_env_line")
        if line and line not in lines:
            lines.append(line)

    if not lines:
        return None

    allowed_roots: list[str] = []
    dataset_line = None
    for line in lines:
        if line.startswith("ACUSTICAFAUNA_DATASET_DIR=") and dataset_line is None:
            dataset_line = line
        elif line.startswith("ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS="):
            allowed_roots.append(line.split("=", 1)[1])

    if dataset_line and allowed_roots:
        return f"{dataset_line}\nACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS={';'.join(allowed_roots)}"
    if len(lines) == 1:
        return lines[0]
    return "\n".join(lines)


def resolve_curated_segment_audio(row) -> Path:
    attempts = [
        ("audio_limpio", row["output_path"]),
        ("fuente_original", row["source_path"]),
    ]
    errors: list[HTTPException] = []

    for kind, raw_path in attempts:
        if not raw_path:
            continue
        try:
            return resolve_allowed_audio_path(raw_path)
        except HTTPException as exc:
            errors.append(exc)

    status_code = 404
    if any(exc.status_code == 403 for exc in errors):
        status_code = 403

    detail = {
        "error": "audio_not_found" if status_code == 404 else "audio_path_not_allowed",
        "message": (
            "No se encontro el audio limpio ni la fuente original."
            if status_code == 404
            else "El audio existe pero esta fuera de las carpetas permitidas."
        ),
        "segment_id": row["id"],
        "audio_clean_path": row["output_path"],
        "source_original_path": row["source_path"],
        "allowed_roots": [str(root) for root in allowed_audio_roots()],
        "attempts": [exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)} for exc in errors],
    }
    suggested = combined_suggested_env_line(errors)
    if suggested:
        detail["suggested_env_line"] = suggested

    raise HTTPException(status_code=status_code, detail=detail)


def debug_curated_segment_audio(segment_id: str) -> dict[str, Any]:
    row = fetch_curated_segment_audio_paths(segment_id)
    clean = debug_resolve_audio_path(row["output_path"]) if row["output_path"] else None
    source = debug_resolve_audio_path(row["source_path"]) if row["source_path"] else None
    candidates = [
        ("audio_limpio", clean, row["output_path"]),
        ("fuente_original", source, row["source_path"]),
    ]
    selected = next((item for item in candidates if item[1] and item[1].get("exists") and item[1].get("allowed")), None)

    suggested_lines = []
    for _, result, _ in candidates:
        line = result.get("suggested_env_line") if result else None
        if line and line not in suggested_lines:
            suggested_lines.append(line)

    warning = None
    if clean and clean.get("reason") == "audio_path_not_allowed" and "dataset_curado" in str(row["output_path"]).lower():
        warning = (
            "Tu dataset configurado no coincide con las rutas importadas. Configura ACUSTICAFAUNA_DATASET_DIR "
            "con la carpeta real de dataset_curado o agrega esa carpeta a ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS."
        )

    return {
        "context": "curated_dataset",
        "segment_id": segment_id,
        "db_audio_clean_path": row["output_path"],
        "db_source_original_path": row["source_path"],
        "audio_clean": clean,
        "source_original": source,
        "resolved_final": selected[1]["normalized_path"] if selected else None,
        "selected_source": selected[0] if selected else None,
        "exists": bool(selected),
        "allowed": bool(selected),
        "matched_root": selected[1]["matched_root"] if selected else None,
        "playable_url": selected[1]["playable_url"] if selected else None,
        "suggested_env_line": "\n".join(suggested_lines) if suggested_lines else None,
        "warning": warning,
        "allowed_roots": [str(root) for root in allowed_audio_roots()],
    }


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
    result = list_curated_segments(filters)
    for item in result.get("items", []):
        if item.get("id"):
            item["playable_url"] = f"/api/curated-dataset/segments/{item['id']}/audio"
            item["audio_url"] = item["playable_url"]
    return result


@router.get("/segments/{segment_id}")
def curated_dataset_segment_detail(segment_id: str):
    detail = get_curated_segment_detail(segment_id)
    segment = detail.get("segment") or {}
    if segment.get("id"):
        segment["playable_url"] = f"/api/curated-dataset/segments/{segment['id']}/audio"
        segment["audio_url"] = segment["playable_url"]
    return detail


@router.get("/segments/{segment_id}/audio")
def curated_dataset_segment_audio(segment_id: str):
    row = fetch_curated_segment_audio_paths(segment_id)
    audio_path = resolve_curated_segment_audio(row)
    return FileResponse(str(audio_path), media_type=media_type_for_path(audio_path), filename=audio_path.name)


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
            "SELECT id, segment_id, source_path, output_path FROM curated_audio_segments WHERE id = ?",
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
        audio_path = resolve_curated_segment_audio(row)
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
            "SELECT id, segment_id, source_path, output_path, spectrogram_path FROM curated_audio_segments WHERE id = ?",
            (segment_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Segmento curado no encontrado.")

    audio_path = resolve_curated_segment_audio(row)
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
