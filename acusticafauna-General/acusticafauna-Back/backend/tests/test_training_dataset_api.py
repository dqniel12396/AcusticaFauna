def test_training_dataset_api_flow(client, sample_curated_dataset):
    client.post("/api/curated-dataset/import", json={"dataset_root": str(sample_curated_dataset)})
    client.post("/api/taxonomy/suggest-from-curated")

    create_response = client.post(
        "/api/training-datasets",
        json={
            "version_name": "dataset_api_v1",
            "description": "Version API de prueba",
            "created_by": "pytest",
            "min_duration_seconds": 0.1,
            "max_duration_seconds": 1.0,
            "min_examples_per_label": 1,
            "random_seed": 99,
        },
    )
    assert create_response.status_code == 200
    version = create_response.json()

    build_response = client.post(f"/api/training-datasets/{version['id']}/build")
    assert build_response.status_code == 200
    assert build_response.json()["status"] == "built"
    assert build_response.json()["total_items"] == 3

    items_response = client.get(f"/api/training-datasets/{version['id']}/items")
    assert items_response.status_code == 200
    assert items_response.json()["total"] == 4

    stats_response = client.get(f"/api/training-datasets/{version['id']}/stats")
    assert stats_response.status_code == 200
    assert stats_response.json()["version"]["total_items"] == 3
    assert "by_exclude_reason" in stats_response.json()
    assert "included_label_stats" in stats_response.json()
    assert "excluded_label_stats" in stats_response.json()

    audit_response = client.get(f"/api/training-datasets/{version['id']}/audit")
    assert audit_response.status_code == 200
    assert "warnings" in audit_response.json()

    presets_response = client.get("/api/training-datasets/presets")
    assert presets_response.status_code == 200
    assert "general_detector_v0" in presets_response.json()

    split_response = client.post(
        f"/api/training-datasets/{version['id']}/splits",
        json={"train_ratio": 0.8, "val_ratio": 0.1, "test_ratio": 0.1, "random_seed": 7},
    )
    assert split_response.status_code == 200

    export_response = client.get(f"/api/training-datasets/{version['id']}/export")
    assert export_response.status_code == 200
    assert "normalized_label" in export_response.text

    included_export_response = client.get(f"/api/training-datasets/{version['id']}/export?included_only=true")
    assert included_export_response.status_code == 200
    assert "Boana_boans" in included_export_response.text
    assert "pendiente_real" not in included_export_response.text

    lock_response = client.post(f"/api/training-datasets/{version['id']}/lock")
    assert lock_response.status_code == 200
    assert lock_response.json()["status"] == "locked"
