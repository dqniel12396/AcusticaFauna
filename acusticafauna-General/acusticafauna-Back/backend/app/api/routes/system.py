from fastapi import APIRouter

from app.core.config import settings
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
