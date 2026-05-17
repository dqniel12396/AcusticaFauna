from __future__ import annotations

import os


def detect_hardware_profile() -> dict:
    cpu_count = os.cpu_count() or 1
    ram_gb = None
    try:
        import psutil  # type: ignore

        ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
    except Exception:
        pass

    cuda = {"available": False, "name": None}
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            cuda = {"available": True, "name": torch.cuda.get_device_name(0)}
    except Exception:
        pass

    configured = os.getenv("ACUSTICAFAUNA_RESOURCE_PROFILE", "auto").lower()
    if configured in {"eco", "balanceado", "rendimiento"}:
        profile = configured
    elif cpu_count <= 4 or (ram_gb is not None and ram_gb < 8):
        profile = "eco"
    else:
        profile = "balanceado"

    if profile == "eco":
        threads = max(1, cpu_count // 2)
        workers = 1
        device = "cpu"
    elif profile == "rendimiento":
        threads = max(1, cpu_count)
        workers = max(1, cpu_count - 1)
        device = "cuda" if cuda["available"] else "cpu"
    else:
        threads = max(1, cpu_count - 1)
        workers = max(1, min(4, cpu_count - 1))
        device = "cuda" if cuda["available"] else "cpu"

    return {
        "profile": profile,
        "cpu_count": cpu_count,
        "ram_gb": ram_gb,
        "cuda": cuda,
        "max_cpu_threads": threads,
        "max_workers": workers,
        "device": device,
    }


def main() -> None:
    profile = detect_hardware_profile()
    for key, value in profile.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
