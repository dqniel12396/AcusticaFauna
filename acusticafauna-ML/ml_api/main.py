from __future__ import annotations

import io
import csv
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def resolve_path(value: str | Path, base: Path) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    return (base / path).resolve()


def resolve_ml_path(value: str | Path, base: Path) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    first = path.parts[0] if path.parts else ""
    if first in {"acusticafauna-ML", "acusticafauna-General", "data", "sample_data"}:
        return (DEFAULT_ML_ROOT.parent / path).resolve()
    return (base / path).resolve()


DEFAULT_ML_ROOT = Path(__file__).resolve().parents[1]
load_env_file(DEFAULT_ML_ROOT.parent / ".env")
load_env_file(DEFAULT_ML_ROOT / ".env")
ML_ROOT = resolve_ml_path(os.getenv("ACUSTICAFAUNA_ML_ROOT", str(DEFAULT_ML_ROOT)), DEFAULT_ML_ROOT.parent)
if str(ML_ROOT / "scripts") not in sys.path:
    sys.path.append(str(ML_ROOT / "scripts"))

try:
    from ml_utils import import_opensoundscape_cnn
except Exception as exc:  # pragma: no cover - import error is reported at runtime.
    import_opensoundscape_cnn = None
    ML_UTILS_IMPORT_ERROR = exc
else:
    ML_UTILS_IMPORT_ERROR = None


SERVICE_NAME = "acusticafauna-ml-api"
DEFAULT_MODEL_ID = "frog_detector_v1_binary_v3_hardneg"
DEFAULT_POSITIVE_LABEL = "rana_sapo"
DEFAULT_THRESHOLD = 0.30
MIN_RELIABLE_BALANCED_ACCURACY = 0.60
MIN_PROMOTION_BALANCED_ACCURACY = 0.70
MIN_PROMOTION_BOANA_RECALL = 0.70
REGISTRY_STATUSES = {"active", "experimental", "archived", "rejected"}
TASK_LABELS = {
    "frog_detector": "Detector rana/sapo",
    "boana_boans_pugnax": "Boana boans vs Boana pugnax",
    "amphibian_genus": "Genero anfibio",
    "amphibian_species": "Especies anfibias",
}
UPLOAD_TTL_SECONDS = int(os.getenv("ACUSTICAFAUNA_ML_UPLOAD_TTL_SECONDS", "86400"))
MODELS_DIR = resolve_ml_path(os.getenv("ACUSTICAFAUNA_MODELS_DIR", str(ML_ROOT / "models")), ML_ROOT)
MANIFESTS_DIR = resolve_ml_path(os.getenv("ACUSTICAFAUNA_MANIFESTS_DIR", str(ML_ROOT / "manifests")), ML_ROOT)
OUTPUTS_DIR = resolve_ml_path(os.getenv("ACUSTICAFAUNA_OUTPUTS_DIR", str(ML_ROOT / "outputs")), ML_ROOT)
TMP_ROOT = resolve_ml_path(os.getenv("ACUSTICAFAUNA_ML_TMP_DIR", str(ML_ROOT / "tmp")), ML_ROOT)
UPLOAD_DIR = TMP_ROOT / "uploads"
SPECTROGRAM_DIR = TMP_ROOT / "spectrograms"
ML_RUNS_DIR = resolve_ml_path(os.getenv("ACUSTICAFAUNA_ML_RUNS_DIR", str(ML_ROOT / "ml_runs")), ML_ROOT)
TRAINING_JOBS_DIR = ML_RUNS_DIR / "jobs"
TRAINING_CLEAN_DIR = MANIFESTS_DIR / "clean"
TRAINING_LOCK = threading.Lock()
ACTIVE_TRAINING_JOB_ID: str | None = None
TRAINING_PROCESSES: dict[str, subprocess.Popen] = {}
TRAINING_CLEAN_MANIFEST_LOCK = threading.Lock()
TRAINING_CLEAN_MANIFEST_OUTPUTS: set[str] = set()

TRAINING_PRESETS: dict[str, dict[str, Any]] = {
    "frog_detector": {
        "id": "frog_detector",
        "name": "Detector rana/sapo",
        "target_mode": "binary_presence",
        "positive_label": DEFAULT_POSITIVE_LABEL,
        "default_manifest_csv": "manifests/frog_detector_v1_binary_v3_hardneg_manifest.csv",
        "min_rows_after": 100,
    },
    "boana_boans_pugnax": {
        "id": "boana_boans_pugnax",
        "name": "Clasificador Boana boans vs Boana pugnax",
        "target_mode": "multiclass",
        "default_manifest_csv": "manifests/boana_boans_pugnax_v3_quality045_manifest.csv",
        "classes": ["Boana_boans", "Boana_pugnax"],
        "min_per_split_by_class": {"train": 50, "val": 10, "test": 10},
        "min_rows_after": 140,
    },
    "amphibian_genus": {
        "id": "amphibian_genus",
        "name": "Genero anfibio",
        "target_mode": "multiclass",
        "default_manifest_csv": "manifests/amphibian_genus_v1_manifest.csv",
        "min_rows_after": 200,
    },
    "amphibian_species": {
        "id": "amphibian_species",
        "name": "Especies anfibias",
        "target_mode": "multiclass",
        "default_manifest_csv": "manifests/amphibian_species_v2_aliases_top_manifest.csv",
        "min_rows_after": 200,
    },
}


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _classes_from_label_map(path: Path) -> list[str]:
    label_map = _read_json(path)
    if not label_map:
        return []
    if "positive_label" in label_map and "negative_labels" in label_map:
        return [str(label_map["positive_label"])]
    if all(isinstance(value, int) for value in label_map.values()):
        return [
            str(label)
            for label, _ in sorted(label_map.items(), key=lambda item: int(item[1]))
        ]
    return [str(label) for label in label_map.keys()]


def _merge_model_card(data: dict[str, Any]) -> dict[str, Any]:
    card_path = data.get("model_card_path")
    if not card_path:
        return data
    card = _read_json(Path(card_path))
    if not card:
        return data

    merged = {**data, **card}
    if "model_id" in card:
        merged["id"] = card["model_id"]
        merged["model_id"] = card["model_id"]
    if card.get("decision_rule", {}).get("threshold") is not None:
        merged["threshold"] = card["decision_rule"]["threshold"]
    return merged


def infer_task(data: dict[str, Any]) -> str:
    model_id = str(data.get("model_id") or data.get("id") or "")
    preset = str(data.get("preset") or "")
    if data.get("task"):
        return str(data["task"])
    if "boana_boans_pugnax" in model_id or preset == "boana_boans_pugnax":
        return "boana_boans_pugnax"
    if "amphibian_genus" in model_id or preset == "amphibian_genus":
        return "amphibian_genus"
    if "amphibian_species" in model_id or preset == "amphibian_species":
        return "amphibian_species"
    if "frog_detector" in model_id or data.get("target_mode") == "binary_presence":
        return "frog_detector"
    return "unknown"


def metric_balanced_accuracy(data: dict[str, Any] | None) -> float | None:
    if not data:
        return None
    candidates = [
        data.get("calibrated_metrics", {}).get("balanced_accuracy") if isinstance(data.get("calibrated_metrics"), dict) else None,
        data.get("calibration", {}).get("test_metrics", {}).get("balanced_accuracy") if isinstance(data.get("calibration"), dict) else None,
        data.get("test_metrics", {}).get("balanced_accuracy") if isinstance(data.get("test_metrics"), dict) else None,
        data.get("raw_argmax_metrics", {}).get("balanced_accuracy") if isinstance(data.get("raw_argmax_metrics"), dict) else None,
        data.get("metrics", {}).get("balanced_accuracy") if isinstance(data.get("metrics"), dict) else None,
        data.get("balanced_accuracy"),
    ]
    for value in candidates:
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def model_is_unreliable(data: dict[str, Any] | None) -> bool:
    ba = metric_balanced_accuracy(data)
    return ba is not None and ba < MIN_RELIABLE_BALANCED_ACCURACY


def model_reliability_warnings(data: dict[str, Any] | None) -> list[str]:
    if not data or not model_is_unreliable(data):
        return []
    ba = metric_balanced_accuracy(data)
    return [
        f"Modelo no confiable: balanced_accuracy historica {ba:.3f} < {MIN_RELIABLE_BALANCED_ACCURACY:.2f}.",
        "Score alto no implica confianza: el modelo tiene bajo rendimiento historico.",
    ]


def metric_boana_recall(data: dict[str, Any] | None) -> float | None:
    if not data:
        return None
    candidates = [
        data.get("per_class_recall", {}).get("Boana") if isinstance(data.get("per_class_recall"), dict) else None,
        data.get("metrics", {}).get("per_class_recall", {}).get("Boana") if isinstance(data.get("metrics"), dict) else None,
        data.get("metrics", {}).get("recall_by_class", {}).get("Boana") if isinstance(data.get("metrics"), dict) else None,
    ]
    for value in candidates:
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def has_genus_prediction_collapse(data: dict[str, Any] | None) -> bool:
    counts = {}
    if isinstance(data, dict):
        counts = data.get("prediction_counts") or data.get("metrics", {}).get("prediction_counts") or {}
    if not isinstance(counts, dict) or not counts:
        return False
    total = sum(float(value or 0) for value in counts.values())
    if total <= 0:
        return False
    dominant = float(counts.get("Hyalinobatrachium", 0) or 0) + float(counts.get("Atelopus", 0) or 0)
    return dominant / total > 0.60


def hardware_profile() -> dict[str, Any]:
    cpu_count = os.cpu_count() or 1
    ram_gb = None
    try:
        import psutil  # type: ignore

        ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
    except Exception:
        ram_gb = None
    cuda = {"available": False, "name": None, "reason": "torch no disponible"}
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            cuda = {"available": True, "name": torch.cuda.get_device_name(0), "reason": None}
        else:
            cuda = {"available": False, "name": None, "reason": "cuda no disponible"}
    except Exception as exc:
        cuda = {"available": False, "name": None, "reason": str(exc)}

    configured = os.getenv("ACUSTICAFAUNA_RESOURCE_PROFILE", "auto").lower()
    if configured in {"eco", "balanceado", "rendimiento"}:
        profile = configured
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
    return {
        "configured_profile": configured,
        "recommended_profile": profile,
        "cpu_count": cpu_count,
        "ram_gb": ram_gb,
        "cuda": cuda,
        "max_cpu_threads": os.getenv("ACUSTICAFAUNA_MAX_CPU_THREADS", "auto") if os.getenv("ACUSTICAFAUNA_MAX_CPU_THREADS", "auto") != "auto" else max_threads,
        "max_workers": os.getenv("ACUSTICAFAUNA_MAX_WORKERS", "auto") if os.getenv("ACUSTICAFAUNA_MAX_WORKERS", "auto") != "auto" else max_workers,
        "device": os.getenv("ACUSTICAFAUNA_DEVICE", "auto") if os.getenv("ACUSTICAFAUNA_DEVICE", "auto") != "auto" else device,
    }


def apply_thread_limits() -> None:
    profile = hardware_profile()
    threads = str(profile.get("max_cpu_threads") or 1)
    for key in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ.setdefault(key, threads)
    try:
        import torch  # type: ignore

        torch.set_num_threads(int(float(threads)))
    except Exception:
        pass


def apply_registry_defaults(data: dict[str, Any]) -> dict[str, Any]:
    model_id = str(data.get("model_id") or data.get("id") or "")
    task = infer_task(data)
    data["task"] = task
    if data.get("registry_status") not in REGISTRY_STATUSES:
        data["registry_status"] = "active" if model_id in {DEFAULT_MODEL_ID, "boana_boans_pugnax_v3_quality045"} else "experimental"
    if data.get("is_default_for_task") is None:
        data["is_default_for_task"] = model_id in {DEFAULT_MODEL_ID, "boana_boans_pugnax_v3_quality045"}
    data["task_label"] = TASK_LABELS.get(task, task)
    data["balanced_accuracy"] = metric_balanced_accuracy(data)
    data["is_reliable"] = not model_is_unreliable(data)
    data["reliability_label"] = "No confiable" if model_is_unreliable(data) else "Confiable"
    data["reliability_warnings"] = model_reliability_warnings(data)
    if model_id == "amphibian_genus_v1" and model_is_unreliable(data):
        data["promotion_warning"] = "No promover: bajo rendimiento"
    return data


