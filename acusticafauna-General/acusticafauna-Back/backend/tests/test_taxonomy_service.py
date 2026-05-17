from app.services.taxonomy_service import (
    canonical_label_for,
    get_examples_for_label,
    get_label_counts,
    infer_from_label,
    list_taxonomy,
    suggest_taxonomy_from_curated_labels,
    update_taxonomy_item,
)


def find_item(label: str):
    result = list_taxonomy({"label": label})
    assert result["total"] == 1
    return result["items"][0]


def test_suggest_from_curated_creates_and_enriches_taxonomy(imported_curated_dataset):
    result = suggest_taxonomy_from_curated_labels()

    assert result["labels_seen"] >= 3

    boana = find_item("Boana_boans")
    assert boana["scientific_name"] == "Boana boans"
    assert boana["genus"] == "Boana"
    assert boana["species"] == "boans"
    assert boana["label_type"] == "species"
    assert boana["group_name"] == "anfibio"

    revisar = find_item("revisar_etiqueta")
    assert revisar["label_type"] == "unknown"
    assert revisar["use_for_training"] == 0
    assert revisar["needs_review"] == 1

    lepfus = find_item("LEPFUS")
    assert lepfus["label_type"] == "code"
    assert lepfus["parent_label"] == "Leptodactylus_fuscus"
    assert lepfus["needs_review"] == 0

    canonical = find_item("Leptodactylus_fuscus")
    assert canonical["label_type"] == "species"
    assert canonical["use_for_training"] == 1
    assert "LEPFUS" in canonical["aliases"]


def test_initial_aliases_normalize_legacy_codes():
    assert canonical_label_for("BOAPLA") == "Boana_platanera"
    assert canonical_label_for("RHIHOR") == "Rhinella_horribilis"
    assert canonical_label_for("SCIRUB") == "Scinax_ruber"
    assert canonical_label_for("LEPFUS") == "Leptodactylus_fuscus"
    assert canonical_label_for("LEPINS") == "Leptodactylus_insularum"

    non = infer_from_label("NON")
    no = infer_from_label("NO")
    assert non["parent_label"] == "otros_ruidos"
    assert no["parent_label"] == "otros_ruidos"
    assert non["label_type"] == "noise"
    assert no["label_type"] == "noise"


def test_update_taxonomy_and_stats(imported_curated_dataset):
    suggest_taxonomy_from_curated_labels()
    boana = find_item("Boana_boans")

    updated = update_taxonomy_item(
        boana["id"],
        {
            **boana,
            "common_name": "Rana de prueba",
            "use_for_training": False,
            "needs_review": True,
        },
    )

    assert updated["common_name"] == "Rana de prueba"
    assert updated["use_for_training"] == 0
    assert updated["needs_review"] == 1

    stats = get_label_counts()
    assert stats["total_labels"] >= 3
    assert stats["incomplete_count"] >= 1


def test_examples_for_label_returns_curated_segments(imported_curated_dataset):
    examples = get_examples_for_label("Boana_boans", limit=5)

    assert examples["label"] == "Boana_boans"
    assert len(examples["items"]) == 1
    assert examples["items"][0]["label"] == "Boana_boans"
