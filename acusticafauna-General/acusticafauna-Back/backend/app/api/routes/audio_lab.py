from __future__ import annotations

import uuid
import base64
import csv
import fnmatch
import json
import math
import re
import threading
import wave
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.config import settings
from app.db.database import get_connection
from app.services.audio_path_service import (
    allowed_audio_roots,
    debug_resolve_audio_path,
    media_type_for_path,
    playable_url_for_path,
    resolve_allowed_audio_path,
)

try:
    import soundfile as sf
except ImportError:  # pragma: no cover - exercised when the optional package is absent
    sf = None


router = APIRouter(prefix="/audio-lab", tags=["audio-lab"])

VALID_FEEDBACK = {
    "confirmed_positive",
    "false_positive",
    "false_negative",
    "uncertain",
    "hard_negative",
    "excluded_from_training",
}

VALID_STATUS = {"active", "corrected", "retracted", "legacy", "needs_review"}
VALID_EXCLUSION_REASONS = {
    "voz_humana",
    "ruido",
    "sin_vocalizacion",
    "audio_equivocado",
    "etiqueta_incorrecta",
    "otro",
}
BATCH_JOB_CANCEL_EVENTS: dict[str, threading.Event] = {}
BATCH_JOB_STATUSES = {"queued", "running", "completed", "failed", "canceled"}
BATCH_JOB_MODES = {"clean_existing", "full_auto"}
BATCH_JOB_PRESETS = {"conservador", "normal", "agresivo", "personalizado"}
FOLDER_BATCH_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
FOLDER_BATCH_STATUSES = {"pending", "running", "paused", "completed", "failed", "cancelled"}
FOLDER_BATCH_MODES = {"species_folder_cleanup"}
FOLDER_BATCH_PRESETS = {"conservador", "normal", "agresivo", "personalizado", "exploratory_wide", "intermedia_exploratoria"}
INTERMEDIATE_EXPLORATORY_CONFIG = {
    "name": "intermedia_exploratoria",
    "frequency_min_hz": 2200,
    "frequency_max_hz": 5500,
    "threshold_dbfs": -53,
    "min_band_energy_ratio": 0.20,
    "bandpass": True,
    "noise_reduce": False,
    "normalize": False,
    "min_activity_seconds": 0.25,
    "min_silence_seconds": 0.5,
    "padding_seconds": 0.15,
    "clip_duration_seconds": 5,
    "max_segment_seconds": 10,
}


class AudioLabAnnotationPayload(BaseModel):
    audio_path: str
    audio_name: str | None = None
    source_row_id: str | None = None
    start_seconds: float | None = None
    end_seconds: float | None = None
    segment_start_seconds: float | None = None
    segment_end_seconds: float | None = None
    model_id: str | None = None
    predicted_label: str | None = None
    raw_argmax_label: str | None = None
    decision_rule_applied: bool | None = None
    threshold: float | None = None
    score: float | None = None
    score_used: float | None = None
    user_feedback: str
    feedback_type: str | None = None
    exclusion_reason: str | None = None
    label_type: str | None = None
    recommended_training_use: str | None = None
    hard_negative_candidate: bool | None = None
    user_label: str | None = None
    notes: str | None = None
    status: str | None = None
    previous_feedback: str | None = None
    new_feedback: str | None = None
    correction_note: str | None = None
    processed_audio_path: str | None = None
    batch_job_id: str | None = None
    batch_output_id: str | None = None
    processing_metadata_path: str | None = None
    original_source_audio_path: str | None = None
    final_label: str | None = None
    pipeline_stages_json: str | None = None
    model_ids_json: str | None = None


class AudioLabAnnotationUpdatePayload(BaseModel):
    user_feedback: str | None = None
    feedback_type: str | None = None
    user_label: str | None = None
    exclusion_reason: str | None = None
    label_type: str | None = None
    recommended_training_use: str | None = None
    hard_negative_candidate: bool | None = None
    notes: str | None = None
    status: str | None = None
    previous_feedback: str | None = None
    new_feedback: str | None = None
    correction_note: str | None = None


class AudioClipPayload(BaseModel):
    source_audio_path: str
    audio_name: str | None = None
    start_seconds: float
    end_seconds: float
    suggested_name: str | None = None
    purpose: str = "revision"
    notes: str | None = None


class ActivityDetectPayload(BaseModel):
    audio_path: str
    method: str = "energy"
    threshold_db: float = -45
    min_activity_seconds: float = 0.4
    min_silence_seconds: float = 1.5
    padding_seconds: float = 0.5
    window_seconds: float = 0.05
    hop_seconds: float = 0.025
    frequency_min_hz: float | None = 300
    frequency_max_hz: float | None = 8000
    normalize: bool = True
    merge_gap_seconds: float = 1.0
    max_segment_seconds: float | None = 10.0


class ActivityClipSegmentPayload(BaseModel):
    id: str | None = None
    run_id: str | None = None
    start_seconds: float
    end_seconds: float
    duration_seconds: float | None = None
    peak_db: float | None = None
    mean_db: float | None = None
    score: float | None = None


class ActivityCreateClipsPayload(BaseModel):
    audio_path: str
    segments: list[ActivityClipSegmentPayload]
    purpose: str = "revision"
    name_prefix: str | None = None
    format: str = "wav"


class BatchActivityParams(BaseModel):
    method: str = "band_energy"
    threshold_db: float = -45
    min_activity_seconds: float = 0.4
    min_silence_seconds: float = 1.5
    padding_seconds: float = 0.5
    window_seconds: float = 0.05
    hop_seconds: float = 0.025
    frequency_min_hz: float | None = 300
    frequency_max_hz: float | None = 8000
    normalize: bool = True
    merge_gap_seconds: float = 1.0
    max_segment_seconds: float | None = 10.0


class BatchProcessingSteps(BaseModel):
    detect_activity: bool = True
    create_segments: bool = True
    discard_empty_segments: bool = True
    denoise: bool = True
    normalize: bool = True
    bandpass: bool = True
    run_frog_detector: bool = False


class BatchDenoiseParams(BaseModel):
    method: str = "spectral_gate"
    preset: str = "normal"
    prop_decrease: float = 0.8
    frequency_min_hz: float | None = 300
    frequency_max_hz: float | None = 8000
    normalize: bool = True


class BatchDetectorParams(BaseModel):
    model_id: str = "frog_detector_v1_binary_v3_hardneg"
    threshold: float = 0.30
    clip_duration: float = 5


class BatchOutputPolicy(BaseModel):
    save_segments: bool = True
    save_denoised: bool = True
    keep_intermediate: bool = True
    recommended_training_use: str = "requires_review"


class BatchProcessingJobPayload(BaseModel):
    job_name: str | None = None
    input_audio_paths: list[str]
    mode: str
    preset: str = "normal"
    steps: BatchProcessingSteps = BatchProcessingSteps()
    activity_params: BatchActivityParams | None = None
    denoise_params: BatchDenoiseParams = BatchDenoiseParams()
    detector_params: BatchDetectorParams = BatchDetectorParams()
    output_policy: BatchOutputPolicy = BatchOutputPolicy()
    job_allowed_roots: list[str] = []


class QualityReportPayload(BaseModel):
    source_audio_path: str
    processed_audio_path: str
    run_frog_detector: bool = True
    frog_detector_model_id: str = "frog_detector_v1_binary_v3_hardneg"
    frog_detector_threshold: float = 0.30
    batch_output_id: str | None = None


class DebugResolveAudioPayload(BaseModel):
    audio_path: str | None = None
    segment_id: str | None = None
    context: str | None = None


class FolderBatchScanPayload(BaseModel):
    folder_path: str
    recursive: bool = True
    extensions: list[str] = [".wav", ".flac", ".mp3", ".ogg", ".m4a"]
    include_patterns: list[str] = []
    exclude_patterns: list[str] = []


class FolderBatchJobPayload(BaseModel):
    job_name: str
    folder_path: str
    recursive: bool = True
    target_label: str
    mode: str = "species_folder_cleanup"
    preset: str = "normal"
    config_name: str | None = None
    calibration_mode: str = "recommended"
    frequency_min_hz: float = 1800
    frequency_max_hz: float = 3000
    threshold_dbfs: float = -45
    min_activity_seconds: float = 0.4
    min_silence_seconds: float = 1.0
    padding_seconds: float = 0.3
    clip_duration_seconds: float = 5.0
    max_segment_seconds: float = 10.0
    min_band_ratio: float = 0.25
    bandpass: bool = True
    noise_reduce: bool = True
    normalize: bool = True
    discard_empty: bool = True
    detect_frog: bool = True
    detect_contaminants_heuristic: bool = True
    create_clips: bool = True
    create_manifest: bool = True
    resource_profile: str = "auto"
    include_patterns: list[str] = []
    exclude_patterns: list[str] = []
    extensions: list[str] = [".wav", ".flac", ".mp3", ".ogg", ".m4a"]


class CleanManifestPayload(BaseModel):
    name: str | None = None
    source_manifest_path: str | None = None


class UploadBatchFilePayload(BaseModel):
    original_filename: str
    content_base64: str


class UploadBatchPayload(BaseModel):
    files: list[UploadBatchFilePayload]


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def row_to_dict(row) -> dict[str, Any]:
    return dict(row)


def clip_row_to_dict(row) -> dict[str, Any]:
    item = dict(row)
    output_path = Path(item.get("output_audio_path") or "")
    metadata_path = item.get("output_metadata_path") or (str(output_path.with_suffix(output_path.suffix + ".json")) if item.get("output_audio_path") else "")
    item["clip_name"] = item.get("audio_name") or output_path.name
    item["output_metadata_path"] = metadata_path
    item["file_exists"] = bool(item.get("output_audio_path") and output_path.exists())
    item["wav_exists"] = bool(item["file_exists"] and output_path.suffix.lower() == ".wav")
    item["playable_url"] = f"/api/audio-lab/clips/{item['id']}/audio"
    item["audio_url"] = item["playable_url"]
    return item


def audio_lab_dir(*parts: str) -> Path:
    path = settings.STORAGE_DIR / "audio_lab"
    for part in parts:
        path = path / part
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_filename(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {".", "-", "_"} else "_" for ch in name)
    return cleaned.strip("._") or "audio"


def short_safe_stem(name: str, max_length: int = 30) -> str:
    cleaned = safe_filename(name)
    if len(cleaned) <= max_length:
        return cleaned
    return cleaned[:max_length].rstrip("._-") or "audio"


def readable_audio_stem(path_value: str | None, max_length: int = 90) -> str:
    stem = Path(path_value or "").stem
    if not stem:
        return "audio"
    if len(stem) <= max_length:
        return stem
    return f"{stem[: max_length - 1]}…"


def inferred_label_from_stem(stem: str) -> str | None:
    if "__" in stem:
        label = stem.split("__", 1)[0].strip(" _.-")
        return label or None
    return None


def segment_label_from_output(output: dict[str, Any], fallback_index: int) -> tuple[str, int | None]:
    for value in [output.get("segment_audio_path"), output.get("processed_audio_path")]:
        match = re.search(r"seg[_-]?(\d+)", Path(value or "").stem, flags=re.IGNORECASE)
        if match:
            number = int(match.group(1))
            return f"seg_{number:04d}", number
    if output.get("segment_start_seconds") is not None:
        return f"seg_{fallback_index:04d}", fallback_index
    return "audio completo", None


