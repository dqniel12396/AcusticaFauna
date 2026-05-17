import csv
import math
import struct
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


FIELDNAMES = [
    "segment_id",
    "source_path",
    "source_sha256",
    "output_path",
    "split",
    "label",
    "group_type",
    "negative_for",
    "source_filename",
    "start_seconds",
    "end_seconds",
    "duration_seconds",
    "rms_max_dbfs",
    "rms_mean_dbfs",
    "threshold_dbfs",
    "sample_rate",
    "channels",
    "status",
    "error",
]


def write_wav(path: Path, sample_rate: int = 8000, duration_seconds: float = 0.15) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    total_frames = int(sample_rate * duration_seconds)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for index in range(total_frames):
            value = int(12000 * math.sin(2 * math.pi * 440 * index / sample_rate))
            wav.writeframes(struct.pack("<h", value))
    return path


@pytest.fixture
def tmp_storage_root(tmp_path: Path) -> Path:
    return tmp_path / "storage"


@pytest.fixture
def tmp_db_path(tmp_storage_root: Path) -> Path:
    return tmp_storage_root / "db" / "acusticafauna_test.db"


@pytest.fixture
def test_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, tmp_storage_root: Path, tmp_db_path: Path):
    dataset_root = tmp_path / "dataset_curado"
    allowed_roots = [str(dataset_root), str(tmp_storage_root)]

    monkeypatch.setenv("ACUSTICAFAUNA_DB_PATH", str(tmp_db_path))
    monkeypatch.setenv("ACUSTICAFAUNA_STORAGE_ROOT", str(tmp_storage_root))
    monkeypatch.setenv("ACUSTICAFAUNA_CURATED_DATASET_ROOT", str(dataset_root))
    monkeypatch.setenv("ACUSTICAFAUNA_ALLOWED_MEDIA_ROOTS", ";".join(allowed_roots))

    from app.core.config import settings

    settings.reload_from_env()
    return settings


@pytest.fixture
def initialized_test_db(test_settings):
    from app.db.init_db import init_db
    from app.services.storage_service import ensure_storage_dirs

    ensure_storage_dirs()
    init_db()
    return test_settings.DB_PATH


@pytest.fixture
def sample_audio_file(tmp_path: Path) -> Path:
    return write_wav(tmp_path / "sample.wav")


@pytest.fixture
def sample_curated_dataset(test_settings) -> Path:
    dataset_root = test_settings.CURATED_DATASET_DIR
    positive = write_wav(
        dataset_root
        / "cleaned"
        / "positivos"
        / "Boana_boans"
        / "Boana_boans__sample__seg0001.wav"
    )
    noise = write_wav(
        dataset_root
        / "cleaned"
        / "otros_ruidos"
        / "otros_ruidos"
        / "otros_ruidos__sample__seg0001.wav"
    )
    review = write_wav(
        dataset_root
        / "cleaned"
        / "revisar_etiqueta"
        / "revisar_etiqueta"
        / "revisar_etiqueta__sample__seg0001.wav"
    )
    negative = write_wav(
        dataset_root
        / "cleaned"
        / "negativos_por_objetivo"
        / "LEPFUS"
        / "LEPFUS__no__seg0001.wav"
    )

    manifest_path = dataset_root / "manifests" / "manifest_segmentos.csv"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    rows = [
        {
            "segment_id": "Boana_boans__sample__seg0001",
            "source_path": str(dataset_root / "source_boana.wav"),
            "source_sha256": "sha-boana",
            "output_path": str(positive),
            "split": "train",
            "label": "Boana_boans",
            "group_type": "positivo",
            "negative_for": "",
            "source_filename": "source_boana.wav",
            "start_seconds": "0",
            "end_seconds": "0.15",
            "duration_seconds": "0.15",
            "rms_max_dbfs": "-20",
            "rms_mean_dbfs": "-30",
            "threshold_dbfs": "-40",
            "sample_rate": "8000",
            "channels": "1",
            "status": "ok",
            "error": "",
        },
        {
            "segment_id": "otros_ruidos__sample__seg0001",
            "source_path": str(dataset_root / "source_noise.wav"),
            "source_sha256": "sha-noise",
            "output_path": str(noise),
            "split": "train",
            "label": "otros_ruidos",
            "group_type": "otros_ruidos",
            "negative_for": "",
            "source_filename": "source_noise.wav",
            "start_seconds": "0",
            "end_seconds": "0.15",
            "duration_seconds": "0.15",
            "rms_max_dbfs": "-22",
            "rms_mean_dbfs": "-32",
            "threshold_dbfs": "-40",
            "sample_rate": "8000",
            "channels": "1",
            "status": "ok",
            "error": "",
        },
        {
            "segment_id": "revisar_etiqueta__sample__seg0001",
            "source_path": str(dataset_root / "source_review.wav"),
            "source_sha256": "sha-review",
            "output_path": str(review),
            "split": "sin_split",
            "label": "revisar_etiqueta",
            "group_type": "revisar",
            "negative_for": "",
            "source_filename": "source_review.wav",
            "start_seconds": "0",
            "end_seconds": "0.15",
            "duration_seconds": "0.15",
            "rms_max_dbfs": "-25",
            "rms_mean_dbfs": "-35",
            "threshold_dbfs": "-40",
            "sample_rate": "8000",
            "channels": "1",
            "status": "ok",
            "error": "",
        },
        {
            "segment_id": "LEPFUS__no__seg0001",
            "source_path": str(dataset_root / "source_lepfus_no.wav"),
            "source_sha256": "sha-lepfus-no",
            "output_path": str(negative),
            "split": "train",
            "label": "otros_ruidos",
            "group_type": "negativo_objetivo",
            "negative_for": "LEPFUS",
            "source_filename": "source_lepfus_no.wav",
            "start_seconds": "0",
            "end_seconds": "0.15",
            "duration_seconds": "0.15",
            "rms_max_dbfs": "-24",
            "rms_mean_dbfs": "-34",
            "threshold_dbfs": "-40",
            "sample_rate": "8000",
            "channels": "1",
            "status": "ok",
            "error": "",
        },
    ]
    with manifest_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    return dataset_root


@pytest.fixture
def sample_manifest_csv(sample_curated_dataset: Path) -> Path:
    return sample_curated_dataset / "manifests" / "manifest_segmentos.csv"


@pytest.fixture
def imported_curated_dataset(initialized_test_db, sample_curated_dataset: Path):
    from app.services.curated_dataset_service import import_curated_manifest

    return import_curated_manifest(sample_curated_dataset)


@pytest.fixture
def client(initialized_test_db):
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
