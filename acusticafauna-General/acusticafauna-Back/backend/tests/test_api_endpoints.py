from app.db.database import get_connection


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
