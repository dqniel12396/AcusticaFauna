import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.core.config import settings
from app.db.database import get_connection
from app.repositories.session_repository import create_import_session, finalize_session
from app.services.csv_index_service import build_csv_index, enrich_from_csv
from app.services.discovery_service import (
    discover_csv_summary,
    discover_named_folder,
    discover_selection_tables,
)
from app.services.selection_table_service import (
    group_predictions_by_window,
    parse_selection_table,
)
from app.services.storage_service import copy_if_needed, ensure_storage_dirs
from app.utils.parsing import safe_float


def build_event_fingerprint(begin_path: str, begin_time: float, end_time: float) -> str:
    raw = f"{Path(begin_path).name.lower().strip()}|{begin_time:.2f}|{end_time:.2f}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def event_exists(conn, event_fingerprint: str) -> bool:
    row = conn.execute(
        "SELECT id FROM events WHERE event_fingerprint = ?",
        (event_fingerprint,),
    ).fetchone()
    return row is not None


def build_time_pattern(begin_time: float, end_time: float) -> str:
    return f"{begin_time:.2f}-{end_time:.2f}s"


def build_source_audio_stem(begin_path: str) -> str:
    """
    Toma el audio original y devuelve el stem:
    Boana_boans__IAvH-CSA-18225__2018-07-13__d4dc506687
    """
    return Path(begin_path).stem.lower().strip()


def find_matching_file_by_time_and_stem(
    source_audio_path: str,
    begin_time: float,
    end_time: float,
    search_dir: Path | None,
    allowed_suffixes: set[str],
) -> str | None:
    """
    Busca un archivo en search_dir que:
    - tenga en el nombre el stem del audio original
    - tenga en el nombre el patrón de tiempo 36.00-39.00s
    - tenga una extensión esperada (.wav, .png, ...)
    """
    if search_dir is None or not search_dir.exists() or not search_dir.is_dir():
        return None

    source_stem = build_source_audio_stem(source_audio_path)
    time_pattern = build_time_pattern(begin_time, end_time)

    candidates: list[Path] = []

    for file in search_dir.iterdir():
        if not file.is_file():
            continue

        if file.suffix.lower() not in allowed_suffixes:
            continue

        name_lower = file.name.lower()

        if source_stem in name_lower and time_pattern in name_lower:
            candidates.append(file)

    if not candidates:
        return None

    # Si hay varios, toma el primero ordenado por nombre para mantener consistencia.
    candidates.sort(key=lambda p: p.name.lower())
    return str(candidates[0])


def find_matching_segment_and_spectrogram(
    begin_path: str,
    begin_time: float,
    end_time: float,
    segments_dir: Path | None,
    spectrograms_dir: Path | None,
) -> tuple[str | None, str | None]:
    segment_path = find_matching_file_by_time_and_stem(
        source_audio_path=begin_path,
        begin_time=begin_time,
        end_time=end_time,
        search_dir=segments_dir,
        allowed_suffixes={".wav", ".mp3", ".flac"},
    )

    spectrogram_path = find_matching_file_by_time_and_stem(
        source_audio_path=begin_path,
        begin_time=begin_time,
        end_time=end_time,
        search_dir=spectrograms_dir,
        allowed_suffixes={".png", ".jpg", ".jpeg", ".webp"},
    )

    return segment_path, spectrogram_path


