from __future__ import annotations

import platform
import shutil
import socket
import subprocess
import sys
from pathlib import Path

from paths import BACKEND_DIR, FRONTEND_DIR, LOCAL_DIRS, ML_ROOT, REPO_ROOT


BACKEND_VENV = BACKEND_DIR / ".venv-backend"
ML_VENV = ML_ROOT / ".venv-ml"
RECOMMENDED_PATHS = "C:\\AcusticaFauna o F:\\AcusticaFauna"
LONG_PATHS_COMMAND = (
    'New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" '
    '-Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force'
)


class Reporter:
    def __init__(self) -> None:
        self.errors = 0
        self.warnings = 0

    def emit(self, level: str, label: str, detail: str = "", solution: str = "") -> None:
        if level == "ERROR":
            self.errors += 1
        elif level == "WARNING":
            self.warnings += 1
        print(f"{level}: {label}{' - ' + detail if detail else ''}")
        if solution:
            print(f"  Solucion: {solution}")

    def ok(self, label: str, detail: str = "") -> None:
        self.emit("OK", label, detail)

    def warning(self, label: str, detail: str = "", solution: str = "") -> None:
        self.emit("WARNING", label, detail, solution)

    def error(self, label: str, detail: str = "", solution: str = "") -> None:
        self.emit("ERROR", label, detail, solution)


def command_version(command: str, args: list[str]) -> str | None:
    executable = shutil.which(command)
    if not executable:
        return None
    try:
        result = subprocess.run([executable, *args], capture_output=True, text=True, timeout=10)
        output = (result.stdout or result.stderr).strip().splitlines()
        return output[0] if output else "detectado"
    except Exception as exc:
        return f"detectado, pero no se pudo ejecutar: {exc}"


def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def is_windows() -> bool:
    return platform.system().lower() == "windows"


def venv_python(venv_dir: Path) -> Path:
    if is_windows():
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def venv_pip(venv_dir: Path) -> Path:
    if is_windows():
        return venv_dir / "Scripts" / "pip.exe"
    return venv_dir / "bin" / "pip"


def model_items(models_dir: Path) -> list[Path]:
    if not models_dir.exists():
        return []
    ignored = {".gitkeep", "README.md"}
    return [path for path in models_dir.iterdir() if path.name not in ignored]


def long_paths_enabled() -> bool | None:
    if not is_windows():
        return None
    try:
        import winreg

        key_path = r"SYSTEM\CurrentControlSet\Control\FileSystem"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            value, _ = winreg.QueryValueEx(key, "LongPathsEnabled")
            return int(value) == 1
    except Exception:
        return None


def check_path(reporter: Reporter) -> None:
    root = str(REPO_ROOT)
    reporter.ok("ruta actual", root)
    reporter.ok("ruta recomendada Windows", RECOMMENDED_PATHS)
    if "onedrive" in root.lower():
        reporter.warning(
            "OneDrive detectado",
            "la instalacion ML puede fallar por rutas largas o sincronizacion",
            f"mueve el repo a {RECOMMENDED_PATHS}",
        )
    if len(root) > 80:
        reporter.warning(
            "ruta larga",
            f"{len(root)} caracteres",
            f"mueve el repo a una ruta corta como {RECOMMENDED_PATHS}",
        )


def check_python(reporter: Reporter) -> None:
    reporter.ok("Python", sys.version.split()[0])
    if sys.version_info >= (3, 13):
        reporter.warning(
            "Python 3.13 o superior detectado",
            "algunas dependencias ML pueden fallar",
            "usa Python 3.11 para crear los venvs ML",
        )


def check_node(reporter: Reporter) -> None:
    node_version = command_version("node", ["--version"])
    npm_version = command_version("npm", ["--version"])
    if node_version:
        reporter.ok("Node", node_version)
    else:
        reporter.error("Node", "no encontrado", "instala Node.js LTS y vuelve a ejecutar el setup")
    if npm_version:
        reporter.ok("npm", npm_version)
    else:
        reporter.error("npm", "no encontrado", "instala Node.js LTS; npm viene incluido")