def read_wave_mono(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        sample_rate = wav.getframerate()
        raw = wav.readframes(wav.getnframes())
    if not raw:
        return np.array([], dtype="float32"), sample_rate
    if sample_width == 1:
        data = np.frombuffer(raw, dtype=np.uint8).astype("float32")
        data = (data - 128.0) / 128.0
    elif sample_width == 2:
        data = np.frombuffer(raw, dtype="<i2").astype("float32") / 32768.0
    elif sample_width == 4:
        data = np.frombuffer(raw, dtype="<i4").astype("float32") / 2147483648.0
    else:
        raise ValueError(f"sample width WAV no soportado: {sample_width}")
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data.astype("float32"), sample_rate


def write_wave_clip(source: Path, output_path: Path, start_seconds: float, end_seconds: float) -> float:
    with wave.open(str(source), "rb") as src:
        sample_rate = src.getframerate()
        start_frame = max(0, int(start_seconds * sample_rate))
        end_frame = max(start_frame, int(end_seconds * sample_rate))
        frames = max(0, end_frame - start_frame)
        if frames <= 0:
            raise HTTPException(status_code=400, detail="El recorte no contiene muestras.")
        src.setpos(min(start_frame, src.getnframes()))
        raw = src.readframes(frames)
        if not raw:
            raise HTTPException(status_code=400, detail="El recorte quedo vacio.")
        frames_written = len(raw) // (src.getsampwidth() * src.getnchannels())
        with wave.open(str(output_path), "wb") as dst:
            dst.setnchannels(src.getnchannels())
            dst.setsampwidth(src.getsampwidth())
            dst.setframerate(sample_rate)
            dst.writeframes(raw)
    return float(frames_written / sample_rate)


def read_audio_mono_for_activity(path: Path) -> tuple[np.ndarray, int]:
    if sf is not None:
        data, sample_rate = sf.read(str(path), always_2d=True)
        if data.size == 0:
            return np.array([], dtype="float32"), int(sample_rate)
        mono = data.astype("float32").mean(axis=1)
        return mono, int(sample_rate)
    if path.suffix.lower() == ".wav":
        return read_wave_mono(path)
    raise HTTPException(
        status_code=400,
        detail="soundfile no esta instalado; solo se puede detectar actividad en WAV.",
    )


def validate_activity_payload(payload: ActivityDetectPayload) -> None:
    if payload.method not in {"energy", "band_energy", "detector_model"}:
        raise HTTPException(status_code=400, detail="method debe ser energy, band_energy o detector_model.")
    if payload.method == "detector_model":
        raise HTTPException(status_code=400, detail="method detector_model queda reservado para una integracion futura.")
    if payload.window_seconds <= 0 or payload.hop_seconds <= 0:
        raise HTTPException(status_code=400, detail="window_seconds y hop_seconds deben ser mayores que cero.")
    if payload.min_activity_seconds < 0 or payload.min_silence_seconds < 0 or payload.padding_seconds < 0:
        raise HTTPException(status_code=400, detail="Duraciones minimas y padding no pueden ser negativos.")
    if payload.merge_gap_seconds < 0:
        raise HTTPException(status_code=400, detail="merge_gap_seconds no puede ser negativo.")
    if payload.max_segment_seconds is not None and payload.max_segment_seconds <= 0:
        raise HTTPException(status_code=400, detail="max_segment_seconds debe ser mayor que cero.")
    if (
        payload.frequency_min_hz is not None
        and payload.frequency_max_hz is not None
        and payload.frequency_min_hz >= payload.frequency_max_hz
    ):
        raise HTTPException(status_code=400, detail="frequency_min_hz debe ser menor que frequency_max_hz.")


def activity_params_dict(payload: ActivityDetectPayload) -> dict[str, Any]:
    return {
        "method": payload.method,
        "threshold_db": payload.threshold_db,
        "min_activity_seconds": payload.min_activity_seconds,
        "min_silence_seconds": payload.min_silence_seconds,
        "padding_seconds": payload.padding_seconds,
        "window_seconds": payload.window_seconds,
        "hop_seconds": payload.hop_seconds,
        "frequency_min_hz": payload.frequency_min_hz,
        "frequency_max_hz": payload.frequency_max_hz,
        "normalize": payload.normalize,
        "merge_gap_seconds": payload.merge_gap_seconds,
        "max_segment_seconds": payload.max_segment_seconds,
    }


def pydantic_to_dict(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def batch_job_dir(job_id: str, *parts: str) -> Path:
    path = audio_lab_dir("batch_jobs") / job_id
    for part in parts:
        path = path / part
    path.mkdir(parents=True, exist_ok=True)
    return path


def folder_batch_job_dir(job_id: str, *parts: str) -> Path:
    path = audio_lab_dir("folder_batch_jobs") / job_id
    for part in parts:
        path = path / part
    path.mkdir(parents=True, exist_ok=True)
    return path


def normalize_extensions(extensions: list[str] | None) -> set[str]:
    values = extensions or list(FOLDER_BATCH_EXTENSIONS)
    normalized = {value.lower() if value.startswith(".") else f".{value.lower()}" for value in values}
    return normalized & FOLDER_BATCH_EXTENSIONS or set(FOLDER_BATCH_EXTENSIONS)


def matches_folder_patterns(path: Path, include_patterns: list[str], exclude_patterns: list[str]) -> bool:
    text = str(path)
    name = path.name
    if include_patterns and not any(fnmatch.fnmatch(name, pattern) or fnmatch.fnmatch(text, pattern) for pattern in include_patterns):
        return False
    if exclude_patterns and any(fnmatch.fnmatch(name, pattern) or fnmatch.fnmatch(text, pattern) for pattern in exclude_patterns):
        return False
    return True


def list_folder_audio_files(payload: FolderBatchScanPayload | FolderBatchJobPayload) -> list[Path]:
    folder = Path(payload.folder_path).expanduser().resolve(strict=False)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=404, detail="La ruta de carpeta no existe en este computador.")
    extensions = normalize_extensions(payload.extensions)
    iterator = folder.rglob("*") if payload.recursive else folder.glob("*")
    files = [
        path
        for path in iterator
        if path.is_file()
        and path.suffix.lower() in extensions
        and matches_folder_patterns(path, payload.include_patterns, payload.exclude_patterns)
    ]
    return sorted(files, key=lambda item: str(item).lower())


def audio_file_info(path: Path) -> dict[str, Any]:
    size = path.stat().st_size
    sample_rate = None
    duration = None
    try:
        if sf is not None:
            info = sf.info(str(path))
            sample_rate = int(info.samplerate)
            duration = float(info.duration)
        elif path.suffix.lower() == ".wav":
            with wave.open(str(path), "rb") as wav:
                sample_rate = int(wav.getframerate())
                duration = float(wav.getnframes() / max(1, sample_rate))
    except Exception:
        pass
    return {
        "size_bytes": int(size),
        "duration_seconds": duration,
        "sample_rate": sample_rate,
    }


def scan_folder_payload(payload: FolderBatchScanPayload | FolderBatchJobPayload) -> dict[str, Any]:
    files = list_folder_audio_files(payload)
    extensions_count: dict[str, int] = {}
    total_size = 0
    estimated_duration = 0.0
    warnings: list[str] = []
    sample_files = []
    for index, path in enumerate(files):
        extensions_count[path.suffix.lower()] = extensions_count.get(path.suffix.lower(), 0) + 1
        info = audio_file_info(path)
        total_size += int(info["size_bytes"])
        if info["duration_seconds"] is not None:
            estimated_duration += float(info["duration_seconds"])
        elif index < 25:
            warnings.append(f"No se pudo estimar duracion: {path}")
        if len(sample_files) < 10:
            sample_files.append(str(path))
    if total_size > 50 * 1024**3:
        warnings.append("Lote grande detectado: se recomienda procesar por perfil eco o balanceado y revisar espacio en disco.")
    folder_resolved = Path(payload.folder_path).expanduser().resolve(strict=False)
    return {
        "folder_path": str(Path(payload.folder_path).expanduser()),
        "folder_path_resolved": str(folder_resolved),
        "job_allowed_root": str(folder_resolved),
        "files_found": len(files),
        "total_size_bytes": total_size,
        "estimated_duration_seconds": round(estimated_duration, 3),
        "extensions_count": extensions_count,
        "sample_files": sample_files,
        "warnings": warnings,
    }


def iter_audio_blocks(path: Path, block_seconds: float = 20.0):
    if sf is not None:
        with sf.SoundFile(str(path)) as audio_file:
            sample_rate = int(audio_file.samplerate)
            block_size = max(1, int(sample_rate * block_seconds))
            start = 0
            while True:
                data = audio_file.read(block_size, always_2d=True, dtype="float32")
                if data.size == 0:
                    break
                mono = data.mean(axis=1).astype("float32")
                yield mono, sample_rate, float(start / sample_rate)
                start += len(mono)
        return
    if path.suffix.lower() != ".wav":
        raise RuntimeError("soundfile no esta instalado; solo WAV soportado por streaming.")
    with wave.open(str(path), "rb") as wav:
        sample_rate = int(wav.getframerate())
        channels = int(wav.getnchannels())
        sample_width = int(wav.getsampwidth())
        block_frames = max(1, int(sample_rate * block_seconds))
        start = 0
        while True:
            raw = wav.readframes(block_frames)
            if not raw:
                break
            if sample_width == 2:
                data = np.frombuffer(raw, dtype="<i2").astype("float32") / 32768.0
            elif sample_width == 1:
                data = (np.frombuffer(raw, dtype=np.uint8).astype("float32") - 128.0) / 128.0
            else:
                raise RuntimeError("sample width WAV no soportado en streaming.")
            if channels > 1:
                data = data.reshape(-1, channels).mean(axis=1)
            yield data.astype("float32"), sample_rate, float(start / sample_rate)
            start += len(data)


def frame_band_metrics(
    frame: np.ndarray,
    sample_rate: int,
    frequency_min_hz: float,
    frequency_max_hz: float,
) -> dict[str, float]:
    epsilon = 1e-12
    rms = float(np.sqrt(np.mean(np.square(frame)) + epsilon))
    total_energy = float(np.sum(np.square(frame)) + epsilon)
    window = np.hanning(frame.size).astype("float32")
    spectrum = np.fft.rfft(frame * window)
    freqs = np.fft.rfftfreq(frame.size, d=1.0 / sample_rate)
    power = np.square(np.abs(spectrum))
    total_power = float(np.sum(power) + epsilon)
    band_mask = (freqs >= frequency_min_hz) & (freqs <= min(frequency_max_hz, sample_rate / 2))
    low_mask = freqs < 500
    voice_mask = (freqs >= 300) & (freqs <= 3400)
    high_mask = freqs > 4000
    band_power = float(np.sum(power[band_mask]) + epsilon) if np.any(band_mask) else epsilon
    band_ratio = float(band_power / total_power)
    band_rms = rms * math.sqrt(max(0.0, min(1.0, band_ratio)))
    return {
        "rms_dbfs": dbfs(rms),
        "band_rms_dbfs": dbfs(band_rms),
        "band_energy_ratio": band_ratio,
        "low_ratio": float(np.sum(power[low_mask]) / total_power) if np.any(low_mask) else 0.0,
        "voice_ratio": float(np.sum(power[voice_mask]) / total_power) if np.any(voice_mask) else 0.0,
        "high_ratio": float(np.sum(power[high_mask]) / total_power) if np.any(high_mask) else 0.0,
        "total_energy": total_energy,
    }


def contaminant_flags_from_metrics(metrics: dict[str, float], payload: FolderBatchJobPayload, duration: float) -> list[str]:
    flags: list[str] = []
    band_ratio = metrics.get("band_energy_ratio", 0.0)
    if metrics.get("voice_ratio", 0.0) > 0.60 and band_ratio < max(payload.min_band_ratio, 0.35) and duration >= 1.0:
        flags.append("voz_humana_suspect")
    if metrics.get("low_ratio", 0.0) > 0.55 and duration >= 1.5:
        flags.append("carro_motor_suspect")
    if metrics.get("high_ratio", 0.0) > 0.45 and duration <= 3.0:
        flags.append("ave_suspect")
    if band_ratio < 0.18 and metrics.get("voice_ratio", 0.0) > 0.20 and metrics.get("high_ratio", 0.0) > 0.20:
        flags.append("broadband_noise_suspect")
    return flags


def analyze_folder_audio_file(path: Path, payload: FolderBatchJobPayload) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    info = audio_file_info(path)
    sample_rate = info.get("sample_rate")
    duration = float(info.get("duration_seconds") or 0.0)
    frame_seconds = 0.10
    hop_seconds = 0.05
    active_intervals: list[tuple[float, float, dict[str, float]]] = []
    for block, block_rate, block_start in iter_audio_blocks(path, block_seconds=20.0):
        sample_rate = sample_rate or block_rate
        if block.size == 0:
            continue
        frame_size = max(1, int(block_rate * frame_seconds))
        hop_size = max(1, int(block_rate * hop_seconds))
        if block.size < frame_size:
            block = np.pad(block, (0, frame_size - block.size))
        for start in range(0, max(block.size - frame_size, 0) + 1, hop_size):
            frame = block[start : start + frame_size]
            metrics = frame_band_metrics(frame, block_rate, payload.frequency_min_hz, payload.frequency_max_hz)
            is_active = (
                metrics["band_rms_dbfs"] >= payload.threshold_dbfs
                and metrics["band_energy_ratio"] >= payload.min_band_ratio
            )
            if is_active:
                absolute_start = block_start + float(start / block_rate)
                active_intervals.append((absolute_start, absolute_start + frame_seconds, metrics))
    if sample_rate is None:
        sample_rate = 0
    if duration <= 0 and sample_rate:
        duration = max((end for _, end, _ in active_intervals), default=0.0)
    merged = merge_intervals([(start, end) for start, end, _ in active_intervals], payload.min_silence_seconds)
    padded = [(max(0.0, start - payload.padding_seconds), min(duration or end, end + payload.padding_seconds)) for start, end in merged]
    merged = merge_intervals(padded, payload.min_silence_seconds)
    merged = [(start, end) for start, end in merged if end - start >= payload.min_activity_seconds]
    merged = split_long_intervals(merged, payload.max_segment_seconds or payload.clip_duration_seconds)

    segments: list[dict[str, Any]] = []
    for index, (start, end) in enumerate(merged, start=1):
        related = [metrics for frame_start, frame_end, metrics in active_intervals if frame_start < end and frame_end > start]
        if not related:
            continue
        avg = {
            key: float(np.mean([item[key] for item in related]))
            for key in ["rms_dbfs", "band_rms_dbfs", "band_energy_ratio", "low_ratio", "voice_ratio", "high_ratio"]
        }
        peak_band = float(max(item["band_rms_dbfs"] for item in related))
        segment_duration = float(end - start)
        flags = contaminant_flags_from_metrics(avg, payload, segment_duration) if payload.detect_contaminants_heuristic else []
        score = max(0.0, min(1.0, (avg["band_energy_ratio"] * 0.65) + (max(0.0, peak_band - payload.threshold_dbfs) / 40.0 * 0.35)))
        recommendation = "candidate"
        if flags:
            recommendation = "requires_review"
        if avg["band_energy_ratio"] < payload.min_band_ratio or segment_duration < payload.min_activity_seconds:
            recommendation = "excluded"
        segments.append(
            {
                "segment_key": f"seg_{index:04d}",
                "start_seconds": round(float(start), 3),
                "end_seconds": round(float(end), 3),
                "duration_seconds": round(segment_duration, 3),
                "frequency_min_hz": payload.frequency_min_hz,
                "frequency_max_hz": payload.frequency_max_hz,
                "rms_dbfs": round(avg["rms_dbfs"], 3),
                "band_rms_dbfs": round(avg["band_rms_dbfs"], 3),
                "band_energy_ratio": round(avg["band_energy_ratio"], 6),
                "snr_estimate": round(peak_band - payload.threshold_dbfs, 3),
                "activity_score": round(score, 4),
                "contaminant_flags": flags,
                "recommendation": recommendation,
            }
        )
    return {
        "duration_seconds": round(duration, 3),
        "sample_rate": int(sample_rate or 0),
        "size_bytes": int(info.get("size_bytes") or 0),
    }, segments


def folder_batch_payload_dict(payload: FolderBatchJobPayload) -> dict[str, Any]:
    return pydantic_to_dict(payload)


def validate_job_allowed_roots(raw_roots: list[str] | None, require_confirmation: bool = False) -> list[Path]:
    roots: list[Path] = []
    for raw in raw_roots or []:
        root = Path(str(raw)).expanduser().resolve(strict=False)
        anchor = Path(root.anchor) if root.anchor else None
        if anchor and root == anchor and not require_confirmation:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "job_allowed_root_too_broad",
                    "message": "No se autoriza una raiz de unidad completa para este job. Selecciona una carpeta mas especifica.",
                    "audio_path": str(root),
                },
            )
        if not root.exists() or not root.is_dir():
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "job_allowed_root_not_found",
                    "message": "La carpeta autorizada para el job no existe.",
                    "audio_path": str(root),
                },
            )
        roots.append(root)
    return roots


def folder_batch_job_to_dict(row) -> dict[str, Any]:
    item = dict(row)
    if item.get("total_files"):
        item["progress"] = round(float(item.get("processed_files") or 0) / float(item["total_files"]), 4)
    else:
        item["progress"] = 0.0
    item["output_dir"] = item.get("output_dir") or str(folder_batch_job_dir(item["id"]))
    return item


def folder_job_status(job_id: str) -> str | None:
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        row = conn.execute("SELECT status FROM audio_lab_folder_batch_jobs WHERE id = ?", (job_id,)).fetchone()
        return row["status"] if row else None
    finally:
        conn.close()


def log_folder_batch_job(job_id: str, message: str) -> None:
    logs_dir = folder_batch_job_dir(job_id, "logs")
    (logs_dir / "job.log").open("a", encoding="utf-8").write(f"{now_iso()} {message}\n")


def update_folder_batch_job(job_id: str, **values: Any) -> None:
    if not values:
        return
    values["updated_at"] = now_iso()
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        assignments = ", ".join(f"{key} = ?" for key in values)
        conn.execute(f"UPDATE audio_lab_folder_batch_jobs SET {assignments} WHERE id = ?", [*values.values(), job_id])
        conn.commit()
    finally:
        conn.close()


def batch_payload_dict(payload: BatchProcessingJobPayload) -> dict[str, Any]:
    return {
        "job_name": payload.job_name,
        "input_audio_paths": payload.input_audio_paths,
        "mode": payload.mode,
        "preset": payload.preset,
        "steps": pydantic_to_dict(payload.steps),
        "activity_params": pydantic_to_dict(payload.activity_params) if payload.activity_params else None,
        "denoise_params": pydantic_to_dict(payload.denoise_params),
        "detector_params": pydantic_to_dict(payload.detector_params),
        "output_policy": pydantic_to_dict(payload.output_policy),
        "job_allowed_roots": payload.job_allowed_roots,
    }


def default_activity_params_for_audio(audio_path: str, payload: BatchProcessingJobPayload) -> ActivityDetectPayload:
    params = pydantic_to_dict(payload.activity_params) if payload.activity_params else {}
    params.pop("audio_path", None)
    return ActivityDetectPayload(audio_path=audio_path, **params)


def log_batch_job(job_id: str, message: str) -> None:
    logs_dir = batch_job_dir(job_id, "logs")
    line = f"{now_iso()} {message}\n"
    (logs_dir / "job.log").open("a", encoding="utf-8").write(line)


def update_batch_job(job_id: str, **values: Any) -> None:
    if not values:
        return
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        assignments = ", ".join(f"{key} = ?" for key in values)
        conn.execute(
            f"UPDATE audio_lab_batch_jobs SET {assignments} WHERE id = ?",
            [*values.values(), job_id],
        )
        conn.commit()
    finally:
        conn.close()


def insert_batch_item(job_id: str, source_audio_path: str, status: str = "running") -> str:
    item_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        conn.execute(
            """
            INSERT INTO audio_lab_batch_items (
                id, job_id, source_audio_path, status, duration_seconds, segments_detected,
                segments_created, segments_discarded, processed_files_count,
                frog_detected_count, review_count, error_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (item_id, job_id, source_audio_path, status, None, 0, 0, 0, 0, 0, 0, None),
        )
        conn.commit()
        return item_id
    finally:
        conn.close()


def update_batch_item(item_id: str, **values: Any) -> None:
    if not values:
        return
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        assignments = ", ".join(f"{key} = ?" for key in values)
        conn.execute(
            f"UPDATE audio_lab_batch_items SET {assignments} WHERE id = ?",
            [*values.values(), item_id],
        )
        conn.commit()
    finally:
        conn.close()


def insert_batch_output(
    job_id: str,
    item_id: str,
    source_audio_path: str,
    segment_start_seconds: float | None = None,
    segment_end_seconds: float | None = None,
    segment_audio_path: str | None = None,
    processed_audio_path: str | None = None,
    processing_metadata_path: str | None = None,
    frog_detector_score: float | None = None,
    frog_detector_prediction: str | None = None,
    recommended_action: str = "requires_review",
) -> str:
    output_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        conn.execute(
            """
            INSERT INTO audio_lab_batch_outputs (
                id, job_id, item_id, source_audio_path, segment_start_seconds,
                segment_end_seconds, segment_audio_path, processed_audio_path,
                processing_metadata_path, frog_detector_score, frog_detector_prediction,
                recommended_action, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                output_id,
                job_id,
                item_id,
                source_audio_path,
                segment_start_seconds,
                segment_end_seconds,
                segment_audio_path,
                processed_audio_path,
                processing_metadata_path,
                frog_detector_score,
                frog_detector_prediction,
                recommended_action,
                now_iso(),
            ),
        )
        conn.commit()
        return output_id
    finally:
        conn.close()


def batch_job_to_dict(row) -> dict[str, Any]:
    item = dict(row)
    for key in ["params_json", "summary_json"]:
        raw = item.get(key)
        try:
            item[key.replace("_json", "")] = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            item[key.replace("_json", "")] = {}
    item["output_dir"] = str(batch_job_dir(item["id"]))
    return item