def insert_event_and_predictions(
    conn,
    session_id: str,
    begin_path: str,
    begin_time: float,
    end_time: float,
    predictions_for_event: list[dict[str, Any]],
    csv_info: dict[str, Any],
    segments_dir: Path | None,
    spectrograms_dir: Path | None,
) -> tuple[str | None, bool, bool, bool]:
    """
    Retorna:
    - event_id
    - has_segment
    - has_spectrogram
    - skipped_existing_event
    """
    event_fingerprint = build_event_fingerprint(begin_path, begin_time, end_time)

    if event_exists(conn, event_fingerprint):
        return None, False, False, True

    sorted_predictions = sorted(
        predictions_for_event,
        key=lambda row: safe_float(row.get("Confidence"), 0.0),
        reverse=True,
    )

    best = sorted_predictions[0]
    event_id = str(uuid.uuid4())
    now = datetime.now().isoformat(timespec="seconds")

    # 1) Intentar por búsqueda real de archivos en las carpetas detectadas
    matched_segment_path, matched_spectrogram_path = find_matching_segment_and_spectrogram(
        begin_path=begin_path,
        begin_time=begin_time,
        end_time=end_time,
        segments_dir=segments_dir,
        spectrograms_dir=spectrograms_dir,
    )

    # 2) Si no se encontró por carpeta, usar lo que venga del CSV como respaldo
    segment_audio_original = matched_segment_path or csv_info.get("segment_audio_path")
    spectrogram_original = matched_spectrogram_path or csv_info.get("spectrogram_path")

    stored_audio_path, _, audio_hash = copy_if_needed(
        segment_audio_original,
        settings.AUDIO_DIR,
    )
    stored_spectrogram_path, _, spectrogram_hash = copy_if_needed(
        spectrogram_original,
        settings.SPECTROGRAM_DIR,
    )

    latitude = (
        safe_float(csv_info.get("latitude"), None)
        if csv_info.get("latitude") not in (None, "", "None")
        else None
    )
    longitude = (
        safe_float(csv_info.get("longitude"), None)
        if csv_info.get("longitude") not in (None, "", "None")
        else None
    )

    conn.execute(
        """
        INSERT INTO events (
            id,
            session_id,
            source_audio_path,
            source_audio_name,
            begin_time,
            end_time,
            duration_seconds,
            main_common_name,
            main_species_code,
            main_confidence,
            segment_audio_path,
            spectrogram_path,
            segment_audio_hash,
            spectrogram_hash,
            imported_status,
            location_name,
            habitat,
            latitude,
            longitude,
            event_fingerprint,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_id,
            session_id,
            begin_path,
            Path(begin_path).name if begin_path else None,
            begin_time,
            end_time,
            round(end_time - begin_time, 3),
            best.get("Common Name"),
            best.get("Species Code"),
            safe_float(best.get("Confidence")),
            stored_audio_path,
            stored_spectrogram_path,
            audio_hash,
            spectrogram_hash,
            "importado_al_pc",
            csv_info.get("location_name"),
            csv_info.get("habitat"),
            latitude,
            longitude,
            event_fingerprint,
            now,
        ),
    )

    for idx, prediction in enumerate(sorted_predictions, start=1):
        conn.execute(
            """
            INSERT INTO predictions (
                id,
                event_id,
                rank_order,
                common_name,
                species_code,
                confidence,
                begin_time,
                end_time,
                low_freq,
                high_freq,
                begin_path,
                file_offset
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                event_id,
                idx,
                prediction.get("Common Name"),
                prediction.get("Species Code"),
                safe_float(prediction.get("Confidence")),
                safe_float(prediction.get("Begin Time (s)") or prediction.get("Begin Time")),
                safe_float(prediction.get("End Time (s)") or prediction.get("End Time")),
                safe_float(prediction.get("Low Freq (Hz)") or prediction.get("Low Freq")),
                safe_float(prediction.get("High Freq (Hz)") or prediction.get("High Freq")),
                prediction.get("Begin Path"),
                safe_float(prediction.get("File Offset (s)") or prediction.get("File Offset")),
            ),
        )

    conn.commit()

    return event_id, bool(stored_audio_path), bool(stored_spectrogram_path), False


