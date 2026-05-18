from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote

from fastapi import HTTPException

from app.core.config import settings


AUDIO_MEDIA_TYPES = {
    ".wav": "audio/wav",
    ".wave": "audio/wav",
    ".flac": "audio/flac",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
}

PATH_MARKERS = {
    "dataset_curado",
    "dataset_ranas",
    "storage",
    "audio_lab",
    "clips",
    "uploads",
    "processed",
    "folder_batch_jobs",
    "batch_jobs",
    "sample_data",
}


def path_to_dict(path: Path) -> dict[str, Any]:
    return {"path": str(path), "exists": path.exists()}


def get_uploads_dir() -> Path:
    return settings.STORAGE_DIR / "audio_lab" / "uploads"


def get_clips_dir() -> Path:
    return settings.STORAGE_DIR / "audio_lab" / "clips"


def get_processed_dir() -> Path:
    return settings.STORAGE_DIR / "audio_lab" / "batch_jobs"


def get_audio_proxy_dir() -> Path:
    return settings.STORAGE_DIR / "audio_lab" / "audio_proxy"


def get_sample_data_dir() -> Path:
    return settings.WORKSPACE_DIR / "sample_data"


def get_ml_root() -> Path:
    return settings.WORKSPACE_DIR / "acusticafauna-ML"


def get_models_dir() -> Path:
    return get_ml_root() / "models"


def get_manifests_dir() -> Path:
    return get_ml_root() / "manifests"


def unique_paths(paths: Iterable[Path]) -> list[Path]:
    seen: set[str] = set()
    unique: list[Path] = []
    for path in paths:
        key = os.path.normcase(str(path.expanduser().resolve(strict=False)))
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def allowed_audio_roots() -> list[Path]:
    return unique_paths(
        [
            *settings.MEDIA_ALLOWED_ROOTS,
            get_uploads_dir(),
            get_clips_dir(),
            get_processed_dir(),
            get_audio_proxy_dir(),
            get_sample_data_dir(),
        ]
    )


def resolve_no_strict(path: Path) -> Path:
    return path.expanduser().resolve(strict=False)


def is_path_inside(path: Path, root: Path) -> bool:
    try:
        resolve_no_strict(path).relative_to(resolve_no_strict(root))
        return True
    except ValueError:
        return False


def media_type_for_path(path: Path) -> str:
    return AUDIO_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")


def playable_url_for_path(path: str | Path) -> str:
    return f"/api/media/file?path={quote(str(path), safe='')}"


def audio_http_error(status_code: int, error: str, message: str, audio_path: str, **extra: Any) -> HTTPException:
    detail = {
        "error": error,
        "message": message,
        "audio_path": audio_path,
        **extra,
    }
    return HTTPException(status_code=status_code, detail=detail)


def suggested_env_line_for_path(path: Path) -> str:
    resolved = resolve_no_strict(path)
    lower_parts = [part.lower() for part in resolved.parts]
    if "dataset_curado" in lower_parts:
        index = lower_parts.index("dataset_curado")
        dataset_root = Path(*resolved.parts[: index + 1])
        return f"ACUSTICAFAUNA_DATASET_DIR={dataset_root}"
    dataset_ranas_part = next((part for part in resolved.parts if part.lower().startswith("dataset_ranas")), None)
    if dataset_ranas_part:
        index = lower_parts.index(dataset_ranas_part.lower())
        dataset_root = Path(*resolved.parts[: index + 1])
        return f"ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS={dataset_root}"
    parent = resolved.parent if resolved.suffix else resolved
    return f"ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS={parent}"


def normalized_input_path(input_path: str | Path) -> Path:
    raw = str(input_path or "").strip().strip('"').strip("'")
    if not raw:
        raise audio_http_error(400, "audio_path_empty", "Debes enviar una ruta de audio.", "")
    return Path(raw.replace("\\", os.sep))


def candidate_relative_parts(path: Path) -> list[Path]:
    parts = list(path.parts)
    candidates: list[Path] = []
    for index, part in enumerate(parts):
        if part.lower() in PATH_MARKERS and index + 1 < len(parts):
            candidates.append(Path(*parts[index + 1 :]))
            candidates.append(Path(*parts[index:]))
    if path.name:
        candidates.append(Path(path.name))
    return candidates


def find_audio_by_name_or_relative_path(
    audio_name: str | Path,
    dataset_dir: Path | None = None,
    storage_dir: Path | None = None,
    max_scan: int = 3,
) -> Path | None:
    requested = normalized_input_path(audio_name)
    roots = unique_paths([dataset_dir or settings.CURATED_DATASET_DIR, storage_dir or settings.STORAGE_DIR, get_sample_data_dir()])
    relative_candidates = candidate_relative_parts(requested)

    for root in roots:
        for relative in relative_candidates:
            candidate = resolve_no_strict(root / relative)
            if candidate.exists() and candidate.is_file():
                return candidate

    if not requested.name:
        return None

    matches: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        try:
            for candidate in root.rglob(requested.name):
                if candidate.is_file():
                    matches.append(resolve_no_strict(candidate))
                    if len(matches) >= max_scan:
                        return matches[0]
        except OSError:
            continue
    return matches[0] if matches else None


