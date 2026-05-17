from fastapi import APIRouter
from app.schemas.import_job import ImportRequest, AdvancedImportRequest
from app.services.import_service import run_advanced_import

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/local")
def import_local(payload: ImportRequest):
    advanced_payload = AdvancedImportRequest(
        mode="automatico",
        root_path=payload.root_path,
        session_name=payload.session_name,
        source_type=payload.source_type,
    )
    return run_advanced_import(advanced_payload)


@router.post("/local-advanced")
def import_local_advanced(payload: AdvancedImportRequest):
    return run_advanced_import(payload)