def run_advanced_import(payload) -> dict[str, Any]:
    ensure_storage_dirs()

    base_path = Path(payload.root_path) if payload.root_path else None

    if payload.mode == "automatico":
        if base_path is None or not base_path.exists():
            raise HTTPException(
                status_code=400,
                detail="La carpeta raíz no existe o no fue enviada.",
            )

    selection_files = discover_selection_tables(base_path, payload.selection_tables_path)
    if not selection_files:
        raise HTTPException(
            status_code=400,
            detail="No se encontraron archivos .BirdNET.selection.table.txt.",
        )

    csv_path = discover_csv_summary(base_path, payload.csv_summary_path)
    csv_index = build_csv_index(csv_path)

    segments_dir = discover_named_folder(
        base_path,
        payload.segments_path,
        ["segmentos_audio", "segments", "audio_segments"],
    )

    spectrograms_dir = discover_named_folder(
        base_path,
        payload.spectrograms_path,
        ["espectogramas", "espectrogramas", "spectrograms", "imagenes", "images"],
    )

    conn = get_connection()

    session_name = payload.session_name or f"Importacion_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    session_id = create_import_session(
        conn=conn,
        name=session_name,
        root_path=str(base_path) if base_path else "(modo avanzado)",
        source_type=payload.source_type or "carpeta_local",
        import_mode=payload.mode,
        csv_detected=str(csv_path) if csv_path else None,
        segments_dir_detected=str(segments_dir) if segments_dir else None,
        spectrograms_dir_detected=str(spectrograms_dir) if spectrograms_dir else None,
    )

    total_predictions = 0
    total_events = 0
    imported_segments = 0
    imported_spectrograms = 0
    skipped_existing_events = 0

    try:
        for selection_file in selection_files:
            rows = parse_selection_table(selection_file)
            total_predictions += len(rows)

            grouped = group_predictions_by_window(rows)

            for (begin_path, begin_time, end_time), predictions_for_event in grouped.items():
                csv_info = enrich_from_csv(
                    csv_index=csv_index,
                    begin_path=begin_path,
                    begin_time=begin_time,
                    end_time=end_time,
                )

                _, has_segment, has_spectrogram, skipped = insert_event_and_predictions(
                    conn=conn,
                    session_id=session_id,
                    begin_path=begin_path,
                    begin_time=begin_time,
                    end_time=end_time,
                    predictions_for_event=predictions_for_event,
                    csv_info=csv_info,
                    segments_dir=segments_dir,
                    spectrograms_dir=spectrograms_dir,
                )

                if skipped:
                    skipped_existing_events += 1
                    continue

                total_events += 1
                imported_segments += 1 if has_segment else 0
                imported_spectrograms += 1 if has_spectrogram else 0

        finalize_session(
            conn=conn,
            session_id=session_id,
            total_selection_files=len(selection_files),
            total_predictions=total_predictions,
            total_events=total_events,
            imported_segments=imported_segments,
            imported_spectrograms=imported_spectrograms,
            skipped_existing_events=skipped_existing_events,
        )
    finally:
        conn.close()

    messages = [
        "Importación completada.",
        "Los archivos importados se copiaron al almacenamiento interno del sistema.",
        "Si vuelves a importar lo mismo, los eventos ya existentes se omiten para evitar duplicados.",
    ]

    if csv_path is None:
        messages.append("No se encontró resumen_espectrogramas.csv.")
    if segments_dir is None:
        messages.append("No se detectó carpeta de segmentos de audio.")
    if spectrograms_dir is None:
        messages.append("No se detectó carpeta de espectrogramas.")
    if skipped_existing_events > 0:
        messages.append(f"Se omitieron {skipped_existing_events} eventos ya existentes.")

    return {
        "session_id": session_id,
        "session_name": session_name,
        "mode": payload.mode,
        "root_path": str(base_path) if base_path else None,
        "detected_selection_tables": len(selection_files),
        "csv_detected": str(csv_path) if csv_path else None,
        "segments_dir_detected": str(segments_dir) if segments_dir else None,
        "spectrograms_dir_detected": str(spectrograms_dir) if spectrograms_dir else None,
        "total_selection_files": len(selection_files),
        "total_predictions": total_predictions,
        "total_events": total_events,
        "imported_segments": imported_segments,
        "imported_spectrograms": imported_spectrograms,
        "skipped_existing_events": skipped_existing_events,
        "status": "importado",
        "messages": messages,
    }