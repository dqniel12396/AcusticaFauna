from __future__ import annotations

import os
import re
from pathlib import Path

from paths import REPO_ROOT


IGNORE_PARTS = {
    ".git",
    "AcusticaFauna-GitHub",
    "node_modules",
    ".venv",
    ".venv-backend",
    ".venv-ml",
    "venv",
    "env",
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
    "tools",
}
AUDIO_EXTS = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
MODEL_EXTS = {".model", ".pt", ".pth", ".ckpt", ".onnx", ".pkl"}
FORBIDDEN_EXTS = {".pdf"}
FORBIDDEN_PATHS = {
    Path("Codigos para arrancaar las cosas.txt"),
    Path("package-lock.json"),
    Path("tools"),
    Path("acusticafauna-ML") / "=",
    Path("acusticafauna-General") / "acusticafauna-frontend" / "26.1.1",
    Path("acusticafauna-ML") / "manifests" / "clean",
}
ABSOLUTE_PATTERNS = [
    re.compile(r"[A-Z]:\\"),
    re.compile(r"/f/PROYECTO", re.IGNORECASE),
    re.compile(r"PROYECTO de cosa", re.IGNORECASE),
    re.compile(r"C:\\Users", re.IGNORECASE),
]


def is_relative_to(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents


def relative_path(path: Path) -> Path:
    try:
        return path.relative_to(REPO_ROOT)
    except ValueError:
        return path


def is_forbidden(path: Path) -> bool:
    relative = relative_path(path)
    return any(is_relative_to(relative, forbidden) for forbidden in FORBIDDEN_PATHS)


def should_skip(path: Path) -> bool:
    relative = relative_path(path)
    if is_forbidden(path):
        return True
    return any(
        part in IGNORE_PARTS
        or part.startswith(".venv")
        or part.startswith("wetransfer_")
        or part.startswith("dataset_ranas-")
        or part.startswith("segmentos entrenamiento-")
        for part in relative.parts
    )


def emit(level: str, message: str) -> None:
    print(f"{level}: {message}")


def scan() -> int:
    errors = 0
    warnings = 0
    for forbidden in sorted(FORBIDDEN_PATHS, key=str):
        forbidden_path = REPO_ROOT / forbidden
        if forbidden_path.exists():
            emit("ERROR", f"archivo/carpeta fuera del release limpio: {forbidden}")
            errors += 1
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
        if path.suffix.lower() in FORBIDDEN_EXTS:
            emit("ERROR", f"archivo no apto para GitHub limpio: {relative}")
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
