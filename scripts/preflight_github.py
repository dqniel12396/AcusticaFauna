from __future__ import annotations

import os
import re
from pathlib import Path

from paths import REPO_ROOT


IGNORE_PARTS = {
    ".git",
    "node_modules",
    ".venv",
    ".venv-ml",
    "__pycache__",
    "dist",
    ".pytest_cache",
    "data",
    "dataset_curado",
    "models",
    "storage",
    "outputs",
    "ml_runs",
    "tmp",
    "Birdnet",
    "Articulos",
    "ESC-50-master",
    "PROYECTOGIT",
    "pruebas de audio",
    "videos",
}
AUDIO_EXTS = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
MODEL_EXTS = {".model", ".pt", ".pth", ".ckpt", ".onnx", ".pkl"}
ABSOLUTE_PATTERNS = [
    re.compile(r"[A-Z]:\\"),
    re.compile(r"/f/PROYECTO", re.IGNORECASE),
    re.compile(r"PROYECTO de cosa", re.IGNORECASE),
    re.compile(r"C:\\Users", re.IGNORECASE),
]


def should_skip(path: Path) -> bool:
    return any(part in IGNORE_PARTS or part.startswith("wetransfer_") or part.startswith("dataset_ranas-") or part.startswith("segmentos entrenamiento-") for part in path.parts)


def emit(level: str, message: str) -> None:
    print(f"{level}: {message}")


def scan() -> int:
    errors = 0
    warnings = 0
    for path in REPO_ROOT.rglob("*"):
        if should_skip(path):
            continue
        if path.is_dir():
            continue
        relative = path.relative_to(REPO_ROOT)
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size > 50 * 1024 * 1024:
            emit("ERROR", f"archivo >50MB: {relative}")
            errors += 1
        if path.suffix.lower() in AUDIO_EXTS:
            emit("ERROR", f"audio dentro del repo: {relative}")
            errors += 1
        if path.suffix.lower() in MODEL_EXTS:
            emit("ERROR", f"modelo/binario dentro del repo normal: {relative}")
            errors += 1
        if path.name == ".env":
            emit("ERROR", f".env real detectado: {relative}")
            errors += 1
        if relative == Path("scripts/preflight_github.py"):
            continue
        if size < 2 * 1024 * 1024 and path.suffix.lower() in {".py", ".js", ".jsx", ".md", ".txt", ".csv", ".json", ".yml", ".yaml", ".ps1", ".sh"}:
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if any(pattern.search(text) for pattern in ABSOLUTE_PATTERNS):
                emit("WARNING", f"posible ruta absoluta en {relative}")
                warnings += 1
    if errors:
        emit("ERROR", f"preflight fallo con {errors} error(es) y {warnings} warning(s)")
        return 1
    emit("OK", f"preflight sin errores criticos ({warnings} warning(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(scan())
