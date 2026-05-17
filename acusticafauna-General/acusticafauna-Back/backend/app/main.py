from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.init_db import init_db
from app.services.storage_service import ensure_storage_dirs
from app.api.routes.health import router as health_router
from app.api.routes.imports import router as imports_router
from app.api.routes.sessions import router as sessions_router
from app.api.routes.events import router as events_router
from app.api.routes.media import router as media_router
from app.api.routes.curated_dataset import router as curated_dataset_router
from app.api.routes.taxonomy import router as taxonomy_router
from app.api.routes.training_datasets import router as training_datasets_router
from app.api.routes.ml import router as ml_router
from app.api.routes.audio_lab import router as audio_lab_router
from app.api.routes.system import router as system_router


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    ensure_storage_dirs()
    init_db()


app.include_router(health_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(events_router, prefix="/api")
app.include_router(media_router, prefix="/api")
app.include_router(curated_dataset_router, prefix="/api")
app.include_router(taxonomy_router, prefix="/api")
app.include_router(training_datasets_router, prefix="/api")
app.include_router(ml_router, prefix="/api")
app.include_router(audio_lab_router, prefix="/api")
app.include_router(system_router, prefix="/api")
