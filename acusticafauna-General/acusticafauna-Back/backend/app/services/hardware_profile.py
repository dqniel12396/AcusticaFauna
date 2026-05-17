from __future__ import annotations

import os
from typing import Any


def _ram_gb() -> float | None:
    try:
        import psutil  # type: ignore
    except Exception:
        return None
    try:
        return round(psutil.virtual_memory().total / (1024**3), 1)
    except Exception:
        return None


def _cuda_info() -> dict[str, Any]:
    try:
        import torch  # type: ignore
    except Exception as exc:
        return {"available": False, "name": None, "reason": f"torch no disponible: {exc}"}
    try:
        if not torch.cuda.is_available():
            return {"available": False, "name": None, "reason": "cuda no disponible"}
        return {"available": True, "name": torch.cuda.get_device_name(0), "reason": None}
    except Exception as exc:
        return {"available": False, "name": None, "reason": str(exc)}


def recommended_profile() -> dict[str, Any]:
    cpu_count = os.cpu_count() or 1
    ram_gb = _ram_gb()
    cuda = _cuda_info()
    configured = os.getenv("ACUSTICAFAUNA_RESOURCE_PROFILE", "auto").lower()
    if configured in {"eco", "balanceado", "rendimiento"}:
        profile = configured
    elif cuda["available"] and (ram_gb is None or ram_gb >= 16) and cpu_count >= 8:
        profile = "balanceado"
    elif cpu_count <= 4 or (ram_gb is not None and ram_gb < 8):
        profile = "eco"
    else:
        profile = "balanceado"

    if profile == "eco":
        max_threads = max(1, cpu_count // 2)
        max_workers = 1
        device = "cpu"
    elif profile == "rendimiento":
        max_threads = max(1, cpu_count)
        max_workers = max(1, cpu_count - 1)
        device = "cuda" if cuda["available"] else "cpu"
    else:
        max_threads = max(1, cpu_count - 1)
        max_workers = max(1, min(4, cpu_count - 1))
        device = "cuda" if cuda["available"] else "cpu"

    env_threads = os.getenv("ACUSTICAFAUNA_MAX_CPU_THREADS", "auto")
    env_workers = os.getenv("ACUSTICAFAUNA_MAX_WORKERS", "auto")
    env_device = os.getenv("ACUSTICAFAUNA_DEVICE", "auto")
    return {
        "configured_profile": configured,
        "recommended_profile": profile,
        "cpu_count": cpu_count,
        "ram_gb": ram_gb,
        "cuda": cuda,
        "max_cpu_threads": max_threads if env_threads == "auto" else env_threads,
        "max_workers": max_workers if env_workers == "auto" else env_workers,
        "device": device if env_device == "auto" else env_device,
        "notes": [
            "eco reduce threads/workers y prefiere CPU.",
            "balanceado deja un core libre y usa CUDA si esta disponible.",
            "rendimiento puede consumir muchos recursos; usar con cuidado.",
        ],
    }


def apply_thread_limits(profile: dict[str, Any] | None = None) -> dict[str, Any]:
    profile = profile or recommended_profile()
    threads = str(profile.get("max_cpu_threads") or 1)
    for key in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ.setdefault(key, threads)
    try:
        import torch  # type: ignore

        torch.set_num_threads(int(float(threads)))
    except Exception:
        pass
    return profile
