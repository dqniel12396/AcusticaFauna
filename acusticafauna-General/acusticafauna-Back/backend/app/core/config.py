import os
import re
from pathlib import Path


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def resolve_path(value: str | Path, base: Path) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    return (base / path).resolve()


def resolve_project_path(value: str | Path, base: Path, workspace: Path) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    first = path.parts[0] if path.parts else ""
    if first in {"acusticafauna-General", "acusticafauna-ML", "data", "sample_data"}:
        return (workspace / path).resolve()
    return (base / path).resolve()


class Settings:
    APP_NAME: str = "AcusticaFauna Local Importer"
    APP_VERSION: str = "1.0.0"

    def __init__(self) -> None:
        self.reload_from_env()

    def reload_from_env(self) -> None:
        default_base_dir = Path(__file__).resolve().parents[2]
        load_env_file(default_base_dir.parents[2] / ".env")
        load_env_file(default_base_dir / ".env")

        default_workspace_dir = default_base_dir.parents[2]
        self.BASE_DIR = resolve_project_path(
            os.getenv("ACUSTICAFAUNA_BACKEND_DIR", str(default_base_dir)),
            default_base_dir,
            default_workspace_dir,
        )
        self.WORKSPACE_DIR = self.BASE_DIR.parents[2]

        storage_root = os.getenv("ACUSTICAFAUNA_STORAGE_ROOT") or os.getenv(
            "ACUSTICAFAUNA_STORAGE_DIR",
            str(self.BASE_DIR / "storage"),
        )
        self.STORAGE_DIR = resolve_project_path(storage_root, self.BASE_DIR, self.WORKSPACE_DIR)

        self.DB_DIR = self.STORAGE_DIR / "db"
        self.AUDIO_DIR = self.STORAGE_DIR / "audio"
        self.SPECTROGRAM_DIR = self.STORAGE_DIR / "spectrograms"
        self.SPECTROGRAM_TMP_DIR = self.SPECTROGRAM_DIR / "tmp"
        self.SPECTROGRAM_CURATED_CONFIRMED_DIR = self.SPECTROGRAM_DIR / "curated_confirmed"
        self.ORIGINALS_DIR = self.STORAGE_DIR / "originals"
        self.IMPORTS_DIR = self.STORAGE_DIR / "imports"
        self.LOGS_DIR = self.STORAGE_DIR / "logs"

        self.DB_PATH = resolve_project_path(os.getenv("ACUSTICAFAUNA_DB_PATH", str(self.DB_DIR / "acusticafauna_local.db")), self.BASE_DIR, self.WORKSPACE_DIR)

        self.CURATED_DATASET_DIR = resolve_project_path(
            os.getenv("ACUSTICAFAUNA_DATASET_DIR") or os.getenv("ACUSTICAFAUNA_CURATED_DATASET_ROOT", str(self.WORKSPACE_DIR / "data" / "dataset_curado")),
            self.WORKSPACE_DIR,
            self.WORKSPACE_DIR,
        )
        self.ML_API_BASE_URL = os.getenv("ACUSTICAFAUNA_ML_API_URL") or os.getenv("ML_API_BASE_URL", "http://127.0.0.1:8010")
        self.ML_API_BASE_URL = self.ML_API_BASE_URL.rstrip("/")
        self.FRONTEND_URL = os.getenv("ACUSTICAFAUNA_FRONTEND_URL", "http://localhost:5173")
        self.RESOURCE_PROFILE = os.getenv("ACUSTICAFAUNA_RESOURCE_PROFILE", "auto")
        self.MAX_CPU_THREADS = os.getenv("ACUSTICAFAUNA_MAX_CPU_THREADS", "auto")
        self.MAX_WORKERS = os.getenv("ACUSTICAFAUNA_MAX_WORKERS", "auto")
        self.DEVICE = os.getenv("ACUSTICAFAUNA_DEVICE", "auto")

    @property
    def MEDIA_ALLOWED_ROOTS(self) -> tuple[Path, ...]:
        extra_roots = os.getenv("ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS") or os.getenv("ACUSTICAFAUNA_ALLOWED_MEDIA_ROOTS", "")
        roots = [self.CURATED_DATASET_DIR, self.STORAGE_DIR]

        for raw_path in re.split(r"[;,]" if os.pathsep == ";" else rf"[;,{re.escape(os.pathsep)}]", extra_roots):
            raw_path = raw_path.strip()
            if raw_path:
                roots.append(resolve_project_path(raw_path, self.WORKSPACE_DIR, self.WORKSPACE_DIR))

        return tuple(roots)


settings = Settings()
