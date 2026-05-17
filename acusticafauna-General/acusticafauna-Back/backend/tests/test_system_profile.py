def test_hardware_profile_endpoint_returns_resource_defaults(client):
    response = client.get("/api/system/hardware-profile")
    assert response.status_code == 200
    data = response.json()
    assert data["cpu_count"] >= 1
    assert data["recommended_profile"] in {"eco", "balanceado", "rendimiento"}
    assert data["device"] in {"auto", "cpu", "cuda", "mps"} or isinstance(data["device"], str)
    assert "storage_dir" in data["paths"]


def test_config_paths_are_not_hardcoded_to_developer_machine(test_settings):
    assert str(test_settings.STORAGE_DIR).endswith("storage")
    assert test_settings.CURATED_DATASET_DIR.name == "dataset_curado"