def check_long_paths(reporter: Reporter) -> None:
    enabled = long_paths_enabled()
    if enabled is True:
        reporter.ok("LongPathsEnabled", "habilitado")
    elif enabled is False:
        reporter.warning(
            "LongPathsEnabled",
            "deshabilitado en Windows",
            f"abre PowerShell como admin y ejecuta: {LONG_PATHS_COMMAND}",
        )
    else:
        if is_windows():
            reporter.warning(
                "LongPathsEnabled",
                "no se pudo leer el registro de Windows",
                f"si ves errores de rutas largas, ejecuta como admin: {LONG_PATHS_COMMAND}",
            )
        else:
            reporter.ok("LongPathsEnabled", "no aplica fuera de Windows")


def check_repo_dirs(reporter: Reporter) -> None:
    required = [
        ("Backend dir", BACKEND_DIR),
        ("Frontend dir", FRONTEND_DIR),
        ("ML root", ML_ROOT),
    ]
    for label, path in required:
        if path.exists():
            reporter.ok(label, str(path))
        else:
            reporter.error(label, f"no existe: {path}", "revisa que el repo se haya clonado completo")


def check_venv(reporter: Reporter, label: str, venv_dir: Path) -> None:
    if not venv_dir.exists():
        reporter.warning(
            f"venv {label}",
            f"no existe: {venv_dir}",
            "se creara al ejecutar bash scripts/setup_gitbash.sh",
        )
        return

    missing = []
    if not venv_python(venv_dir).exists():
        missing.append(str(venv_python(venv_dir)))
    if not venv_pip(venv_dir).exists():
        missing.append(str(venv_pip(venv_dir)))
    if missing:
        reporter.error(
            f"venv {label}",
            "incompleto",
            "mueve el repo a una ruta corta, elimina solo ese venv incompleto si lo quieres recrear, y ejecuta setup otra vez. Faltan: "
            + ", ".join(missing),
        )
        return

    reporter.ok(f"venv {label}", str(venv_dir))


def check_local_dirs(reporter: Reporter) -> None:
    for path in LOCAL_DIRS:
        if path.exists():
            reporter.ok(f"carpeta {path.relative_to(REPO_ROOT)}", str(path))
        else:
            reporter.warning(
                f"carpeta {path.relative_to(REPO_ROOT)}",
                "falta",
                "ejecuta python scripts/create_local_dirs.py",
            )


def check_ports(reporter: Reporter) -> None:
    for port in (8000, 8010, 5173):
        if port_open(port):
            reporter.warning(
                f"puerto {port}",
                "en uso",
                "cierra el proceso que lo usa o cambia el puerto antes de arrancar servicios",
            )
        else:
            reporter.ok(f"puerto {port}", "libre")


def check_models(reporter: Reporter) -> None:
    models_dir = ML_ROOT / "models"
    models = model_items(models_dir)
    if models:
        reporter.ok("modelos descargados", f"{len(models)} item(s) en {models_dir}")
    else:
        reporter.warning(
            "modelos descargados",
            f"no se encontraron modelos en {models_dir}",
            "consulta python scripts/download_models.py --list y descarga el pack disponible",
        )


def main() -> int:
    reporter = Reporter()
    print("AcusticaFauna - doctor de instalacion")
    check_path(reporter)
    check_python(reporter)
    check_node(reporter)
    check_long_paths(reporter)
    check_repo_dirs(reporter)
    check_venv(reporter, "Backend", BACKEND_VENV)
    check_venv(reporter, "ML", ML_VENV)

    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        reporter.ok(".env", str(env_path))
    else:
        reporter.warning(".env", "falta", "copia .env.example a .env o ejecuta setup_gitbash.sh")

    check_local_dirs(reporter)
    check_ports(reporter)
    check_models(reporter)

    print(f"Resumen: {reporter.errors} error(es), {reporter.warnings} warning(s)")
    return 1 if reporter.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
