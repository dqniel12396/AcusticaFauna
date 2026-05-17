from __future__ import annotations

import shutil
import socket
import subprocess
import sys
from pathlib import Path

from hardware_profile import detect_hardware_profile
from paths import BACKEND_DIR, FRONTEND_DIR, LOCAL_DIRS, ML_ROOT, REPO_ROOT


def status(label: str, ok: bool, detail: str = "") -> None:
    prefix = "OK" if ok else "WARNING"
    print(f"{prefix}: {label}{' - ' + detail if detail else ''}")


def command_version(command: str, args: list[str]) -> str | None:
    executable = shutil.which(command)
    if not executable:
        return None
    try:
        result = subprocess.run([executable, *args], capture_output=True, text=True, timeout=10)
        return (result.stdout or result.stderr).strip().splitlines()[0]
    except Exception as exc:
        return f"detectado, pero no se pudo ejecutar: {exc}"


def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def main() -> int:
    print("AcusticaFauna - diagnostico local")
    status("Python", True, sys.version.split()[0])
    status("Node", shutil.which("node") is not None, command_version("node", ["--version"]) or "no encontrado")
    status("npm", shutil.which("npm") is not None, command_version("npm", ["--version"]) or "no encontrado")
    status("Backend dir", BACKEND_DIR.exists(), str(BACKEND_DIR))
    status("Frontend dir", FRONTEND_DIR.exists(), str(FRONTEND_DIR))
    status("ML root", ML_ROOT.exists(), str(ML_ROOT))
    status(".env", (REPO_ROOT / ".env").exists(), "usa .env.example si falta")
    for path in LOCAL_DIRS:
        status(f"carpeta {path.relative_to(REPO_ROOT)}", path.exists(), str(path))
    for port in (8000, 8010, 5173):
        status(f"puerto {port}", not port_open(port), "libre" if not port_open(port) else "en uso")

    models_dir = ML_ROOT / "models"
    model_dirs = [p for p in models_dir.iterdir() if p.is_dir()] if models_dir.exists() else []
    status("modelos descargados", bool(model_dirs), f"{len(model_dirs)} carpeta(s)")
    print("Perfil hardware:", detect_hardware_profile())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
