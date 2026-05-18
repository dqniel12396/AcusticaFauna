from __future__ import annotations

import platform
import shutil
import socket
import subprocess
import sys
from pathlib import Path

from hardware_profile import detect_hardware_profile
from paths import BACKEND_DIR, FRONTEND_DIR, LOCAL_DIRS, ML_ROOT, REPO_ROOT


BACKEND_VENV = BACKEND_DIR / ".venv-backend"
ML_VENV = ML_ROOT / ".venv-ml"
RECOMMENDED_PATHS = "C:\\AcusticaFauna o F:\\AcusticaFauna"
PYTHON311_URL = "https://www.python.org/downloads/windows/"


def status(level: str, label: str, detail: str = "") -> None:
    print(f"{level}: {label}{' - ' + detail if detail else ''}")


def ok(label: str, detail: str = "") -> None:
    status("OK", label, detail)


def warning(label: str, detail: str = "") -> None:
    status("WARNING", label, detail)


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


def is_windows() -> bool:
    return platform.system().lower() == "windows"


def venv_python_candidates(venv_dir: Path) -> list[Path]:
    if is_windows():
        return [venv_dir / "Scripts" / "python.exe"]
    return [venv_dir / "bin" / "python"]


def venv_pip_candidates(venv_dir: Path) -> list[Path]:
    if is_windows():
        return [venv_dir / "Scripts" / "pip.exe"]
    return [venv_dir / "bin" / "pip"]


def executable_exists(candidates: list[Path]) -> bool:
    return any(path.exists() for path in candidates)


def check_venv(label: str, venv_dir: Path) -> None:
    if not venv_dir.exists():
        warning(f"venv {label}", f"no existe: {venv_dir}")
        return
    if not executable_exists(venv_python_candidates(venv_dir)):
        warning(f"venv {label}", f"incompleto: falta Python en {venv_dir}")
        return
    if not executable_exists(venv_pip_candidates(venv_dir)):
        warning(f"venv {label}", f"incompleto: falta pip en {venv_dir}")
        return
    ok(f"venv {label}", str(venv_dir))


def model_items(models_dir: Path) -> list[Path]:
    if not models_dir.exists():
        return []
    ignored = {".gitkeep", "README.md"}
    return [path for path in models_dir.iterdir() if path.name not in ignored]


def check_path() -> None:
    root = str(REPO_ROOT)
    ok("ruta actual", root)
    if "onedrive" in root.lower():
        warning("OneDrive detectado", f"para ML usa una ruta corta como {RECOMMENDED_PATHS}")
    if len(root) > 80:
        warning("ruta larga", f"{len(root)} caracteres; recomendado: {RECOMMENDED_PATHS}")


def check_python() -> None:
    version = sys.version_info
    ok("Python", sys.version.split()[0])
    if version >= (3, 13):
        warning(
            "Python 3.13 detectado. Para AcusticaFauna ML se recomienda Python 3.11.x.",
            PYTHON311_URL,
        )


def main() -> int:
    print("AcusticaFauna - diagnostico local")
    if is_windows():
        print("Windows: Python recomendado 3.11.x")
        print("Verificar con: py -3.11 --version")
        print(f"Descarga: {PYTHON311_URL}")
        print(r"Comandos recomendados: py -3.11 scripts\doctor_install.py")
        print(r"Comandos recomendados: .\scripts\setup_windows.ps1")
        if shutil.which("git") is None:
            print("WARNING: Git no encontrado - puedes descargar el ZIP desde GitHub y descomprimirlo en C:\\AcusticaFauna")
    check_path()
    check_python()

    node_version = command_version("node", ["--version"])
    npm_version = command_version("npm.cmd" if is_windows() else "npm", ["--version"])
    ok("Node", node_version) if node_version else warning("Node", "no encontrado")
    ok("npm.cmd" if is_windows() else "npm", npm_version) if npm_version else warning("npm.cmd" if is_windows() else "npm", "no encontrado")

    ok("Backend dir", str(BACKEND_DIR)) if BACKEND_DIR.exists() else warning("Backend dir", str(BACKEND_DIR))
    ok("Frontend dir", str(FRONTEND_DIR)) if FRONTEND_DIR.exists() else warning("Frontend dir", str(FRONTEND_DIR))
    ok("ML root", str(ML_ROOT)) if ML_ROOT.exists() else warning("ML root", str(ML_ROOT))

    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        ok(".env", str(env_path))
    else:
        warning(".env", "falta; copia .env.example a .env")

    check_venv("Backend", BACKEND_VENV)
    check_venv("ML", ML_VENV)

    for path in LOCAL_DIRS:
        label = f"carpeta {path.relative_to(REPO_ROOT)}"
        ok(label, str(path)) if path.exists() else warning(label, "falta; ejecuta python scripts/create_local_dirs.py")

    for port in (8000, 8010, 5173):
        in_use = port_open(port)
        ok(f"puerto {port}", "libre") if not in_use else warning(f"puerto {port}", "en uso")

    models_dir = ML_ROOT / "models"
    models = model_items(models_dir)
    if models:
        ok("modelos descargados", f"{len(models)} item(s) en {models_dir}")
    else:
        warning("modelos descargados", f"faltan modelos en {models_dir}; ejecuta python scripts/download_models.py --list")

    print("Perfil hardware:", detect_hardware_profile())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