def enrich_batch_outputs_with_quality_reports(conn, outputs, job: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    enriched = []
    job = job or {}
    params = job.get("params") or {}
    denoise_params = params.get("denoise_params") or {}
    output_job_name = job.get("job_name") or job.get("id")
    output_job_id = job.get("id")
    processing_preset = job.get("preset") or params.get("preset") or denoise_params.get("preset")
    processing_method = denoise_params.get("method") or ("spectral_gate" if output_job_id else None)
    for index, output in enumerate(outputs, start=1):
        item = dict(output)
        source_path = item.get("source_audio_path")
        processed_path = item.get("processed_audio_path")
        source_name = Path(source_path or "").name
        processed_name = Path(processed_path or "").name if processed_path else None
        source_stem = readable_audio_stem(source_path)
        processed_stem = readable_audio_stem(processed_path) if processed_path else None
        segment_label, segment_index = segment_label_from_output(item, index)
        has_segment = item.get("segment_start_seconds") is not None
        processing_bits = [value for value in [processing_preset, processing_method] if value]
        display_base = source_stem
        if has_segment and segment_label:
            display_base = f"{display_base} · {segment_label}"
        item["source_audio_name"] = source_name
        item["source_audio_stem"] = source_stem
        item["processed_audio_name"] = processed_name
        item["processed_audio_stem"] = processed_stem
        playable_path = item.get("processed_audio_path") or item.get("segment_audio_path") or item.get("source_audio_path")
        if playable_path:
            item["playable_url"] = playable_url_for_path(playable_path)
            item["audio_url"] = item["playable_url"]
        item["display_name"] = display_base
        item["display_label"] = f"{display_base} · procesado" if processed_path else display_base
        item["short_id"] = item.get("id", "")[:8]
        item["batch_job_name"] = output_job_name
        item["batch_job_id"] = output_job_id or item.get("job_id")
        item["segment_label"] = segment_label
        item["segment_index"] = segment_index
        item["processing_preset"] = processing_preset
        item["processing_method"] = processing_method
        item["processing_label"] = " · ".join(processing_bits) if processing_bits else None
        item["source_origin"] = "batch"
        item["original_label"] = inferred_label_from_stem(source_stem)
        item["normalized_label"] = safe_filename(item["original_label"]) if item.get("original_label") else None
        report = None
        if item.get("quality_report_path"):
            report = {
                "report_path": item.get("quality_report_path"),
                "recommendation_label": item.get("quality_report_label"),
            }
        elif item.get("processed_audio_path"):
            report = conn.execute(
                """
                SELECT report_path, recommendation_label, contrast_improvement_db, clipping_processed_ratio, created_at
                FROM audio_lab_quality_reports
                WHERE processed_audio_path = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (item["processed_audio_path"],),
            ).fetchone()
        if report:
            report_dict = dict(report)
            item["quality_report_path"] = report_dict.get("report_path")
            item["quality_report_label"] = report_dict.get("recommendation_label")
            item["quality_report"] = report_dict
        else:
            item["quality_report"] = None
        enriched.append(item)
    return enriched


def frame_db_energy(
    audio: np.ndarray,
    sample_rate: int,
    payload: ActivityDetectPayload,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    epsilon = 1e-10
    window_size = max(1, int(round(payload.window_seconds * sample_rate)))
    hop_size = max(1, int(round(payload.hop_seconds * sample_rate)))
    if len(audio) < window_size:
        audio = np.pad(audio, (0, window_size - len(audio)))
    starts = np.arange(0, max(len(audio) - window_size, 0) + 1, hop_size, dtype=np.int64)
    if starts.size == 0:
        starts = np.array([0], dtype=np.int64)
    ends = starts + window_size

    if payload.method == "band_energy":
        freqs = np.fft.rfftfreq(window_size, d=1.0 / sample_rate)
        min_hz = 0 if payload.frequency_min_hz is None else max(0, payload.frequency_min_hz)
        max_hz = sample_rate / 2 if payload.frequency_max_hz is None else min(sample_rate / 2, payload.frequency_max_hz)
        band_mask = (freqs >= min_hz) & (freqs <= max_hz)
        if not np.any(band_mask):
            raise HTTPException(status_code=400, detail="La banda de frecuencia no contiene bins validos para este sample rate.")
        window = np.hanning(window_size).astype("float32")
        rms_values = []
        for start in starts:
            frame = audio[start : start + window_size]
            total_rms = float(np.sqrt(np.mean(np.square(frame)) + epsilon))
            spectrum = np.fft.rfft(frame * window)
            power = np.square(np.abs(spectrum))
            total_power = float(np.sum(power) + epsilon)
            band_fraction = float(np.sum(power[band_mask]) / total_power)
            rms_values.append(total_rms * np.sqrt(max(0.0, min(1.0, band_fraction))))
        rms = np.array(rms_values, dtype="float32")
    else:
        squared = np.square(audio.astype("float64"))
        cumulative = np.concatenate(([0.0], np.cumsum(squared)))
        mean_square = (cumulative[ends] - cumulative[starts]) / window_size
        rms = np.sqrt(mean_square + epsilon).astype("float32")

    db_values = 20.0 * np.log10(rms + epsilon)
    frame_starts = starts.astype("float64") / sample_rate
    frame_ends = np.minimum(ends.astype("float64") / sample_rate, len(audio) / sample_rate)
    return frame_starts, frame_ends, db_values


def merge_intervals(intervals: list[tuple[float, float]], max_gap: float) -> list[tuple[float, float]]:
    if not intervals:
        return []
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        last_start, last_end = merged[-1]
        if start - last_end <= max_gap:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def split_long_intervals(intervals: list[tuple[float, float]], max_seconds: float | None) -> list[tuple[float, float]]:
    if not max_seconds:
        return intervals
    split: list[tuple[float, float]] = []
    for start, end in intervals:
        cursor = start
        while end - cursor > max_seconds:
            split.append((cursor, cursor + max_seconds))
            cursor += max_seconds
        if end - cursor > 0:
            split.append((cursor, end))
    return split


def detect_activity_segments(payload: ActivityDetectPayload) -> dict[str, Any]:
    validate_activity_payload(payload)
    source = resolve_allowed_audio_path(payload.audio_path)

    audio, sample_rate = read_audio_mono_for_activity(source)
    if audio.size == 0 or sample_rate <= 0:
        raise HTTPException(status_code=400, detail="El audio no contiene muestras legibles.")

    duration = float(len(audio) / sample_rate)
    analysis_audio = audio.astype("float32", copy=True)
    if payload.normalize:
        peak = float(np.max(np.abs(analysis_audio))) if analysis_audio.size else 0.0
        if peak > 1e-8:
            analysis_audio = analysis_audio / peak

    frame_starts, frame_ends, db_values = frame_db_energy(analysis_audio, sample_rate, payload)
    active_mask = db_values >= payload.threshold_db
    active_intervals = [
        (float(start), float(end))
        for start, end, active in zip(frame_starts, frame_ends, active_mask)
        if active
    ]
    intervals = merge_intervals(active_intervals, payload.min_silence_seconds)
    intervals = [
        (start, end)
        for start, end in intervals
        if end - start >= payload.min_activity_seconds
    ]
    padded = [
        (max(0.0, start - payload.padding_seconds), min(duration, end + payload.padding_seconds))
        for start, end in intervals
    ]
    intervals = merge_intervals(padded, payload.merge_gap_seconds)
    intervals = split_long_intervals(intervals, payload.max_segment_seconds)

    segments = []
    active_seconds = 0.0
    for index, (start, end) in enumerate(intervals, start=1):
        if end <= start:
            continue
        overlaps = (frame_starts < end) & (frame_ends > start)
        segment_db = db_values[overlaps] if np.any(overlaps) else np.array([payload.threshold_db], dtype="float32")
        peak_db = float(np.max(segment_db))
        mean_db = float(np.mean(segment_db))
        active_fraction = float(np.mean(segment_db >= payload.threshold_db)) if segment_db.size else 0.0
        margin_score = max(0.0, min(1.0, (peak_db - payload.threshold_db) / 30.0))
        score = max(0.0, min(1.0, active_fraction * 0.6 + margin_score * 0.4))
        segment = {
            "id": f"seg_{index:04d}",
            "start_seconds": round(float(start), 3),
            "end_seconds": round(float(end), 3),
            "duration_seconds": round(float(end - start), 3),
            "peak_db": round(peak_db, 3),
            "mean_db": round(mean_db, 3),
            "score": round(score, 3),
        }
        active_seconds += end - start
        segments.append(segment)

    active_seconds = min(duration, active_seconds)
    summary = {
        "segments_detected": len(segments),
        "active_seconds": round(active_seconds, 3),
        "silent_seconds": round(max(0.0, duration - active_seconds), 3),
        "active_ratio": round(active_seconds / duration if duration else 0.0, 4),
    }
    return {
        "audio_path": str(source),
        "duration_seconds": round(duration, 3),
        "sample_rate": sample_rate,
        "method": payload.method,
        "params": activity_params_dict(payload),
        "summary": summary,
        "segments": segments,
    }


def write_audio_segment_to_path(source: Path, output_path: Path, start_seconds: float, end_seconds: float) -> float:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if sf is not None:
        info = sf.info(str(source))
        sample_rate = int(info.samplerate)
        start_frame = max(0, int(start_seconds * sample_rate))
        end_frame = max(start_frame, int(end_seconds * sample_rate))
        frames = max(0, end_frame - start_frame)
        if frames <= 0:
            raise HTTPException(status_code=400, detail="El segmento no contiene muestras.")
        data, read_rate = sf.read(str(source), start=start_frame, frames=frames, always_2d=True)
        if data.size == 0:
            raise HTTPException(status_code=400, detail="El segmento quedo vacio.")
        sf.write(str(output_path), data, int(read_rate), format="WAV")
        return float(len(data) / int(read_rate))
    if source.suffix.lower() == ".wav":
        return write_wave_clip(source, output_path, start_seconds, end_seconds)
    raise HTTPException(status_code=400, detail="soundfile no esta instalado; no se puede segmentar este formato.")


def apply_fft_bandpass(data: np.ndarray, sample_rate: int, min_hz: float | None, max_hz: float | None) -> np.ndarray:
    if data.size == 0:
        return data
    min_hz = 0 if min_hz is None else max(0, float(min_hz))
    max_hz = sample_rate / 2 if max_hz is None else min(sample_rate / 2, float(max_hz))
    if min_hz <= 0 and max_hz >= sample_rate / 2:
        return data
    processed = np.zeros_like(data, dtype="float32")
    for channel in range(data.shape[1]):
        spectrum = np.fft.rfft(data[:, channel])
        freqs = np.fft.rfftfreq(len(data), d=1.0 / sample_rate)
        mask = (freqs >= min_hz) & (freqs <= max_hz)
        spectrum[~mask] = 0
        processed[:, channel] = np.fft.irfft(spectrum, n=len(data)).astype("float32")
    return processed


def apply_time_gate(data: np.ndarray, prop_decrease: float) -> np.ndarray:
    if data.size == 0:
        return data
    mono = data.mean(axis=1)
    rms = np.sqrt(np.mean(np.square(mono)) + 1e-10)
    threshold = max(1e-5, rms * 0.35)
    attenuation = max(0.0, min(1.0, 1.0 - prop_decrease))
    quiet = np.abs(mono) < threshold
    processed = data.copy()
    processed[quiet, :] *= attenuation
    return processed


def process_audio_copy(
    source: Path,
    output_path: Path,
    denoise_params: BatchDenoiseParams,
    use_denoise: bool,
    use_normalize: bool,
    use_bandpass: bool,
) -> dict[str, Any]:
    if sf is None and source.suffix.lower() != ".wav":
        raise HTTPException(status_code=400, detail="soundfile no esta instalado; no se puede procesar este formato.")
    if sf is not None:
        data, sample_rate = sf.read(str(source), always_2d=True)
        data = data.astype("float32")
    else:
        mono, sample_rate = read_wave_mono(source)
        data = mono.reshape(-1, 1).astype("float32")
    if data.size == 0:
        raise HTTPException(status_code=400, detail="El audio no contiene muestras.")

    original_peak = float(np.max(np.abs(data)))
    processed = data
    if use_bandpass:
        processed = apply_fft_bandpass(
            processed,
            int(sample_rate),
            denoise_params.frequency_min_hz,
            denoise_params.frequency_max_hz,
        )
    if use_denoise:
        processed = apply_time_gate(processed, float(denoise_params.prop_decrease))
    if use_normalize or denoise_params.normalize:
        peak = float(np.max(np.abs(processed))) if processed.size else 0.0
        if peak > 1e-8:
            processed = processed / peak * 0.95
    processed = np.clip(processed, -1.0, 1.0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if sf is not None:
        sf.write(str(output_path), processed, int(sample_rate), format="WAV")
    else:
        with wave.open(str(output_path), "wb") as wav:
            wav.setnchannels(processed.shape[1])
            wav.setsampwidth(2)
            wav.setframerate(int(sample_rate))
            pcm = (processed * 32767.0).astype("<i2")
            wav.writeframes(pcm.tobytes())

    return {
        "source_audio_path": str(source),
        "processed_audio_path": str(output_path),
        "sample_rate": int(sample_rate),
        "duration_seconds": round(float(len(processed) / int(sample_rate)), 3),
        "original_peak": round(original_peak, 6),
        "processed_peak": round(float(np.max(np.abs(processed))), 6),
        "denoise_method": denoise_params.method if use_denoise else "none",
        "prop_decrease": denoise_params.prop_decrease if use_denoise else 0,
        "bandpass": bool(use_bandpass),
        "frequency_min_hz": denoise_params.frequency_min_hz if use_bandpass else None,
        "frequency_max_hz": denoise_params.frequency_max_hz if use_bandpass else None,
        "normalize": bool(use_normalize or denoise_params.normalize),
        "created_at": now_iso(),
    }


def segment_is_empty(segment: dict[str, Any], min_activity_seconds: float) -> bool:
    return (
        float(segment.get("duration_seconds") or 0) < min_activity_seconds
        or float(segment.get("score") or 0) < 0.08
        or float(segment.get("mean_db") or -120) < -80
    )


def call_frog_detector(audio_path: str, detector_params: BatchDetectorParams) -> tuple[str | None, float | None, str]:
    payload = {
        "audio_path": audio_path,
        "model_id": detector_params.model_id,
        "target_mode": "binary_presence",
        "positive_label": "rana_sapo",
        "threshold": detector_params.threshold,
        "clip_duration": detector_params.clip_duration,
        "step_seconds": detector_params.clip_duration,
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(90.0, connect=2.0)) as client:
            response = client.post(f"{settings.ML_API_BASE_URL}/predict/audio-path", json=payload)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        return "error", None, f"Error detector rana/sapo: {exc}"

    summary = data.get("summary") or {}
    score = summary.get("max_score_rana_sapo")
    detected = bool(summary.get("detected"))
    prediction = "rana_sapo" if detected else "no_rana_sapo"
    return prediction, float(score) if score is not None else None, ""


def recommended_action_from_detector(prediction: str | None, score: float | None, threshold: float) -> str:
    if prediction == "error":
        return "error"
    if prediction == "rana_sapo":
        if score is not None and score < threshold + 0.15:
            return "revisar"
        return "probable_rana"
    if prediction == "no_rana_sapo":
        if score is not None and score >= max(0.05, threshold * 0.75):
            return "revisar"
        return "no_rana"
        return "requires_review"


def dbfs(value: float) -> float:
    return float(20.0 * np.log10(max(float(value), 1e-10)))


def window_rms_values(audio: np.ndarray, sample_rate: int, window_seconds: float = 0.05, hop_seconds: float = 0.025) -> np.ndarray:
    window_size = max(1, int(round(window_seconds * sample_rate)))
    hop_size = max(1, int(round(hop_seconds * sample_rate)))
    if audio.size < window_size:
        audio = np.pad(audio, (0, window_size - audio.size))
    starts = np.arange(0, max(audio.size - window_size, 0) + 1, hop_size, dtype=np.int64)
    if starts.size == 0:
        starts = np.array([0], dtype=np.int64)
    squared = np.square(audio.astype("float64"))
    cumulative = np.concatenate(([0.0], np.cumsum(squared)))
    ends = starts + window_size
    return np.sqrt((cumulative[ends] - cumulative[starts]) / window_size + 1e-10)


def band_db(audio: np.ndarray, sample_rate: int, low_hz: float, high_hz: float) -> float:
    if audio.size == 0:
        return -120.0
    nyquist = sample_rate / 2
    low_hz = max(0.0, low_hz)
    high_hz = min(nyquist, high_hz)
    if high_hz <= low_hz:
        return -120.0
    window = np.hanning(audio.size).astype("float32")
    spectrum = np.fft.rfft(audio.astype("float32") * window)
    freqs = np.fft.rfftfreq(audio.size, d=1.0 / sample_rate)
    mask = (freqs >= low_hz) & (freqs < high_hz)
    if not np.any(mask):
        return -120.0
    power = np.mean(np.square(np.abs(spectrum[mask]))) / max(1, audio.size)
    return float(10.0 * np.log10(max(power, 1e-20)))


def quality_metrics(path: Path) -> dict[str, Any]:
    audio, sample_rate = read_audio_mono_for_activity(path)
    if audio.size == 0 or sample_rate <= 0:
        raise HTTPException(status_code=400, detail=f"Audio sin muestras legibles: {path}")
    audio = np.clip(audio.astype("float32"), -1.0, 1.0)
    rms_values = window_rms_values(audio, sample_rate)
    noise_floor_db = dbfs(float(np.percentile(rms_values, 20)))
    activity_db = dbfs(float(np.percentile(rms_values, 95)))
    return {
        "duration_seconds": round(float(audio.size / sample_rate), 3),
        "sample_rate": int(sample_rate),
        "peak": round(float(np.max(np.abs(audio))), 6),
        "clipping_ratio": round(float(np.mean(np.abs(audio) >= 0.99)), 8),
        "rms_db": round(dbfs(float(np.sqrt(np.mean(np.square(audio)) + 1e-10))), 3),
        "noise_floor_db": round(noise_floor_db, 3),
        "activity_db": round(activity_db, 3),
        "contrast_db": round(activity_db - noise_floor_db, 3),
        "bands": {
            "0-300": round(band_db(audio, sample_rate, 0, 300), 3),
            "300-2000": round(band_db(audio, sample_rate, 300, 2000), 3),
            "2000-8000": round(band_db(audio, sample_rate, 2000, 8000), 3),
            "8000-12000": round(band_db(audio, sample_rate, 8000, 12000), 3),
        },
    }


def band_interpretation(label: str, delta_db: float) -> str:
    if label == "0-300" and delta_db <= -6:
        return "grave reducido"
    if label in {"300-2000", "2000-8000"} and delta_db < -6:
        return "posible perdida de senal util"
    if delta_db > 3:
        return "energia aumentada"
    if delta_db < -3:
        return "energia reducida"
    return "similar"


def build_quality_recommendation(
    source_metrics: dict[str, Any],
    processed_metrics: dict[str, Any],
    contrast_improvement: float,
    band_energy: list[dict[str, Any]],
    detector_warning: str | None,
) -> dict[str, Any]:
    warnings: list[str] = []
    notes: list[str] = []
    clipping = float(processed_metrics["clipping_ratio"])
    if clipping > 0.001:
        warnings.append("posible clipping")
    if abs(source_metrics["duration_seconds"] - processed_metrics["duration_seconds"]) > 0.1:
        warnings.append("la duracion del original y procesado no coincide")
    useful_source = source_metrics["bands"]["300-2000"]
    useful_processed = processed_metrics["bands"]["300-2000"]
    useful_delta = useful_processed - useful_source
    high_useful_delta = processed_metrics["bands"]["2000-8000"] - source_metrics["bands"]["2000-8000"]
    low_delta = processed_metrics["bands"]["0-300"] - source_metrics["bands"]["0-300"]
    if min(useful_delta, high_useful_delta) < -6:
        warnings.append("posible perdida de senal util")
    if low_delta <= -6 and min(useful_delta, high_useful_delta) > -4:
        notes.append("grave reducido correctamente")
    if detector_warning:
        warnings.append(detector_warning)

    if clipping > 0.001 or min(useful_delta, high_useful_delta) < -10:
        label = "posible_dano"
        severity = "danger"
        summary = "El procesado requiere revision: puede tener clipping o perdida de senal util."
    elif contrast_improvement > 2:
        label = "bueno_para_revision"
        severity = "ok"
        summary = "El procesado redujo ruido y aumento contraste sin clipping relevante."
    elif contrast_improvement >= 0:
        label = "mejora_ligera"
        severity = "warning"
        summary = "El procesado mejora ligeramente; conviene revisar espectrograma y escucha."
    else:
        label = "procesado_puede_empeorar"
        severity = "danger"
        summary = "El contraste bajo despues del procesamiento; puede empeorar el analisis."

    return {
        "label": label,
        "severity": severity,
        "summary": " ".join([summary, *notes]).strip(),
        "training_use": "requires_review",
        "warnings": warnings,
    }


def build_quality_report(payload: QualityReportPayload) -> dict[str, Any]:
    source = resolve_allowed_audio_path(payload.source_audio_path)
    processed = resolve_allowed_audio_path(payload.processed_audio_path)

    source_metrics = quality_metrics(source)
    processed_metrics = quality_metrics(processed)
    contrast_improvement = round(processed_metrics["contrast_db"] - source_metrics["contrast_db"], 3)

    band_energy = []
    for label in ["0-300", "300-2000", "2000-8000", "8000-12000"]:
        source_db = source_metrics["bands"][label]
        processed_db = processed_metrics["bands"][label]
        delta = round(processed_db - source_db, 3)
        band_energy.append(
            {
                "band_hz": label,
                "source_db": source_db,
                "processed_db": processed_db,
                "delta_db": delta,
                "interpretation": band_interpretation(label, delta),
            }
        )

    detector = {
        "source_score": None,
        "processed_score": None,
        "delta_score": None,
        "source_prediction": None,
        "processed_prediction": None,
    }
    detector_warning = None
    if payload.run_frog_detector:
        source_prediction, source_score, source_error = call_frog_detector(
            str(source),
            BatchDetectorParams(
                model_id=payload.frog_detector_model_id,
                threshold=payload.frog_detector_threshold,
                clip_duration=min(5, max(1, source_metrics["duration_seconds"])),
            ),
        )
        processed_prediction, processed_score, processed_error = call_frog_detector(
            str(processed),
            BatchDetectorParams(
                model_id=payload.frog_detector_model_id,
                threshold=payload.frog_detector_threshold,
                clip_duration=min(5, max(1, processed_metrics["duration_seconds"])),
            ),
        )
        detector.update(
            {
                "source_score": source_score,
                "processed_score": processed_score,
                "delta_score": round(processed_score - source_score, 6)
                if source_score is not None and processed_score is not None
                else None,
                "source_prediction": source_prediction if source_prediction != "error" else None,
                "processed_prediction": processed_prediction if processed_prediction != "error" else None,
            }
        )
        if source_error or processed_error:
            detector_warning = "detector no disponible"

    recommendation = build_quality_recommendation(
        source_metrics,
        processed_metrics,
        contrast_improvement,
        band_energy,
        detector_warning,
    )

    report = {
        "source_audio_path": str(source),
        "processed_audio_path": str(processed),
        "source_audio_name": source.name,
        "processed_audio_name": processed.name,
        "duration_seconds": processed_metrics["duration_seconds"],
        "duration_source_seconds": source_metrics["duration_seconds"],
        "duration_processed_seconds": processed_metrics["duration_seconds"],
        "sample_rate_source": source_metrics["sample_rate"],
        "sample_rate_processed": processed_metrics["sample_rate"],
        "peak_source": source_metrics["peak"],
        "peak_processed": processed_metrics["peak"],
        "clipping_source_ratio": source_metrics["clipping_ratio"],
        "clipping_processed_ratio": processed_metrics["clipping_ratio"],
        "rms_db_source": source_metrics["rms_db"],
        "rms_db_processed": processed_metrics["rms_db"],
        "noise_floor_db_source": source_metrics["noise_floor_db"],
        "noise_floor_db_processed": processed_metrics["noise_floor_db"],
        "activity_db_source": source_metrics["activity_db"],
        "activity_db_processed": processed_metrics["activity_db"],
        "contrast_db_source": source_metrics["contrast_db"],
        "contrast_db_processed": processed_metrics["contrast_db"],
        "contrast_improvement_db": contrast_improvement,
        "band_energy": band_energy,
        "frog_detector": detector,
        "recommendation": recommendation,
        "created_at": now_iso(),
    }
    return report


def annotation_key(item: dict[str, Any]) -> tuple[Any, ...]:
    return (
        item.get("audio_path"),
        round(float(item.get("segment_start_seconds") or item.get("start_seconds") or 0), 3),
        round(float(item.get("segment_end_seconds") or item.get("end_seconds") or 0), 3),
        item.get("model_id"),
    )


def conflict_groups(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for item in items:
        if item.get("status") == "retracted":
            continue
        grouped.setdefault(annotation_key(item), []).append(item)

    conflicts = []
    conflict_sets = [
        {"confirmed_positive", "false_positive"},
        {"confirmed_positive", "hard_negative"},
        {"confirmed_positive", "excluded_from_training"},
    ]
    for key, rows in grouped.items():
        feedbacks = {row.get("feedback_type") or row.get("user_feedback") for row in rows}
        if any(rule.issubset(feedbacks) for rule in conflict_sets):
            conflicts.append(
                {
                    "audio_path": key[0],
                    "start_seconds": key[1],
                    "end_seconds": key[2],
                    "model_id": key[3],
                    "feedback_types": sorted(feedbacks),
                    "annotation_ids": [row["id"] for row in rows],
                    "message": "Este item tiene feedback contradictorio. Corrige antes de usarlo para entrenamiento.",
                }
            )
    return conflicts


def fetch_annotations_for_audit(conn, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    filters = filters or {}
    where = []
    params: list[Any] = []
    mapping = {
        "audio_path": "audio_path",
        "model_id": "model_id",
        "feedback_type": "feedback_type",
        "exclusion_reason": "exclusion_reason",
        "status": "status",
    }
    for key, column in mapping.items():
        value = filters.get(key)
        if value:
            where.append(f"{column} = ?")
            params.append(value)
    if filters.get("date_from"):
        where.append("created_at >= ?")
        params.append(filters["date_from"])
    if filters.get("date_to"):
        where.append("created_at <= ?")
        params.append(filters["date_to"])
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = conn.execute(
        f"""
        SELECT *
        FROM audio_lab_annotations
        {clause}
        ORDER BY created_at DESC
        """,
        params,
    ).fetchall()
    return [row_to_dict(row) for row in rows]


def summarize_feedback(items: list[dict[str, Any]]) -> dict[str, Any]:
    active = [item for item in items if item.get("status") != "retracted"]
    return {
        "total": len(items),
        "active": len(active),
        "confirmed_positive": sum((item.get("feedback_type") or item.get("user_feedback")) == "confirmed_positive" for item in active),
        "false_positive": sum((item.get("feedback_type") or item.get("user_feedback")) == "false_positive" for item in active),
        "false_negative": sum((item.get("feedback_type") or item.get("user_feedback")) == "false_negative" for item in active),
        "excluded_from_training": sum((item.get("feedback_type") or item.get("user_feedback")) == "excluded_from_training" for item in active),
        "human_voice": sum(item.get("exclusion_reason") == "voz_humana" or item.get("label_type") == "human_voice" for item in active),
        "hard_negative": sum((item.get("feedback_type") or item.get("user_feedback")) == "hard_negative" for item in active),
        "retracted": sum(item.get("status") == "retracted" for item in items),
        "corrected": sum(item.get("status") == "corrected" for item in items),
    }


def clean_manifest_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    conflicts = conflict_groups(items)
    active = [item for item in items if item.get("status") != "retracted"]
    excluded_training = [
        item for item in active if (item.get("feedback_type") or item.get("user_feedback")) == "excluded_from_training"
    ]
    human_voice = [item for item in active if item.get("exclusion_reason") == "voz_humana" or item.get("label_type") == "human_voice"]
    review = [item for item in active if (item.get("feedback_type") or item.get("user_feedback")) == "uncertain"]
    confirmed = [item for item in active if (item.get("feedback_type") or item.get("user_feedback")) == "confirmed_positive"]
    hard_negatives = [item for item in active if (item.get("feedback_type") or item.get("user_feedback")) == "hard_negative"]
    excluded_ids = {item["id"] for item in excluded_training + human_voice}
    included = [item for item in active if item["id"] not in excluded_ids and annotation_key(item) not in {annotation_key(row) for conflict in conflicts for row in active if row["id"] in conflict["annotation_ids"]}]
    return {
        "rows_before": len(items),
        "rows_after": len(included),
        "excluded_by_human_voice": len(human_voice),
        "excluded_by_retracted": sum(item.get("status") == "retracted" for item in items),
        "excluded_by_excluded_from_training": len(excluded_training),
        "included_confirmed": len(confirmed),
        "sent_to_review": len(review),
        "hard_negatives_available": len(hard_negatives),
        "conflicts_detected": len(conflicts),
        "conflicts": conflicts,
    }


def ensure_audio_lab_schema(conn) -> None:
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(audio_lab_annotations)").fetchall()}
    columns = {
        "audio_path": "TEXT",
        "start_seconds": "REAL",
        "end_seconds": "REAL",
        "audio_name": "TEXT",
        "source_row_id": "TEXT",
        "segment_start_seconds": "REAL",
        "segment_end_seconds": "REAL",
        "model_id": "TEXT",
        "predicted_label": "TEXT",
        "raw_argmax_label": "TEXT",
        "decision_rule_applied": "INTEGER DEFAULT 0",
        "threshold": "REAL",
        "score": "REAL",
        "score_used": "REAL",
        "user_feedback": "TEXT",
        "feedback_type": "TEXT",
        "exclusion_reason": "TEXT",
        "label_type": "TEXT",
        "recommended_training_use": "TEXT",
        "hard_negative_candidate": "INTEGER DEFAULT 0",
        "user_label": "TEXT",
        "notes": "TEXT",
        "status": "TEXT DEFAULT 'active'",
        "is_legacy": "INTEGER DEFAULT 0",
        "needs_review": "INTEGER DEFAULT 0",
        "created_at": "TEXT",
        "updated_at": "TEXT",
        "previous_feedback": "TEXT",
        "new_feedback": "TEXT",
        "correction_note": "TEXT",
        "processed_audio_path": "TEXT",
        "batch_job_id": "TEXT",
        "batch_output_id": "TEXT",
        "processing_metadata_path": "TEXT",
        "original_source_audio_path": "TEXT",
        "final_label": "TEXT",
        "pipeline_stages_json": "TEXT",
        "model_ids_json": "TEXT",
    }
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE audio_lab_annotations ADD COLUMN {name} {definition}")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_annotations_status ON audio_lab_annotations(status)"
    )

    conn.execute(
        """
        UPDATE audio_lab_annotations
        SET
            segment_start_seconds = COALESCE(segment_start_seconds, start_seconds),
            segment_end_seconds = COALESCE(segment_end_seconds, end_seconds),
            score_used = COALESCE(score_used, score),
            feedback_type = COALESCE(feedback_type, user_feedback),
            status = CASE
                WHEN audio_path IS NULL OR start_seconds IS NULL OR end_seconds IS NULL THEN 'needs_review'
                ELSE COALESCE(status, 'active')
            END,
            is_legacy = CASE
                WHEN raw_argmax_label IS NULL AND threshold IS NULL AND score_used IS NULL THEN 1
                ELSE COALESCE(is_legacy, 0)
            END,
            needs_review = CASE
                WHEN audio_path IS NULL OR start_seconds IS NULL OR end_seconds IS NULL THEN 1
                ELSE COALESCE(needs_review, 0)
            END,
            created_at = COALESCE(created_at, datetime('now'))
        WHERE status IS NULL
           OR segment_start_seconds IS NULL
           OR segment_end_seconds IS NULL
           OR score_used IS NULL
           OR feedback_type IS NULL
           OR is_legacy IS NULL
           OR needs_review IS NULL
           OR created_at IS NULL
        """
    )
    conn.commit()


def ensure_audio_lab_extra_schema(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_clips (
            id TEXT PRIMARY KEY,
            source_audio_path TEXT NOT NULL,
            output_audio_path TEXT NOT NULL,
            output_metadata_path TEXT,
            audio_name TEXT,
            start_seconds REAL NOT NULL,
            end_seconds REAL NOT NULL,
            duration_seconds REAL,
            purpose TEXT,
            notes TEXT,
            status TEXT DEFAULT 'created',
            created_at TEXT NOT NULL
        )
        """
    )
    existing_clip_columns = {row["name"] for row in conn.execute("PRAGMA table_info(audio_lab_clips)").fetchall()}
    if "output_metadata_path" not in existing_clip_columns:
        conn.execute("ALTER TABLE audio_lab_clips ADD COLUMN output_metadata_path TEXT")
    conn.execute(
        """
        UPDATE audio_lab_clips
        SET output_metadata_path = output_audio_path || '.json'
        WHERE output_metadata_path IS NULL
          AND output_audio_path IS NOT NULL
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_clips_source ON audio_lab_clips(source_audio_path)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_activity_runs (
            id TEXT PRIMARY KEY,
            audio_path TEXT NOT NULL,
            method TEXT NOT NULL,
            params_json TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_activity_segments (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            segment_key TEXT NOT NULL,
            start_seconds REAL NOT NULL,
            end_seconds REAL NOT NULL,
            duration_seconds REAL NOT NULL,
            peak_db REAL,
            mean_db REAL,
            score REAL,
            selected INTEGER DEFAULT 0,
            clip_id TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(run_id) REFERENCES audio_lab_activity_runs(id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_activity_runs_audio ON audio_lab_activity_runs(audio_path)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_activity_segments_run ON audio_lab_activity_segments(run_id)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_batch_jobs (
            id TEXT PRIMARY KEY,
            job_name TEXT,
            mode TEXT NOT NULL,
            preset TEXT NOT NULL,
            status TEXT NOT NULL,
            progress REAL DEFAULT 0,
            phase TEXT,
            current_file TEXT,
            params_json TEXT,
            summary_json TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_batch_items (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            source_audio_path TEXT NOT NULL,
            status TEXT NOT NULL,
            duration_seconds REAL,
            segments_detected INTEGER DEFAULT 0,
            segments_created INTEGER DEFAULT 0,
            segments_discarded INTEGER DEFAULT 0,
            processed_files_count INTEGER DEFAULT 0,
            frog_detected_count INTEGER DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            error_message TEXT,
            FOREIGN KEY(job_id) REFERENCES audio_lab_batch_jobs(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_batch_outputs (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            source_audio_path TEXT NOT NULL,
            segment_start_seconds REAL,
            segment_end_seconds REAL,
            segment_audio_path TEXT,
            processed_audio_path TEXT,
            processing_metadata_path TEXT,
            frog_detector_score REAL,
            frog_detector_prediction TEXT,
            recommended_action TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES audio_lab_batch_jobs(id),
            FOREIGN KEY(item_id) REFERENCES audio_lab_batch_items(id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_lab_batch_items_job ON audio_lab_batch_items(job_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_lab_batch_outputs_job ON audio_lab_batch_outputs(job_id)")
    existing_output_columns = {row["name"] for row in conn.execute("PRAGMA table_info(audio_lab_batch_outputs)").fetchall()}
    for name, definition in {
        "quality_report_path": "TEXT",
        "quality_report_label": "TEXT",
    }.items():
        if name not in existing_output_columns:
            conn.execute(f"ALTER TABLE audio_lab_batch_outputs ADD COLUMN {name} {definition}")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_quality_reports (
            id TEXT PRIMARY KEY,
            source_audio_path TEXT NOT NULL,
            processed_audio_path TEXT NOT NULL,
            report_path TEXT NOT NULL,
            recommendation_label TEXT,
            contrast_improvement_db REAL,
            clipping_processed_ratio REAL,
            frog_source_score REAL,
            frog_processed_score REAL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_quality_reports_processed ON audio_lab_quality_reports(processed_audio_path)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_clean_manifests (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            manifest_path TEXT NOT NULL,
            summary_json TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_uploads (
            id TEXT PRIMARY KEY,
            original_filename TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            size_bytes INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_folder_batch_jobs (
            id TEXT PRIMARY KEY,
            job_name TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            folder_path_resolved TEXT,
            target_label TEXT,
            status TEXT NOT NULL,
            mode TEXT,
            preset TEXT,
            frequency_min_hz REAL,
            frequency_max_hz REAL,
            threshold_dbfs REAL,
            total_files INTEGER DEFAULT 0,
            processed_files INTEGER DEFAULT 0,
            total_duration_seconds REAL DEFAULT 0,
            processed_duration_seconds REAL DEFAULT 0,
            candidates_count INTEGER DEFAULT 0,
            discarded_count INTEGER DEFAULT 0,
            contaminant_suspect_count INTEGER DEFAULT 0,
            frog_positive_count INTEGER DEFAULT 0,
            errors_count INTEGER DEFAULT 0,
            output_dir TEXT,
            manifest_path TEXT,
            params_json TEXT,
            summary_json TEXT,
            current_file TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    existing_folder_job_columns = {row["name"] for row in conn.execute("PRAGMA table_info(audio_lab_folder_batch_jobs)").fetchall()}
    if "folder_path_resolved" not in existing_folder_job_columns:
        conn.execute("ALTER TABLE audio_lab_folder_batch_jobs ADD COLUMN folder_path_resolved TEXT")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_folder_batch_files (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            original_audio_path TEXT NOT NULL,
            audio_name TEXT,
            extension TEXT,
            size_bytes INTEGER DEFAULT 0,
            duration_seconds REAL,
            sample_rate INTEGER,
            status TEXT,
            error TEXT,
            processed_at TEXT,
            FOREIGN KEY(job_id) REFERENCES audio_lab_folder_batch_jobs(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_folder_batch_segments (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            file_id TEXT NOT NULL,
            original_audio_path TEXT NOT NULL,
            start_seconds REAL,
            end_seconds REAL,
            duration_seconds REAL,
            frequency_min_hz REAL,
            frequency_max_hz REAL,
            rms_dbfs REAL,
            band_rms_dbfs REAL,
            band_energy_ratio REAL,
            snr_estimate REAL,
            activity_score REAL,
            contaminant_flags_json TEXT,
            recommendation TEXT,
            output_audio_path TEXT,
            output_metadata_path TEXT,
            quality_report_path TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES audio_lab_folder_batch_jobs(id),
            FOREIGN KEY(file_id) REFERENCES audio_lab_folder_batch_files(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_folder_batch_outputs (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            file_id TEXT NOT NULL,
            segment_id TEXT,
            original_audio_path TEXT NOT NULL,
            output_audio_path TEXT,
            output_metadata_path TEXT,
            quality_report_path TEXT,
            recommendation TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES audio_lab_folder_batch_jobs(id),
            FOREIGN KEY(file_id) REFERENCES audio_lab_folder_batch_files(id),
            FOREIGN KEY(segment_id) REFERENCES audio_lab_folder_batch_segments(id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_lab_folder_batch_files_job ON audio_lab_folder_batch_files(job_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_lab_folder_batch_segments_job ON audio_lab_folder_batch_segments(job_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_lab_folder_batch_outputs_job ON audio_lab_folder_batch_outputs(job_id)")
    conn.commit()


def validate_feedback(user_feedback: str | None) -> None:
    if user_feedback and user_feedback not in VALID_FEEDBACK:
        raise HTTPException(
            status_code=400,
            detail=f"user_feedback debe ser uno de: {sorted(VALID_FEEDBACK)}",
        )


def validate_status(status: str | None) -> None:
    if status and status not in VALID_STATUS:
        raise HTTPException(
            status_code=400,
            detail=f"status debe ser uno de: {sorted(VALID_STATUS)}",
        )


def validate_exclusion_reason(reason: str | None) -> None:
    if reason and reason not in VALID_EXCLUSION_REASONS:
        raise HTTPException(
            status_code=400,
            detail=f"exclusion_reason debe ser uno de: {sorted(VALID_EXCLUSION_REASONS)}",
        )


@router.post("/annotations")
def create_annotation(payload: AudioLabAnnotationPayload):
    validate_feedback(payload.user_feedback)
    validate_status(payload.status)
    validate_exclusion_reason(payload.exclusion_reason)

    annotation_id = str(uuid.uuid4())
    created_at = now_iso()
    segment_start = payload.segment_start_seconds if payload.segment_start_seconds is not None else payload.start_seconds
    segment_end = payload.segment_end_seconds if payload.segment_end_seconds is not None else payload.end_seconds
    score_used = payload.score_used if payload.score_used is not None else payload.score
    status = payload.status or "active"
    feedback_type = payload.feedback_type or payload.user_feedback
    label_type = payload.label_type
    recommended_training_use = payload.recommended_training_use
    hard_negative_candidate = payload.hard_negative_candidate
    if payload.user_feedback == "excluded_from_training" and payload.exclusion_reason == "voz_humana":
        label_type = label_type or "human_voice"
        recommended_training_use = recommended_training_use or "exclude_species_training"
        hard_negative_candidate = False if hard_negative_candidate is None else hard_negative_candidate

    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        conn.execute(
            """
            INSERT INTO audio_lab_annotations (
                id,
                audio_path,
                audio_name,
                source_row_id,
                start_seconds,
                end_seconds,
                segment_start_seconds,
                segment_end_seconds,
                model_id,
                predicted_label,
                raw_argmax_label,
                decision_rule_applied,
                threshold,
                score,
                score_used,
                user_feedback,
                feedback_type,
                exclusion_reason,
                label_type,
                recommended_training_use,
                hard_negative_candidate,
                user_label,
                notes,
                status,
                previous_feedback,
                new_feedback,
                correction_note,
                processed_audio_path,
                batch_job_id,
                batch_output_id,
                processing_metadata_path,
                original_source_audio_path,
                final_label,
                pipeline_stages_json,
                model_ids_json,
                updated_at,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                annotation_id,
                payload.audio_path,
                payload.audio_name,
                payload.source_row_id,
                payload.start_seconds,
                payload.end_seconds,
                segment_start,
                segment_end,
                payload.model_id,
                payload.predicted_label,
                payload.raw_argmax_label,
                1 if payload.decision_rule_applied else 0,
                payload.threshold,
                payload.score,
                score_used,
                payload.user_feedback,
                feedback_type,
                payload.exclusion_reason,
                label_type,
                recommended_training_use,
                1 if hard_negative_candidate else 0,
                payload.user_label,
                payload.notes,
                status,
                payload.previous_feedback,
                payload.new_feedback or payload.user_feedback,
                payload.correction_note,
                payload.processed_audio_path,
                payload.batch_job_id,
                payload.batch_output_id,
                payload.processing_metadata_path,
                payload.original_source_audio_path,
                payload.final_label,
                payload.pipeline_stages_json,
                payload.model_ids_json,
                created_at,
                created_at,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM audio_lab_annotations WHERE id = ?",
            (annotation_id,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@router.get("/annotations")
def list_annotations(
    audio_path: str | None = None,
    model_id: str | None = None,
    feedback_type: str | None = None,
    exclusion_reason: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    where_parts = []
    params: list[Any] = []
    for column, value in {
        "audio_path": audio_path,
        "model_id": model_id,
        "feedback_type": feedback_type,
        "exclusion_reason": exclusion_reason,
        "status": status,
    }.items():
        if value:
            where_parts.append(f"{column} = ?")
            params.append(value)
    if date_from:
        where_parts.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        where_parts.append("created_at <= ?")
        params.append(date_to)
    where = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        rows = conn.execute(
            f"""
            SELECT *
            FROM audio_lab_annotations
            {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        ).fetchall()
        total = conn.execute(
            f"SELECT COUNT(*) AS total FROM audio_lab_annotations {where}",
            params,
        ).fetchone()["total"]
        return {
            "items": [row_to_dict(row) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    finally:
        conn.close()


@router.get("/feedback/audit")
def feedback_audit(
    audio_path: str | None = None,
    model_id: str | None = None,
    feedback_type: str | None = None,
    exclusion_reason: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    filters = {
        "audio_path": audio_path,
        "model_id": model_id,
        "feedback_type": feedback_type,
        "exclusion_reason": exclusion_reason,
        "status": status,
        "date_from": date_from,
        "date_to": date_to,
    }
    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        items = fetch_annotations_for_audit(conn, filters)
        return {
            "summary": summarize_feedback(items),
            "conflicts": conflict_groups(items),
            "items": items[offset : offset + limit],
            "total": len(items),
            "limit": limit,
            "offset": offset,
        }
    finally:
        conn.close()


@router.get("/feedback/conflicts")
def feedback_conflicts():
    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        items = fetch_annotations_for_audit(conn)
        return {"items": conflict_groups(items)}
    finally:
        conn.close()


@router.get("/annotations/facets")
def annotation_facets():
    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        rows = conn.execute(
            """
            SELECT
                model_id,
                COALESCE(feedback_type, user_feedback) AS feedback_type,
                exclusion_reason,
                status,
                created_at
            FROM audio_lab_annotations
            """
        ).fetchall()
        items = [row_to_dict(row) for row in rows]
        dates = sorted(item["created_at"] for item in items if item.get("created_at"))
        return {
            "models": sorted({item["model_id"] for item in items if item.get("model_id")}),
            "feedback_types": sorted({item["feedback_type"] for item in items if item.get("feedback_type")}),
            "exclusion_reasons": sorted({item["exclusion_reason"] for item in items if item.get("exclusion_reason")}),
            "statuses": sorted({item["status"] for item in items if item.get("status")}),
            "date_min": dates[0] if dates else None,
            "date_max": dates[-1] if dates else None,
        }
    finally:
        conn.close()


@router.post("/debug/resolve-audio")
def debug_resolve_audio(payload: DebugResolveAudioPayload):
    if payload.context == "curated_dataset" and payload.segment_id:
        from app.api.routes.curated_dataset import debug_curated_segment_audio

        return debug_curated_segment_audio(payload.segment_id)
    if not payload.audio_path:
        raise HTTPException(status_code=400, detail="Debes enviar audio_path o segment_id con context=curated_dataset.")
    return debug_resolve_audio_path(payload.audio_path)


@router.get("/waveform")
def get_waveform(audio_path: str, points: int = Query(1400, ge=100, le=10000)):
    path = resolve_allowed_audio_path(audio_path)
    try:
        if sf is not None:
            data, sample_rate = sf.read(str(path), always_2d=True)
            mono = data.mean(axis=1).astype("float32")
        elif path.suffix.lower() == ".wav":
            mono, sample_rate = read_wave_mono(path)
        else:
            raise RuntimeError("soundfile no esta instalado; solo se puede calcular waveform server-side para WAV.")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No fue posible leer el audio para waveform: {exc}") from exc

    if mono.size == 0:
        raise HTTPException(status_code=400, detail="Audio sin muestras.")
    bucket_count = min(points, mono.size)
    edges = np.linspace(0, mono.size, bucket_count + 1, dtype=int)
    peaks = []
    max_abs = float(np.max(np.abs(mono))) or 1.0
    for idx in range(bucket_count):
        chunk = mono[edges[idx] : edges[idx + 1]]
        if chunk.size == 0:
            peaks.append({"min": 0.0, "max": 0.0})
        else:
            peaks.append({"min": float(np.min(chunk) / max_abs), "max": float(np.max(chunk) / max_abs)})
    return {
        "duration_seconds": float(mono.size / sample_rate),
        "sample_rate": int(sample_rate),
        "peaks": peaks,
    }


@router.post("/clean-manifest/dry-run")
def dry_run_clean_manifest(payload: CleanManifestPayload | None = None):
    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        items = fetch_annotations_for_audit(conn)
        return clean_manifest_summary(items)
    finally:
        conn.close()


@router.post("/clean-manifest")
def create_clean_manifest(payload: CleanManifestPayload):
    name = payload.name or f"audio_lab_clean_manifest_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        ensure_audio_lab_extra_schema(conn)
        items = fetch_annotations_for_audit(conn)
        summary = clean_manifest_summary(items)
        if summary["conflicts_detected"]:
            raise HTTPException(status_code=409, detail="Hay feedback contradictorio. Corrige antes de crear el manifest.")

        output_dir = settings.STORAGE_DIR / "audio_lab_manifests"
        output_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = output_dir / f"{name}.csv"
        active_items = [item for item in items if item.get("status") != "retracted"]
        with manifest_path.open("w", newline="", encoding="utf-8") as f:
            fieldnames = [
                "audio_path",
                "audio_name",
                "start_seconds",
                "end_seconds",
                "model_id",
                "predicted_label",
                "raw_argmax_label",
                "score_used",
                "threshold",
                "feedback_type",
                "exclusion_reason",
                "status",
                "notes",
            ]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for item in active_items:
                feedback = item.get("feedback_type") or item.get("user_feedback")
                if feedback == "excluded_from_training" or item.get("exclusion_reason") == "voz_humana" or item.get("label_type") == "human_voice":
                    continue
                writer.writerow({key: item.get(key) for key in fieldnames})

        manifest_id = str(uuid.uuid4())
        created_at = now_iso()
        conn.execute(
            """
            INSERT INTO audio_lab_clean_manifests (id, name, manifest_path, summary_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (manifest_id, name, str(manifest_path), json.dumps(summary, ensure_ascii=False), created_at),
        )
        conn.commit()
        return {"id": manifest_id, "name": name, "manifest_path": str(manifest_path), "summary": summary, "created_at": created_at}
    finally:
        conn.close()


@router.patch("/annotations/{annotation_id}")
def update_annotation(annotation_id: str, payload: AudioLabAnnotationUpdatePayload):
    validate_feedback(payload.user_feedback)
    validate_status(payload.status)
    validate_exclusion_reason(payload.exclusion_reason)

    updates = (
        payload.model_dump(exclude_unset=True)
        if hasattr(payload, "model_dump")
        else payload.dict(exclude_unset=True)
    )
    if not updates:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar.")

    if updates.get("user_feedback") == "excluded_from_training" and updates.get("exclusion_reason") == "voz_humana":
        updates.setdefault("label_type", "human_voice")
        updates.setdefault("recommended_training_use", "exclude_species_training")
        updates.setdefault("hard_negative_candidate", False)
    if "feedback_type" not in updates and "user_feedback" in updates:
        updates["feedback_type"] = updates["user_feedback"]

    updates["updated_at"] = now_iso()
    bool_fields = {"hard_negative_candidate"}
    set_clause = ", ".join(f"{field} = ?" for field in updates)
    values = [1 if field in bool_fields and value else 0 if field in bool_fields else value for field, value in updates.items()]

    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        existing = conn.execute(
            "SELECT id FROM audio_lab_annotations WHERE id = ?",
            (annotation_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Anotacion no encontrada.")
        conn.execute(
            f"UPDATE audio_lab_annotations SET {set_clause} WHERE id = ?",
            (*values, annotation_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM audio_lab_annotations WHERE id = ?",
            (annotation_id,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@router.post("/annotations/{annotation_id}/retract")
def retract_annotation(annotation_id: str):
    updated_at = now_iso()
    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        existing = conn.execute(
            "SELECT id FROM audio_lab_annotations WHERE id = ?",
            (annotation_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Anotacion no encontrada.")
        conn.execute(
            "UPDATE audio_lab_annotations SET status = 'retracted', updated_at = ? WHERE id = ?",
            (updated_at, annotation_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM audio_lab_annotations WHERE id = ?",
            (annotation_id,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@router.post("/clips")
def create_clip(payload: AudioClipPayload):
    if payload.end_seconds <= payload.start_seconds:
        raise HTTPException(status_code=400, detail="end_seconds debe ser mayor que start_seconds.")
    source = resolve_allowed_audio_path(payload.source_audio_path)

    clip_id = str(uuid.uuid4())
    created_at = now_iso()
    safe_name = safe_filename(payload.suggested_name or f"{source.stem}_{payload.start_seconds:.1f}_{payload.end_seconds:.1f}")
    if safe_name.lower().endswith((".flac", ".mp3", ".ogg", ".json")):
        safe_name = Path(safe_name).stem
    if not safe_name.lower().endswith(".wav"):
        safe_name = f"{safe_name}.wav"
    output_dir = audio_lab_dir("clips")
    duration = payload.end_seconds - payload.start_seconds
    status = "created"
    output_path = output_dir / f"{clip_id}_{safe_name}"
    metadata_path = output_path.with_suffix(output_path.suffix + ".json")

    try:
        if sf is not None:
            info = sf.info(str(source))
            sample_rate = int(info.samplerate)
            start_frame = max(0, int(payload.start_seconds * sample_rate))
            end_frame = max(start_frame, int(payload.end_seconds * sample_rate))
            frames = max(0, end_frame - start_frame)
            if frames <= 0:
                raise HTTPException(status_code=400, detail="El recorte no contiene muestras.")
            data, read_rate = sf.read(str(source), start=start_frame, frames=frames, always_2d=True)
            if data.size == 0:
                raise HTTPException(status_code=400, detail="El recorte quedo vacio.")
            try:
                sf.write(str(output_path), data, int(read_rate), format="WAV")
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"No fue posible escribir el WAV del recorte: {exc}") from exc
            duration = float(len(data) / int(read_rate))
        elif source.suffix.lower() == ".wav":
            try:
                duration = write_wave_clip(source, output_path, payload.start_seconds, payload.end_seconds)
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"No fue posible escribir el WAV del recorte: {exc}") from exc
        else:
            raise HTTPException(
                status_code=400,
                detail="soundfile no esta instalado; no es posible recortar FLAC/MP3 en el backend actual.",
            )
        if not output_path.exists() or output_path.stat().st_size <= 0:
            raise HTTPException(status_code=500, detail="No se pudo crear el archivo WAV del recorte.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No fue posible crear el recorte reproducible: {exc}") from exc

    sidecar = {
        "id": clip_id,
        "source_audio_path": str(source),
        "output_audio_path": str(output_path),
        "output_metadata_path": str(metadata_path),
        "start_seconds": payload.start_seconds,
        "end_seconds": payload.end_seconds,
        "duration_seconds": duration,
        "purpose": payload.purpose,
        "notes": payload.notes,
        "status": status,
        "created_at": created_at,
    }
    try:
        metadata_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"El WAV se creo, pero no fue posible escribir metadata del recorte: {exc}") from exc

    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        conn.execute(
            """
            INSERT INTO audio_lab_clips (
                id, source_audio_path, output_audio_path, output_metadata_path, audio_name, start_seconds,
                end_seconds, duration_seconds, purpose, notes, status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                clip_id,
                str(source),
                str(output_path),
                str(metadata_path),
                output_path.name,
                payload.start_seconds,
                payload.end_seconds,
                duration,
                payload.purpose,
                payload.notes,
                status,
                created_at,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM audio_lab_clips WHERE id = ?", (clip_id,)).fetchone()
        return clip_row_to_dict(row)
    finally:
        conn.close()


@router.post("/activity/detect")
def detect_activity(payload: ActivityDetectPayload):
    result = detect_activity_segments(payload)
    run_id = str(uuid.uuid4())
    created_at = now_iso()
    result["run_id"] = run_id

    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        conn.execute(
            """
            INSERT INTO audio_lab_activity_runs (id, audio_path, method, params_json, summary_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                result["audio_path"],
                result["method"],
                json.dumps(result["params"], ensure_ascii=False),
                json.dumps(result["summary"], ensure_ascii=False),
                created_at,
            ),
        )
        for segment in result["segments"]:
            segment["run_id"] = run_id
            conn.execute(
                """
                INSERT INTO audio_lab_activity_segments (
                    id, run_id, segment_key, start_seconds, end_seconds, duration_seconds,
                    peak_db, mean_db, score, selected, clip_id, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    run_id,
                    segment["id"],
                    segment["start_seconds"],
                    segment["end_seconds"],
                    segment["duration_seconds"],
                    segment["peak_db"],
                    segment["mean_db"],
                    segment["score"],
                    0,
                    None,
                    created_at,
                ),
            )
        conn.commit()
        return result
    finally:
        conn.close()


@router.post("/activity/create-clips")
def create_activity_clips(payload: ActivityCreateClipsPayload):
    if payload.format.lower() != "wav":
        raise HTTPException(status_code=400, detail="Por ahora solo se soporta format=wav.")
    source = resolve_allowed_audio_path(payload.audio_path)
    if not payload.segments:
        raise HTTPException(status_code=400, detail="Debes enviar al menos un segmento.")

    clips = []
    total_duration = 0.0
    prefix = safe_filename(payload.name_prefix or source.stem)
    for index, segment in enumerate(payload.segments, start=1):
        if segment.end_seconds <= segment.start_seconds:
            raise HTTPException(status_code=400, detail=f"Segmento invalido: {segment.id or index}.")
        total_duration += segment.end_seconds - segment.start_seconds
        segment_key = safe_filename(segment.id or f"seg_{index:04d}")
        clip = create_clip(
            AudioClipPayload(
                source_audio_path=str(source),
                audio_name=source.name,
                start_seconds=segment.start_seconds,
                end_seconds=segment.end_seconds,
                suggested_name=f"{prefix}__{segment_key}__clip_{segment.start_seconds:.1f}_{segment.end_seconds:.1f}.wav",
                purpose=payload.purpose,
                notes=f"Recorte derivado de deteccion de actividad {segment.id or segment_key}.",
            )
        )
        clips.append(clip)

        if segment.run_id and segment.id:
            conn = get_connection()
            try:
                ensure_audio_lab_extra_schema(conn)
                conn.execute(
                    """
                    UPDATE audio_lab_activity_segments
                    SET selected = 1, clip_id = ?
                    WHERE run_id = ? AND segment_key = ?
                    """,
                    (clip["id"], segment.run_id, segment.id),
                )
                conn.commit()
            finally:
                conn.close()

    return {
        "audio_path": str(source),
        "clips": clips,
        "total": len(clips),
        "duration_seconds": round(total_duration, 3),
        "output_dir": str(audio_lab_dir("clips")),
        "purpose": payload.purpose,
        "format": "wav",
    }


def run_batch_processing_job(job_id: str, payload: BatchProcessingJobPayload) -> None:
    cancel_event = BATCH_JOB_CANCEL_EVENTS.setdefault(job_id, threading.Event())
    summary = {
        "audios_processed": 0,
        "segments_detected": 0,
        "segments_created": 0,
        "segments_discarded": 0,
        "processed_files_count": 0,
        "probable_rana": 0,
        "no_rana": 0,
        "revisar": 0,
        "errors": 0,
    }
    try:
        update_batch_job(job_id, status="running", started_at=now_iso(), phase="validando archivos", progress=1)
        log_batch_job(job_id, f"Job iniciado modo={payload.mode} preset={payload.preset}")
        total = max(1, len(payload.input_audio_paths))
        job_roots = [*allowed_audio_roots(), *validate_job_allowed_roots(payload.job_allowed_roots)]
        for index, raw_path in enumerate(payload.input_audio_paths):
            if cancel_event.is_set():
                update_batch_job(job_id, status="canceled", phase="cancelado", finished_at=now_iso())
                log_batch_job(job_id, "Job cancelado por el usuario")
                return
            source = Path(raw_path)
            base_progress = (index / total) * 100.0
            update_batch_job(job_id, current_file=str(source), phase="validando archivos", progress=round(base_progress, 2))
            item_id = insert_batch_item(job_id, str(source))
            try:
                source = resolve_allowed_audio_path(raw_path, job_roots)
            except HTTPException as exc:
                summary["errors"] += 1
                detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
                update_batch_item(item_id, status="error", error_message=json.dumps(detail, ensure_ascii=False))
                log_batch_job(job_id, f"ERROR ruta no disponible: {raw_path} {detail}")
                continue

            try:
                audio, sample_rate = read_audio_mono_for_activity(source)
                duration = float(len(audio) / sample_rate) if sample_rate else 0.0
                update_batch_item(item_id, duration_seconds=round(duration, 3))

                if payload.mode == "clean_existing":
                    update_batch_job(job_id, phase="aplicando reduccion de ruido", progress=round(base_progress + 40 / total, 2))
                    item_key = safe_filename(item_id)[:12]
                    processed_name = f"{item_key}_denoised.wav"
                    processed_path = batch_job_dir(job_id, "processed") / processed_name
                    metadata_path = processed_path.with_suffix(processed_path.suffix + ".json")
                    metadata = process_audio_copy(
                        source,
                        processed_path,
                        payload.denoise_params,
                        payload.steps.denoise,
                        payload.steps.normalize,
                        payload.steps.bandpass,
                    )
                    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

                    prediction = None
                    score = None
                    action = payload.output_policy.recommended_training_use
                    if payload.steps.run_frog_detector:
                        update_batch_job(job_id, phase="analizando con detector rana/sapo", progress=round(base_progress + 70 / total, 2))
                        prediction, score, detector_error = call_frog_detector(str(processed_path), payload.detector_params)
                        action = recommended_action_from_detector(prediction, score, payload.detector_params.threshold)
                        if detector_error:
                            log_batch_job(job_id, detector_error)
                    insert_batch_output(
                        job_id,
                        item_id,
                        str(source),
                        processed_audio_path=str(processed_path),
                        processing_metadata_path=str(metadata_path),
                        frog_detector_score=score,
                        frog_detector_prediction=prediction,
                        recommended_action=action,
                    )
                    summary["processed_files_count"] += 1
                    if action == "probable_rana":
                        summary["probable_rana"] += 1
                    elif action == "no_rana":
                        summary["no_rana"] += 1
                    elif action in {"revisar", "requires_review"}:
                        summary["revisar"] += 1
                    update_batch_item(
                        item_id,
                        status="completed",
                        processed_files_count=1,
                        frog_detected_count=1 if action == "probable_rana" else 0,
                        review_count=1 if action in {"revisar", "requires_review"} else 0,
                    )
                    summary["audios_processed"] += 1
                    log_batch_job(job_id, f"Procesado limpio: {processed_path}")
                    continue

                update_batch_job(job_id, phase="detectando actividad", progress=round(base_progress + 15 / total, 2))
                activity_payload = default_activity_params_for_audio(str(source), payload)
                activity = detect_activity_segments(activity_payload)
                detected_segments = activity.get("segments") or []
                summary["segments_detected"] += len(detected_segments)

                created = 0
                discarded = 0
                processed_count = 0
                frog_count = 0
                review_count = 0
                for segment in detected_segments:
                    if cancel_event.is_set():
                        update_batch_job(job_id, status="canceled", phase="cancelado", finished_at=now_iso())
                        log_batch_job(job_id, "Job cancelado por el usuario")
                        return
                    if payload.steps.discard_empty_segments and segment_is_empty(segment, activity_payload.min_activity_seconds):
                        discarded += 1
                        continue

                    segment_path = None
                    item_key = safe_filename(item_id)[:12]
                    if payload.steps.create_segments and payload.output_policy.save_segments:
                        update_batch_job(job_id, phase="creando segmentos")
                        segment_path = batch_job_dir(job_id, "segments") / f"{item_key}_{safe_filename(segment['id'])}.wav"
                        write_audio_segment_to_path(source, segment_path, segment["start_seconds"], segment["end_seconds"])
                        created += 1

                    processed_path = None
                    metadata_path = None
                    source_for_processing = segment_path or source
                    if payload.steps.denoise or payload.steps.normalize or payload.steps.bandpass:
                        update_batch_job(job_id, phase="reduciendo ruido")
                        processed_path = batch_job_dir(job_id, "processed") / f"{item_key}_{safe_filename(segment['id'])}_denoised.wav"
                        metadata_path = processed_path.with_suffix(processed_path.suffix + ".json")
                        metadata = process_audio_copy(
                            source_for_processing,
                            processed_path,
                            payload.denoise_params,
                            payload.steps.denoise,
                            payload.steps.normalize,
                            payload.steps.bandpass,
                        )
                        metadata.update(
                            {
                                "activity_segment": segment,
                                "source_segment_audio_path": str(segment_path) if segment_path else None,
                                "recommended_training_use": payload.output_policy.recommended_training_use,
                            }
                        )
                        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
                        processed_count += 1

                    detector_audio_path = str(processed_path or segment_path or source)
                    prediction = None
                    score = None
                    action = payload.output_policy.recommended_training_use
                    if payload.steps.run_frog_detector:
                        update_batch_job(job_id, phase="analizando con detector rana/sapo")
                        prediction, score, detector_error = call_frog_detector(detector_audio_path, payload.detector_params)
                        action = recommended_action_from_detector(prediction, score, payload.detector_params.threshold)
                        if detector_error:
                            log_batch_job(job_id, detector_error)

                    if action == "probable_rana":
                        frog_count += 1
                        summary["probable_rana"] += 1
                    elif action == "no_rana":
                        summary["no_rana"] += 1
                    elif action in {"revisar", "requires_review"}:
                        review_count += 1
                        summary["revisar"] += 1
                    elif action == "error":
                        summary["errors"] += 1

                    insert_batch_output(
                        job_id,
                        item_id,
                        str(source),
                        segment_start_seconds=segment["start_seconds"],
                        segment_end_seconds=segment["end_seconds"],
                        segment_audio_path=str(segment_path) if segment_path else None,
                        processed_audio_path=str(processed_path) if processed_path else None,
                        processing_metadata_path=str(metadata_path) if metadata_path else None,
                        frog_detector_score=score,
                        frog_detector_prediction=prediction,
                        recommended_action=action,
                    )

                summary["segments_created"] += created
                summary["segments_discarded"] += discarded
                summary["processed_files_count"] += processed_count
                summary["audios_processed"] += 1
                update_batch_item(
                    item_id,
                    status="completed",
                    segments_detected=len(detected_segments),
                    segments_created=created,
                    segments_discarded=discarded,
                    processed_files_count=processed_count,
                    frog_detected_count=frog_count,
                    review_count=review_count,
                )
                item_summary_path = batch_job_dir(job_id, "summaries") / f"{safe_filename(item_id)[:12]}.summary.json"
                item_summary_path.write_text(
                    json.dumps({"source_audio_path": str(source), "activity": activity, "created": created, "discarded": discarded}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                log_batch_job(job_id, f"Procesado full_auto: {source} segmentos={created} descartados={discarded}")
            except Exception as exc:
                summary["errors"] += 1
                update_batch_item(item_id, status="error", error_message=str(exc))
                log_batch_job(job_id, f"ERROR {source}: {exc}")
            finally:
                update_batch_job(
                    job_id,
                    progress=round(((index + 1) / total) * 100.0, 2),
                    summary_json=json.dumps(summary, ensure_ascii=False),
                )

        finished_summary = {**summary, "output_dir": str(batch_job_dir(job_id))}
        (batch_job_dir(job_id, "summaries") / "summary.json").write_text(
            json.dumps(finished_summary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        final_status = "completed"
        final_phase = "completado"
        if summary["errors"] and summary["audios_processed"] == 0:
            final_status = "failed"
            final_phase = "fallido"
        elif summary["errors"]:
            final_status = "completed_with_errors"
            final_phase = "completado con errores"
        update_batch_job(
            job_id,
            status=final_status,
            phase=final_phase,
            progress=100,
            summary_json=json.dumps(finished_summary, ensure_ascii=False),
            finished_at=now_iso(),
        )
        log_batch_job(job_id, "Job completado" if final_status == "completed" else f"Job finalizado: {final_status}")
    except Exception as exc:
        summary["errors"] += 1
        update_batch_job(
            job_id,
            status="failed",
            phase="fallido",
            summary_json=json.dumps(summary, ensure_ascii=False),
            finished_at=now_iso(),
        )
        log_batch_job(job_id, f"FATAL {exc}")
    finally:
        BATCH_JOB_CANCEL_EVENTS.pop(job_id, None)


def folder_batch_segment_to_manifest_row(job: dict[str, Any], file_row: dict[str, Any], segment: dict[str, Any]) -> dict[str, Any]:
    return {
        "audio_path": segment.get("output_audio_path") or "",
        "original_audio_path": segment.get("original_audio_path") or file_row.get("original_audio_path") or "",
        "start_seconds": segment.get("start_seconds"),
        "end_seconds": segment.get("end_seconds"),
        "duration_seconds": segment.get("duration_seconds"),
        "normalized_label": safe_filename(job.get("target_label") or "sin_label"),
        "target_label": job.get("target_label") or "",
        "source_job_id": job.get("id"),
        "source_file_id": file_row.get("id"),
        "processing_preset": job.get("preset"),
        "frequency_min_hz": segment.get("frequency_min_hz"),
        "frequency_max_hz": segment.get("frequency_max_hz"),
        "threshold_dbfs": job.get("threshold_dbfs"),
        "band_energy_ratio": segment.get("band_energy_ratio"),
        "rms_dbfs": segment.get("rms_dbfs"),
        "contaminant_flags": segment.get("contaminant_flags_json") or "[]",
        "recommendation": segment.get("recommendation"),
        "split": "",
    }


def write_folder_batch_manifest(job_id: str) -> str:
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        job_row = conn.execute("SELECT * FROM audio_lab_folder_batch_jobs WHERE id = ?", (job_id,)).fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job no encontrado.")
        job = folder_batch_job_to_dict(job_row)
        rows = conn.execute(
            """
            SELECT s.*, f.id AS source_file_id, f.original_audio_path AS file_original_audio_path
            FROM audio_lab_folder_batch_segments s
            JOIN audio_lab_folder_batch_files f ON f.id = s.file_id
            WHERE s.job_id = ?
            ORDER BY f.rowid ASC, s.start_seconds ASC
            """,
            (job_id,),
        ).fetchall()
        manifest_dir = folder_batch_job_dir(job_id, "manifests")
        manifest_path = manifest_dir / "manifest.csv"
        fieldnames = [
            "audio_path",
            "original_audio_path",
            "start_seconds",
            "end_seconds",
            "duration_seconds",
            "normalized_label",
            "target_label",
            "source_job_id",
            "source_file_id",
            "processing_preset",
            "frequency_min_hz",
            "frequency_max_hz",
            "threshold_dbfs",
            "band_energy_ratio",
            "rms_dbfs",
            "contaminant_flags",
            "recommendation",
            "split",
        ]
        with manifest_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                segment = dict(row)
                file_row = {"id": segment.get("source_file_id"), "original_audio_path": segment.get("file_original_audio_path")}
                writer.writerow(folder_batch_segment_to_manifest_row(job, file_row, segment))
        conn.execute("UPDATE audio_lab_folder_batch_jobs SET manifest_path = ?, updated_at = ? WHERE id = ?", (str(manifest_path), now_iso(), job_id))
        conn.commit()
        return str(manifest_path)
    finally:
        conn.close()


def folder_batch_is_exploratory(job: dict[str, Any], params: dict[str, Any] | None = None) -> bool:
    params = params or {}
    return (
        job.get("preset") == "exploratory_wide"
        or params.get("config_name") == "exploratory_wide"
        or params.get("name") == "exploratory_wide"
        or params.get("calibration_mode") == "exploratory"
    )


def folder_batch_exploratory_result(candidates: int, job: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    params = params or {}
    result = {
        "title": "Resultado exploratorio",
        "safe_for_batch_processing": False,
        "summary": "Se encontró actividad con configuración amplia, pero no se considera segura.",
        "warning": "Esta configuración es exploratoria. Sirve para encontrar actividad posible, no para procesar toda la carpeta.",
        "training_warning": "No usar para entrenamiento ni procesamiento masivo sin revisar.",
        "suggested_intermediate_config": INTERMEDIATE_EXPLORATORY_CONFIG,
        "markdown": "\n".join(
            [
                "## Resultado exploratorio",
                "",
                "Se encontró actividad con configuración amplia, pero no se considera segura.",
                "",
                "Configuración intermedia sugerida:",
                f"- frequency_min_hz: {INTERMEDIATE_EXPLORATORY_CONFIG['frequency_min_hz']}",
                f"- frequency_max_hz: {INTERMEDIATE_EXPLORATORY_CONFIG['frequency_max_hz']}",
                f"- threshold_dbfs: {INTERMEDIATE_EXPLORATORY_CONFIG['threshold_dbfs']}",
                f"- min_band_energy_ratio: {INTERMEDIATE_EXPLORATORY_CONFIG['min_band_energy_ratio']}",
                "- bandpass: true",
                "- noise_reduce: false",
                "- normalize: false",
            ]
        ),
    }
    if candidates > 0:
        result["best_next_step"] = "try_intermediate_config"
        result["recommendation"] = "too_many_candidates"
        result["next_step_text"] = "Hay actividad, pero la configuración es demasiado abierta. Siguiente paso: probar una configuración intermedia."
    else:
        result["recommendation"] = params.get("recommendation") or "exploratory_only"
    return result


def build_folder_batch_summary(job_id: str) -> dict[str, Any]:
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        job_row = conn.execute("SELECT * FROM audio_lab_folder_batch_jobs WHERE id = ?", (job_id,)).fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job no encontrado.")
        job = dict(job_row)
        try:
            params = json.loads(job.get("params_json") or "{}")
        except json.JSONDecodeError:
            params = {}
        segs = conn.execute("SELECT * FROM audio_lab_folder_batch_segments WHERE job_id = ?", (job_id,)).fetchall()
        files = conn.execute("SELECT * FROM audio_lab_folder_batch_files WHERE job_id = ?", (job_id,)).fetchall()
        ratios = [float(row["band_energy_ratio"] or 0) for row in segs]
        rms_values = [float(row["rms_dbfs"] or -120) for row in segs]
        top_files = conn.execute(
            """
            SELECT f.original_audio_path, COUNT(s.id) AS segments_count, AVG(s.activity_score) AS avg_score
            FROM audio_lab_folder_batch_files f
            LEFT JOIN audio_lab_folder_batch_segments s ON s.file_id = f.id
            WHERE f.job_id = ?
            GROUP BY f.id
            ORDER BY segments_count DESC, avg_score DESC
            LIMIT 10
            """,
            (job_id,),
        ).fetchall()
        contaminants = sum(1 for row in segs if row["contaminant_flags_json"] and row["contaminant_flags_json"] != "[]")
        candidates = sum(1 for row in segs if row["recommendation"] == "candidate")
        discarded = sum(1 for row in segs if row["recommendation"] == "excluded")
        summary = {
            "total_files": len(files),
            "total_duration_seconds": round(sum(float(row["duration_seconds"] or 0) for row in files), 3),
            "candidates": candidates,
            "discarded": discarded,
            "contaminant_suspect": contaminants,
            "errors": sum(1 for row in files if row["status"] == "error"),
            "top_files_with_activity": [dict(row) for row in top_files],
            "band_energy_ratio_distribution": {
                "min": round(min(ratios), 6) if ratios else None,
                "mean": round(float(np.mean(ratios)), 6) if ratios else None,
                "max": round(max(ratios), 6) if ratios else None,
            },
            "rms_dbfs_distribution": {
                "min": round(min(rms_values), 3) if rms_values else None,
                "mean": round(float(np.mean(rms_values)), 3) if rms_values else None,
                "max": round(max(rms_values), 3) if rms_values else None,
            },
            "manifest_path": job["manifest_path"],
        }
        if folder_batch_is_exploratory(job, params):
            summary["exploratory_result"] = folder_batch_exploratory_result(candidates, job, params)
        return summary
    finally:
        conn.close()


def update_folder_batch_counts(job_id: str) -> None:
    summary = build_folder_batch_summary(job_id)
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        processed = conn.execute(
            "SELECT COUNT(*) AS count FROM audio_lab_folder_batch_files WHERE job_id = ? AND status IN ('processed', 'error')",
            (job_id,),
        ).fetchone()["count"]
        processed_duration = conn.execute(
            "SELECT COALESCE(SUM(duration_seconds), 0) AS total FROM audio_lab_folder_batch_files WHERE job_id = ? AND status IN ('processed', 'error')",
            (job_id,),
        ).fetchone()["total"]
        conn.execute(
            """
            UPDATE audio_lab_folder_batch_jobs
            SET processed_files = ?, processed_duration_seconds = ?, candidates_count = ?,
                discarded_count = ?, contaminant_suspect_count = ?, errors_count = ?,
                summary_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                processed,
                processed_duration,
                summary["candidates"],
                summary["discarded"],
                summary["contaminant_suspect"],
                summary["errors"],
                json.dumps(summary, ensure_ascii=False),
                now_iso(),
                job_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def create_folder_batch_outputs_for_segment(
    job_id: str,
    file_id: str,
    source: Path,
    payload: FolderBatchJobPayload,
    segment: dict[str, Any],
) -> dict[str, Any]:
    stem = short_safe_stem(source.stem, 70)
    segment_key = segment["segment_key"]
    clips_dir = folder_batch_job_dir(job_id, "clips")
    processed_dir = folder_batch_job_dir(job_id, "processed")
    summaries_dir = folder_batch_job_dir(job_id, "summaries")
    clip_path = clips_dir / f"{stem}_{segment_key}.wav"
    processed_path = processed_dir / f"{stem}_{segment_key}_processed.wav"
    metadata_path = processed_path.with_suffix(processed_path.suffix + ".json")
    quality_path = summaries_dir / f"{stem}_{segment_key}.quality.json"

    if payload.create_clips:
        write_audio_segment_to_path(source, clip_path, segment["start_seconds"], segment["end_seconds"])
        denoise = BatchDenoiseParams(
            method="spectral_gate",
            preset=payload.preset,
            prop_decrease={"conservador": 0.45, "normal": 0.65, "agresivo": 0.8}.get(payload.preset, 0.65),
            frequency_min_hz=payload.frequency_min_hz,
            frequency_max_hz=payload.frequency_max_hz,
            normalize=payload.normalize,
        )
        process_audio_copy(
            clip_path,
            processed_path,
            denoise,
            use_denoise=payload.noise_reduce,
            use_normalize=payload.normalize,
            use_bandpass=payload.bandpass,
        )
    else:
        processed_path = Path("")

    flags = segment.get("contaminant_flags") or []
    metadata = {
        "source_job_id": job_id,
        "source_file_id": file_id,
        "original_audio_path": str(source),
        "start_seconds": segment["start_seconds"],
        "end_seconds": segment["end_seconds"],
        "duration_seconds": segment["duration_seconds"],
        "frequency_min_hz": payload.frequency_min_hz,
        "frequency_max_hz": payload.frequency_max_hz,
        "threshold_dbfs": payload.threshold_dbfs,
        "band_energy_ratio": segment["band_energy_ratio"],
        "rms_dbfs": segment["rms_dbfs"],
        "activity_score": segment["activity_score"],
        "contaminant_flags": flags,
        "recommendation": segment["recommendation"],
        "dBFS_note": "dBFS es nivel relativo del archivo digital; no es dB acustico calibrado.",
    }
    if payload.preset == "exploratory_wide" or payload.config_name == "exploratory_wide" or payload.calibration_mode == "exploratory":
        metadata["exploratory_result"] = {
            "title": "Resultado exploratorio",
            "summary": "Se encontró actividad con configuración amplia, pero no se considera segura.",
            "warning": "No usar para entrenamiento ni procesamiento masivo sin revisar.",
            "recommendation": "too_many_candidates" if segment["recommendation"] == "candidate" else "exploratory_only",
            "suggested_intermediate_config": INTERMEDIATE_EXPLORATORY_CONFIG,
        }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    quality_path.write_text(json.dumps({"recommendation": segment["recommendation"], **metadata}, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "output_audio_path": str(processed_path) if str(processed_path) else None,
        "output_metadata_path": str(metadata_path),
        "quality_report_path": str(quality_path),
    }


def run_folder_batch_job(job_id: str, payload: FolderBatchJobPayload) -> None:
    update_folder_batch_job(job_id, status="running")
    log_folder_batch_job(job_id, "Inicio procesamiento por carpeta local")
    ml_warning_logged = False
    try:
        conn = get_connection()
        try:
            ensure_audio_lab_extra_schema(conn)
            file_rows = conn.execute(
                "SELECT * FROM audio_lab_folder_batch_files WHERE job_id = ? AND status IN ('pending', 'error') ORDER BY rowid ASC",
                (job_id,),
            ).fetchall()
        finally:
            conn.close()
        for row in file_rows:
            status = folder_job_status(job_id)
            if status == "cancelled":
                log_folder_batch_job(job_id, "Job cancelado por usuario")
                return
            if status == "paused":
                log_folder_batch_job(job_id, "Job pausado por usuario")
                return
            file_id = row["id"]
            source = Path(row["original_audio_path"])
            update_folder_batch_job(job_id, current_file=str(source))
            conn = get_connection()
            try:
                ensure_audio_lab_extra_schema(conn)
                conn.execute("UPDATE audio_lab_folder_batch_files SET status = ? WHERE id = ?", ("running", file_id))
                conn.commit()
            finally:
                conn.close()
            try:
                file_info, segments = analyze_folder_audio_file(source, payload)
                conn = get_connection()
                try:
                    ensure_audio_lab_extra_schema(conn)
                    conn.execute(
                        """
                        UPDATE audio_lab_folder_batch_files
                        SET duration_seconds = ?, sample_rate = ?, size_bytes = ?, status = ?, processed_at = ?
                        WHERE id = ?
                        """,
                        (file_info["duration_seconds"], file_info["sample_rate"], file_info["size_bytes"], "processed", now_iso(), file_id),
                    )
                    for segment in segments:
                        output_info = create_folder_batch_outputs_for_segment(job_id, file_id, source, payload, segment)
                        frog_positive = False
                        if payload.detect_frog and output_info.get("output_audio_path"):
                            prediction, score, detector_error = call_frog_detector(
                                output_info["output_audio_path"],
                                BatchDetectorParams(),
                            )
                            if detector_error and not ml_warning_logged:
                                log_folder_batch_job(job_id, "ML API no disponible; se omitio detector rana/sapo.")
                                ml_warning_logged = True
                            frog_positive = prediction == "rana_sapo"
                        segment_id = str(uuid.uuid4())
                        flags_json = json.dumps(segment.get("contaminant_flags") or [], ensure_ascii=False)
                        conn.execute(
                            """
                            INSERT INTO audio_lab_folder_batch_segments (
                                id, job_id, file_id, original_audio_path, start_seconds, end_seconds,
                                duration_seconds, frequency_min_hz, frequency_max_hz, rms_dbfs,
                                band_rms_dbfs, band_energy_ratio, snr_estimate, activity_score,
                                contaminant_flags_json, recommendation, output_audio_path,
                                output_metadata_path, quality_report_path, created_at
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                segment_id,
                                job_id,
                                file_id,
                                str(source),
                                segment["start_seconds"],
                                segment["end_seconds"],
                                segment["duration_seconds"],
                                segment["frequency_min_hz"],
                                segment["frequency_max_hz"],
                                segment["rms_dbfs"],
                                segment["band_rms_dbfs"],
                                segment["band_energy_ratio"],
                                segment["snr_estimate"],
                                segment["activity_score"],
                                flags_json,
                                segment["recommendation"],
                                output_info.get("output_audio_path"),
                                output_info.get("output_metadata_path"),
                                output_info.get("quality_report_path"),
                                now_iso(),
                            ),
                        )
                        conn.execute(
                            """
                            INSERT INTO audio_lab_folder_batch_outputs (
                                id, job_id, file_id, segment_id, original_audio_path, output_audio_path,
                                output_metadata_path, quality_report_path, recommendation, created_at
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                str(uuid.uuid4()),
                                job_id,
                                file_id,
                                segment_id,
                                str(source),
                                output_info.get("output_audio_path"),
                                output_info.get("output_metadata_path"),
                                output_info.get("quality_report_path"),
                                segment["recommendation"],
                                now_iso(),
                            ),
                        )
                        if frog_positive:
                            conn.execute(
                                "UPDATE audio_lab_folder_batch_jobs SET frog_positive_count = frog_positive_count + 1 WHERE id = ?",
                                (job_id,),
                            )
                    conn.commit()
                finally:
                    conn.close()
                write_folder_batch_manifest(job_id)
                update_folder_batch_counts(job_id)
                log_folder_batch_job(job_id, f"Procesado {source} segmentos={len(segments)}")
            except Exception as exc:
                conn = get_connection()
                try:
                    ensure_audio_lab_extra_schema(conn)
                    conn.execute(
                        "UPDATE audio_lab_folder_batch_files SET status = ?, error = ?, processed_at = ? WHERE id = ?",
                        ("error", str(exc), now_iso(), file_id),
                    )
                    conn.commit()
                finally:
                    conn.close()
                update_folder_batch_counts(job_id)
                log_folder_batch_job(job_id, f"ERROR {source}: {exc}")
        write_folder_batch_manifest(job_id)
        update_folder_batch_counts(job_id)
        summary = build_folder_batch_summary(job_id)
        final_status = "completed"
        if summary.get("errors") and int(summary.get("processed_files") or 0) == 0:
            final_status = "failed"
        elif summary.get("errors"):
            final_status = "completed_with_errors"
        update_folder_batch_job(job_id, status=final_status, summary_json=json.dumps(summary, ensure_ascii=False), current_file=None)
        log_folder_batch_job(job_id, "Job completado" if final_status == "completed" else f"Job finalizado: {final_status}")
    except Exception as exc:
        update_folder_batch_job(job_id, status="failed", summary_json=json.dumps({"error": str(exc)}, ensure_ascii=False))
        log_folder_batch_job(job_id, f"FATAL {exc}")


@router.post("/batch-processing/jobs")
def create_batch_processing_job(payload: BatchProcessingJobPayload, background_tasks: BackgroundTasks):
    if payload.mode not in BATCH_JOB_MODES:
        raise HTTPException(status_code=400, detail=f"mode debe ser uno de: {sorted(BATCH_JOB_MODES)}")
    if payload.preset not in BATCH_JOB_PRESETS:
        raise HTTPException(status_code=400, detail=f"preset debe ser uno de: {sorted(BATCH_JOB_PRESETS)}")
    if not payload.input_audio_paths:
        raise HTTPException(status_code=400, detail="input_audio_paths no puede estar vacio.")
    if payload.mode == "clean_existing":
        payload.steps.detect_activity = False
        payload.steps.create_segments = False
        payload.steps.discard_empty_segments = False
    if payload.mode == "full_auto":
        payload.steps.detect_activity = True
        payload.steps.create_segments = True
        payload.steps.discard_empty_segments = True

    job_id = str(uuid.uuid4())
    created_at = now_iso()
    batch_job_dir(job_id, "segments")
    batch_job_dir(job_id, "processed")
    batch_job_dir(job_id, "summaries")
    batch_job_dir(job_id, "logs")

    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        conn.execute(
            """
            INSERT INTO audio_lab_batch_jobs (
                id, job_name, mode, preset, status, progress, phase, current_file,
                params_json, summary_json, created_at, started_at, finished_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                payload.job_name or f"batch_{created_at}",
                payload.mode,
                payload.preset,
                "queued",
                0,
                "queued",
                None,
                json.dumps(batch_payload_dict(payload), ensure_ascii=False),
                json.dumps({}, ensure_ascii=False),
                created_at,
                None,
                None,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    BATCH_JOB_CANCEL_EVENTS[job_id] = threading.Event()
    background_tasks.add_task(run_batch_processing_job, job_id, payload)
    return {"job_id": job_id, "status": "queued", "message": "Batch processing job created"}


@router.post("/folder-batch/scan")
def scan_folder_batch(payload: FolderBatchScanPayload):
    return scan_folder_payload(payload)


@router.post("/folder-batch/jobs")
def create_folder_batch_job(payload: FolderBatchJobPayload, background_tasks: BackgroundTasks):
    if payload.mode not in FOLDER_BATCH_MODES:
        raise HTTPException(status_code=400, detail=f"mode debe ser uno de: {sorted(FOLDER_BATCH_MODES)}")
    if payload.preset not in FOLDER_BATCH_PRESETS:
        raise HTTPException(status_code=400, detail=f"preset debe ser uno de: {sorted(FOLDER_BATCH_PRESETS)}")
    if payload.frequency_min_hz >= payload.frequency_max_hz:
        raise HTTPException(status_code=400, detail="frequency_min_hz debe ser menor que frequency_max_hz.")
    if payload.threshold_dbfs > 0:
        raise HTTPException(status_code=400, detail="threshold_dbfs debe ser un valor dBFS relativo, normalmente negativo.")
    if min(payload.min_activity_seconds, payload.min_silence_seconds, payload.padding_seconds, payload.clip_duration_seconds) < 0:
        raise HTTPException(status_code=400, detail="Las duraciones no pueden ser negativas.")
    scan = scan_folder_payload(payload)
    if scan["files_found"] == 0:
        raise HTTPException(status_code=400, detail="No se encontraron audios con las extensiones solicitadas.")

    job_id = str(uuid.uuid4())
    created_at = now_iso()
    output_dir = folder_batch_job_dir(job_id)
    for part in ["clips", "processed", "summaries", "manifests", "logs"]:
        folder_batch_job_dir(job_id, part)
    manifest_path = str(folder_batch_job_dir(job_id, "manifests") / "manifest.csv")
    files = list_folder_audio_files(payload)
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        conn.execute(
            """
            INSERT INTO audio_lab_folder_batch_jobs (
                id, job_name, folder_path, folder_path_resolved, target_label, status, mode, preset,
                frequency_min_hz, frequency_max_hz, threshold_dbfs, total_files,
                processed_files, total_duration_seconds, processed_duration_seconds,
                candidates_count, discarded_count, contaminant_suspect_count,
                frog_positive_count, errors_count, output_dir, manifest_path,
                params_json, summary_json, current_file, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                payload.job_name,
                str(Path(payload.folder_path).expanduser()),
                scan["folder_path_resolved"],
                payload.target_label,
                "pending",
                payload.mode,
                payload.preset,
                payload.frequency_min_hz,
                payload.frequency_max_hz,
                payload.threshold_dbfs,
                len(files),
                0,
                scan["estimated_duration_seconds"],
                0,
                0,
                0,
                0,
                0,
                0,
                str(output_dir),
                manifest_path,
                json.dumps(folder_batch_payload_dict(payload), ensure_ascii=False),
                json.dumps(scan, ensure_ascii=False),
                None,
                created_at,
                created_at,
            ),
        )
        for path in files:
            info = audio_file_info(path)
            conn.execute(
                """
                INSERT INTO audio_lab_folder_batch_files (
                    id, job_id, original_audio_path, audio_name, extension, size_bytes,
                    duration_seconds, sample_rate, status, error, processed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    job_id,
                    str(path),
                    path.name,
                    path.suffix.lower(),
                    info["size_bytes"],
                    info["duration_seconds"],
                    info["sample_rate"],
                    "pending",
                    None,
                    None,
                ),
            )
        conn.commit()
    finally:
        conn.close()

    log_folder_batch_job(job_id, f"Job creado con {len(files)} archivo(s). Originales no se modifican.")
    background_tasks.add_task(run_folder_batch_job, job_id, payload)
    return {"job_id": job_id, "status": "pending", "scan": scan, "output_dir": str(output_dir)}


@router.get("/folder-batch/jobs")
def list_folder_batch_jobs(limit: int = Query(50, ge=1, le=200)):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        rows = conn.execute(
            "SELECT * FROM audio_lab_folder_batch_jobs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return {"items": [folder_batch_job_to_dict(row) for row in rows], "total": len(rows)}
    finally:
        conn.close()


@router.get("/folder-batch/jobs/{job_id}")
def get_folder_batch_job(job_id: str):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        row = conn.execute("SELECT * FROM audio_lab_folder_batch_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job no encontrado.")
        files = conn.execute("SELECT * FROM audio_lab_folder_batch_files WHERE job_id = ? ORDER BY rowid ASC LIMIT 200", (job_id,)).fetchall()
        return {**folder_batch_job_to_dict(row), "files": [dict(item) for item in files]}
    finally:
        conn.close()


@router.get("/folder-batch/jobs/{job_id}/logs")
def get_folder_batch_logs(job_id: str):
    log_path = folder_batch_job_dir(job_id, "logs") / "job.log"
    return {"job_id": job_id, "logs": log_path.read_text(encoding="utf-8") if log_path.exists() else ""}


@router.post("/folder-batch/jobs/{job_id}/cancel")
def cancel_folder_batch_job(job_id: str):
    update_folder_batch_job(job_id, status="cancelled", current_file=None)
    log_folder_batch_job(job_id, "Cancel solicitado")
    return get_folder_batch_job(job_id)


@router.post("/folder-batch/jobs/{job_id}/pause")
def pause_folder_batch_job(job_id: str):
    status = folder_job_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job no encontrado.")
    if status in {"completed", "failed", "cancelled"}:
        return get_folder_batch_job(job_id)
    update_folder_batch_job(job_id, status="paused")
    log_folder_batch_job(job_id, "Pausa solicitada")
    return get_folder_batch_job(job_id)


@router.post("/folder-batch/jobs/{job_id}/resume")
def resume_folder_batch_job(job_id: str, background_tasks: BackgroundTasks):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        row = conn.execute("SELECT * FROM audio_lab_folder_batch_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job no encontrado.")
        if row["status"] not in {"paused", "failed", "pending"}:
            return folder_batch_job_to_dict(row)
        params = json.loads(row["params_json"] or "{}")
        payload = FolderBatchJobPayload(**params)
    finally:
        conn.close()
    update_folder_batch_job(job_id, status="pending")
    log_folder_batch_job(job_id, "Reanudacion solicitada")
    background_tasks.add_task(run_folder_batch_job, job_id, payload)
    return get_folder_batch_job(job_id)


@router.get("/folder-batch/jobs/{job_id}/outputs")
def get_folder_batch_outputs(job_id: str, limit: int = Query(500, ge=1, le=5000)):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        rows = conn.execute(
            """
            SELECT o.*, s.start_seconds, s.end_seconds, s.duration_seconds, s.activity_score,
                   s.band_energy_ratio, s.rms_dbfs, s.contaminant_flags_json
            FROM audio_lab_folder_batch_outputs o
            LEFT JOIN audio_lab_folder_batch_segments s ON s.id = o.segment_id
            WHERE o.job_id = ?
            ORDER BY o.created_at ASC
            LIMIT ?
            """,
            (job_id, limit),
        ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            playable_path = item.get("output_audio_path") or item.get("original_audio_path")
            if playable_path:
                item["playable_url"] = playable_url_for_path(playable_path)
                item["audio_url"] = item["playable_url"]
            items.append(item)
        return {"job_id": job_id, "items": items, "total": len(items)}
    finally:
        conn.close()


@router.get("/folder-batch/jobs/{job_id}/manifest")
def get_folder_batch_manifest(job_id: str):
    manifest_path = Path(write_folder_batch_manifest(job_id))
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Manifest no encontrado.")
    return FileResponse(str(manifest_path), filename=manifest_path.name, media_type="text/csv")


@router.get("/folder-batch/jobs/{job_id}/summary")
def get_folder_batch_summary(job_id: str):
    return {"job_id": job_id, "summary": build_folder_batch_summary(job_id)}


@router.get("/batch-processing/jobs")
def list_batch_processing_jobs(limit: int = Query(50, ge=1, le=200)):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        rows = conn.execute(
            """
            SELECT *
            FROM audio_lab_batch_jobs
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        items = []
        for row in rows:
            job = batch_job_to_dict(row)
            output_rows = conn.execute(
                """
                SELECT source_audio_path, processed_audio_path
                FROM audio_lab_batch_outputs
                WHERE job_id = ?
                ORDER BY created_at DESC
                LIMIT 25
                """,
                (job["id"],),
            ).fetchall()
            names = []
            for output in output_rows:
                names.extend(
                    [
                        readable_audio_stem(output["source_audio_path"]),
                        Path(output["source_audio_path"] or "").name,
                        readable_audio_stem(output["processed_audio_path"]),
                        Path(output["processed_audio_path"] or "").name,
                    ]
                )
            job["output_search_text"] = " ".join(value for value in names if value)
            items.append(job)
        return {"items": items, "total": len(rows)}
    finally:
        conn.close()


@router.get("/batch-processing/jobs/{job_id}")
def get_batch_processing_job(job_id: str):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        row = conn.execute("SELECT * FROM audio_lab_batch_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job no encontrado.")
        items = conn.execute("SELECT * FROM audio_lab_batch_items WHERE job_id = ? ORDER BY rowid ASC", (job_id,)).fetchall()
        outputs = conn.execute("SELECT * FROM audio_lab_batch_outputs WHERE job_id = ? ORDER BY created_at ASC", (job_id,)).fetchall()
        job = batch_job_to_dict(row)
        return {
            **job,
            "items": [dict(item) for item in items],
            "outputs": enrich_batch_outputs_with_quality_reports(conn, outputs, job),
        }
    finally:
        conn.close()


@router.get("/batch-processing/jobs/{job_id}/logs")
def get_batch_processing_job_logs(job_id: str):
    log_path = batch_job_dir(job_id, "logs") / "job.log"
    if not log_path.exists():
        return {"job_id": job_id, "logs": ""}
    return {"job_id": job_id, "logs": log_path.read_text(encoding="utf-8")}


@router.post("/batch-processing/jobs/{job_id}/cancel")
def cancel_batch_processing_job(job_id: str):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        row = conn.execute("SELECT * FROM audio_lab_batch_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job no encontrado.")
        if row["status"] in {"completed", "failed", "canceled"}:
            return batch_job_to_dict(row)
        BATCH_JOB_CANCEL_EVENTS.setdefault(job_id, threading.Event()).set()
        conn.execute(
            "UPDATE audio_lab_batch_jobs SET status = ?, phase = ?, finished_at = ? WHERE id = ?",
            ("canceled", "cancelado", now_iso(), job_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM audio_lab_batch_jobs WHERE id = ?", (job_id,)).fetchone()
        return batch_job_to_dict(row)
    finally:
        conn.close()


@router.post("/audio-processing/quality-report")
def create_quality_report(payload: QualityReportPayload):
    report_id = str(uuid.uuid4())
    try:
        report = build_quality_report(payload)
        if payload.batch_output_id:
            conn = get_connection()
            try:
                ensure_audio_lab_extra_schema(conn)
                output = conn.execute("SELECT * FROM audio_lab_batch_outputs WHERE id = ?", (payload.batch_output_id,)).fetchone()
                if output:
                    job_row = conn.execute("SELECT * FROM audio_lab_batch_jobs WHERE id = ?", (output["job_id"],)).fetchone()
                    job = batch_job_to_dict(job_row) if job_row else {}
                    identity = enrich_batch_outputs_with_quality_reports(conn, [output], job)[0]
                    for key in [
                        "source_audio_name",
                        "processed_audio_name",
                        "display_name",
                        "display_label",
                        "batch_job_id",
                        "batch_job_name",
                        "segment_label",
                        "segment_index",
                        "processing_preset",
                        "processing_method",
                        "processing_metadata_path",
                    ]:
                        report[key] = identity.get(key)
                    report["batch_output_id"] = payload.batch_output_id
            finally:
                conn.close()
        report_dir = audio_lab_dir("quality_reports")
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / f"{report_id}.quality.json"
        report["id"] = report_id
        report["report_path"] = str(report_path)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo guardar el reporte de calidad: {type(exc).__name__}: {str(exc)[:180]}",
        ) from exc

    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        detector = report.get("frog_detector") or {}
        conn.execute(
            """
            INSERT INTO audio_lab_quality_reports (
                id, source_audio_path, processed_audio_path, report_path,
                recommendation_label, contrast_improvement_db, clipping_processed_ratio,
                frog_source_score, frog_processed_score, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                report["source_audio_path"],
                report["processed_audio_path"],
                str(report_path),
                report["recommendation"]["label"],
                report["contrast_improvement_db"],
                report["clipping_processed_ratio"],
                detector.get("source_score"),
                detector.get("processed_score"),
                report["created_at"],
            ),
        )
        if payload.batch_output_id:
            conn.execute(
                """
                UPDATE audio_lab_batch_outputs
                SET quality_report_path = ?, quality_report_label = ?
                WHERE id = ?
                """,
                (str(report_path), report["recommendation"]["label"], payload.batch_output_id),
            )
        conn.commit()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo guardar el reporte de calidad: {type(exc).__name__}: {str(exc)[:180]}",
        ) from exc
    finally:
        conn.close()
    return report


@router.get("/clips")
def list_clips(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        rows = conn.execute(
            """
            SELECT *
            FROM audio_lab_clips
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) AS total FROM audio_lab_clips").fetchone()["total"]
        return {"items": [clip_row_to_dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}
    finally:
        conn.close()


@router.get("/clips/{clip_id}")
def get_clip(clip_id: str):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        row = conn.execute("SELECT * FROM audio_lab_clips WHERE id = ?", (clip_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Recorte no encontrado.")
        return clip_row_to_dict(row)
    finally:
        conn.close()


@router.get("/clips/{clip_id}/audio")
def get_clip_audio(clip_id: str):
    conn = get_connection()
    try:
        ensure_audio_lab_extra_schema(conn)
        row = conn.execute("SELECT * FROM audio_lab_clips WHERE id = ?", (clip_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Recorte no encontrado.")
        path = resolve_allowed_audio_path(row["output_audio_path"])
        if path.suffix.lower() != ".wav":
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "audio_decode_error",
                    "message": "El recorte registrado no es un WAV reproducible.",
                    "audio_path": row["output_audio_path"],
                    "format": path.suffix.lower(),
                },
            )
        return FileResponse(str(path), media_type=media_type_for_path(path), filename=path.name)
    finally:
        conn.close()


@router.post("/uploads/batch")
def upload_batch(payload: UploadBatchPayload):
    upload_dir = audio_lab_dir("uploads")
    conn = get_connection()
    saved_items = []
    try:
        ensure_audio_lab_extra_schema(conn)
        for file in payload.files:
            upload_id = str(uuid.uuid4())
            filename = safe_filename(file.original_filename or f"audio_{upload_id}")
            stored_path = upload_dir / f"{upload_id}_{filename}"
            try:
                raw = base64.b64decode(file.content_base64, validate=True)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Archivo invalido: {file.original_filename}") from exc
            stored_path.write_bytes(raw)
            size_bytes = stored_path.stat().st_size
            created_at = now_iso()
            conn.execute(
                """
                INSERT INTO audio_lab_uploads (id, original_filename, stored_path, size_bytes, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (upload_id, file.original_filename or filename, str(stored_path), size_bytes, created_at),
            )
            saved_items.append(
                {
                    "id": upload_id,
                    "original_filename": file.original_filename or filename,
                    "stored_path": str(stored_path),
                    "size_bytes": size_bytes,
                    "created_at": created_at,
                }
            )
        conn.commit()
        return {"items": saved_items, "total": len(saved_items)}
    finally:
        conn.close()
