from pydantic import BaseModel


class ImportRequest(BaseModel):
    root_path: str
    session_name: str | None = None
    source_type: str | None = "carpeta_local"


class AdvancedImportRequest(BaseModel):
    mode: str = "automatico"
    root_path: str | None = None
    session_name: str | None = None
    source_type: str | None = "carpeta_local"
    selection_tables_path: str | None = None
    csv_summary_path: str | None = None
    segments_path: str | None = None
    spectrograms_path: str | None = None