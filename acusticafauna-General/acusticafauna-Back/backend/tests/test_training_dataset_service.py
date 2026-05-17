import uuid
from datetime import datetime

from app.db.database import get_connection
from app.services.curated_dataset_service import list_curated_segments, mark_segment_review
from app.services.taxonomy_service import suggest_taxonomy_from_curated_labels
from app.services.training_dataset_service import (
    archive_dataset_version,
    build_dataset_version,
    create_dataset_version,
    export_dataset_manifest,
    get_dataset_audit,
    get_dataset_items,
    get_dataset_presets,
    get_dataset_stats,
    lock_dataset_version,
)


def create_basic_version(**overrides):
    config = {
        "version_name": overrides.pop("version_name", "dataset_pytest_v1"),
        "description": "Dataset versionado de prueba",
        "created_by": "pytest",
        "min_duration_seconds": 0.1,
        "max_duration_seconds": 1.0,
        "min_examples_per_label": 1,
        "random_seed": 123,
        **overrides,
    }
    return create_dataset_version(config)


def insert_curated_test_segment(tmp_path, label, group_type="positivo", negative_for=""):
    audio_path = tmp_path / f"{label}_{uuid.uuid4().hex}.wav"
    audio_path.write_bytes(b"fake-audio")
    timestamp = datetime.now().isoformat(timespec="seconds")
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO curated_audio_segments (
                id, segment_id, source_path, source_sha256, output_path, split,
                label, group_type, negative_for, source_filename, start_seconds,
                end_seconds, duration_seconds, sample_rate, channels, status, imported_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                f"{label}__pytest__{uuid.uuid4().hex}",
                str(audio_path),
                f"sha-{uuid.uuid4().hex}",
                str(audio_path),
                "train",
                label,
                group_type,
                negative_for,
                audio_path.name,
                0,
                1,
                1,
                8000,
                1,
                "ok",
                timestamp,
            ),
        )
        conn.commit()
        return str(audio_path)
    finally:
        conn.close()


