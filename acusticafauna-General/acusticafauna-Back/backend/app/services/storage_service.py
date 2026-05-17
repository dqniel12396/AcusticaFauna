from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

from app.core.config import settings


def ensure_storage_dirs() -> None:
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    settings.DB_DIR.mkdir(parents=True, exist_ok=True)
    settings.AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    settings.SPECTROGRAM_DIR.mkdir(parents=True, exist_ok=True)
    settings.SPECTROGRAM_TMP_DIR.mkdir(parents=True, exist_ok=True)
    settings.SPECTROGRAM_CURATED_CONFIRMED_DIR.mkdir(parents=True, exist_ok=True)
    settings.ORIGINALS_DIR.mkdir(parents=True, exist_ok=True)
    settings.IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    settings.LOGS_DIR.mkdir(parents=True, exist_ok=True)
    for relative in [
        "audio_lab/uploads",
        "audio_lab/clips",
        "audio_lab/processed",
        "audio_lab/batch_jobs",
        "audio_lab/quality_reports",
        "audio_lab/logs",
        "audio_lab_manifests",
    ]:
        (settings.STORAGE_DIR / relative).mkdir(parents=True, exist_ok=True)


def compute_file_hash(file_path: Path, chunk_size: int = 1024 * 1024) -> str:
    hasher = hashlib.sha256()

    with file_path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)

    return hasher.hexdigest()


def build_stored_filename(
    source_path: Path,
    content_hash: str,
    suffix_override: str | None = None,
) -> str:
    ext = suffix_override or source_path.suffix.lower()
    stem = source_path.stem

    safe_stem = "".join(
        ch if ch.isalnum() or ch in ("-", "_") else "_"
        for ch in stem
    )
    safe_stem = safe_stem[:80] if safe_stem else "file"

    return f"{safe_stem}__{content_hash[:16]}{ext}"


def copy_if_needed(source_file: str | None, target_root: Path) -> tuple[str | None, bool, str | None]:
    """
    Retorna:
    - ruta final interna
    - si se copió en esta ejecución
    - hash del archivo
    """
    if not source_file:
        return None, False, None

    src = Path(source_file)

    if not src.exists() or not src.is_file():
        return None, False, None

    file_hash = compute_file_hash(src)
    final_name = build_stored_filename(src, file_hash)

    target_root.mkdir(parents=True, exist_ok=True)
    dest = target_root / final_name

    if dest.exists():
        return str(dest), False, file_hash

    shutil.copy2(src, dest)
    return str(dest), True, file_hash
