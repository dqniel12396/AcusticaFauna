from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.services.audio_path_service import media_type_for_path, resolve_allowed_audio_path


router = APIRouter(prefix="/media", tags=["media"])


@router.get("/file")
def serve_local_file(path: str = Query(..., description="Ruta absoluta del archivo")):
    file_path = resolve_allowed_audio_path(path)
    if not file_path.is_file():
        raise HTTPException(
            status_code=400,
            detail={
                "error": "audio_not_file",
                "message": "La ruta no corresponde a un archivo.",
                "audio_path": path,
            },
        )
    return FileResponse(str(file_path), media_type=media_type_for_path(file_path), filename=file_path.name)
