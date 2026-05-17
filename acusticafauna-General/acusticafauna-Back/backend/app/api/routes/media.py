from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse


router = APIRouter(prefix="/media", tags=["media"])


@router.get("/file")
def serve_local_file(path: str = Query(..., description="Ruta absoluta del archivo")):
    file_path = Path(path)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")

    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="La ruta no corresponde a un archivo.")

    return FileResponse(file_path)