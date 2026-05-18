import math
import struct
import uuid
import wave
from datetime import datetime
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.services.audio_path_service import resolve_allowed_audio_path


def write_test_wav(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(8000)
        for index in range(800):
            value = int(10000 * math.sin(2 * math.pi * 440 * index / 8000))
            wav.writeframes(struct.pack("<h", value))
    return path


def test_resolve_allowed_audio_path_storage(test_settings):
    audio = write_test_wav(test_settings.STORAGE_DIR / "audio_lab" / "uploads" / "ok.wav")
    resolved = resolve_allowed_audio_path(str(audio))
    assert resolved == audio.resolve()


def test_resolve_allowed_audio_path_dataset(test_settings):
    audio = write_test_wav(test_settings.CURATED_DATASET_DIR / "cleaned" / "ok.wav")
    resolved = resolve_allowed_audio_path(str(audio))
    assert resolved == audio.resolve()


def test_resolve_old_dataset_curado_path_under_configured_dataset_dir(test_settings, tmp_path):
    audio = write_test_wav(
        test_settings.CURATED_DATASET_DIR
        / "cleaned"
        / "positivos"
        / "Allobates_cepedai"
        / "old_manifest.wav"
    )
    old_path = (
        tmp_path
        / "old_machine"
        / "dataset_curado"
        / "cleaned"
        / "positivos"
        / "Allobates_cepedai"
        / "old_manifest.wav"
    )
    resolved = resolve_allowed_audio_path(str(old_path))
    assert resolved == audio.resolve()


def test_resolve_allowed_audio_path_backslash_windows(test_settings):
    audio = write_test_wav(test_settings.STORAGE_DIR / "audio_lab" / "uploads" / "backslash.wav")
    resolved = resolve_allowed_audio_path(str(audio).replace("/", "\\"))
    assert resolved.exists()


def test_resolve_allowed_audio_path_relative_safe(test_settings):
    audio = write_test_wav(test_settings.STORAGE_DIR / "relative.wav")
    resolved = resolve_allowed_audio_path("relative.wav")
    assert resolved == audio.resolve()


def test_resolve_allowed_audio_path_not_found(test_settings):
    with pytest.raises(HTTPException) as exc:
        resolve_allowed_audio_path(str(test_settings.STORAGE_DIR / "missing.wav"))
    assert exc.value.status_code == 404
    assert exc.value.detail["error"] == "audio_not_found"


def test_resolve_allowed_audio_path_outside_roots(tmp_path, test_settings):
    audio = write_test_wav(tmp_path / "outside.wav")
    with pytest.raises(HTTPException) as exc:
        resolve_allowed_audio_path(str(audio))
    assert exc.value.status_code == 403
    assert exc.value.detail["error"] == "audio_path_not_allowed"
    assert "suggested_env_line" in exc.value.detail


def test_resolve_allowed_audio_path_traversal(test_settings):
    with pytest.raises(HTTPException) as exc:
        resolve_allowed_audio_path("..\\outside.wav")
    assert exc.value.status_code in {403, 404}
    assert exc.value.detail["error"] in {"audio_path_not_allowed", "audio_not_found"}


def test_media_endpoint_audio_responses(client, tmp_path, test_settings):
    audio = write_test_wav(test_settings.STORAGE_DIR / "served.wav")
    served = client.get("/api/media/file", params={"path": str(audio)})
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("audio/")

    outside = write_test_wav(tmp_path / "outside-served.wav")
    forbidden = client.get("/api/media/file", params={"path": str(outside)})
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"]["error"] == "audio_path_not_allowed"

    missing = client.get("/api/media/file", params={"path": str(test_settings.STORAGE_DIR / "missing.wav")})
    assert missing.status_code == 404
    assert missing.json()["detail"]["error"] == "audio_not_found"


def test_system_paths_and_debug_resolve_audio(client, test_settings):
    audio = write_test_wav(test_settings.STORAGE_DIR / "debug.wav")
    paths = client.get("/api/system/paths")
    assert paths.status_code == 200
    assert "allowed_audio_roots" in paths.json()

    debug = client.post("/api/audio-lab/debug/resolve-audio", json={"audio_path": str(audio)})
    assert debug.status_code == 200
    payload = debug.json()
    assert payload["exists"] is True
    assert payload["allowed"] is True
    assert payload["playable_url"]


def test_import_session_route_diagnostics_reports_outside_allowed_audio(client, tmp_path):
    from app.db.database import get_connection
    from app.repositories.session_repository import create_import_session, finalize_session

    outside = write_test_wav(tmp_path / "external_session" / "clip.wav")
    conn = get_connection()
    try:
        session_id = create_import_session(
            conn=conn,
            name="pytest_import_routes",
            root_path=str(tmp_path),
            source_type="carpeta_local",
            import_mode="avanzado",
            csv_detected=None,
            segments_dir_detected=None,
            spectrograms_dir_detected=None,
        )
        event_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO events (
                id, session_id, source_audio_path, source_audio_name, begin_time, end_time,
                duration_seconds, segment_audio_path, spectrogram_path, event_fingerprint, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                session_id,
                str(outside),
                outside.name,
                0,
                1,
                1,
                str(outside),
                None,
                f"pytest-{event_id}",
                datetime.now().isoformat(timespec="seconds"),
            ),
        )
        conn.execute(
            """
            INSERT INTO predictions (id, event_id, rank_order, common_name, confidence)
            VALUES (?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), event_id, 1, "Test species", 0.9),
        )
        conn.commit()
        finalize_session(conn, session_id, 1, 1, 1, 1, 0, 0)
    finally:
        conn.close()

    response = client.get(f"/api/sessions/{session_id}/diagnose-routes")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_events"] == 1
    assert payload["predictions"] == 1
    assert payload["audios_outside_allowed_roots"] == 1
    assert payload["examples"][0]["suggested_env_line"].startswith("ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=")
