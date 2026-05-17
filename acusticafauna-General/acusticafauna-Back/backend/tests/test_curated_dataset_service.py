from app.db.database import get_connection
from app.services.curated_dataset_service import (
    get_curated_dataset_stats,
    list_curated_segments,
    read_manifest_segments,
)


def test_read_manifest_segments(sample_manifest_csv):
    rows = read_manifest_segments(sample_manifest_csv)

    assert len(rows) == 4
    assert rows[0]["label"] == "Boana_boans"
    assert rows[2]["group_type"] == "revisar"
    assert rows[3]["negative_for"] == "LEPFUS"


def test_import_curated_manifest_groups_and_dedupes(imported_curated_dataset, sample_curated_dataset):
    from app.services.curated_dataset_service import import_curated_manifest

    assert imported_curated_dataset["imported_count"] == 4
    assert imported_curated_dataset["skipped_duplicates"] == 0

    stats = get_curated_dataset_stats()
    assert stats["total_segments"] == 4
    assert stats["review_queue_count"] == 1

    positives = list_curated_segments({"group_type": "positivo"})
    assert positives["total"] == 1
    assert positives["items"][0]["label"] == "Boana_boans"

    negatives = list_curated_segments({"group_type": "negativo_objetivo", "negative_for": "LEPFUS"})
    assert negatives["total"] == 1
    assert negatives["items"][0]["label"] == "otros_ruidos"

    review_queue = list_curated_segments({"pending_real": True})
    assert review_queue["total"] == 1
    assert review_queue["items"][0]["label"] == "revisar_etiqueta"

    second_result = import_curated_manifest(sample_curated_dataset)
    assert second_result["imported_count"] == 0
    assert second_result["skipped_duplicates"] == 4

    conn = get_connection()
    try:
        labels = [
            row["label"]
            for row in conn.execute("SELECT label FROM label_taxonomy ORDER BY label").fetchall()
        ]
    finally:
        conn.close()

    assert "Boana_boans" in labels
    assert "LEPFUS" in labels
    assert "otros_ruidos" in labels
    assert "revisar_etiqueta" in labels