MODEL_REGISTRY: dict[str, dict[str, Any]] = {
    DEFAULT_MODEL_ID: {
        "id": DEFAULT_MODEL_ID,
        "name": "Detector rana/sapo v1 binary v3 hard negatives",
        "model_type": "binary_presence_detector",
        "target_mode": "binary_presence",
        "positive_label": DEFAULT_POSITIVE_LABEL,
        "threshold": DEFAULT_THRESHOLD,
        "classes": [DEFAULT_POSITIVE_LABEL],
        "clip_duration": 5,
        "step_seconds": 5,
        "model_path": str(
            MODELS_DIR / DEFAULT_MODEL_ID / f"{DEFAULT_MODEL_ID}.model"
        ),
        "label_map_path": str(MODELS_DIR / DEFAULT_MODEL_ID / "label_map.json"),
        "model_card_path": str(MODELS_DIR / DEFAULT_MODEL_ID / "model_card.json"),
        "metrics_path": str(
            MODELS_DIR / DEFAULT_MODEL_ID / "test_threshold_applied_metrics.json"
        ),
    },
    "boana_boans_pugnax_v3_quality045": {
        "id": "boana_boans_pugnax_v3_quality045",
        "name": "Boana boans vs Boana pugnax v3 quality 0.45",
        "model_type": "specialized_species_classifier",
        "target_mode": "multiclass",
        "threshold": 0.03,
        "clip_duration": 5,
        "step_seconds": 5,
        "model_path": str(
            MODELS_DIR
            / "boana_boans_pugnax_v3_quality045"
            / "boana_boans_pugnax_v3_quality045.model"
        ),
        "label_map_path": str(
            MODELS_DIR / "boana_boans_pugnax_v3_quality045" / "label_map.json"
        ),
        "model_card_path": str(
            MODELS_DIR / "boana_boans_pugnax_v3_quality045" / "model_card.json"
        ),
    },
    "amphibian_genus_v1": {
        "id": "amphibian_genus_v1",
        "name": "Clasificador de genero anfibio v1 candidato",
        "model_type": "amphibian_genus_classifier",
        "target_mode": "multiclass",
        "task": "amphibian_genus",
        "registry_status": "experimental",
        "is_default_for_task": False,
        "clip_duration": 5,
        "step_seconds": 5,
        "model_path": str(OUTPUTS_DIR / "amphibian_genus_v1" / "amphibian_genus_v1.model"),
        "label_map_path": str(OUTPUTS_DIR / "amphibian_genus_v1" / "label_map.json"),
        "metrics_path": str(OUTPUTS_DIR / "amphibian_genus_v1_eval" / "metrics.json"),
        "model_card_path": str(MODELS_DIR / "amphibian_genus_v1" / "model_card.json"),
        "notes": "Modelo de genero candidato; requiere evaluacion/validacion antes de activar.",
    },
}


MODEL_CACHE: dict[str, Any] = {}


class PredictAudioPathRequest(BaseModel):
    audio_path: str
    model_id: str = DEFAULT_MODEL_ID
    target_mode: str = "binary_presence"
    positive_label: str = DEFAULT_POSITIVE_LABEL
    threshold: float = DEFAULT_THRESHOLD
    clip_duration: float = Field(default=5, gt=0)
    step_seconds: float = Field(default=5, gt=0)
    start_seconds: float | None = Field(default=None, ge=0)
    end_seconds: float | None = Field(default=None, gt=0)


class SpectrogramAudioPathRequest(BaseModel):
    audio_path: str
    start_seconds: float = Field(default=0, ge=0)
    end_seconds: float | None = Field(default=None, gt=0)
    max_freq: float = Field(default=12000, gt=0)


class TrainingCleanManifestRequest(BaseModel):
    preset: str = "boana_boans_pugnax"
    base_manifest_csv: str
    output_csv: str | None = None
    feedback_items: list[dict[str, Any]] = Field(default_factory=list)
    exclude_human_voice: bool = True
    exclude_excluded_from_training: bool = True
    ignore_retracted: bool = True
    block_conflicts: bool = True
    include_confirmed: bool = True
    min_rows_after: int | None = None
    overwrite_existing: bool = False
    output_conflict_strategy: str = "fail"


class SpecializedManifestRequest(BaseModel):
    base_manifest_csv: str
    output_csv: str
    include_labels: list[str] = Field(default_factory=list)
    filter_mode: str = "labels"
    group: str | None = None
    apply_feedback: bool = True
    feedback_items: list[dict[str, Any]] = Field(default_factory=list)
    exclude_human_voice: bool = True
    exclude_retracted: bool = True
    exclude_excluded_from_training: bool = True
    block_conflicts: bool = True
    overwrite_existing: bool = False
    output_conflict_strategy: str = "fail"


class TrainingJobRequest(BaseModel):
    job_name: str
    preset: str = "boana_boans_pugnax"
    base_manifest_csv: str | None = None
    clean_manifest_csv: str
    output_dir: str
    model_name: str
    target_mode: str = "multiclass"
    positive_label: str | None = None
    epochs: int = Field(default=15, ge=1)
    batch_size: int = Field(default=8, ge=1)
    clip_duration: float = Field(default=5, gt=0)
    sample_strategy: str = "stratified"
    random_seed: int = 52
    device: str = "auto"
    dry_run_first: bool = True
    override_conflicts: bool = False


class TrainingEvaluateRequest(BaseModel):
    model_path: str | None = None
    manifest_csv: str | None = None
    output_dir: str | None = None
    target_mode: str | None = None
    positive_label: str | None = None
    threshold: float | None = None


class ThresholdCalibrationRequest(BaseModel):
    positive_class: str
    score_column: str | None = None
    metric: str = "balanced_accuracy"
    threshold_min: float = Field(default=0.01, ge=0, le=1)
    threshold_max: float = Field(default=0.99, ge=0, le=1)
    threshold_step: float = Field(default=0.01, gt=0, le=1)


class RegisterModelRequest(BaseModel):
    model_id: str | None = None
    model_name: str | None = None
    model_type: str | None = None
    target_mode: str | None = None
    threshold: float | None = None
    positive_label: str | None = None
    decision_rule: dict[str, Any] | None = None
    task: str | None = None
    parent_model_id: str | None = None
    notes: str | None = None


class ModelNotesRequest(BaseModel):
    notes: str = ""


class ModelRegistryActionRequest(BaseModel):
    notes: str | None = None
    force_promote_unreliable: bool = False


app = FastAPI(title="AcusticaFauna ML API", version="0.1.0")
router = APIRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_tmp_dirs() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    SPECTROGRAM_DIR.mkdir(parents=True, exist_ok=True)
    TRAINING_JOBS_DIR.mkdir(parents=True, exist_ok=True)
    TRAINING_CLEAN_DIR.mkdir(parents=True, exist_ok=True)


@app.on_event("startup")
def on_startup() -> None:
    apply_thread_limits()
    ensure_tmp_dirs()
    cleanup_old_uploads()


def cleanup_old_uploads() -> None:
    if not UPLOAD_DIR.exists():
        return
    cutoff = time.time() - UPLOAD_TTL_SECONDS
    for path in UPLOAD_DIR.iterdir():
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            continue


def is_path_inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def safe_relative_path(raw_path: str, *, must_exist: bool = False, base: Path = ML_ROOT) -> Path:
    path = Path(raw_path)
    if not path.is_absolute():
        path = base / path
    resolved = path.expanduser().resolve()
    allowed_roots = [ML_ROOT, MODELS_DIR, MANIFESTS_DIR, OUTPUTS_DIR, ML_RUNS_DIR, TMP_ROOT]
    if not any(is_path_inside(resolved, root) for root in allowed_roots):
        raise HTTPException(status_code=400, detail=f"Ruta fuera de directorios ML configurados: {raw_path}")
    if must_exist and not resolved.exists():
        raise HTTPException(status_code=404, detail=f"Ruta no encontrada: {raw_path}")
    return resolved


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ML_ROOT.resolve())).replace("\\", "/")
    except ValueError:
        return str(path)


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def normalize_path_key(value: Any) -> str:
    return str(value or "").strip().replace("\\", "/").lower()