def resolve_allowed_audio_path(
    input_path: str | Path,
    allowed_roots: Iterable[Path] | None = None,
    allow_runtime_relocation: bool = True,
) -> Path:
    requested = normalized_input_path(input_path)
    roots = unique_paths(list(allowed_roots or allowed_audio_roots()))
    roots_payload = [str(resolve_no_strict(root)) for root in roots]

    candidate = resolve_no_strict(requested if requested.is_absolute() else settings.WORKSPACE_DIR / requested)
    exists = candidate.exists() and candidate.is_file()
    allowed = any(is_path_inside(candidate, root) for root in roots)

    if exists and allowed:
        return candidate

    relocated = find_audio_by_name_or_relative_path(requested, settings.CURATED_DATASET_DIR, settings.STORAGE_DIR) if allow_runtime_relocation else None
    if relocated is not None and any(is_path_inside(relocated, root) for root in roots):
        return relocated

    if exists and not allowed:
        raise audio_http_error(
            403,
            "audio_path_not_allowed",
            "El audio existe pero esta fuera de las carpetas permitidas.",
            str(requested),
            normalized_path=str(candidate),
            allowed_roots=roots_payload,
            suggested_env_line=suggested_env_line_for_path(candidate),
        )

    if not requested.is_absolute():
        for root in roots:
            relative_candidate = resolve_no_strict(root / requested)
            if relative_candidate.exists() and relative_candidate.is_file():
                return relative_candidate

    if relocated is not None:
        if any(is_path_inside(relocated, root) for root in roots):
            return relocated
        raise audio_http_error(
            403,
            "audio_path_not_allowed",
            "El audio fue encontrado por nombre, pero esta fuera de las carpetas permitidas.",
            str(requested),
            normalized_path=str(relocated),
            allowed_roots=roots_payload,
            suggested_env_line=suggested_env_line_for_path(relocated),
        )

    traversal_target = resolve_no_strict(settings.WORKSPACE_DIR / requested)
    if ".." in requested.parts and not any(is_path_inside(traversal_target, root) for root in roots):
        raise audio_http_error(
            403,
            "audio_path_not_allowed",
            "La ruta intenta salir de las carpetas permitidas.",
            str(requested),
            normalized_path=str(traversal_target),
            allowed_roots=roots_payload,
        )

    raise audio_http_error(
        404,
        "audio_not_found",
        "No se encontro el archivo de audio.",
        str(requested),
        normalized_path=str(candidate),
        allowed_roots=roots_payload,
    )


def debug_resolve_audio_path(input_path: str | Path) -> dict[str, Any]:
    requested = normalized_input_path(input_path)
    roots = allowed_audio_roots()
    roots_payload = [str(resolve_no_strict(root)) for root in roots]
    candidate = resolve_no_strict(requested if requested.is_absolute() else settings.WORKSPACE_DIR / requested)
    relocated: Path | None = None
    reason = "ok"
    suggested_env_line = None

    try:
        resolved = resolve_allowed_audio_path(requested, roots)
        allowed = True
        exists = True
        matched_root = next((str(resolve_no_strict(root)) for root in roots if is_path_inside(resolved, root)), None)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        allowed = False
        exists = candidate.exists() and candidate.is_file()
        matched_root = None
        reason = detail.get("error") or detail.get("message") or "unknown_error"
        suggested_env_line = detail.get("suggested_env_line")
        resolved = candidate
        if reason == "audio_not_found":
            relocated = find_audio_by_name_or_relative_path(requested, settings.CURATED_DATASET_DIR, settings.STORAGE_DIR)
            if relocated is not None:
                exists = True
                allowed = any(is_path_inside(relocated, root) for root in roots)
                matched_root = next((str(resolve_no_strict(root)) for root in roots if is_path_inside(relocated, root)), None)
                resolved = relocated
                reason = "runtime_relocation_match" if allowed else "relocated_not_allowed"
                suggested_env_line = None if allowed else suggested_env_line_for_path(relocated)

    playable_url = playable_url_for_path(resolved) if exists and allowed else None
    return {
        "input_path": str(requested),
        "normalized_path": str(resolved),
        "exists": exists,
        "allowed": allowed,
        "matched_root": matched_root,
        "reason": reason,
        "playable_url": playable_url,
        "media_type": media_type_for_path(resolved) if exists else None,
        "allowed_roots": roots_payload,
        "suggested_env_line": suggested_env_line,
    }
