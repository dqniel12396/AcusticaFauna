from app.db.database import get_connection


def create_empty_folder_batch_job(client, job_id="job_zero_candidates"):
    client.get("/api/audio-lab/folder-batch/jobs")
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO audio_lab_folder_batch_jobs (
                id, job_name, folder_path, target_label, status, mode, preset,
                frequency_min_hz, frequency_max_hz, threshold_dbfs,
                total_files, processed_files, candidates_count, discarded_count,
                contaminant_suspect_count, errors_count, params_json, summary_json,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                "empty job",
                "F:\\fake\\folder",
                "Pristimantis_simoterus",
                "completed",
                "species_folder_cleanup",
                "personalizado",
                2500,
                5000,
                -51,
                10,
                10,
                0,
                0,
                0,
                0,
                None,
                None,
                "2026-05-23T00:00:00",
                "2026-05-23T00:00:00",
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return job_id


def write_test_wav(path):
    import math
    import struct
    import wave

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(8000)
        for index in range(800):
            value = int(10000 * math.sin(2 * math.pi * 440 * index / 8000))
            wav.writeframes(struct.pack("<h", value))
    return path


def test_folder_batch_outputs_empty_job_returns_structured_empty_payload(client):
    job_id = create_empty_folder_batch_job(client)

    response = client.get(f"/api/audio-lab/folder-batch/jobs/{job_id}/outputs")

    assert response.status_code == 200
    payload = response.json()
    assert payload["job_id"] == job_id
    assert payload["outputs"] == []
    assert payload["items"] == []
    assert payload["count"] == 0
    assert "No se generaron clips" in payload["message"]


def test_folder_batch_summary_empty_job_returns_zero_candidates_summary(client):
    job_id = create_empty_folder_batch_job(client, "job_zero_summary")

    response = client.get(f"/api/audio-lab/folder-batch/jobs/{job_id}/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["outputs_count"] == 0
    assert payload["summary"]["files_processed"] == 10
    assert payload["summary"]["candidates_count"] == 0
    assert payload["summary"]["errors_count"] == 0
    assert payload["summary"]["zero_candidates"] is True
    assert payload["summary"]["reason"] == "zero_candidates_after_batch"


def test_folder_batch_job_old_job_without_config_does_not_crash(client):
    job_id = create_empty_folder_batch_job(client, "job_without_config")

    response = client.get(f"/api/audio-lab/folder-batch/jobs/{job_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == job_id
    assert payload["params"] == {}
    assert payload["summary"] == {}


def test_folder_batch_job_not_found_returns_clear_json(client):
    response = client.get("/api/audio-lab/folder-batch/jobs/missing-job-id")

    assert response.status_code == 404
    assert response.json()["detail"] == "folder_batch_job_not_found"
    assert response.json()["job_id"] == "missing-job-id"


def test_cors_preflight_allows_localhost_frontend(client):
    response = client.options(
        "/api/audio-lab/folder-batch/jobs",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_preflight_allows_127_frontend(client):
    response = client.options(
        "/api/audio-lab/folder-batch/jobs",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_curated_dataset_endpoints_use_temporary_database(client, sample_curated_dataset, tmp_db_path):
    response = client.post(
        "/api/curated-dataset/import",
        json={"dataset_root": str(sample_curated_dataset)},
    )
    assert response.status_code == 200
    assert response.json()["imported_count"] == 4
    assert tmp_db_path.exists()

    stats_response = client.get("/api/curated-dataset/stats")
    assert stats_response.status_code == 200
    assert stats_response.json()["total_segments"] == 4

    segments_response = client.get("/api/curated-dataset/segments", params={"label": "Boana_boans"})
    assert segments_response.status_code == 200
    segment = segments_response.json()["items"][0]
    assert segment["label"] == "Boana_boans"

    audio_response = client.get(f"/api/curated-dataset/segments/{segment['id']}/audio")
    assert audio_response.status_code == 200
    assert audio_response.headers["content-type"].startswith("audio/")


def test_curated_dataset_audio_relocates_old_dataset_curado_path(client, sample_curated_dataset, tmp_path):
    client.post("/api/curated-dataset/import", json={"dataset_root": str(sample_curated_dataset)})
    segment = client.get("/api/curated-dataset/segments", params={"label": "Boana_boans"}).json()["items"][0]
    actual = sample_curated_dataset / "cleaned" / "positivos" / "Boana_boans" / "Boana_boans__sample__seg0001.wav"
    old_path = tmp_path / "old_pc" / "dataset_curado" / "cleaned" / "positivos" / "Boana_boans" / actual.name

    conn = get_connection()
    try:
        conn.execute("UPDATE curated_audio_segments SET output_path = ? WHERE id = ?", (str(old_path), segment["id"]))
        conn.commit()
    finally:
        conn.close()

    audio_response = client.get(f"/api/curated-dataset/segments/{segment['id']}/audio")
    assert audio_response.status_code == 200
    assert audio_response.headers["content-type"].startswith("audio/")

    debug = client.post(
        "/api/audio-lab/debug/resolve-audio",
        json={"segment_id": segment["id"], "context": "curated_dataset"},
    )
    assert debug.status_code == 200
    payload = debug.json()
    assert payload["allowed"] is True
    assert payload["selected_source"] == "audio_limpio"


def test_curated_dataset_audio_forbidden_returns_clear_json(client, sample_curated_dataset, tmp_path):
    client.post("/api/curated-dataset/import", json={"dataset_root": str(sample_curated_dataset)})
    segment = client.get("/api/curated-dataset/segments", params={"label": "Boana_boans"}).json()["items"][0]
    outside = write_test_wav(tmp_path / "dataset_ranas-20260512T141405Z-3-004" / "dataset_ranas" / "Allobates" / "outside.wav")

    conn = get_connection()
    try:
        conn.execute(
            "UPDATE curated_audio_segments SET output_path = ?, source_path = NULL WHERE id = ?",
            (str(outside), segment["id"]),
        )
        conn.commit()
    finally:
        conn.close()

    audio_response = client.get(f"/api/curated-dataset/segments/{segment['id']}/audio")
    assert audio_response.status_code == 403
    detail = audio_response.json()["detail"]
    assert detail["error"] == "audio_path_not_allowed"
    assert "suggested_env_line" in detail
    assert detail["suggested_env_line"].startswith("ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=")

    debug = client.post(
        "/api/audio-lab/debug/resolve-audio",
        json={"segment_id": segment["id"], "context": "curated_dataset"},
    )
    assert debug.status_code == 200
    payload = debug.json()
    assert payload["audio_clean"]["exists"] is True
    assert payload["audio_clean"]["allowed"] is False
    assert payload["suggested_env_line"].startswith("ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=")


def test_review_endpoint_is_idempotent(client, sample_curated_dataset):
    client.post("/api/curated-dataset/import", json={"dataset_root": str(sample_curated_dataset)})
    segment = client.get("/api/curated-dataset/segments", params={"label": "Boana_boans"}).json()["items"][0]

    payload = {
        "reviewed_label": "Boana_boans",
        "review_status": "accepted",
        "reviewer": "pytest",
        "notes": "same review",
    }
    first = client.post(f"/api/curated-dataset/segments/{segment['id']}/review", json=payload)
    second = client.post(f"/api/curated-dataset/segments/{segment['id']}/review", json=payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]

    conn = get_connection()
    try:
        count = conn.execute(
            "SELECT COUNT(*) AS count FROM human_reviews WHERE curated_segment_id = ?",
            (segment["id"],),
        ).fetchone()["count"]
    finally:
        conn.close()
    assert count == 1


def test_taxonomy_endpoints(client, sample_curated_dataset):
    client.post("/api/curated-dataset/import", json={"dataset_root": str(sample_curated_dataset)})

    suggest = client.post("/api/taxonomy/suggest-from-curated")
    assert suggest.status_code == 200
    assert suggest.json()["labels_seen"] >= 3

    list_response = client.get("/api/taxonomy", params={"label": "Boana_boans"})
    assert list_response.status_code == 200
    item = list_response.json()["items"][0]
    assert item["scientific_name"] == "Boana boans"

    update = client.put(
        f"/api/taxonomy/{item['id']}",
        json={**item, "common_name": "Rana API", "use_for_training": False},
    )
    assert update.status_code == 200
    assert update.json()["common_name"] == "Rana API"
    assert update.json()["use_for_training"] == 0

    stats = client.get("/api/taxonomy/stats")
    assert stats.status_code == 200
    assert stats.json()["total_labels"] >= 3

    examples = client.get("/api/taxonomy/Boana_boans/examples")
    assert examples.status_code == 200
    assert examples.json()["items"][0]["label"] == "Boana_boans"
