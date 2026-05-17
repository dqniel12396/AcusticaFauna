from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "acusticafauna-General" / "acusticafauna-Back" / "backend"
FRONTEND_DIR = REPO_ROOT / "acusticafauna-General" / "acusticafauna-frontend"
ML_ROOT = REPO_ROOT / "acusticafauna-ML"


LOCAL_DIRS = [
    BACKEND_DIR / "storage" / "audio_lab" / "uploads",
    BACKEND_DIR / "storage" / "audio_lab" / "clips",
    BACKEND_DIR / "storage" / "audio_lab" / "processed",
    BACKEND_DIR / "storage" / "audio_lab" / "batch_jobs",
    BACKEND_DIR / "storage" / "audio_lab" / "quality_reports",
    BACKEND_DIR / "storage" / "audio_lab" / "logs",
    ML_ROOT / "models",
    ML_ROOT / "outputs",
    ML_ROOT / "ml_runs" / "jobs",
    ML_ROOT / "manifests" / "clean",
    REPO_ROOT / "data" / "dataset_curado",
    REPO_ROOT / "sample_data" / "audios",
    REPO_ROOT / "sample_data" / "manifests",
]
