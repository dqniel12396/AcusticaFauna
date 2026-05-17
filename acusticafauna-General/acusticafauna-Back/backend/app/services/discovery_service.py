from pathlib import Path
from fastapi import HTTPException


def find_first_csv(root_path: Path) -> Path | None:
    for path in root_path.rglob("resumen_espectrogramas.csv"):
        return path
    return None


def discover_selection_tables(base_path: Path | None, manual_path: str | None) -> list[Path]:
    if manual_path:
        p = Path(manual_path)
        if not p.exists():
            raise HTTPException(status_code=400, detail="La ruta manual de selection tables no existe.")

        if p.is_file() and p.name.endswith(".BirdNET.selection.table.txt"):
            return [p]

        if p.is_dir():
            return sorted(p.rglob("*.BirdNET.selection.table.txt"))

    if base_path and base_path.exists():
        return sorted(base_path.rglob("*.BirdNET.selection.table.txt"))

    return []


def discover_csv_summary(base_path: Path | None, manual_path: str | None) -> Path | None:
    if manual_path:
        p = Path(manual_path)
        if not p.exists():
            raise HTTPException(status_code=400, detail="La ruta manual del CSV no existe.")
        if not p.is_file():
            raise HTTPException(status_code=400, detail="La ruta manual del CSV debe apuntar a un archivo.")
        return p

    if base_path and base_path.exists():
        for p in base_path.rglob("resumen_espectrogramas.csv"):
            return p

    return None


def discover_named_folder(
    base_path: Path | None,
    manual_path: str | None,
    folder_hints: list[str],
) -> Path | None:
    if manual_path:
        p = Path(manual_path)
        if not p.exists():
            raise HTTPException(status_code=400, detail=f"La ruta manual '{manual_path}' no existe.")
        if not p.is_dir():
            raise HTTPException(status_code=400, detail=f"La ruta manual '{manual_path}' debe ser una carpeta.")
        return p

    if not base_path or not base_path.exists():
        return None

    normalized_hints = {hint.lower() for hint in folder_hints}

    for p in base_path.rglob("*"):
        if p.is_dir() and p.name.lower() in normalized_hints:
            return p

    return None