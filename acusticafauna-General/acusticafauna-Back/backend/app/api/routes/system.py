from fastapi import APIRouter

from app.core.config import settings
from app.services.audio_path_service import (
    allowed_audio_roots,
    get_clips_dir,
    get_manifests_dir,
    get_ml_root,
    get_models_dir,
    get_processed_dir,
    get_sample_data_dir,
    get_uploads_dir,
    path_to_dict,
)
from app.services.hardware_profile import recommended_profile


router = APIRouter(prefix="/system", tags=["system"])


@router.get("/hardware-profile")
def hardware_profile():
    profile = recommended_profile()
    return {
        **profile,
        "paths": {
            "backend_dir": str(settings.BASE_DIR),
            "storage_dir": str(settings.STORAGE_DIR),
            "dataset_dir": str(settings.CURATED_DATASET_DIR),
            "ml_api_url": settings.ML_API_BASE_URL,
        },
    }


@router.get("/paths")
def system_paths():
    dataset_dir = settings.CURATED_DATASET_DIR
    dataset_health = {
        "path": str(dataset_dir),
        "exists": dataset_dir.exists(),
        "has_cleaned_dir": (dataset_dir / "cleaned").exists(),
        "has_cleaned_positivos": (dataset_dir / "cleaned" / "positivos").exists(),
        "has_manifest": any((dataset_dir / "manifests").glob("*.csv")) if (dataset_dir / "manifests").exists() else False,
        "audio_examples_found": False,
        "warnings": [],
    }
    if dataset_dir.exists():
        try:
            dataset_health["audio_examples_found"] = next(dataset_dir.rglob("*.wav"), None) is not None or next(dataset_dir.rglob("*.flac"), None) is not None
        except OSError:
            dataset_health["warnings"].append("No fue posible escanear ejemplos de audio en dataset_dir.")
    if dataset_dir.exists() and not dataset_health["has_cleaned_positivos"] and not dataset_health["has_manifest"]:
        dataset_health["warnings"].append(
            "dataset_dir existe, pero no parece ser dataset_curado: falta cleaned/positivos o manifests/*.csv."
        )

    paths = {
        "project_root": settings.WORKSPACE_DIR,
        "backend_dir": settings.BASE_DIR,
        "dataset_dir": settings.CURATED_DATASET_DIR,
        "storage_dir": settings.STORAGE_DIR,
        "uploads_dir": get_uploads_dir(),
        "clips_dir": get_clips_dir(),
        "processed_dir": get_processed_dir(),
        "sample_data_dir": get_sample_data_dir(),
        "ml_root": get_ml_root(),
        "models_dir": get_models_dir(),
        "manifests_dir": get_manifests_dir(),
    }
    return {
        **{key: path_to_dict(value) for key, value in paths.items()},
        "dataset_dir_health": dataset_health,
        "allowed_audio_roots": [path_to_dict(path) for path in allowed_audio_roots()],
    }