def test_build_dataset_version_includes_candidates_and_excludes_pending(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    version = create_basic_version()
    built = build_dataset_version(version["id"])

    assert built["status"] == "built"
    assert built["total_items"] == 3

    items = get_dataset_items(version["id"], {"limit": 20})["items"]
    by_original = {item["curated_segment_id"]: item for item in items}
    included = [item for item in by_original.values() if item["item_role"] != "excluded"]
    excluded = [item for item in by_original.values() if item["item_role"] == "excluded"]

    assert len(included) == 3
    assert any(item["normalized_label"] == "Boana_boans" and item["item_role"] == "positive" for item in included)
    assert any(item["normalized_label"] == "otros_ruidos" and item["item_role"] == "background" for item in included)
    assert any(item["normalized_label"] == "Leptodactylus_fuscus" and item["item_role"] == "negative" for item in included)
    assert any(item["original_label"] == "revisar_etiqueta" and item["exclude_reason"] == "pendiente_real" for item in excluded)

    stats = get_dataset_stats(version["id"])
    assert stats["version"]["total_items"] == 3
    assert any(row["label"] == "Boana_boans" for row in stats["label_stats"])


def test_corrected_review_uses_reviewed_label(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    segment = list_curated_segments({"label": "Boana_boans"})["items"][0]
    mark_segment_review(
        segment["id"],
        reviewed_label="Boana_platanera",
        review_status="corrected",
        reviewer="pytest",
        notes="corregida",
    )

    version = create_basic_version(version_name="dataset_pytest_corrected")
    build_dataset_version(version["id"])
    items = get_dataset_items(version["id"], {"normalized_label": "Boana_platanera"})["items"]

    assert len(items) == 1
    assert items[0]["confidence_source"] == "corrected"
    assert items[0]["include_reason"] == "revision_humana_corrected"


def test_min_examples_rule_excludes_small_labels(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    version = create_basic_version(version_name="dataset_pytest_min_examples", min_examples_per_label=2)
    build_dataset_version(version["id"])

    items = get_dataset_items(version["id"], {"limit": 20})["items"]
    assert all(item["item_role"] == "excluded" for item in items)
    assert any(item["exclude_reason"] == "pocos_ejemplos_por_etiqueta" for item in items)


def test_export_lock_and_archive_dataset_version(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    version = create_basic_version(version_name="dataset_pytest_export")
    build_dataset_version(version["id"])

    manifest_path = export_dataset_manifest(version["id"])
    assert manifest_path.exists()
    text = manifest_path.read_text(encoding="utf-8")
    assert "normalized_label" in text
    assert "Boana_boans" in text

    locked = lock_dataset_version(version["id"])
    assert locked["status"] == "locked"
    archived = archive_dataset_version(version["id"])
    assert archived["status"] == "archived"


def test_export_included_only_excludes_rejected_items(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    version = create_basic_version(version_name="dataset_pytest_export_included")
    build_dataset_version(version["id"])

    manifest_path = export_dataset_manifest(version["id"], included_only=True)
    text = manifest_path.read_text(encoding="utf-8")

    assert "Boana_boans" in text
    assert "revisar_etiqueta" not in text
    assert "pendiente_real" not in text


def test_max_examples_per_label_can_exclude_all_included_items(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    version = create_basic_version(
        version_name="dataset_pytest_max_examples",
        max_examples_per_label=0,
    )
    built = build_dataset_version(version["id"])
    items = get_dataset_items(version["id"], {"limit": 20})["items"]

    assert built["total_items"] == 0
    assert any(item["exclude_reason"] == "exceso_max_examples_per_label" for item in items)


def test_max_background_examples_caps_background(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    version = create_basic_version(
        version_name="dataset_pytest_background_cap",
        max_background_examples=0,
    )
    built = build_dataset_version(version["id"])
    items = get_dataset_items(version["id"], {"limit": 20})["items"]

    assert built["total_items"] == 2
    assert any(
        item["original_label"] == "otros_ruidos" and item["exclude_reason"] == "exceso_max_background_examples"
        for item in items
    )


def test_include_label_types_filters_non_species(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    version = create_basic_version(
        version_name="dataset_pytest_include_species",
        include_label_types=["species"],
    )
    build_dataset_version(version["id"])
    items = get_dataset_items(version["id"], {"limit": 20})["items"]

    assert any(item["normalized_label"] == "Boana_boans" and item["item_role"] == "positive" for item in items)
    assert any(item["exclude_reason"] == "tipo_taxonomico_no_incluido" for item in items)


def test_general_detector_preset_maps_species_to_group(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    preset = get_dataset_presets()["general_detector_v0"]
    assert preset["balance_strategy"] == "cap_per_label"
    preset.update(
        {
            "version_name": "dataset_pytest_general_detector",
            "min_duration_seconds": 0.1,
            "min_examples_per_label": 1,
        }
    )
    version = create_dataset_version(preset)
    build_dataset_version(version["id"])
    items = get_dataset_items(version["id"], {"limit": 20})["items"]

    assert any(
        item["original_label"] == "Boana_boans"
        and item["normalized_label"] == "rana_sapo"
        and item["item_role"] == "positive"
        for item in items
    )
    assert get_dataset_presets()["general_detector_strict_balanced"]["balance_strategy"] == "balanced_downsample"


def test_amphibian_species_preset_keeps_species_labels(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    preset = get_dataset_presets()["amphibian_species_v0"]
    preset.update(
        {
            "version_name": "dataset_pytest_species_classifier",
            "min_duration_seconds": 0.1,
            "min_examples_per_label": 1,
        }
    )
    version = create_dataset_version(preset)
    build_dataset_version(version["id"])
    items = get_dataset_items(version["id"], {"limit": 20})["items"]

    assert any(
        item["original_label"] == "Boana_boans"
        and item["normalized_label"] == "Boana_boans"
        and item["item_role"] == "positive"
        for item in items
    )
    assert not any(item["label_type"] in {"code", "group", "unknown"} and item["item_role"] != "excluded" for item in items)


def test_amphibian_species_v2_aliases_uses_canonical_labels(imported_curated_dataset, tmp_path):
    expected = {
        "BOAPLA": "Boana_platanera",
        "RHIHOR": "Rhinella_horribilis",
        "SCIRUB": "Scinax_ruber",
        "LEPFUS": "Leptodactylus_fuscus",
        "LEPINS": "Leptodactylus_insularum",
    }
    audio_paths = {
        label: insert_curated_test_segment(tmp_path, label)
        for label in [*expected.keys(), "NON", "NO"]
    }
    suggest_taxonomy_from_curated_labels()
    preset = get_dataset_presets()["amphibian_species_v2_aliases"]
    preset.update(
        {
            "version_name": "dataset_pytest_species_aliases",
            "min_duration_seconds": 0.1,
            "min_examples_per_label": 1,
            "max_background_examples": 1000,
        }
    )
    version = create_dataset_version(preset)
    build_dataset_version(version["id"])
    items = get_dataset_items(version["id"], {"limit": 100})["items"]
    included = [item for item in items if item["item_role"] != "excluded"]

    for raw_label, canonical_label in expected.items():
        match = next(item for item in included if item["original_label"] == raw_label)
        assert match["normalized_label"] == canonical_label
        assert match["label_type"] == "species"
        assert match["group_name"] == "anfibio"
        assert match["audio_path"] == audio_paths[raw_label]
        assert match["source_path"] == audio_paths[raw_label]

    for raw_label in ["NON", "NO"]:
        match = next(item for item in included if item["original_label"] == raw_label)
        assert match["normalized_label"] == "otros_ruidos"
        assert match["label_type"] == "noise"
        assert match["item_role"] == "background"

    assert not any(item["normalized_label"] in {"NON", "NO"} and item["label_type"] == "species" for item in included)


def test_dataset_audit_returns_balance_sections(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    version = create_basic_version(version_name="dataset_pytest_audit")
    build_dataset_version(version["id"])

    audit = get_dataset_audit(version["id"])

    assert "warnings" in audit
    assert "stats" in audit
    assert "included_total" in audit["summary"]
    assert any(warning["code"] == "dataset_too_small" for warning in audit["warnings"])
