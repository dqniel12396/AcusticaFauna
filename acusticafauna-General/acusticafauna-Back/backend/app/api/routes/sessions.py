from pathlib import Path

from fastapi import APIRouter, HTTPException
from app.db.database import get_connection
from app.repositories.session_repository import list_sessions
from app.services.audio_path_service import debug_resolve_audio_path

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/")
def get_sessions():
    conn = get_connection()
    try:
        data = list_sessions(conn)
        return data
    finally:
        conn.close()


@router.get("/{session_id}/diagnose-routes")
def diagnose_session_routes(session_id: str):
    conn = get_connection()
    try:
        session = conn.execute("SELECT id, name, root_path FROM import_sessions WHERE id = ?", (session_id,)).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Sesion no encontrada.")

        rows = conn.execute(
            """
            SELECT id, source_audio_path, segment_audio_path, spectrogram_path
            FROM events
            WHERE session_id = ?
            """,
            (session_id,),
        ).fetchall()

        summary = {
            "session_id": session_id,
            "session_name": session["name"],
            "root_path": session["root_path"],
            "total_events": len(rows),
            "predictions": 0,
            "audios_found": 0,
            "audios_missing": 0,
            "audios_outside_allowed_roots": 0,
            "spectrograms_found": 0,
            "examples": [],
        }

        prediction_count = conn.execute(
            """
            SELECT COUNT(*) AS total
            FROM predictions p
            JOIN events e ON e.id = p.event_id
            WHERE e.session_id = ?
            """,
            (session_id,),
        ).fetchone()
        summary["predictions"] = int(prediction_count["total"] or 0)

        for row in rows:
            audio_path = row["segment_audio_path"] or row["source_audio_path"]
            if audio_path:
                resolved = debug_resolve_audio_path(audio_path)
                if resolved["exists"] and resolved["allowed"]:
                    summary["audios_found"] += 1
                elif resolved["exists"]:
                    summary["audios_outside_allowed_roots"] += 1
                else:
                    summary["audios_missing"] += 1
                if not resolved["allowed"] and len(summary["examples"]) < 5:
                    summary["examples"].append(
                        {
                            "event_id": row["id"],
                            "audio_path": audio_path,
                            "reason": resolved.get("reason"),
                            "suggested_env_line": resolved.get("suggested_env_line"),
                        }
                    )
            else:
                summary["audios_missing"] += 1

            spectrogram_path = row["spectrogram_path"]
            if spectrogram_path and Path(spectrogram_path).exists():
                summary["spectrograms_found"] += 1

        return summary
    finally:
        conn.close()
