import uuid
from datetime import datetime
import sqlite3


def create_import_session(
    conn: sqlite3.Connection,
    name: str,
    root_path: str | None,
    source_type: str,
    import_mode: str,
    csv_detected: str | None,
    segments_dir_detected: str | None,
    spectrograms_dir_detected: str | None,
) -> str:
    session_id = str(uuid.uuid4())
    imported_at = datetime.now().isoformat(timespec="seconds")

    conn.execute(
        """
        INSERT INTO import_sessions (
            id, name, root_path, source_type, import_mode, imported_at,
            csv_detected, segments_dir_detected, spectrograms_dir_detected
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            name,
            root_path,
            source_type,
            import_mode,
            imported_at,
            csv_detected,
            segments_dir_detected,
            spectrograms_dir_detected,
        ),
    )
    conn.commit()
    return session_id


def finalize_session(
    conn: sqlite3.Connection,
    session_id: str,
    total_selection_files: int,
    total_predictions: int,
    total_events: int,
    imported_segments: int,
    imported_spectrograms: int,
    skipped_existing_events: int,
) -> None:
    conn.execute(
        """
        UPDATE import_sessions
        SET total_selection_files = ?,
            total_predictions = ?,
            total_events = ?,
            imported_segments = ?,
            imported_spectrograms = ?,
            skipped_existing_events = ?,
            status = 'importado'
        WHERE id = ?
        """,
        (
            total_selection_files,
            total_predictions,
            total_events,
            imported_segments,
            imported_spectrograms,
            skipped_existing_events,
            session_id,
        ),
    )
    conn.commit()


def list_sessions(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT *
        FROM import_sessions
        ORDER BY imported_at DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]