def read_csv_rows(path: Path) -> list[dict[str, Any]]:
    with path.open("r", newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def write_csv_rows(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        value = str(row.get(key) or "")
        counts[value] = counts.get(value, 0) + 1
    return counts


def split_class_counts(rows: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for row in rows:
        split = str(row.get("split") or "unknown")
        label = str(row.get("normalized_label") or row.get("canonical_label") or "unknown")
        counts.setdefault(split, {})
        counts[split][label] = counts[split].get(label, 0) + 1
    return counts


def manifest_label(row: dict[str, Any]) -> str:
    return str(row.get("normalized_label") or row.get("canonical_label") or row.get("source_species_label") or "").strip()


def species_label(row: dict[str, Any]) -> str:
    candidates = [
        row.get("source_species_label"),
        row.get("canonical_label"),
        row.get("normalized_label"),
        row.get("original_label_raw"),
    ]
    for value in candidates:
        text = str(value or "").strip()
        if "_" in text:
            return text
    return str(row.get("normalized_label") or "").strip()


def genus_from_label(label: str) -> str:
    text = str(label or "").strip()
    if not text:
        return "unknown"
    return text.split("_", 1)[0]


def row_genus(row: dict[str, Any]) -> str:
    explicit = str(row.get("taxonomy_group") or "").strip()
    if explicit:
        return explicit
    return genus_from_label(species_label(row) or manifest_label(row))


def to_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        result = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def minimum_checks_for_counts(split_counts_by_class: dict[str, dict[str, int]], labels: list[str]) -> list[dict[str, Any]]:
    minimums = {"train": 50, "val": 10, "test": 10}
    checks = []
    for label in labels:
        for split, minimum in minimums.items():
            count = split_counts_by_class.get(split, {}).get(label, 0)
            checks.append({"label": label, "split": split, "count": count, "minimum": minimum, "ok": count >= minimum})
    return checks


def class_is_trainable(split_counts_by_class: dict[str, dict[str, int]], label: str) -> bool:
    return all(
        split_counts_by_class.get(split, {}).get(label, 0) >= minimum
        for split, minimum in {"train": 50, "val": 10, "test": 10}.items()
    )


def recommendation_for_classes(split_counts_by_class: dict[str, dict[str, int]], labels: list[str]) -> dict[str, Any]:
    trainable = [label for label in labels if class_is_trainable(split_counts_by_class, label)]
    low_data = [label for label in labels if label not in trainable]
    if len(labels) < 2:
        recommendation = "insuficiente"
        message = "Se necesita al menos dos clases para un clasificador especializado."
    elif len(trainable) < 2:
        recommendation = "necesita_mas_datos"
        message = "Menos de dos clases cumplen minimos por split."
    elif len(trainable) == 2 and len(labels) == 2:
        recommendation = "binario"
        message = "Apto para clasificador binario especializado."
    elif len(trainable) >= 3:
        recommendation = "multiclase"
        message = "Apto para clasificador multiclase; revisar clases con pocos datos si existen."
    else:
        recommendation = "revisar"
        message = "Hay dos clases entrenables, pero algunas clases del grupo tienen pocos datos."
    return {
        "recommendation": recommendation,
        "message": message,
        "minimums_ok": len(labels) >= 2 and not low_data,
        "trainable_classes": trainable,
        "low_data_classes": low_data,
    }


def feedback_key(item: dict[str, Any]) -> str:
    return normalize_path_key(item.get("audio_path"))


def feedback_type(item: dict[str, Any]) -> str:
    return str(item.get("feedback_type") or item.get("user_feedback") or "")


def detect_feedback_conflicts(feedback_items: list[dict[str, Any]], ignore_retracted: bool = True) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in feedback_items:
        if ignore_retracted and item.get("status") == "retracted":
            continue
        key = feedback_key(item)
        if key:
            grouped.setdefault(key, []).append(item)
    conflict_sets = [
        {"confirmed_positive", "false_positive"},
        {"confirmed_positive", "hard_negative"},
        {"confirmed_positive", "excluded_from_training"},
    ]
    conflicts = []
    for key, items in grouped.items():
        types = {feedback_type(item) for item in items if feedback_type(item)}
        if any(rule.issubset(types) for rule in conflict_sets):
            conflicts.append(
                {
                    "audio_path": items[0].get("audio_path"),
                    "feedback_types": sorted(types),
                    "annotation_ids": [item.get("id") for item in items if item.get("id")],
                    "message": "Este item tiene feedback contradictorio. Corrige antes de usarlo para entrenamiento.",
                }
            )
    return conflicts


def summarize_training_manifest(rows: list[dict[str, Any]], preset: str) -> dict[str, Any]:
    preset_data = TRAINING_PRESETS.get(preset, {})
    split_counts = count_by(rows, "split")
    class_counts = count_by(rows, "normalized_label")
    by_split_class = split_class_counts(rows)
    min_checks = []
    for split, minimum in (preset_data.get("min_per_split_by_class") or {}).items():
        for label in preset_data.get("classes") or sorted(class_counts):
            count = by_split_class.get(split, {}).get(label, 0)
            min_checks.append(
                {
                    "split": split,
                    "label": label,
                    "count": count,
                    "minimum": minimum,
                    "ok": count >= minimum,
                }
            )
    return {
        "rows": len(rows),
        "classes": sorted([label for label in class_counts if label]),
        "class_counts": class_counts,
        "split_counts": split_counts,
        "split_class_counts": by_split_class,
        "min_checks": min_checks,
        "minimums_ok": all(item["ok"] for item in min_checks) if min_checks else True,
    }


def summarize_manifest_file(manifest_csv: str) -> dict[str, Any]:
    manifest_path = safe_relative_path(manifest_csv, must_exist=True)
    rows = read_csv_rows(manifest_path)
    columns = list(rows[0].keys()) if rows else []
    labels = sorted({manifest_label(row) for row in rows if manifest_label(row)})
    split_counts = count_by(rows, "split")
    split_by_class = split_class_counts(rows)
    duration_values = [to_float(row.get("duration_seconds")) for row in rows]
    missing_samples = []
    missing_count = 0
    for row in rows:
        audio_path = str(row.get("audio_path") or "").strip()
        if audio_path and not Path(audio_path).exists():
            missing_count += 1
            if len(missing_samples) < 20:
                missing_samples.append(audio_path)
    top_labels = sorted(count_by(rows, "normalized_label").items(), key=lambda item: item[1], reverse=True)[:25]
    return {
        "manifest_csv": display_path(manifest_path),
        "rows": len(rows),
        "columns": columns,
        "labels": labels,
        "total_classes": len(labels),
        "duration_total": round(sum(value for value in duration_values if value is not None), 3),
        "missing_files": missing_count,
        "missing_file_samples": missing_samples,
        "class_counts": count_by(rows, "normalized_label"),
        "split_counts": split_counts,
        "split_class_counts": split_by_class,
        "top_labels": [{"label": label, "count": count} for label, count in top_labels],
    }


def manifest_candidates_for_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row_genus(row), []).append(row)

    candidates = []
    for group, group_rows in sorted(grouped.items()):
        class_rows: dict[str, list[dict[str, Any]]] = {}
        for row in group_rows:
            label = species_label(row) or manifest_label(row)
            if label:
                class_rows.setdefault(label, []).append(row)
        labels = sorted(class_rows)
        split_by_class = split_class_counts(
            [
                {**row, "normalized_label": species_label(row) or manifest_label(row)}
                for row in group_rows
                if species_label(row) or manifest_label(row)
            ]
        )
        checks = minimum_checks_for_counts(split_by_class, labels)
        recommendation = recommendation_for_classes(split_by_class, labels)
        candidates.append(
            {
                "group": group,
                "classes": labels,
                "rows": len(group_rows),
                "class_counts": {label: len(class_rows[label]) for label in labels},
                "split_class_counts": split_by_class,
                "min_checks": checks,
                "minimums_ok": recommendation["minimums_ok"],
                "recommendation": recommendation["recommendation"],
                "recommendation_message": recommendation["message"],
                "trainable_classes": recommendation["trainable_classes"],
                "low_data_classes": recommendation["low_data_classes"],
                "suggested_task": "binary" if recommendation["recommendation"] == "binario" else "multiclass" if recommendation["recommendation"] == "multiclase" else "review",
            }
        )
    return sorted(candidates, key=lambda item: (item["recommendation"] not in {"binario", "multiclase"}, -item["rows"], item["group"]))


def specialized_manifest_output_path(payload: SpecializedManifestRequest) -> Path:
    return safe_relative_path(payload.output_csv, must_exist=False)


def build_specialized_manifest(payload: SpecializedManifestRequest, write_output: bool = False) -> dict[str, Any]:
    base_path = safe_relative_path(payload.base_manifest_csv, must_exist=True)
    rows = read_csv_rows(base_path)
    include_labels = {str(label).strip() for label in payload.include_labels if str(label).strip()}
    filter_mode = payload.filter_mode or "labels"
    if filter_mode not in {"labels", "group"}:
        raise HTTPException(status_code=400, detail="filter_mode debe ser labels o group.")
    if filter_mode == "labels" and not include_labels:
        raise HTTPException(status_code=400, detail="Selecciona al menos una clase para crear el manifest especializado.")
    if filter_mode == "group" and not payload.group:
        raise HTTPException(status_code=400, detail="Selecciona un genero o grupo para crear el manifest especializado.")

    feedback_items = payload.feedback_items if payload.apply_feedback else []
    conflicts = detect_feedback_conflicts(feedback_items, payload.exclude_retracted) if payload.apply_feedback else []
    feedback_by_path: dict[str, list[dict[str, Any]]] = {}
    for item in feedback_items:
        if payload.exclude_retracted and item.get("status") == "retracted":
            continue
        key = feedback_key(item)
        if key:
            feedback_by_path.setdefault(key, []).append(item)

    fieldnames = list(rows[0].keys()) if rows else []
    extra_fields = [
        "audio_lab_feedback_type",
        "audio_lab_exclusion_reason",
        "audio_lab_status",
        "audio_lab_notes",
        "audio_lab_recommended_training_use",
    ]
    for field in extra_fields:
        if field not in fieldnames:
            fieldnames.append(field)

    output_rows = []
    excluded_by_filter = 0
    excluded_by_human_voice = 0
    excluded_by_retracted = 0
    excluded_by_training = 0
    feedback_applied = 0
    for row in rows:
        label = manifest_label(row)
        species = species_label(row) or label
        group = row_genus(row)
        if filter_mode == "labels":
            selected_label = species if species in include_labels else label if label in include_labels else ""
            include = bool(selected_label)
        else:
            selected_label = species or label
            include = group == payload.group
        if not include:
            excluded_by_filter += 1
            continue

        next_row = dict(row)
        if selected_label:
            next_row["normalized_label"] = selected_label
        related = feedback_by_path.get(normalize_path_key(row.get("audio_path")), [])
        if related:
            feedback_applied += 1
            types = [feedback_type(item) for item in related]
            reasons = [str(item.get("exclusion_reason") or "") for item in related if item.get("exclusion_reason")]
            latest = related[-1]
            next_row["audio_lab_feedback_type"] = ",".join(sorted(set(types)))
            next_row["audio_lab_exclusion_reason"] = ",".join(sorted(set(reasons)))
            next_row["audio_lab_status"] = str(latest.get("status") or "active")
            next_row["audio_lab_notes"] = str(latest.get("notes") or "")
            next_row["audio_lab_recommended_training_use"] = str(latest.get("recommended_training_use") or "")

            human_voice = any(
                item.get("exclusion_reason") == "voz_humana" or item.get("label_type") == "human_voice"
                for item in related
            )
            excluded_training = any(feedback_type(item) == "excluded_from_training" for item in related)
            if payload.exclude_human_voice and human_voice:
                excluded_by_human_voice += 1
                continue
            if payload.exclude_excluded_from_training and excluded_training:
                excluded_by_training += 1
                continue
            if payload.exclude_retracted and any(item.get("status") == "retracted" for item in related):
                excluded_by_retracted += 1
                continue

        if payload.exclude_retracted and str(next_row.get("status") or next_row.get("audio_lab_status") or "").lower() == "retracted":
            excluded_by_retracted += 1
            continue
        output_rows.append(next_row)

    class_counts = count_by(output_rows, "normalized_label")
    labels = sorted([label for label in class_counts if label])
    split_by_class = split_class_counts(output_rows)
    min_checks = minimum_checks_for_counts(split_by_class, labels)
    recommendation = recommendation_for_classes(split_by_class, labels)
    warnings = []
    if len(labels) < 2:
        warnings.append("No apto: se requieren al menos dos clases.")
    for label in recommendation["low_data_classes"]:
        warnings.append(f"No apto: clase {label} tiene pocos ejemplos por split.")
    if conflicts and payload.block_conflicts:
        warnings.append("No apto: hay conflictos de retroalimentacion acumulada.")
    minimums_ok = len(labels) >= 2 and all(item["ok"] for item in min_checks)
    can_train = minimums_ok and not (conflicts and payload.block_conflicts)

    output_path = specialized_manifest_output_path(payload)
    if write_output and payload.output_conflict_strategy == "suffix":
        output_path = next_available_csv_path(output_path)
    if write_output:
        write_csv_rows(output_path, output_rows, fieldnames)
        summary_path = output_path.with_suffix(output_path.suffix + ".summary.json")
        summary_path.write_text(
            json.dumps(
                {
                    "base_manifest_csv": display_path(base_path),
                    "output_csv": display_path(output_path),
                    "created_at": now_iso(),
                    "filter_mode": filter_mode,
                    "include_labels": sorted(include_labels),
                    "group": payload.group,
                    "recommendation": recommendation,
                    "rows_after": len(output_rows),
                    "class_counts": class_counts,
                    "split_class_counts": split_by_class,
                    "minimums_ok": minimums_ok,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    return {
        "base_manifest_csv": display_path(base_path),
        "output_csv": display_path(output_path),
        "summary_json": display_path(output_path.with_suffix(output_path.suffix + ".summary.json")),
        "created": bool(write_output),
        "status": "completed" if write_output else "dry_run_ok",
        "progress": 100 if write_output else 0,
        "rows_before": len(rows),
        "rows_after": len(output_rows),
        "classes": labels,
        "class_counts": class_counts,
        "split_counts": count_by(output_rows, "split"),
        "split_class_counts": split_by_class,
        "min_checks": min_checks,
        "minimums_ok": minimums_ok,
        "recommendation": recommendation["recommendation"],
        "recommendation_message": recommendation["message"],
        "recommendation_final": "Apto para entrenamiento" if can_train else "; ".join(warnings),
        "target_mode": "multiclass" if len(labels) >= 2 else "review",
        "classifier_kind": "binary_specialized" if len(labels) == 2 else "multiclass" if len(labels) > 2 else "review",
        "feedback_applied": feedback_applied,
        "excluded_by_filter": excluded_by_filter,
        "excluded_by_human_voice": excluded_by_human_voice,
        "excluded_by_retracted": excluded_by_retracted,
        "excluded_by_excluded_from_training": excluded_by_training,
        "conflicts_detected": len(conflicts),
        "conflicts": conflicts,
        "warnings": warnings,
        "can_train": can_train,
    }


def clean_manifest_steps(status: str = "completed", progress: int = 100) -> list[dict[str, Any]]:
    labels = [
        ("validating_base_manifest", "Validando manifest base", 15),
        ("loading_feedback", "Cargando retroalimentacion", 30),
        ("applying_exclusions", "Aplicando exclusiones", 50),
        ("checking_minimums", "Verificando minimos", 70),
        ("writing_clean_csv", "Escribiendo CSV limpio", 90),
        ("saving_summary", "Guardando resumen", 95),
        ("completed", "Completado", 100),
    ]
    return [
        {
            "id": step_id,
            "label": label,
            "progress": step_progress,
            "status": "completed" if progress >= step_progress and status == "completed" else "pending",
        }
        for step_id, label, step_progress in labels
    ]


def clean_manifest_output_path(payload: TrainingCleanManifestRequest) -> Path:
    return safe_relative_path(
        payload.output_csv or f"manifests/clean/{Path(payload.base_manifest_csv).stem}_feedback_clean.csv",
        must_exist=False,
    )


def next_available_csv_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    index = 2
    while True:
        candidate = parent / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def build_clean_manifest(payload: TrainingCleanManifestRequest, write_output: bool = False) -> dict[str, Any]:
    base_path = safe_relative_path(payload.base_manifest_csv, must_exist=True)
    rows = read_csv_rows(base_path)
    feedback_items = payload.feedback_items or []
    conflicts = detect_feedback_conflicts(feedback_items, payload.ignore_retracted)
    feedback_by_path: dict[str, list[dict[str, Any]]] = {}
    for item in feedback_items:
        if payload.ignore_retracted and item.get("status") == "retracted":
            continue
        key = feedback_key(item)
        if key:
            feedback_by_path.setdefault(key, []).append(item)

    output_rows = []
    excluded_by_human_voice = 0
    excluded_by_retracted = sum(1 for item in feedback_items if item.get("status") == "retracted")
    excluded_by_training = 0
    included_confirmed = 0
    hard_negatives_available = 0
    sent_to_review = 0
    feedback_applied = 0

    fieldnames = list(rows[0].keys()) if rows else []
    extra_fields = [
        "audio_lab_feedback_type",
        "audio_lab_exclusion_reason",
        "audio_lab_status",
        "audio_lab_notes",
        "audio_lab_recommended_training_use",
    ]
    for field in extra_fields:
        if field not in fieldnames:
            fieldnames.append(field)

    for row in rows:
        row_key = normalize_path_key(row.get("audio_path"))
        related = feedback_by_path.get(row_key, [])
        excluded = False
        next_row = dict(row)
        if related:
            feedback_applied += 1
            types = [feedback_type(item) for item in related]
            reasons = [str(item.get("exclusion_reason") or "") for item in related if item.get("exclusion_reason")]
            latest = related[-1]
            next_row["audio_lab_feedback_type"] = ",".join(sorted(set(types)))
            next_row["audio_lab_exclusion_reason"] = ",".join(sorted(set(reasons)))
            next_row["audio_lab_status"] = str(latest.get("status") or "active")
            next_row["audio_lab_notes"] = str(latest.get("notes") or "")
            next_row["audio_lab_recommended_training_use"] = str(latest.get("recommended_training_use") or "")

            if "confirmed_positive" in types and payload.include_confirmed:
                included_confirmed += 1
            if "hard_negative" in types:
                hard_negatives_available += 1
            if "uncertain" in types:
                sent_to_review += 1

            human_voice = any(
                item.get("exclusion_reason") == "voz_humana" or item.get("label_type") == "human_voice"
                for item in related
            )
            excluded_training = any(feedback_type(item) == "excluded_from_training" for item in related)
            if payload.exclude_human_voice and human_voice:
                excluded = True
                excluded_by_human_voice += 1
            elif payload.exclude_excluded_from_training and excluded_training:
                excluded = True
                excluded_by_training += 1

        if not excluded:
            output_rows.append(next_row)

    manifest_summary = summarize_training_manifest(output_rows, payload.preset)
    min_rows_after = payload.min_rows_after or TRAINING_PRESETS.get(payload.preset, {}).get("min_rows_after") or 1
    warnings = []
    if len(output_rows) < min_rows_after:
        warnings.append("Dataset insuficiente para entrenamiento.")
    if conflicts and payload.block_conflicts:
        warnings.append("Hay conflictos detectados. Entrenamiento bloqueado salvo override explicito.")
    if not manifest_summary["minimums_ok"]:
        warnings.append("No se cumplen los minimos recomendados por clase/split.")

    output_path = clean_manifest_output_path(payload)
    if write_output and payload.output_conflict_strategy == "suffix":
        output_path = next_available_csv_path(output_path)
    if write_output:
        write_csv_rows(output_path, output_rows, fieldnames)
        summary_path = output_path.with_suffix(output_path.suffix + ".summary.json")
        summary_path.write_text(
            json.dumps(
                {
                    "base_manifest_csv": display_path(base_path),
                    "output_csv": display_path(output_path),
                    "created_at": now_iso(),
                    "summary": manifest_summary,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    return {
        "base_manifest_csv": display_path(base_path),
        "output_csv": display_path(output_path),
        "summary_json": display_path(output_path.with_suffix(output_path.suffix + ".summary.json")),
        "created": bool(write_output),
        "status": "completed" if write_output else "dry_run_ok",
        "progress": 100 if write_output else 0,
        "steps": clean_manifest_steps("completed", 100) if write_output else clean_manifest_steps("dry_run_ok", 0),
        "rows_before": len(rows),
        "rows_after": len(output_rows),
        "classes": manifest_summary["classes"],
        "class_counts": manifest_summary["class_counts"],
        "split_counts": manifest_summary["split_counts"],
        "split_class_counts": manifest_summary["split_class_counts"],
        "min_checks": manifest_summary["min_checks"],
        "minimums_ok": manifest_summary["minimums_ok"],
        "feedback_applied": feedback_applied,
        "excluded_by_human_voice": excluded_by_human_voice,
        "excluded_by_retracted": excluded_by_retracted,
        "excluded_by_excluded_from_training": excluded_by_training,
        "included_confirmed": included_confirmed,
        "sent_to_review": sent_to_review,
        "hard_negatives_available": hard_negatives_available,
        "conflicts_detected": len(conflicts),
        "conflicts": conflicts,
        "warnings": warnings,
        "can_train": not warnings,
    }


def model_metadata(model_id: str) -> dict[str, Any]:
    model = discovered_model_registry().get(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Modelo no registrado: {model_id}")

    data = _merge_model_card(dict(model))
    label_map_path = data.get("label_map_path")
    classes = data.get("classes") or (_classes_from_label_map(Path(label_map_path)) if label_map_path else [])
    data["classes"] = classes
    data["model_id"] = data.get("model_id") or data.get("id") or model_id
    data["id"] = data["model_id"]
    data["model_type"] = data.get("model_type") or data.get("target_mode") or "unknown"
    data["decision_rule"] = data.get("decision_rule")
    decision_rule = data.get("decision_rule") or {}
    if decision_rule.get("threshold") is not None:
        data["threshold"] = decision_rule["threshold"]

    metrics_path = data.get("metrics_path")
    metrics = _read_json(Path(metrics_path)) if metrics_path else None
    if metrics:
        data["metrics"] = metrics
    model_path = Path(data.get("model_path") or "")
    data["model_exists"] = model_path.exists()
    data["download_status"] = "available" if data["model_exists"] else "missing"
    data["availability_label"] = "modelo disponible" if data["model_exists"] else "modelo no descargado"
    if not data["model_exists"]:
        data["download_url"] = data.get("download_url") or "PENDIENTE_URL_RELEASE"
    data = apply_registry_defaults(data)
    data.pop("metrics_path", None)
    data.pop("label_map_path", None)
    data.pop("model_card_path", None)
    return data


def discovered_model_registry() -> dict[str, dict[str, Any]]:
    registry = dict(MODEL_REGISTRY)
    models_dir = MODELS_DIR
    if models_dir.exists():
        for child in models_dir.iterdir():
            if not child.is_dir():
                continue
            model_id = child.name
            if model_id in registry:
                continue
            model_files = sorted(child.glob("*.model"))
            if not model_files:
                continue
            registry[model_id] = {
                "id": model_id,
                "name": model_id,
                "model_type": "registered_model",
                "target_mode": "multiclass",
                "model_path": str(model_files[0]),
                "label_map_path": str(child / "label_map.json"),
                "model_card_path": str(child / "model_card.json"),
            }
    return registry


def model_card_path_for(model_id: str) -> Path:
    registry = discovered_model_registry()
    data = registry.get(model_id)
    if data and data.get("model_card_path"):
        return Path(data["model_card_path"])
    return MODELS_DIR / model_id / "model_card.json"


def write_model_card(model_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    path = model_card_path_for(model_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    current = _read_json(path) or {}
    if not current:
        metadata = discovered_model_registry().get(model_id) or {"id": model_id}
        current = {
            "model_id": model_id,
            "name": metadata.get("name") or model_id,
            "model_type": metadata.get("model_type"),
            "target_mode": metadata.get("target_mode"),
            "positive_label": metadata.get("positive_label"),
            "threshold": metadata.get("threshold"),
        }
    current.update({key: value for key, value in updates.items() if value is not None})
    current["model_id"] = model_id
    current = apply_registry_defaults(current)
    path.write_text(json.dumps(json_ready(current), ensure_ascii=False, indent=2), encoding="utf-8")
    return current


def registry_models() -> list[dict[str, Any]]:
    return [model_metadata(model_id) for model_id in discovered_model_registry()]


def active_model_for_task(task: str, exclude_model_id: str | None = None) -> dict[str, Any] | None:
    candidates = [
        item
        for item in registry_models()
        if item.get("task") == task and item.get("registry_status") == "active" and item.get("is_default_for_task") and item.get("model_id") != exclude_model_id
    ]
    if candidates:
        return candidates[0]
    candidates = [
        item
        for item in registry_models()
        if item.get("task") == task and item.get("registry_status") == "active" and item.get("model_id") != exclude_model_id
    ]
    return candidates[0] if candidates else None


def compare_against_active(model_card: dict[str, Any], active_model: dict[str, Any] | None) -> dict[str, Any] | None:
    if not active_model:
        return None
    candidate_ba = metric_balanced_accuracy(model_card)
    active_ba = metric_balanced_accuracy(active_model)
    improves = candidate_ba is not None and active_ba is not None and candidate_ba > active_ba
    return {
        "active_model_id": active_model.get("model_id") or active_model.get("id"),
        "active_balanced_accuracy": active_ba,
        "candidate_balanced_accuracy": candidate_ba,
        "metric": "balanced_accuracy",
        "improves_active": improves,
        "recommendation": "promote_candidate" if improves else "keep_active",
        "warning": None if improves else "Este modelo no supera al activo actual.",
    }


def registry_grouped() -> dict[str, Any]:
    tasks = {task: {"task": task, "label": label, "statuses": {status: [] for status in sorted(REGISTRY_STATUSES)}} for task, label in TASK_LABELS.items()}
    for model in registry_models():
        task = model.get("task") or "unknown"
        tasks.setdefault(task, {"task": task, "label": TASK_LABELS.get(task, task), "statuses": {status: [] for status in sorted(REGISTRY_STATUSES)}})
        status = model.get("registry_status") or "experimental"
        tasks[task]["statuses"].setdefault(status, []).append(model)
    return {"tasks": list(tasks.values())}


def set_model_registry_status(model_id: str, status: str, notes: str | None = None) -> dict[str, Any]:
    if status not in REGISTRY_STATUSES:
        raise HTTPException(status_code=400, detail="registry_status invalido.")
    metadata = model_metadata(model_id)
    updates: dict[str, Any] = {"registry_status": status}
    if status == "archived":
        updates["archived_at"] = now_iso()
        updates["is_default_for_task"] = False
    if status == "rejected":
        updates["rejected_at"] = now_iso()
        updates["is_default_for_task"] = False
    if notes is not None:
        updates["notes"] = notes
    write_model_card(model_id, updates)
    if metadata.get("is_default_for_task") and status in {"archived", "rejected"}:
        write_model_card(model_id, {"is_default_for_task": False})
    return model_metadata(model_id)


def promote_model(model_id: str, notes: str | None = None, force_promote_unreliable: bool = False) -> dict[str, Any]:
    target = model_metadata(model_id)
    task = target.get("task")
    if not task or task == "unknown":
        raise HTTPException(status_code=400, detail="No se puede promover un modelo sin task.")
    if model_is_unreliable(target) and not force_promote_unreliable:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "No promover: bajo rendimiento",
                "balanced_accuracy": metric_balanced_accuracy(target),
                "minimum_required": MIN_RELIABLE_BALANCED_ACCURACY,
                "force_field": "force_promote_unreliable",
            },
        )
    if task == "amphibian_genus":
        ba = metric_balanced_accuracy(target) or 0.0
        boana_recall = metric_boana_recall(target) or 0.0
        if ba < MIN_PROMOTION_BALANCED_ACCURACY or boana_recall < MIN_PROMOTION_BOANA_RECALL or has_genus_prediction_collapse(target):
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "No se permite promover genero: requiere BA >= 0.70, recall Boana >= 0.70 y sin colapso fuerte hacia Hyalinobatrachium/Atelopus.",
                    "balanced_accuracy": ba,
                    "boana_recall": boana_recall,
                    "prediction_collapse": has_genus_prediction_collapse(target),
                },
            )
    for model in registry_models():
        if model.get("task") == task and model.get("model_id") != model_id and model.get("is_default_for_task"):
            write_model_card(
                model["model_id"],
                {
                    "registry_status": "archived" if model.get("registry_status") == "active" else model.get("registry_status"),
                    "is_default_for_task": False,
                    "archived_at": now_iso() if model.get("registry_status") == "active" else model.get("archived_at"),
                },
            )
    write_model_card(
        model_id,
        {
            "registry_status": "active",
            "is_default_for_task": True,
            "promoted_at": now_iso(),
            "notes": notes if notes is not None else target.get("notes"),
        },
    )
    return model_metadata(model_id)


def job_dir(job_id: str) -> Path:
    return TRAINING_JOBS_DIR / job_id


def job_json_path(job_id: str) -> Path:
    return job_dir(job_id) / "job.json"


def job_log_path(job_id: str) -> Path:
    return job_dir(job_id) / "train.log"


def read_job(job_id: str) -> dict[str, Any]:
    path = job_json_path(job_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Training job no encontrado.")
    return json.loads(path.read_text(encoding="utf-8"))


def write_job(job: dict[str, Any]) -> None:
    path = job_json_path(job["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")


def list_jobs() -> list[dict[str, Any]]:
    if not TRAINING_JOBS_DIR.exists():
        return []
    jobs = []
    for path in TRAINING_JOBS_DIR.glob("*/job.json"):
        try:
            jobs.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue
    return sorted(jobs, key=lambda item: item.get("created_at", ""), reverse=True)


def append_log(job_id: str, message: str) -> None:
    path = job_log_path(job_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", errors="replace") as handle:
        handle.write(message.rstrip("\n") + "\n")


def validate_training_request(payload: TrainingJobRequest) -> dict[str, Any]:
    clean_path = safe_relative_path(payload.clean_manifest_csv, must_exist=True)
    rows = read_csv_rows(clean_path)
    summary = summarize_training_manifest(rows, payload.preset)
    if not rows:
        raise HTTPException(status_code=400, detail="Manifest limpio sin filas.")
    if not summary["minimums_ok"]:
        raise HTTPException(status_code=400, detail="Dataset insuficiente para entrenamiento: no cumple minimos por clase/split.")
    preset_data = TRAINING_PRESETS.get(payload.preset, {})
    min_rows = preset_data.get("min_rows_after") or 1
    if len(rows) < min_rows:
        raise HTTPException(status_code=400, detail="Dataset insuficiente para entrenamiento.")
    return {"clean_path": clean_path, "summary": summary}


def build_train_command(payload: TrainingJobRequest, dry_run: bool = False) -> list[str]:
    command = [
        sys.executable,
        "scripts/train_opensoundscape.py",
        "--manifest-csv",
        display_path(safe_relative_path(payload.clean_manifest_csv, must_exist=True)),
        "--output-dir",
        display_path(safe_relative_path(payload.output_dir, must_exist=False)),
        "--model-name",
        payload.model_name,
        "--target-mode",
        payload.target_mode,
        "--epochs",
        str(payload.epochs),
        "--batch-size",
        str(payload.batch_size),
        "--clip-duration",
        str(payload.clip_duration),
        "--sample-strategy",
        payload.sample_strategy,
        "--random-seed",
        str(payload.random_seed),
        "--device",
        payload.device,
    ]
    if payload.positive_label:
        command.extend(["--positive-label", payload.positive_label])
    if dry_run:
        command.append("--dry-run")
    return command


def run_training_worker(job_id: str) -> None:
    global ACTIVE_TRAINING_JOB_ID
    while True:
        with TRAINING_LOCK:
            if ACTIVE_TRAINING_JOB_ID is None:
                ACTIVE_TRAINING_JOB_ID = job_id
                break
        time.sleep(2)

    job = read_job(job_id)
    payload = TrainingJobRequest(**job["request"])
    job.update({"status": "running", "started_at": now_iso(), "progress": 0.05})
    write_job(job)
    append_log(job_id, f"[{now_iso()}] Job iniciado: {payload.job_name}")

    try:
        commands = []
        if payload.dry_run_first:
            commands.append(("dry-run", build_train_command(payload, dry_run=True)))
        commands.append(("train", build_train_command(payload, dry_run=False)))

        for label, command in commands:
            job = read_job(job_id)
            if job.get("status") == "canceled":
                append_log(job_id, f"[{now_iso()}] Job cancelado antes de {label}.")
                return
            append_log(job_id, f"[{now_iso()}] Ejecutando {label}: {' '.join(command)}")
            with job_log_path(job_id).open("a", encoding="utf-8", errors="replace") as log_handle:
                process = subprocess.Popen(
                    command,
                    cwd=str(ML_ROOT),
                    stdout=log_handle,
                    stderr=subprocess.STDOUT,
                    text=True,
                )
                TRAINING_PROCESSES[job_id] = process
                return_code = process.wait()
            TRAINING_PROCESSES.pop(job_id, None)
            if read_job(job_id).get("status") == "canceled":
                append_log(job_id, f"[{now_iso()}] {label} detenido por cancelacion.")
                return
            if return_code != 0:
                job = read_job(job_id)
                job.update({"status": "failed", "finished_at": now_iso(), "error": f"{label} fallo con codigo {return_code}", "progress": 1})
                write_job(job)
                append_log(job_id, f"[{now_iso()}] {label} fallo con codigo {return_code}.")
                return
            append_log(job_id, f"[{now_iso()}] {label} completado.")
            job = read_job(job_id)
            job["progress"] = 0.35 if label == "dry-run" else 0.95
            write_job(job)

        output_dir = safe_relative_path(payload.output_dir, must_exist=False)
        metrics_path = output_dir / "metrics.json"
        metrics = _read_json(metrics_path) if metrics_path.exists() else None
        job = read_job(job_id)
        job.update({"status": "completed", "finished_at": now_iso(), "progress": 1, "metrics": metrics})
        write_job(job)
        append_log(job_id, f"[{now_iso()}] Entrenamiento completado.")
    except Exception as exc:
        job = read_job(job_id)
        job.update({"status": "failed", "finished_at": now_iso(), "error": str(exc), "progress": 1})
        write_job(job)
        append_log(job_id, f"[{now_iso()}] Error: {exc}")
    finally:
        TRAINING_PROCESSES.pop(job_id, None)
        with TRAINING_LOCK:
            if ACTIVE_TRAINING_JOB_ID == job_id:
                ACTIVE_TRAINING_JOB_ID = None


def start_training_job(payload: TrainingJobRequest) -> dict[str, Any]:
    payload.dry_run_first = True
    validation = validate_training_request(payload)
    job_id = uuid.uuid4().hex
    job = {
        "id": job_id,
        "job_name": payload.job_name,
        "preset": payload.preset,
        "status": "queued",
        "progress": 0,
        "created_at": now_iso(),
        "request": payload.dict(),
        "manifest_summary": validation["summary"],
        "log_path": display_path(job_log_path(job_id)),
    }
    write_job(job)
    append_log(job_id, f"[{now_iso()}] Job creado en cola.")
    thread = threading.Thread(target=run_training_worker, args=(job_id,), daemon=True)
    thread.start()
    return job


def run_evaluation_for_job(job_id: str, payload: TrainingEvaluateRequest | None = None) -> dict[str, Any]:
    job = read_job(job_id)
    request = TrainingJobRequest(**job["request"])
    payload = payload or TrainingEvaluateRequest()
    model_path = safe_relative_path(
        payload.model_path or f"{request.output_dir}/{request.model_name}.model",
        must_exist=True,
    )
    manifest_csv = safe_relative_path(
        payload.manifest_csv or f"{request.output_dir}/test_manifest.csv",
        must_exist=True,
    )
    output_dir = safe_relative_path(
        payload.output_dir or f"{request.output_dir}_eval",
        must_exist=False,
    )
    command = [
        sys.executable,
        "scripts/evaluate_model.py",
        "--model-path",
        display_path(model_path),
        "--manifest-csv",
        display_path(manifest_csv),
        "--output-dir",
        display_path(output_dir),
        "--target-mode",
        payload.target_mode or request.target_mode,
    ]
    if payload.positive_label or request.positive_label:
        command.extend(["--positive-label", payload.positive_label or request.positive_label])
    if payload.threshold is not None:
        command.extend(["--threshold", str(payload.threshold)])
    append_log(job_id, f"[{now_iso()}] Evaluando: {' '.join(command)}")
    completed = subprocess.run(command, cwd=str(ML_ROOT), capture_output=True, text=True)
    append_log(job_id, completed.stdout or "")
    append_log(job_id, completed.stderr or "")
    if completed.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Evaluacion fallo con codigo {completed.returncode}.")
    metrics = _read_json(output_dir / "metrics.json")
    job["evaluation"] = {"output_dir": display_path(output_dir), "metrics": metrics, "completed_at": now_iso()}
    write_job(job)
    return job["evaluation"]


def json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def threshold_values(min_value: float, max_value: float, step: float) -> list[float]:
    if max_value < min_value:
        raise HTTPException(status_code=400, detail="threshold_max debe ser mayor o igual que threshold_min.")
    values = []
    current = min_value
    while current <= max_value + (step / 10):
        values.append(round(current, 10))
        current += step
    return values


def binary_threshold_metrics(y_true: list[bool], y_pred: list[bool], positive_label: str, threshold: float) -> dict[str, Any]:
    tp = sum(1 for truth, pred in zip(y_true, y_pred, strict=False) if truth and pred)
    fp = sum(1 for truth, pred in zip(y_true, y_pred, strict=False) if not truth and pred)
    tn = sum(1 for truth, pred in zip(y_true, y_pred, strict=False) if not truth and not pred)
    fn = sum(1 for truth, pred in zip(y_true, y_pred, strict=False) if truth and not pred)
    total = tp + fp + tn + fn
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    specificity = tn / (tn + fp) if tn + fp else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
    accuracy = (tp + tn) / total if total else 0.0
    return {
        "positive_class": positive_label,
        "threshold": float(threshold),
        "accuracy": accuracy,
        "balanced_accuracy": (recall + specificity) / 2,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "specificity": specificity,
        "tp": int(tp),
        "fp": int(fp),
        "tn": int(tn),
        "fn": int(fn),
        "predicted_positive": int(sum(y_pred)),
        "predicted_negative": int(total - sum(y_pred)),
        "rows": int(total),
    }


def calibrated_predictions(enriched: Any, positive_class: str, else_class: str, score_column: str, threshold: float) -> tuple[Any, dict[str, Any]]:
    output = enriched.copy()
    output["raw_argmax_label"] = output["predicted_label"].astype(str)
    output["calibrated_predicted_label"] = output[score_column].ge(float(threshold)).map(
        lambda value: positive_class if value else else_class
    )
    output["predicted_label"] = output["calibrated_predicted_label"]
    output["decision_rule_applied"] = True
    output["decision_rule_score"] = output[score_column].astype(float)
    output["correct_calibrated"] = output["true_label"].astype(str) == output["calibrated_predicted_label"].astype(str)
    y_true = output["true_label"].astype(str).eq(positive_class).tolist()
    y_pred = output["calibrated_predicted_label"].astype(str).eq(positive_class).tolist()
    metrics = binary_threshold_metrics(y_true, y_pred, positive_class, threshold)
    metrics["true_counts"] = output["true_label"].astype(str).value_counts().to_dict()
    metrics["prediction_counts"] = output["calibrated_predicted_label"].astype(str).value_counts().to_dict()
    metrics["raw_argmax_prediction_counts"] = output["raw_argmax_label"].astype(str).value_counts().to_dict()
    return output, metrics


def load_manifest_for_split(path: Path, preferred_splits: set[str]) -> Any:
    try:
        from ml_utils import read_training_manifest
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"No se pudieron cargar utilidades ML: {exc}") from exc
    df = read_training_manifest(path)
    if "split" in df.columns:
        selected = df[df["split"].isin(preferred_splits)].copy()
        return selected if not selected.empty else df.copy()
    return df.copy()


def prepare_prediction_scores(raw_scores: Any) -> Any:
    try:
        import pandas as pd
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falta dependencia ML pandas: {exc}") from exc
    raw = raw_scores.copy()
    if "Unnamed: 0" in raw.columns:
        raw = raw.rename(columns={"Unnamed: 0": "audio_path"})
    elif raw.index.name or not isinstance(raw.index, pd.RangeIndex):
        raw = raw.reset_index()
        raw = raw.rename(columns={raw.columns[0]: "audio_path"})
    if "audio_path" not in raw.columns:
        raw.insert(0, "audio_path", raw.index.astype(str))
    raw["audio_path"] = raw["audio_path"].astype(str)
    return raw


def normalize_manifest_audio_path(value: Any) -> str:
    return str(value or "").strip().replace("\\", "/").lower()


def score_columns(raw_scores: Any, manifest_columns: set[str]) -> list[str]:
    try:
        import pandas as pd
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falta dependencia ML pandas: {exc}") from exc
    reserved = {"audio_path", "true_label", "predicted_label", "confidence", "correct", "Unnamed: 0"}
    reserved.update(manifest_columns)
    return [
        str(column)
        for column in raw_scores.columns
        if column not in reserved and pd.api.types.is_numeric_dtype(raw_scores[column])
    ]


def softmax_frame(logits: Any) -> Any:
    try:
        import numpy as np
        import pandas as pd
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Faltan dependencias ML numpy/pandas: {exc}") from exc
    values = logits.to_numpy(dtype=float)
    shifted = values - np.max(values, axis=1, keepdims=True)
    exp_values = np.exp(shifted)
    probabilities = exp_values / np.sum(exp_values, axis=1, keepdims=True)
    return pd.DataFrame(probabilities, index=logits.index, columns=logits.columns)


def predict_multiclass_enriched(model: Any, manifest_df: Any) -> tuple[Any, list[str]]:
    try:
        import pandas as pd
        from ml_utils import predict_short_clips
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"No se pudieron cargar dependencias de prediccion: {exc}") from exc
    raw = prepare_prediction_scores(predict_short_clips(model, manifest_df["audio_path"].astype(str).tolist()))
    manifest = manifest_df.copy().reset_index(drop=True)
    manifest["audio_path"] = manifest["audio_path"].astype(str)
    manifest["audio_key"] = manifest["audio_path"].map(normalize_manifest_audio_path)
    raw["audio_key"] = raw["audio_path"].map(normalize_manifest_audio_path)
    class_cols = score_columns(raw, set(manifest.columns))
    joined = raw.merge(
        manifest[["audio_key", "normalized_label"]],
        on="audio_key",
        how="left",
        validate="one_to_one",
    )
    if joined["normalized_label"].isna().any() and len(joined) == len(manifest):
        joined["normalized_label"] = joined["normalized_label"].fillna(manifest["normalized_label"])
    logits = joined[class_cols].astype(float)
    probabilities = softmax_frame(logits)
    pred_labels = probabilities.idxmax(axis=1)
    confidence = probabilities.max(axis=1)
    enriched = pd.DataFrame(
        {
            "audio_path": joined["audio_path"].astype(str),
            "true_label": joined["normalized_label"].astype(str),
            "predicted_label": pred_labels.astype(str),
            "confidence": confidence.astype(float),
        }
    )
    enriched["correct"] = enriched["true_label"] == enriched["predicted_label"]
    for label in class_cols:
        enriched[f"logit_{label}"] = logits[label].astype(float)
        enriched[f"score_{label}"] = probabilities[label].astype(float)
    return enriched, class_cols


def calibrate_threshold_for_job(job_id: str, payload: ThresholdCalibrationRequest) -> dict[str, Any]:
    job = read_job(job_id)
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Solo se puede calibrar un job completado.")
    request = TrainingJobRequest(**job["request"])
    if request.target_mode != "multiclass":
        raise HTTPException(status_code=400, detail="La calibracion automatica aplica a clasificadores multiclass binarios.")

    score_column = payload.score_column or f"score_{payload.positive_class}"
    if not score_column.startswith("score_"):
        raise HTTPException(status_code=400, detail="score_column debe usar el formato score_<clase>.")
    if payload.metric != "balanced_accuracy":
        raise HTTPException(status_code=400, detail="Por ahora metric debe ser balanced_accuracy.")

    source_dir = safe_relative_path(request.output_dir, must_exist=True)
    model_path = source_dir / f"{request.model_name}.model"
    if not model_path.exists():
        candidates = sorted(source_dir.glob("*.model"))
        if not candidates:
            raise HTTPException(status_code=404, detail="No se encontro archivo .model para calibrar.")
        model_path = candidates[0]
    val_manifest = source_dir / "val_manifest.csv"
    test_manifest = source_dir / "test_manifest.csv"
    if not val_manifest.exists() or not test_manifest.exists():
        raise HTTPException(status_code=404, detail="El output del job debe tener val_manifest.csv y test_manifest.csv.")

    if import_opensoundscape_cnn is None:
        raise HTTPException(status_code=503, detail=f"No se pudo importar OpenSoundscape en el entorno ML: {ML_UTILS_IMPORT_ERROR}")

    try:
        _, load_model = import_opensoundscape_cnn()
        model = load_model(str(model_path))
        val_df = load_manifest_for_split(val_manifest, {"val", "validation"})
        test_df = load_manifest_for_split(test_manifest, {"test", "unassigned"})
        validation_scores, class_cols = predict_multiclass_enriched(model, val_df)
        test_scores, test_class_cols = predict_multiclass_enriched(model, test_df)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Calibracion fallo: {exc}") from exc

    classes = [str(label) for label in class_cols]
    if sorted(classes) != sorted(str(label) for label in test_class_cols):
        raise HTTPException(status_code=400, detail="Las clases de validacion y test no coinciden.")
    if len(classes) != 2:
        raise HTTPException(status_code=400, detail=f"Se esperaban exactamente dos clases, se recibieron: {classes}")
    if payload.positive_class not in classes:
        raise HTTPException(status_code=400, detail=f"positive_class no esta en el modelo: {classes}")
    if score_column not in validation_scores.columns or score_column not in test_scores.columns:
        raise HTTPException(status_code=400, detail=f"No existe la columna {score_column} en los scores del modelo.")

    else_class = [label for label in classes if label != payload.positive_class][0]
    thresholds = threshold_values(payload.threshold_min, payload.threshold_max, payload.threshold_step)
    y_true = validation_scores["true_label"].astype(str).eq(payload.positive_class).tolist()
    report_rows = []
    for threshold in thresholds:
        y_pred = validation_scores[score_column].ge(float(threshold)).tolist()
        row = binary_threshold_metrics(y_true, y_pred, payload.positive_class, threshold)
        report_rows.append(row)
    best = sorted(report_rows, key=lambda item: (item["balanced_accuracy"], item["f1"], item["recall"], item["precision"]), reverse=True)[0]
    best_threshold = float(best["threshold"])

    validation_predictions, validation_metrics = calibrated_predictions(
        validation_scores,
        payload.positive_class,
        else_class,
        score_column,
        best_threshold,
    )
    test_predictions, test_metrics = calibrated_predictions(
        test_scores,
        payload.positive_class,
        else_class,
        score_column,
        best_threshold,
    )
    decision_rule = {
        "positive_class": payload.positive_class,
        "score_column": score_column,
        "threshold": best_threshold,
        "if_score_gte_threshold": payload.positive_class,
        "else": else_class,
    }
    raw_argmax_metrics = (job.get("evaluation") or {}).get("metrics")
    summary = {
        "status": "calibrated",
        "model_id": request.model_name,
        "training_job_id": job_id,
        "metric": payload.metric,
        "classes": classes,
        "best_threshold": best_threshold,
        "positive_class": payload.positive_class,
        "score_column": score_column,
        "decision_rule": decision_rule,
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
        "raw_argmax_metrics": raw_argmax_metrics,
        "created_at": now_iso(),
    }

    try:
        import pandas as pd
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falta dependencia ML pandas: {exc}") from exc
    pd.DataFrame(report_rows).to_csv(source_dir / "calibration_report.csv", index=False)
    validation_predictions.to_csv(source_dir / "validation_calibrated_predictions.csv", index=False)
    test_predictions.to_csv(source_dir / "test_calibrated_predictions.csv", index=False)
    (source_dir / "calibration_summary.json").write_text(json.dumps(json_ready(summary), ensure_ascii=False, indent=2), encoding="utf-8")
    (source_dir / "test_calibrated_metrics.json").write_text(json.dumps(json_ready(test_metrics), ensure_ascii=False, indent=2), encoding="utf-8")

    job["calibration"] = {
        "output_dir": display_path(source_dir),
        "summary_path": display_path(source_dir / "calibration_summary.json"),
        "best_threshold": best_threshold,
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
        "decision_rule": decision_rule,
        "completed_at": now_iso(),
    }
    write_job(json_ready(job))
    append_log(job_id, f"[{now_iso()}] Calibracion threshold completada: {score_column} >= {best_threshold:.2f} => {payload.positive_class}.")
    return {
        "best_threshold": best_threshold,
        "validation_metrics": json_ready(validation_metrics),
        "test_metrics": json_ready(test_metrics),
        "decision_rule": decision_rule,
    }


def register_job_model(job_id: str, payload: RegisterModelRequest | None = None) -> dict[str, Any]:
    job = read_job(job_id)
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Solo se puede registrar un job completado.")
    request = TrainingJobRequest(**job["request"])
    payload = payload or RegisterModelRequest()
    model_id = payload.model_id or request.model_name
    source_dir = safe_relative_path(request.output_dir, must_exist=True)
    model_path = source_dir / f"{request.model_name}.model"
    if not model_path.exists():
        candidates = sorted(source_dir.glob("*.model"))
        if not candidates:
            raise HTTPException(status_code=404, detail="No se encontro archivo .model para registrar.")
        model_path = candidates[0]
    target_dir = MODELS_DIR / model_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target_model = target_dir / f"{model_id}.model"
    shutil.copy2(model_path, target_model)
    label_map = source_dir / "label_map.json"
    if label_map.exists():
        shutil.copy2(label_map, target_dir / "label_map.json")
    metrics = _read_json(source_dir / "metrics.json")
    calibration_summary = _read_json(source_dir / "calibration_summary.json")
    test_calibrated_metrics = _read_json(source_dir / "test_calibrated_metrics.json")
    raw_argmax_metrics = (job.get("evaluation") or {}).get("metrics")
    if not raw_argmax_metrics:
        raw_argmax_metrics = _read_json(safe_relative_path(f"{request.output_dir}_eval", must_exist=False) / "metrics.json")
    decision_rule = payload.decision_rule
    uses_calibrated_decision_rule = False
    if calibration_summary and calibration_summary.get("decision_rule"):
        decision_rule = calibration_summary["decision_rule"]
        test_calibrated_metrics = test_calibrated_metrics or calibration_summary.get("test_metrics")
        uses_calibrated_decision_rule = True
    for artifact_name in [
        "calibration_report.csv",
        "calibration_summary.json",
        "test_calibrated_metrics.json",
        "test_calibrated_predictions.csv",
    ]:
        artifact_path = source_dir / artifact_name
        if artifact_path.exists():
            shutil.copy2(artifact_path, target_dir / artifact_name)
    task = payload.task or TRAINING_PRESETS.get(request.preset, {}).get("id") or request.preset or infer_task({"model_id": model_id})
    active_model = active_model_for_task(task, exclude_model_id=model_id)
    provisional_card = {
        "metrics": metrics,
        "raw_argmax_metrics": raw_argmax_metrics,
        "calibration": calibration_summary,
        "calibrated_metrics": test_calibrated_metrics,
    }
    comparison = compare_against_active({**provisional_card, "model_id": model_id, "task": task}, active_model)
    registry_status = "experimental" if active_model else "active"
    is_default_for_task = not bool(active_model)
    notes = payload.notes
    if comparison and not comparison.get("improves_active"):
        notes = notes or comparison.get("warning")
    card = {
        "model_id": model_id,
        "name": payload.model_name or request.model_name,
        "model_type": payload.model_type or TRAINING_PRESETS.get(request.preset, {}).get("model_type") or ("binary_presence_detector" if request.target_mode == "binary_presence" else "specialized_species_classifier"),
        "target_mode": payload.target_mode or request.target_mode,
        "positive_label": payload.positive_label or request.positive_label or (calibration_summary or {}).get("positive_class"),
        "threshold": (decision_rule or {}).get("threshold", payload.threshold),
        "decision_rule": decision_rule,
        "uses_calibrated_decision_rule": uses_calibrated_decision_rule,
        "registry_status": registry_status,
        "task": task,
        "is_default_for_task": is_default_for_task,
        "parent_model_id": payload.parent_model_id or (active_model or {}).get("model_id"),
        "training_job_id": job_id,
        "training_manifest": request.clean_manifest_csv,
        "source_output_dir": request.output_dir,
        "registered_at": now_iso(),
        "promoted_at": now_iso() if is_default_for_task else None,
        "archived_at": None,
        "notes": notes,
        "comparison_against_active": comparison,
        "warnings": [comparison["warning"]] if comparison and comparison.get("warning") else [],
        "metrics": metrics,
        "raw_argmax_metrics": raw_argmax_metrics,
        "calibration": calibration_summary,
        "calibrated_metrics": test_calibrated_metrics,
    }
    (target_dir / "model_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    MODEL_CACHE.pop(model_id, None)
    return model_metadata(model_id) if model_id in MODEL_REGISTRY else _merge_model_card({
        "id": model_id,
        "model_id": model_id,
        "name": card["name"],
        "model_type": card["model_type"],
        "target_mode": card["target_mode"],
        "positive_label": card["positive_label"],
        "threshold": card["threshold"],
        "model_path": str(target_model),
        "label_map_path": str(target_dir / "label_map.json"),
        "model_card_path": str(target_dir / "model_card.json"),
    })


def get_model(model_id: str):
    if model_id in MODEL_CACHE:
        return MODEL_CACHE[model_id]

    if import_opensoundscape_cnn is None:
        raise HTTPException(
            status_code=503,
            detail=f"No se pudo importar OpenSoundscape en el entorno ML: {ML_UTILS_IMPORT_ERROR}",
        )

    metadata = model_metadata(model_id)
    model_path = Path(metadata["model_path"])
    if not model_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Modelo no descargado: {model_id}. Descarga el paquete de modelos o configura ACUSTICAFAUNA_MODELS_DIR.",
        )

    try:
        _, load_model = import_opensoundscape_cnn()
        model = load_model(str(model_path))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"No fue posible cargar el modelo ML: {exc}") from exc

    MODEL_CACHE[model_id] = model
    return model


def validate_audio_file(audio_path: str) -> Path:
    path = Path(audio_path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Archivo de audio no encontrado.")
    return path


def audio_duration(audio_path: Path) -> float:
    try:
        import soundfile as sf
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falta dependencia ML soundfile: {exc}") from exc

    try:
        info = sf.info(str(audio_path))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No fue posible leer el audio: {exc}") from exc
    return float(info.frames / info.samplerate) if info.samplerate else 0.0


def build_windows(
    duration: float,
    clip_duration: float,
    step_seconds: float,
    start_seconds: float | None = None,
    end_seconds: float | None = None,
) -> list[tuple[float, float]]:
    start = max(0.0, float(start_seconds or 0.0))
    stop = min(duration, float(end_seconds)) if end_seconds is not None else duration
    if stop <= start:
        raise HTTPException(status_code=400, detail="El fragmento seleccionado no tiene duracion valida.")

    windows: list[tuple[float, float]] = []
    cursor = start
    while cursor < stop:
        end = min(cursor + clip_duration, stop)
        windows.append((round(cursor, 4), round(end, 4)))
        cursor += step_seconds
        if step_seconds <= 0:
            break
    return windows or [(start, stop)]


def write_temp_clip(audio_path: Path, start_seconds: float, end_seconds: float, clip_duration: float, tmp_dir: Path) -> Path:
    try:
        import numpy as np
        import soundfile as sf
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Faltan dependencias ML para audio: {exc}") from exc

    info = sf.info(str(audio_path))
    sample_rate = int(info.samplerate)
    start_frame = max(0, int(start_seconds * sample_rate))
    end_frame = max(start_frame + 1, int(end_seconds * sample_rate))
    data, _ = sf.read(str(audio_path), start=start_frame, stop=end_frame, always_2d=True)

    target_frames = max(1, int(clip_duration * sample_rate))
    if len(data) < target_frames:
        padding = np.zeros((target_frames - len(data), data.shape[1]), dtype=data.dtype)
        data = np.vstack([data, padding])

    output_path = tmp_dir / f"clip_{len(list(tmp_dir.iterdir())):05d}.wav"
    sf.write(str(output_path), data, sample_rate)
    return output_path


def predict_scores(model, clip_paths: list[Path]) -> Any:
    try:
        return model.predict([str(path) for path in clip_paths], split_files_into_clips=False)
    except TypeError:
        return model.predict([str(path) for path in clip_paths])


def score_for_row(scores: Any, row_index: int, positive_label: str) -> float:
    try:
        import numpy as np
    except Exception:
        np = None

    if hasattr(scores, "iloc"):
        row = scores.iloc[row_index]
        if positive_label in getattr(scores, "columns", []):
            return float(row[positive_label])
        return float(row.max())
    if np is not None and isinstance(scores, np.ndarray):
        return float(scores[row_index].max())
    value = scores[row_index]
    return float(value.max() if hasattr(value, "max") else value)


def _softmax(values: list[float]) -> list[float]:
    try:
        import numpy as np
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falta dependencia ML numpy: {exc}") from exc

    array = np.asarray(values, dtype=float)
    shifted = array - np.max(array)
    exp_values = np.exp(shifted)
    probs = exp_values / np.sum(exp_values)
    return [float(value) for value in probs]


def raw_score_map_for_row(scores: Any, row_index: int, classes: list[str]) -> dict[str, float]:
    if hasattr(scores, "iloc"):
        row = scores.iloc[row_index]
        available_columns = [str(column) for column in getattr(scores, "columns", [])]
        selected_classes = classes or available_columns
        return {
            label: float(row[label])
            for label in selected_classes
            if label in available_columns
        }

    try:
        import numpy as np
    except Exception:
        np = None

    row_values = scores[row_index]
    if np is not None:
        row_values = np.asarray(row_values, dtype=float).reshape(-1).tolist()
    elif not isinstance(row_values, list):
        row_values = [float(row_values)]

    selected_classes = classes or [f"class_{index}" for index in range(len(row_values))]
    return {
        label: float(value)
        for label, value in zip(selected_classes, row_values, strict=False)
    }


def normalized_class_scores(raw_scores: dict[str, float], target_mode: str) -> dict[str, float]:
    if target_mode == "binary_presence":
        return dict(raw_scores)
    labels = list(raw_scores.keys())
    probabilities = _softmax([raw_scores[label] for label in labels])
    return {label: probability for label, probability in zip(labels, probabilities, strict=False)}


def argmax_label(score_map: dict[str, float]) -> str | None:
    if not score_map:
        return None
    return max(score_map.items(), key=lambda item: item[1])[0]


def apply_decision_rule(
    decision_rule: dict[str, Any] | None,
    score_map: dict[str, float],
    fallback_label: str | None,
) -> tuple[str | None, bool, float | None]:
    if not decision_rule:
        return fallback_label, False, None

    score_column = str(decision_rule.get("score_column") or "")
    score_label = score_column.replace("score_", "", 1) if score_column.startswith("score_") else score_column
    threshold = decision_rule.get("threshold")
    if not score_label or threshold is None or score_label not in score_map:
        return fallback_label, False, None

    score_value = float(score_map[score_label])
    predicted = (
        decision_rule.get("if_score_gte_threshold")
        if score_value >= float(threshold)
        else decision_rule.get("else")
    )
    return str(predicted or fallback_label), True, score_value


def summarize_segments(segments: list[dict[str, Any]], positive_label: str) -> dict[str, Any]:
    try:
        import numpy as np
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falta dependencia ML numpy: {exc}") from exc

    scores = [float(segment[f"score_{positive_label}"]) for segment in segments]
    detected_segments = [segment for segment in segments if segment["detected"]]
    return {
        "detected_segments": len(detected_segments),
        f"max_score_{positive_label}": max(scores) if scores else 0.0,
        f"mean_score_{positive_label}": float(np.mean(scores)) if scores else 0.0,
        "detected": bool(detected_segments),
    }


def summarize_multiclass_segments(segments: list[dict[str, Any]], classes: list[str]) -> dict[str, Any]:
    if not segments:
        return {"segments": 0}
    predicted_counts: dict[str, int] = {}
    for segment in segments:
        label = segment.get("predicted_label") or "sin_prediccion"
        predicted_counts[label] = predicted_counts.get(label, 0) + 1
    score_summary: dict[str, float] = {}
    for label in classes:
        values = [float(segment.get(f"score_{label}", 0.0)) for segment in segments]
        if values:
            score_summary[f"max_score_{label}"] = max(values)
            score_summary[f"mean_score_{label}"] = sum(values) / len(values)
    return {
        "segments": len(segments),
        "predicted_counts": predicted_counts,
        "top_label": max(predicted_counts.items(), key=lambda item: item[1])[0],
        **score_summary,
    }


def run_prediction(payload: PredictAudioPathRequest) -> dict[str, Any]:
    metadata = model_metadata(payload.model_id)
    target_mode = payload.target_mode or metadata.get("target_mode") or "binary_presence"
    if metadata.get("decision_rule"):
        target_mode = metadata.get("target_mode") or "multiclass"
    threshold = float(metadata.get("threshold", payload.threshold) if metadata.get("decision_rule") else payload.threshold)
    positive_label = payload.positive_label or metadata.get("positive_label") or DEFAULT_POSITIVE_LABEL
    classes = [str(label) for label in metadata.get("classes", [])]
    audio_path = validate_audio_file(payload.audio_path)
    duration = audio_duration(audio_path)
    windows = build_windows(
        duration,
        payload.clip_duration,
        payload.step_seconds,
        payload.start_seconds,
        payload.end_seconds,
    )
    model = get_model(payload.model_id)

    with tempfile.TemporaryDirectory(prefix="acusticafauna_ml_clips_") as tmp:
        tmp_dir = Path(tmp)
        clip_paths = [
            write_temp_clip(audio_path, start, end, payload.clip_duration, tmp_dir)
            for start, end in windows
        ]
        scores = predict_scores(model, clip_paths)

    segments: list[dict[str, Any]] = []
    for index, (start, end) in enumerate(windows):
        if metadata.get("decision_rule"):
            raw_scores = raw_score_map_for_row(scores, index, classes)
            class_scores = normalized_class_scores(raw_scores, target_mode)
            raw_argmax = argmax_label(class_scores)
            predicted_label, rule_applied, rule_score = apply_decision_rule(
                metadata.get("decision_rule"),
                class_scores,
                raw_argmax,
            )
            confidence = class_scores.get(predicted_label, rule_score or 0.0) if predicted_label else 0.0
            segment = {
                "start_seconds": start,
                "end_seconds": end,
                "predicted_label": predicted_label,
                "raw_argmax_label": raw_argmax,
                "decision_rule_applied": rule_applied,
                "decision_rule_score": rule_score,
                "confidence": confidence,
                "detected": True,
            }
            for label, value in class_scores.items():
                segment[f"score_{label}"] = value
            segments.append(segment)
        elif target_mode == "multiclass":
            raw_scores = raw_score_map_for_row(scores, index, classes)
            class_scores = normalized_class_scores(raw_scores, target_mode)
            predicted_label = argmax_label(class_scores)
            confidence = class_scores.get(predicted_label, 0.0) if predicted_label else 0.0
            segment = {
                "start_seconds": start,
                "end_seconds": end,
                "predicted_label": predicted_label,
                "raw_argmax_label": predicted_label,
                "decision_rule_applied": False,
                "confidence": confidence,
                "detected": True,
            }
            for label, value in class_scores.items():
                segment[f"score_{label}"] = value
            segments.append(segment)
        else:
            score = score_for_row(scores, index, positive_label)
            detected = score >= threshold
            segments.append(
                {
                    "start_seconds": start,
                    "end_seconds": end,
                    f"score_{positive_label}": score,
                    "predicted_label": positive_label if detected else f"no_{positive_label}",
                    "detected": detected,
                    "confidence": score if detected else 1.0 - score,
                }
            )

    return {
        "audio_path": str(audio_path),
        "model_id": payload.model_id,
        "target_mode": target_mode,
        "model_type": metadata.get("model_type"),
        "classes": classes,
        "positive_label": positive_label if target_mode == "binary_presence" else None,
        "threshold": threshold,
        "decision_rule": metadata.get("decision_rule"),
        "decision_rule_applied": bool(metadata.get("decision_rule")),
        "duration_seconds": duration,
        "segments": segments,
        "summary": (
            summarize_multiclass_segments(segments, classes)
            if metadata.get("decision_rule") or target_mode == "multiclass"
            else summarize_segments(segments, positive_label)
        ),
    }


class IdentifyAudioPathRequest(BaseModel):
    audio_path: str
    start_seconds: float | None = Field(default=None, ge=0)
    end_seconds: float | None = Field(default=None, gt=0)
    processed_audio_path: str | None = None
    use_experimental_models: bool = False
    return_stage_details: bool = True


def default_model_for_task(task: str, use_experimental: bool = False) -> dict[str, Any] | None:
    models = [item for item in registry_models() if item.get("task") == task]
    active_defaults = [item for item in models if item.get("registry_status") == "active" and item.get("is_default_for_task")]
    if active_defaults:
        return active_defaults[0]
    active = [item for item in models if item.get("registry_status") == "active"]
    if active:
        return active[0]
    if use_experimental:
        experimental_defaults = [
            item
            for item in models
            if item.get("registry_status") == "experimental" and item.get("is_default_for_task")
        ]
        if experimental_defaults:
            return experimental_defaults[0]
        experimental = [item for item in models if item.get("registry_status") == "experimental"]
        if experimental:
            return experimental[0]
    return None


def prediction_payload_for_model(
    model: dict[str, Any],
    audio_path: str,
    request: IdentifyAudioPathRequest,
) -> PredictAudioPathRequest:
    return PredictAudioPathRequest(
        audio_path=audio_path,
        model_id=str(model.get("model_id") or model.get("id")),
        target_mode=str(model.get("target_mode") or "binary_presence"),
        positive_label=str(model.get("positive_label") or DEFAULT_POSITIVE_LABEL),
        threshold=float(model.get("threshold") or DEFAULT_THRESHOLD),
        clip_duration=float(model.get("clip_duration") or 5),
        step_seconds=float(model.get("step_seconds") or model.get("clip_duration") or 5),
        start_seconds=request.start_seconds,
        end_seconds=request.end_seconds,
    )


def max_segment_score(prediction: dict[str, Any], label: str) -> float | None:
    key = f"score_{label}"
    values = [segment.get(key) for segment in prediction.get("segments", []) if segment.get(key) is not None]
    if not values:
        return None
    return max(float(value) for value in values)


def top_k_from_prediction(prediction: dict[str, Any], labels: list[str], k: int = 5) -> list[dict[str, Any]]:
    rows = []
    for label in labels:
        score = max_segment_score(prediction, label)
        if score is not None:
            rows.append({"label": label, "score": score})
    return sorted(rows, key=lambda item: item["score"], reverse=True)[:k]


def confidence_level(score: float | None) -> str:
    if score is None:
        return "revisar"
    if score >= 0.8:
        return "alta"
    if score >= 0.55:
        return "media"
    if score >= 0.3:
        return "baja"
    return "revisar"


def genus_from_label(label: str | None) -> str | None:
    if not label:
        return None
    normalized = str(label).replace(" ", "_")
    return normalized.split("_", 1)[0] if normalized else None


def stage_from_prediction(stage: str, model: dict[str, Any], prediction: dict[str, Any], label: str | None = None) -> dict[str, Any]:
    classes = [str(item) for item in prediction.get("classes") or model.get("classes") or []]
    top_label = label or prediction.get("summary", {}).get("top_label")
    score = max_segment_score(prediction, top_label) if top_label else None
    if score is None and stage == "frog_detector":
        score = prediction.get("summary", {}).get(f"max_score_{DEFAULT_POSITIVE_LABEL}")
    segment = prediction.get("segments", [{}])[0] if prediction.get("segments") else {}
    return {
        "stage": stage,
        "model_id": prediction.get("model_id") or model.get("model_id"),
        "model_name": model.get("name"),
        "task": model.get("task"),
        "registry_status": model.get("registry_status"),
        "is_default_for_task": model.get("is_default_for_task"),
        "balanced_accuracy": metric_balanced_accuracy(model),
        "is_reliable": not model_is_unreliable(model),
        "reliability_warnings": model_reliability_warnings(model),
        "predicted_label": top_label,
        "score": score,
        "threshold": prediction.get("threshold"),
        "raw_argmax_label": segment.get("raw_argmax_label"),
        "decision_rule_applied": bool(segment.get("decision_rule_applied") or prediction.get("decision_rule_applied")),
        "score_used": segment.get("decision_rule_score") if segment.get("decision_rule_score") is not None else score,
        "top_k": top_k_from_prediction(prediction, classes),
        "summary": prediction.get("summary", {}),
    }


def identify_audio_path(payload: IdentifyAudioPathRequest) -> dict[str, Any]:
    audio_path = payload.processed_audio_path or payload.audio_path
    warnings: list[str] = []
    stages: list[dict[str, Any]] = []
    model_ids: list[str] = []
    if payload.use_experimental_models:
        warnings.append("Se permitio usar modelos experimentales en la identificacion.")

    frog_model = default_model_for_task("frog_detector", payload.use_experimental_models)
    if not frog_model:
        raise HTTPException(status_code=503, detail="No hay detector rana/sapo registrado para identificacion automatica.")
    frog_prediction = run_prediction(prediction_payload_for_model(frog_model, audio_path, payload))
    frog_score = frog_prediction.get("summary", {}).get(f"max_score_{DEFAULT_POSITIVE_LABEL}")
    frog_threshold = float(frog_prediction.get("threshold") or frog_model.get("threshold") or DEFAULT_THRESHOLD)
    stages.append(stage_from_prediction("frog_detector", frog_model, frog_prediction, DEFAULT_POSITIVE_LABEL))
    model_ids.append(str(frog_model.get("model_id") or frog_model.get("id")))

    if frog_score is None or float(frog_score) < frog_threshold:
        return {
            "audio_path": payload.audio_path,
            "processed_audio_path": payload.processed_audio_path,
            "final_label": "no_rana_sapo",
            "final_level": "no_rana",
            "confidence": 1.0 - float(frog_score or 0.0),
            "confidence_level": confidence_level(1.0 - float(frog_score or 0.0)),
            "stage": "frog_detector",
            "stages": stages if payload.return_stage_details else [],
            "model_ids": model_ids,
            "recommendation": "no_species_classification",
            "warnings": warnings,
        }

    genus_model = default_model_for_task("amphibian_genus", payload.use_experimental_models)
    if not genus_model:
        warnings.append("No hay clasificador de género activo registrado.")
        return {
            "audio_path": payload.audio_path,
            "processed_audio_path": payload.processed_audio_path,
            "final_label": DEFAULT_POSITIVE_LABEL,
            "final_level": "rana",
            "confidence": float(frog_score),
            "confidence_level": confidence_level(float(frog_score)),
            "stage": "frog_detector",
            "stages": stages if payload.return_stage_details else [],
            "model_ids": model_ids,
            "recommendation": "requires_genus_classifier",
            "message": "No hay clasificador de género activo registrado.",
            "warnings": warnings,
        }

    genus_prediction = run_prediction(prediction_payload_for_model(genus_model, audio_path, payload))
    genus_label = genus_prediction.get("summary", {}).get("top_label")
    genus_score = max_segment_score(genus_prediction, genus_label) if genus_label else None
    genus = genus_from_label(genus_label)
    stages.append(stage_from_prediction("genus_classifier", genus_model, genus_prediction, genus_label))
    model_ids.append(str(genus_model.get("model_id") or genus_model.get("id")))
    if model_is_unreliable(genus_model):
        warnings.extend(model_reliability_warnings(genus_model))
        return {
            "audio_path": payload.audio_path,
            "processed_audio_path": payload.processed_audio_path,
            "final_label": DEFAULT_POSITIVE_LABEL,
            "final_level": "rana",
            "confidence": float(frog_score),
            "confidence_level": "baja",
            "stage": "genus_classifier",
            "genus_label": genus_label,
            "species_label": None,
            "top_k": stages[-1].get("top_k", []),
            "stages": stages if payload.return_stage_details else [],
            "model_ids": model_ids,
            "recommendation": "requires_review",
            "message": "Score alto no implica confianza: el modelo tiene bajo rendimiento historico.",
            "warnings": warnings,
        }

    if genus != "Boana":
        return {
            "audio_path": payload.audio_path,
            "processed_audio_path": payload.processed_audio_path,
            "final_label": genus_label or DEFAULT_POSITIVE_LABEL,
            "final_level": "genus" if genus_label else "rana",
            "confidence": genus_score,
            "confidence_level": confidence_level(genus_score),
            "stage": "genus_classifier",
            "genus_label": genus_label,
            "species_label": None,
            "top_k": stages[-1].get("top_k", []),
            "stages": stages if payload.return_stage_details else [],
            "model_ids": model_ids,
            "recommendation": "requires_review_or_specialized_model",
            "warnings": warnings,
        }

    boana_model = default_model_for_task("boana_boans_pugnax", payload.use_experimental_models)
    if not boana_model:
        warnings.append("No hay clasificador especializado activo para Boana.")
        return {
            "audio_path": payload.audio_path,
            "processed_audio_path": payload.processed_audio_path,
            "final_label": genus_label,
            "final_level": "genus",
            "confidence": genus_score,
            "confidence_level": confidence_level(genus_score),
            "stage": "genus_classifier",
            "genus_label": genus_label,
            "species_label": None,
            "stages": stages if payload.return_stage_details else [],
            "model_ids": model_ids,
            "recommendation": "requires_review_or_specialized_model",
            "warnings": warnings,
        }

    species_prediction = run_prediction(prediction_payload_for_model(boana_model, audio_path, payload))
    species_label = species_prediction.get("summary", {}).get("top_label")
    if not species_label and species_prediction.get("segments"):
        species_label = species_prediction["segments"][0].get("predicted_label")
    species_stage = stage_from_prediction("specialized_species", boana_model, species_prediction, species_label)
    stages.append(species_stage)
    model_ids.append(str(boana_model.get("model_id") or boana_model.get("id")))
    species_score = species_stage.get("score_used") or species_stage.get("score")

    return {
        "audio_path": payload.audio_path,
        "processed_audio_path": payload.processed_audio_path,
        "final_label": species_label or genus_label,
        "final_level": "species" if species_label else "genus",
        "confidence": species_score,
        "confidence_level": confidence_level(species_score),
        "stage": "specialized_species",
        "genus_label": genus_label,
        "species_label": species_label,
        "raw_argmax_label": species_stage.get("raw_argmax_label"),
        "decision_rule_applied": species_stage.get("decision_rule_applied"),
        "score_used": species_stage.get("score_used"),
        "threshold": species_stage.get("threshold"),
        "model_id": species_stage.get("model_id"),
        "stages": stages if payload.return_stage_details else [],
        "model_ids": model_ids,
        "recommendation": "requires_review",
        "warnings": warnings,
    }


def read_audio_slice(audio_path: Path, start_seconds: float, end_seconds: float | None) -> tuple[np.ndarray, int, float, float]:
    try:
        import numpy as np
        import soundfile as sf
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Faltan dependencias ML para audio: {exc}") from exc

    info = sf.info(str(audio_path))
    duration = float(info.frames / info.samplerate) if info.samplerate else 0.0
    start = max(0.0, start_seconds)
    stop = min(duration, end_seconds) if end_seconds is not None else duration
    if stop <= start:
        raise HTTPException(status_code=400, detail="El rango para espectrograma no tiene duracion valida.")

    start_frame = int(start * info.samplerate)
    stop_frame = int(stop * info.samplerate)
    data, sample_rate = sf.read(str(audio_path), start=start_frame, stop=stop_frame, always_2d=True)
    mono = data.mean(axis=1)
    return mono, int(sample_rate), start, stop


def generate_spectrogram_png(payload: SpectrogramAudioPathRequest) -> bytes:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falta dependencia ML matplotlib: {exc}") from exc

    audio_path = validate_audio_file(payload.audio_path)
    data, sample_rate, start, stop = read_audio_slice(audio_path, payload.start_seconds, payload.end_seconds)
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="No hay muestras para generar espectrograma.")

    fig, ax = plt.subplots(figsize=(12, 4), dpi=140)
    nfft = 1024 if sample_rate >= 16000 else 512
    noverlap = int(nfft * 0.75)
    _, _, _, image = ax.specgram(data, NFFT=nfft, Fs=sample_rate, noverlap=noverlap, cmap="magma")
    ax.set_ylim(0, min(payload.max_freq, sample_rate / 2))
    ax.set_xlabel("Tiempo (s)")
    ax.set_ylabel("Frecuencia (Hz)")
    ax.set_title(f"Espectrograma {start:.2f}s - {stop:.2f}s")
    fig.colorbar(image, ax=ax, label="Intensidad (dB)")
    fig.tight_layout()

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png")
    plt.close(fig)
    return buffer.getvalue()


@router.get("/health")
def health():
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "models_available": len(discovered_model_registry()),
        "training_jobs_enabled": True,
        "models_loaded": sorted(MODEL_CACHE.keys()),
    }


@router.get("/system/hardware-profile")
def system_hardware_profile():
    return {
        **hardware_profile(),
        "paths": {
            "ml_root": str(ML_ROOT),
            "models_dir": str(MODELS_DIR),
            "manifests_dir": str(MANIFESTS_DIR),
            "outputs_dir": str(OUTPUTS_DIR),
            "ml_runs_dir": str(ML_RUNS_DIR),
        },
    }


@router.get("/models")
def models():
    return {"items": [model_metadata(model_id) for model_id in discovered_model_registry()]}


@router.get("/models/registry")
def models_registry():
    return registry_grouped()


@router.post("/models/{model_id}/promote")
def promote_registry_model(model_id: str, payload: ModelRegistryActionRequest | None = None):
    request = payload or ModelRegistryActionRequest()
    return promote_model(model_id, request.notes, request.force_promote_unreliable)


@router.post("/models/{model_id}/archive")
def archive_registry_model(model_id: str, payload: ModelRegistryActionRequest | None = None):
    return set_model_registry_status(model_id, "archived", (payload or ModelRegistryActionRequest()).notes)


@router.post("/models/{model_id}/reject")
def reject_registry_model(model_id: str, payload: ModelRegistryActionRequest | None = None):
    return set_model_registry_status(model_id, "rejected", (payload or ModelRegistryActionRequest()).notes)


@router.patch("/models/{model_id}/notes")
def patch_model_notes(model_id: str, payload: ModelNotesRequest):
    write_model_card(model_id, {"notes": payload.notes})
    return model_metadata(model_id)


@router.post("/predict/audio-path")
def predict_audio_path(payload: PredictAudioPathRequest):
    return run_prediction(payload)


@router.post("/identify/audio-path")
def identify_audio_path_endpoint(payload: IdentifyAudioPathRequest):
    return identify_audio_path(payload)


@router.post("/predict/upload")
async def predict_upload(
    file: UploadFile = File(...),
    model_id: str = Form(DEFAULT_MODEL_ID),
    target_mode: str = Form("binary_presence"),
    positive_label: str = Form(DEFAULT_POSITIVE_LABEL),
    threshold: float = Form(DEFAULT_THRESHOLD),
    clip_duration: float = Form(5),
    step_seconds: float = Form(5),
    start_seconds: float | None = Form(None),
    end_seconds: float | None = Form(None),
):
    ensure_tmp_dirs()
    cleanup_old_uploads()
    suffix = Path(file.filename or "upload.wav").suffix or ".wav"
    upload_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    with upload_path.open("wb") as output:
        shutil.copyfileobj(file.file, output)

    payload = PredictAudioPathRequest(
        audio_path=str(upload_path),
        model_id=model_id,
        target_mode=target_mode,
        positive_label=positive_label,
        threshold=threshold,
        clip_duration=clip_duration,
        step_seconds=step_seconds,
        start_seconds=start_seconds,
        end_seconds=end_seconds,
    )
    result = run_prediction(payload)
    result["uploaded_temp_file"] = str(upload_path)
    return result


@router.post("/spectrogram/audio-path")
def spectrogram_audio_path(payload: SpectrogramAudioPathRequest):
    png_bytes = generate_spectrogram_png(payload)
    return Response(content=png_bytes, media_type="image/png")


@router.get("/training/presets")
def training_presets():
    return {"items": list(TRAINING_PRESETS.values())}


@router.get("/training/manifests")
def training_manifests():
    items = []
    manifests_dir = MANIFESTS_DIR
    if manifests_dir.exists():
        for path in sorted(manifests_dir.rglob("*.csv")):
            items.append({"path": display_path(path), "name": path.name, "size_bytes": path.stat().st_size})
    return {"items": items}


@router.get("/training/manifest-summary")
def training_manifest_summary(manifest_csv: str):
    return summarize_manifest_file(manifest_csv)


@router.get("/training/manifest-candidates")
def training_manifest_candidates(manifest_csv: str):
    manifest_path = safe_relative_path(manifest_csv, must_exist=True)
    rows = read_csv_rows(manifest_path)
    return {"manifest_csv": display_path(manifest_path), "candidates": manifest_candidates_for_rows(rows)}


@router.post("/training/clean-manifest/dry-run")
def training_clean_manifest_dry_run(payload: TrainingCleanManifestRequest):
    return build_clean_manifest(payload, write_output=False)


@router.post("/training/clean-manifest")
def training_clean_manifest(payload: TrainingCleanManifestRequest):
    output_path = clean_manifest_output_path(payload)
    output_key = str(output_path.resolve()).lower()
    strategy = payload.output_conflict_strategy or "fail"
    if strategy not in {"fail", "overwrite", "suffix"}:
        raise HTTPException(status_code=400, detail="output_conflict_strategy debe ser fail, overwrite o suffix.")
    if output_path.exists() and strategy == "fail" and not payload.overwrite_existing:
        raise HTTPException(
            status_code=409,
            detail=f"El manifest destino ya existe: {display_path(output_path)}. Confirma sobrescritura o usa sufijo nuevo.",
        )
    with TRAINING_CLEAN_MANIFEST_LOCK:
        if output_key in TRAINING_CLEAN_MANIFEST_OUTPUTS:
            raise HTTPException(status_code=409, detail="Ya hay una creacion en progreso para este manifest.")
        TRAINING_CLEAN_MANIFEST_OUTPUTS.add(output_key)
    try:
        if strategy == "overwrite":
            payload.overwrite_existing = True
        summary = build_clean_manifest(payload, write_output=False)
        if summary["conflicts_detected"] > 0 and payload.block_conflicts:
            raise HTTPException(status_code=400, detail="Hay conflictos detectados. Corrige feedback o usa override explicito.")
        if summary["rows_after"] <= 0:
            raise HTTPException(status_code=400, detail="Manifest limpio sin filas.")
        result = build_clean_manifest(payload, write_output=True)
        result["status"] = "completed"
        result["progress"] = 100
        result["steps"] = clean_manifest_steps("completed", 100)
        return result
    finally:
        with TRAINING_CLEAN_MANIFEST_LOCK:
            TRAINING_CLEAN_MANIFEST_OUTPUTS.discard(output_key)


@router.post("/training/specialized-manifest/dry-run")
def training_specialized_manifest_dry_run(payload: SpecializedManifestRequest):
    return build_specialized_manifest(payload, write_output=False)


@router.post("/training/specialized-manifest")
def training_specialized_manifest(payload: SpecializedManifestRequest):
    output_path = specialized_manifest_output_path(payload)
    output_key = str(output_path.resolve()).lower()
    strategy = payload.output_conflict_strategy or "fail"
    if strategy not in {"fail", "overwrite", "suffix"}:
        raise HTTPException(status_code=400, detail="output_conflict_strategy debe ser fail, overwrite o suffix.")
    if output_path.exists() and strategy == "fail" and not payload.overwrite_existing:
        raise HTTPException(
            status_code=409,
            detail=f"El manifest destino ya existe: {display_path(output_path)}. Confirma sobrescritura o usa sufijo nuevo.",
        )
    with TRAINING_CLEAN_MANIFEST_LOCK:
        if output_key in TRAINING_CLEAN_MANIFEST_OUTPUTS:
            raise HTTPException(status_code=409, detail="Ya hay una creacion en progreso para este manifest.")
        TRAINING_CLEAN_MANIFEST_OUTPUTS.add(output_key)
    try:
        if strategy == "overwrite":
            payload.overwrite_existing = True
        summary = build_specialized_manifest(payload, write_output=False)
        if not summary["can_train"]:
            raise HTTPException(status_code=400, detail=summary["recommendation_final"] or "El dry-run no es apto para entrenamiento.")
        result = build_specialized_manifest(payload, write_output=True)
        result["status"] = "completed"
        result["progress"] = 100
        return result
    finally:
        with TRAINING_CLEAN_MANIFEST_LOCK:
            TRAINING_CLEAN_MANIFEST_OUTPUTS.discard(output_key)


@router.post("/training/jobs")
def create_training_job(payload: TrainingJobRequest):
    return start_training_job(payload)


@router.get("/training/jobs")
def get_training_jobs():
    return {"items": list_jobs()}


@router.get("/training/jobs/{job_id}")
def get_training_job(job_id: str):
    return read_job(job_id)


@router.get("/training/jobs/{job_id}/logs")
def get_training_job_logs(job_id: str):
    read_job(job_id)
    path = job_log_path(job_id)
    return {"job_id": job_id, "logs": path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""}


@router.get("/training/jobs/{job_id}/artifacts/{filename}")
def get_training_job_artifact(job_id: str, filename: str):
    allowed = {
        "metrics.json",
        "diagnostics.json",
        "test_scores.csv",
        "test_manifest.csv",
        "calibration_summary.json",
        "calibration_report.csv",
        "test_calibrated_metrics.json",
        "test_calibrated_predictions.csv",
        "train.log",
    }
    if filename not in allowed:
        raise HTTPException(status_code=400, detail="Artefacto no permitido.")
    job = read_job(job_id)
    if filename == "train.log":
        path = job_log_path(job_id)
    elif filename in {"metrics.json", "diagnostics.json", "test_scores.csv", "test_manifest.csv"} and job.get("evaluation", {}).get("output_dir"):
        path = safe_relative_path(job["evaluation"]["output_dir"], must_exist=True) / filename
    else:
        request = TrainingJobRequest(**job["request"])
        path = safe_relative_path(request.output_dir, must_exist=True) / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=f"Artefacto no encontrado: {filename}")
    return FileResponse(path, filename=filename)


@router.post("/training/jobs/{job_id}/cancel")
def cancel_training_job(job_id: str):
    job = read_job(job_id)
    if job.get("status") not in {"queued", "running"}:
        raise HTTPException(status_code=400, detail="El job ya no se puede cancelar.")
    process = TRAINING_PROCESSES.get(job_id)
    if process and process.poll() is None:
        process.terminate()
    job.update({"status": "canceled", "finished_at": now_iso(), "progress": 1})
    write_job(job)
    append_log(job_id, f"[{now_iso()}] Cancelado por usuario.")
    return job


@router.post("/training/jobs/{job_id}/evaluate")
def evaluate_training_job(job_id: str, payload: TrainingEvaluateRequest | None = None):
    return run_evaluation_for_job(job_id, payload)


@router.post("/training/jobs/{job_id}/calibrate-threshold")
def calibrate_training_job_threshold(job_id: str, payload: ThresholdCalibrationRequest):
    return calibrate_threshold_for_job(job_id, payload)


@router.post("/training/jobs/{job_id}/register-model")
def register_training_job_model(job_id: str, payload: RegisterModelRequest | None = None):
    return register_job_model(job_id, payload)


app.include_router(router)
