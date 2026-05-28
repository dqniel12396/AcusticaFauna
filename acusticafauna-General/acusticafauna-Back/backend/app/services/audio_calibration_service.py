from __future__ import annotations

import csv
import json
import math
import os
import uuid
import wave
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from app.core.config import settings
from app.services.audio_path_service import allowed_audio_roots, is_path_inside, resolve_no_strict, unique_paths

try:
    import soundfile as sf
except ImportError:  # pragma: no cover
    sf = None


AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
PROFILE_BANDS = [
    (0, 300),
    (300, 1000),
    (1000, 2000),
    (2000, 3000),
    (3000, 4500),
    (4500, 8000),
    (8000, 12000),
]
CONFIG_CANDIDATES = {
    "conservadora": {
        "name": "conservadora",
        "label": "Conservadora",
        "frequency_min_hz": 3000,
        "frequency_max_hz": 4500,
        "threshold_dbfs": -48,
        "min_band_energy_ratio": 0.35,
        "min_band_ratio": 0.35,
        "min_activity_seconds": 0.25,
        "min_silence_seconds": 0.35,
        "padding_seconds": 0.1,
        "clip_duration_seconds": 3.0,
        "max_segment_seconds": 4.0,
        "bandpass": True,
        "noise_reduce": True,
        "noise_reduce_strength": "soft",
        "normalize": False,
        "prop_decrease": 0.25,
        "preset": "personalizado",
        "detection_only": False,
    },
    "balanceada": {
        "name": "balanceada",
        "label": "Balanceada",
        "frequency_min_hz": 2500,
        "frequency_max_hz": 4500,
        "threshold_dbfs": -50,
        "min_band_energy_ratio": 0.30,
        "min_band_ratio": 0.30,
        "min_activity_seconds": 0.25,
        "min_silence_seconds": 0.35,
        "padding_seconds": 0.12,
        "clip_duration_seconds": 3.0,
        "max_segment_seconds": 5.0,
        "bandpass": True,
        "noise_reduce": True,
        "noise_reduce_strength": "soft",
        "normalize": False,
        "prop_decrease": 0.30,
        "preset": "personalizado",
        "detection_only": False,
    },
    "sensible": {
        "name": "sensible",
        "label": "Sensible",
        "frequency_min_hz": 2500,
        "frequency_max_hz": 5000,
        "threshold_dbfs": -52,
        "min_band_energy_ratio": 0.25,
        "min_band_ratio": 0.25,
        "min_activity_seconds": 0.20,
        "min_silence_seconds": 0.30,
        "padding_seconds": 0.15,
        "clip_duration_seconds": 3.0,
        "max_segment_seconds": 5.0,
        "bandpass": True,
        "noise_reduce": True,
        "noise_reduce_strength": "soft",
        "normalize": False,
        "prop_decrease": 0.22,
        "preset": "personalizado",
        "detection_only": False,
    },
    "intermedia_sin_norm": {
        "name": "intermedia_sin_norm",
        "label": "Intermedia sin normalizacion",
        "frequency_min_hz": 2500,
        "frequency_max_hz": 5000,
        "threshold_dbfs": -51,
        "min_band_energy_ratio": 0.25,
        "min_band_ratio": 0.25,
        "min_activity_seconds": 0.25,
        "min_silence_seconds": 0.35,
        "padding_seconds": 0.12,
        "clip_duration_seconds": 5.0,
        "max_segment_seconds": 10.0,
        "bandpass": True,
        "noise_reduce": True,
        "noise_reduce_strength": "soft",
        "normalize": False,
        "prop_decrease": 0.20,
        "preset": "personalizado",
        "detection_only": False,
    },
    "sensible_sin_norm": {
        "name": "sensible_sin_norm",
        "label": "Sensible sin normalizacion",
        "frequency_min_hz": 2500,
        "frequency_max_hz": 5000,
        "threshold_dbfs": -52,
        "min_band_energy_ratio": 0.25,
        "min_band_ratio": 0.25,
        "min_activity_seconds": 0.20,
        "min_silence_seconds": 0.30,
        "padding_seconds": 0.15,
        "clip_duration_seconds": 5.0,
        "max_segment_seconds": 10.0,
        "bandpass": True,
        "noise_reduce": True,
        "noise_reduce_strength": "soft",
        "normalize": False,
        "prop_decrease": 0.20,
        "preset": "personalizado",
        "detection_only": False,
    },
    "balanceada_abierta": {
        "name": "balanceada_abierta",
        "label": "Balanceada abierta",
        "frequency_min_hz": 2500,
        "frequency_max_hz": 5000,
        "threshold_dbfs": -51,
        "min_band_energy_ratio": 0.28,
        "min_band_ratio": 0.28,
        "min_activity_seconds": 0.25,
        "min_silence_seconds": 0.35,
        "padding_seconds": 0.12,
        "clip_duration_seconds": 5.0,
        "max_segment_seconds": 10.0,
        "bandpass": True,
        "noise_reduce": True,
        "noise_reduce_strength": "soft",
        "normalize": False,
        "prop_decrease": 0.20,
        "preset": "personalizado",
        "detection_only": False,
    },
    "alta_conservadora": {
        "name": "alta_conservadora",
        "label": "Alta conservadora",
        "frequency_min_hz": 3000,
        "frequency_max_hz": 5000,
        "threshold_dbfs": -52,
        "min_band_energy_ratio": 0.22,
        "min_band_ratio": 0.22,
        "min_activity_seconds": 0.20,
        "min_silence_seconds": 0.30,
        "padding_seconds": 0.15,
        "clip_duration_seconds": 5.0,
        "max_segment_seconds": 10.0,
        "bandpass": True,
        "noise_reduce": True,
        "noise_reduce_strength": "soft",
        "normalize": False,
        "prop_decrease": 0.20,
        "preset": "personalizado",
        "detection_only": False,
    },
}

SUGGESTED_INTERMEDIATE_CONFIG = {
    "name": "intermedia_exploratoria",
    "label": "Intermedia exploratoria",
    "frequency_min_hz": 2200,
    "frequency_max_hz": 5500,
    "threshold_dbfs": -53,
    "min_band_energy_ratio": 0.20,
    "min_band_ratio": 0.20,
    "bandpass": True,
    "noise_reduce": False,
    "normalize": False,
    "min_activity_seconds": 0.25,
    "min_silence_seconds": 0.5,
    "padding_seconds": 0.15,
    "clip_duration_seconds": 5,
    "max_segment_seconds": 10,
    "detection_only": True,
    "purpose": "Prueba intermedia despues de exploratory_wide; revisar manualmente antes de usar en lote grande.",
}

EXPLORATORY_WIDE_CONFIG = {
    "name": "exploratory_wide",
    "label": "Exploratoria amplia",
    "frequency_min_hz": 1800,
    "frequency_max_hz": 6000,
    "threshold_dbfs": -55,
    "min_band_energy_ratio": 0.15,
    "min_band_ratio": 0.15,
    "bandpass": True,
    "noise_reduce": False,
    "normalize": False,
    "min_activity_seconds": 0.25,
    "min_silence_seconds": 0.5,
    "padding_seconds": 0.15,
    "clip_duration_seconds": 5,
    "max_segment_seconds": 10,
    "detection_only": True,
    "purpose": "Solo para encontrar actividad posible. No usar automaticamente para entrenamiento.",
}

SUGGESTED_NARROWER_CONFIG = {
    "name": "intermedia_cerrada",
    "label": "Intermedia cerrada",
    "frequency_min_hz": 2000,
    "frequency_max_hz": 3300,
    "threshold_dbfs": -52,
    "min_band_energy_ratio": 0.20,
    "min_band_ratio": 0.20,
    "bandpass": True,
    "noise_reduce": False,
    "normalize": False,
    "min_activity_seconds": 0.25,
    "min_silence_seconds": 0.5,
    "padding_seconds": 0.15,
    "clip_duration_seconds": 5,
    "max_segment_seconds": 10,
    "detection_only": True,
    "purpose": "Cerrar filtros despues de intermedia_exploratoria; revisar manualmente antes de usar en lote grande.",
}

SUGGESTED_NARROWER_TOO_MANY_VARIANT = {
    **SUGGESTED_NARROWER_CONFIG,
    "name": "intermedia_cerrada_mas_selectiva",
    "label": "Intermedia cerrada mas selectiva",
    "frequency_min_hz": 2200,
    "frequency_max_hz": 3300,
    "threshold_dbfs": -51,
    "min_band_energy_ratio": 0.23,
    "min_band_ratio": 0.23,
    "purpose": "Si intermedia_cerrada sigue demasiado amplia, subir threshold y ratio.",
}

RECOMMENDED_BROADER_DETECTION_CONFIG = {
    **SUGGESTED_NARROWER_TOO_MANY_VARIANT,
    "name": "amplia_2200_3300_m51_r023_no_noise",
    "label": "Amplia 2200-3300 sin reduccion",
    "frequency_min_hz": 2200,
    "frequency_max_hz": 3300,
    "threshold_dbfs": -51,
    "min_band_energy_ratio": 0.23,
    "min_band_ratio": 0.23,
    "bandpass": True,
    "noise_reduce": False,
    "normalize": False,
    "min_activity_seconds": 0.25,
    "min_silence_seconds": 0.35,
    "padding_seconds": 0.12,
    "clip_duration_seconds": 3,
    "max_segment_seconds": 5,
    "preset": "personalizado",
    "detection_only": False,
    "purpose": "Recomendada para Pristimantis cuando 2500-5000 Hz da pocos candidatos; revisar previews antes de entrenamiento.",
}

SUGGESTED_NARROWER_TOO_MANY_RATIO025_VARIANT = {
    **SUGGESTED_NARROWER_TOO_MANY_VARIANT,
    "name": "intermedia_cerrada_mas_selectiva_ratio025",
    "label": "Intermedia cerrada mas selectiva ratio 0.25",
    "min_band_energy_ratio": 0.25,
    "min_band_ratio": 0.25,
    "purpose": "Si ratio 0.23 sigue amplio, mantener banda 2200-3300 Hz y subir ratio a 0.25.",
}

SUGGESTED_STRICT_NARROWER_CONFIG = {
    **SUGGESTED_NARROWER_CONFIG,
    "name": "intermedia_cerrada_estricta",
    "label": "Intermedia cerrada estricta",
    "frequency_min_hz": 2300,
    "frequency_max_hz": 3100,
    "threshold_dbfs": -50,
    "min_band_energy_ratio": 0.30,
    "min_band_ratio": 0.30,
    "purpose": "Probar filtros mas estrictos si la configuracion mas selectiva sigue demasiado amplia.",
}

SUGGESTED_NARROWER_ZERO_VARIANT = {
    **SUGGESTED_NARROWER_CONFIG,
    "name": "intermedia_cerrada_mas_abierta",
    "label": "Intermedia cerrada mas abierta",
    "frequency_min_hz": 1800,
    "frequency_max_hz": 3500,
    "threshold_dbfs": -53,
    "min_band_energy_ratio": 0.18,
    "min_band_ratio": 0.18,
    "purpose": "Si intermedia_cerrada no encuentra candidatos, abrir suavemente banda, threshold y ratio.",
}

MORE_SENSITIVE_VARIANT = {
    "name": "variante_mas_sensible",
    "label": "Variante mas sensible",
    "frequency_min_hz": 2500,
    "frequency_max_hz": 5000,
    "threshold_dbfs": -52,
    "min_band_energy_ratio": 0.22,
    "min_band_ratio": 0.22,
    "min_activity_seconds": 0.20,
    "min_silence_seconds": 0.30,
    "padding_seconds": 0.15,
    "clip_duration_seconds": 5.0,
    "max_segment_seconds": 10.0,
    "bandpass": True,
    "noise_reduce": True,
    "noise_reduce_strength": "soft",
    "normalize": False,
    "prop_decrease": 0.20,
    "preset": "personalizado",
    "detection_only": False,
}

PRISTIMANTIS_RAIN_WIND_SWEEP_CONFIGS = [
    ("high_confidence_config", "Alta confianza", 2300, 3300, -50, 0.27),
    ("balanced_config", "Equilibrada recomendada", 2200, 3200, -50, 0.25),
    ("high_recall_config", "Mayor cobertura", 2200, 3300, -51, 0.23),
    ("exploratory_config", "Exploratoria", 2000, 3500, -52, 0.20),
]


def sweep_config(
    name: str,
    label: str,
    low_hz: float,
    high_hz: float,
    threshold_dbfs: float,
    ratio: float,
    *,
    sweep_profile_type: str,
    species_profile: str | None = None,
    source_band: dict[str, Any] | None = None,
    rationale: str = "",
) -> dict[str, Any]:
    return {
        "name": name,
        "label": label,
        "frequency_min_hz": low_hz,
        "frequency_max_hz": high_hz,
        "threshold_dbfs": threshold_dbfs,
        "min_band_energy_ratio": ratio,
        "min_band_ratio": ratio,
        "min_activity_seconds": 0.25,
        "min_silence_seconds": 0.35,
        "padding_seconds": 0.12,
        "clip_duration_seconds": 3,
        "max_segment_seconds": 5,
        "bandpass": True,
        "noise_reduce": False,
        "normalize": False,
        "preset": "personalizado",
        "detection_only": False,
        "sweep_profile_type": sweep_profile_type,
        "species_profile": species_profile,
        "adaptive_source_band": source_band,
        "adaptive_rationale": rationale,
        "training_allowed": name != "exploratory_config",
    }


def pristimantis_rain_wind_sweep_configs() -> list[dict[str, Any]]:
    return [
        normalize_config(
            sweep_config(
                name,
                label,
                low,
                high,
                threshold,
                ratio,
                sweep_profile_type="species_specific",
                species_profile="pristimantis_simoterus_rain_wind",
                rationale="Preset especifico para Pristimantis_simoterus en lluvia/viento; no es universal.",
            ),
            False,
        )
        for name, label, low, high, threshold, ratio in PRISTIMANTIS_RAIN_WIND_SWEEP_CONFIGS
    ]


class CalibrationError(ValueError):
    pass


class CalibrationPermissionError(PermissionError):
    pass


@dataclass
class Segment:
    source_path: Path
    start_seconds: float
    end_seconds: float
    duration_seconds: float
    rms_dbfs: float
    band_energy_ratio: float
    score: float


def now_id() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def safe_name(value: str, fallback: str = "audio") -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {".", "-", "_"} else "_" for ch in str(value or fallback))
    return cleaned.strip("._") or fallback


def dbfs(value: float) -> float:
    return float(20.0 * np.log10(max(float(value), 1e-10)))


def percentile(values: Iterable[float], q: float, default: float | None = None) -> float | None:
    data = [float(value) for value in values if value is not None and np.isfinite(value)]
    if not data:
        return default
    return round(float(np.percentile(np.array(data, dtype="float64"), q)), 6)


def mean_or_none(values: Iterable[float]) -> float | None:
    data = [float(value) for value in values if value is not None and np.isfinite(value)]
    if not data:
        return None
    return round(float(np.mean(data)), 6)


def normalize_config(config: dict[str, Any], detection_only: bool | None = None) -> dict[str, Any]:
    item = dict(config)
    name = safe_name(item.get("name") or item.get("label") or "config")
    item["name"] = name
    item["label"] = item.get("label") or name.replace("_", " ").title()
    item["frequency_min_hz"] = float(item.get("frequency_min_hz", 2500))
    item["frequency_max_hz"] = float(item.get("frequency_max_hz", 5000))
    item["threshold_dbfs"] = float(item.get("threshold_dbfs", -51))
    ratio = float(item.get("min_band_energy_ratio", item.get("min_band_ratio", 0.25)))
    item["min_band_energy_ratio"] = ratio
    item["min_band_ratio"] = ratio
    item["min_activity_seconds"] = float(item.get("min_activity_seconds", 0.25))
    item["min_silence_seconds"] = float(item.get("min_silence_seconds", 0.35))
    item["padding_seconds"] = float(item.get("padding_seconds", 0.12))
    item["clip_duration_seconds"] = float(item.get("clip_duration_seconds", 5.0))
    item["max_segment_seconds"] = float(item.get("max_segment_seconds", 10.0))
    item["bandpass"] = bool(item.get("bandpass", True))
    item["noise_reduce"] = bool(item.get("noise_reduce", True))
    item["noise_reduce_strength"] = item.get("noise_reduce_strength") or "soft"
    item["prop_decrease"] = float(item.get("prop_decrease", {"soft": 0.20, "normal": 0.30, "aggressive": 0.55}.get(item["noise_reduce_strength"], 0.20)))
    item["normalize"] = bool(item.get("normalize", False))
    item["preset"] = item.get("preset") or "personalizado"
    if detection_only is not None:
        item["detection_only"] = bool(detection_only)
    else:
        item["detection_only"] = bool(item.get("detection_only", False))
    if item["frequency_min_hz"] >= item["frequency_max_hz"]:
        raise CalibrationError(f"Configuracion invalida {name}: frequency_min_hz debe ser menor que frequency_max_hz.")
    return item


def get_default_calibration_configs(
    label: str | None = None,
    noise_type: str | None = None,
    detection_only: bool = False,
) -> dict[str, dict[str, Any]]:
    force_detection_only = True if detection_only else None
    configs = {
        **CONFIG_CANDIDATES,
        "exploratory_wide": EXPLORATORY_WIDE_CONFIG,
        "intermedia_exploratoria": SUGGESTED_INTERMEDIATE_CONFIG,
        "intermedia_cerrada": SUGGESTED_NARROWER_CONFIG,
        "intermedia_cerrada_mas_selectiva": SUGGESTED_NARROWER_TOO_MANY_VARIANT,
        "intermedia_cerrada_mas_selectiva_ratio025": SUGGESTED_NARROWER_TOO_MANY_RATIO025_VARIANT,
        "intermedia_cerrada_estricta": SUGGESTED_STRICT_NARROWER_CONFIG,
    }
    return {name: normalize_config(config, force_detection_only) for name, config in configs.items()}


def available_calibration_config_names() -> list[str]:
    return sorted(get_default_calibration_configs().keys())


def resolve_config_selection(configs: list[str] | None, config_definitions: list[dict[str, Any]] | None = None, detection_only: bool | None = None) -> list[dict[str, Any]]:
    effective_detection_only = True if detection_only is True else None
    catalog = get_default_calibration_configs(detection_only=bool(effective_detection_only))
    selected: list[dict[str, Any]] = []
    for config in config_definitions or []:
        selected.append(normalize_config(config, effective_detection_only))
    for name in configs or []:
        if name not in catalog:
            available = ", ".join(available_calibration_config_names())
            raise CalibrationError(f"Configuración desconocida: {name}. Configuraciones disponibles: {available}")
        selected.append(normalize_config(catalog[name], effective_detection_only))
    if not selected:
        selected = [normalize_config(catalog[name], effective_detection_only) for name in ["conservadora", "balanceada", "sensible"]]
    return selected


def validate_job_allowed_roots(raw_roots: list[str] | None) -> list[Path]:
    roots: list[Path] = []
    for raw in raw_roots or []:
        root = Path(str(raw)).expanduser().resolve(strict=False)
        anchor = Path(root.anchor) if root.anchor else None
        if anchor and root == anchor:
            raise CalibrationError("No se autoriza una raiz de unidad completa. Selecciona una carpeta mas especifica.")
        if not root.exists() or not root.is_dir():
            raise CalibrationError(f"La carpeta autorizada no existe: {root}")
        roots.append(root)
    return roots


def resolve_calibration_folder(
    folder_path: str | Path,
    *,
    job_allowed_roots: list[str] | None = None,
    allow_unrestricted: bool = False,
) -> Path:
    folder = Path(str(folder_path).strip().strip('"').strip("'")).expanduser().resolve(strict=False)
    if not folder.exists() or not folder.is_dir():
        raise CalibrationError("La ruta de carpeta no existe en este computador.")
    if allow_unrestricted:
        return folder
    roots = unique_paths([*allowed_audio_roots(), *validate_job_allowed_roots(job_allowed_roots)])
    if any(is_path_inside(folder, root) for root in roots):
        return folder
    allowed = [str(resolve_no_strict(root)) for root in roots]
    raise CalibrationPermissionError(
        "La carpeta existe, pero esta fuera de las carpetas permitidas. Autoriza esa carpeta para este analisis.",
        {"folder_path": str(folder), "allowed_roots": allowed},
    )


def list_audio_files(folder: Path, recursive: bool = True) -> list[Path]:
    iterator = folder.rglob("*") if recursive else folder.glob("*")
    return sorted(
        [path for path in iterator if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS],
        key=lambda item: str(item).lower(),
    )


def representative_sample(files: list[Path], sample_size: int) -> list[Path]:
    if sample_size <= 0:
        raise CalibrationError("sample_size debe ser mayor que cero.")
    if len(files) <= sample_size:
        return files
    if sample_size == 1:
        return [files[len(files) // 2]]
    indices = np.linspace(0, len(files) - 1, num=sample_size)
    return [files[int(round(index))] for index in indices]


def read_audio_mono(path: Path, max_seconds: float | None = 90.0) -> tuple[np.ndarray, int, float]:
    if sf is not None:
        info = sf.info(str(path))
        sample_rate = int(info.samplerate)
        frames = int(info.frames)
        limit = frames if max_seconds is None else min(frames, int(sample_rate * max_seconds))
        data, read_rate = sf.read(str(path), frames=limit, always_2d=True, dtype="float32")
        mono = data.mean(axis=1).astype("float32") if data.size else np.array([], dtype="float32")
        return mono, int(read_rate), float(frames / max(1, sample_rate))
    if path.suffix.lower() != ".wav":
        raise CalibrationError("soundfile no esta instalado; solo se pueden leer WAV.")
    with wave.open(str(path), "rb") as wav:
        channels = int(wav.getnchannels())
        sample_width = int(wav.getsampwidth())
        sample_rate = int(wav.getframerate())
        total_frames = int(wav.getnframes())
        limit = total_frames if max_seconds is None else min(total_frames, int(sample_rate * max_seconds))
        raw = wav.readframes(limit)
    if sample_width == 1:
        data = (np.frombuffer(raw, dtype=np.uint8).astype("float32") - 128.0) / 128.0
    elif sample_width == 2:
        data = np.frombuffer(raw, dtype="<i2").astype("float32") / 32768.0
    elif sample_width == 4:
        data = np.frombuffer(raw, dtype="<i4").astype("float32") / 2147483648.0
    else:
        raise CalibrationError(f"sample width WAV no soportado: {sample_width}")
    if channels > 1 and data.size:
        data = data.reshape(-1, channels).mean(axis=1)
    return data.astype("float32"), sample_rate, float(total_frames / max(1, sample_rate))


def frame_starts(audio_size: int, sample_rate: int, window_seconds: float = 0.10, hop_seconds: float = 0.05) -> tuple[np.ndarray, int]:
    window_size = max(1, int(round(window_seconds * sample_rate)))
    hop_size = max(1, int(round(hop_seconds * sample_rate)))
    if audio_size <= window_size:
        return np.array([0], dtype=np.int64), window_size
    return np.arange(0, audio_size - window_size + 1, hop_size, dtype=np.int64), window_size


def band_power_for_frame(frame: np.ndarray, sample_rate: int, low_hz: float, high_hz: float) -> float:
    if frame.size == 0:
        return 0.0
    high_hz = min(float(high_hz), sample_rate / 2)
    low_hz = max(0.0, float(low_hz))
    if high_hz <= low_hz:
        return 0.0
    window = np.hanning(frame.size).astype("float32")
    spectrum = np.fft.rfft(frame.astype("float32") * window)
    freqs = np.fft.rfftfreq(frame.size, d=1.0 / sample_rate)
    mask = (freqs >= low_hz) & (freqs < high_hz)
    if not np.any(mask):
        return 0.0
    power = np.square(np.abs(spectrum))
    return float(np.sum(power[mask]))


def collect_frame_metrics(audio: np.ndarray, sample_rate: int, target_band: tuple[float, float] | None = None) -> dict[str, Any]:
    if audio.size == 0:
        return {"rms_dbfs": [], "band_ratios": [], "bands": {}}
    starts, window_size = frame_starts(audio.size, sample_rate)
    if audio.size < window_size:
        audio = np.pad(audio, (0, window_size - audio.size))
    rms_db_values: list[float] = []
    band_ratios: list[float] = []
    band_db_values: dict[str, list[float]] = {f"{low}-{high}": [] for low, high in PROFILE_BANDS}
    for start in starts:
        frame = audio[start : start + window_size]
        rms = float(np.sqrt(np.mean(np.square(frame)) + 1e-10))
        rms_db_values.append(dbfs(rms))
        total_power = sum(band_power_for_frame(frame, sample_rate, low, high) for low, high in PROFILE_BANDS) + 1e-12
        for low, high in PROFILE_BANDS:
            key = f"{low}-{high}"
            power = band_power_for_frame(frame, sample_rate, low, high)
            band_db_values[key].append(float(10.0 * np.log10(max(power / max(1, frame.size), 1e-20))))
        if target_band:
            band_power = band_power_for_frame(frame, sample_rate, target_band[0], target_band[1])
            band_ratios.append(float(band_power / total_power))
    return {"rms_dbfs": rms_db_values, "band_ratios": band_ratios, "bands": band_db_values}


def summarize_bands(frame_metrics: dict[str, Any]) -> list[dict[str, Any]]:
    summaries = []
    for low, high in PROFILE_BANDS:
        key = f"{low}-{high}"
        values = frame_metrics["bands"].get(key) or []
        p20 = percentile(values, 20, -120.0) or -120.0
        p95 = percentile(values, 95, -120.0) or -120.0
        summaries.append(
            {
                "band_hz": key,
                "low_hz": low,
                "high_hz": high,
                "p20_db": round(p20, 3),
                "p95_db": round(p95, 3),
                "contrast_db": round(p95 - p20, 3),
                "mean_db": round(mean_or_none(values) or -120.0, 3),
            }
        )
    return summaries


def file_profile(path: Path) -> dict[str, Any]:
    audio, sample_rate, full_duration = read_audio_mono(path)
    if audio.size == 0 or sample_rate <= 0:
        raise CalibrationError(f"Audio sin muestras legibles: {path}")
    frame_metrics = collect_frame_metrics(audio, sample_rate, (2500, 4500))
    rms_values = frame_metrics["rms_dbfs"]
    band_ratios = frame_metrics["band_ratios"]
    bands = summarize_bands(frame_metrics)
    duration_analyzed = float(audio.size / sample_rate)
    return {
        "path": str(path),
        "name": path.name,
        "duration_seconds": round(full_duration, 3),
        "analyzed_seconds": round(duration_analyzed, 3),
        "sample_rate": sample_rate,
        "size_bytes": path.stat().st_size,
        "rms_dbfs": round(dbfs(float(np.sqrt(np.mean(np.square(audio)) + 1e-10))), 3),
        "noise_floor_dbfs": round(percentile(rms_values, 20, -120.0) or -120.0, 3),
        "activity_dbfs": round(percentile(rms_values, 95, -120.0) or -120.0, 3),
        "band_energy_ratio_percentiles": {
            "p10": percentile(band_ratios, 10, 0.0),
            "p50": percentile(band_ratios, 50, 0.0),
            "p90": percentile(band_ratios, 90, 0.0),
            "p95": percentile(band_ratios, 95, 0.0),
        },
        "rms_dbfs_percentiles": {
            "p10": percentile(rms_values, 10, -120.0),
            "p20": percentile(rms_values, 20, -120.0),
            "p50": percentile(rms_values, 50, -120.0),
            "p90": percentile(rms_values, 90, -120.0),
            "p95": percentile(rms_values, 95, -120.0),
        },
        "bands": bands,
    }


def pick_initial_recommendation(label: str, profiles: list[dict[str, Any]]) -> dict[str, Any]:
    high_bands = ["2000-3000", "3000-4500", "4500-8000"]
    band_contrasts: dict[str, list[float]] = {}
    for profile in profiles:
        for band in profile["bands"]:
            band_contrasts.setdefault(band["band_hz"], []).append(float(band["contrast_db"]))
    ranked = sorted(
        [{"band_hz": key, "mean_contrast_db": round(mean_or_none(values) or 0.0, 3)} for key, values in band_contrasts.items()],
        key=lambda item: (item["band_hz"] not in high_bands, -item["mean_contrast_db"]),
    )
    default = dict(CONFIG_CANDIDATES["balanceada"])
    if "pristimantis_simoterus" in label.lower():
        default.update(
            {
                "rationale": "Pristimantis_simoterus suele beneficiarse de una banda alta inicial; 2500-4500 Hz evita mucha energia de lluvia, rio y viento.",
                "recommended_noise_mode": "bandpass primero, reduccion suave y sin normalizacion agresiva antes de detectar.",
            }
        )
    else:
        default.update(
            {
                "rationale": "Configuracion inicial balanceada para cantos con ruido de fondo constante.",
                "recommended_noise_mode": "bandpass primero, reduccion suave y revisar reporte de calidad.",
            }
        )
    default["top_contrast_bands"] = ranked[:3]
    return default


def estimate_candidates_for_config(files: list[Path], config: dict[str, Any]) -> dict[str, Any]:
    total_segments = 0
    total_duration = 0.0
    ratios: list[float] = []
    rms_values: list[float] = []
    for path in files:
        audio, sample_rate, _ = read_audio_mono(path, max_seconds=45.0)
        segments = detect_segments(audio, sample_rate, path, config)
        total_segments += len(segments)
        total_duration += sum(segment.duration_seconds for segment in segments)
        ratios.extend(segment.band_energy_ratio for segment in segments)
        rms_values.extend(segment.rms_dbfs for segment in segments)
    return {
        "estimated_clips": total_segments,
        "estimated_candidate_duration_seconds": round(total_duration, 3),
        "average_band_energy_ratio": mean_or_none(ratios),
        "average_rms_dbfs": mean_or_none(rms_values),
    }


def analyze_audio_folder_profile(
    folder_path: str,
    label: str,
    sample_size: int = 20,
    output: str | Path | None = None,
    *,
    job_allowed_roots: list[str] | None = None,
    allow_unrestricted: bool = False,
) -> dict[str, Any]:
    folder = resolve_calibration_folder(folder_path, job_allowed_roots=job_allowed_roots, allow_unrestricted=allow_unrestricted)
    files = list_audio_files(folder)
    if not files:
        raise CalibrationError("No se encontraron audios .wav/.flac/.mp3/.ogg/.m4a en la carpeta.")
    sample = representative_sample(files, min(sample_size, len(files)))
    profiles = []
    errors = []
    for path in sample:
        try:
            profiles.append(file_profile(path))
        except Exception as exc:
            errors.append({"path": str(path), "error": str(exc)})
    if not profiles:
        raise CalibrationError("No fue posible leer ningun audio de la muestra.")

    duration_values = [item["duration_seconds"] for item in profiles]
    rms_values = [item["rms_dbfs"] for item in profiles]
    noise_values = [item["noise_floor_dbfs"] for item in profiles]
    suggestion = pick_initial_recommendation(label, profiles)
    config_estimates = {
        name: estimate_candidates_for_config(sample[: min(5, len(sample))], config)
        for name, config in CONFIG_CANDIDATES.items()
    }
    result = {
        "report_type": "audio_folder_profile",
        "report_id": safe_name(f"{label}_profile_{now_id()}"),
        "folder_path": str(folder),
        "folder_path_resolved": str(folder),
        "label": label,
        "sample_size_requested": sample_size,
        "sample_size_used": len(sample),
        "total_audio_files": len(files),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "summary": {
            "duration_seconds": {
                "min": percentile(duration_values, 0, 0.0),
                "median": percentile(duration_values, 50, 0.0),
                "max": percentile(duration_values, 100, 0.0),
            },
            "rms_dbfs": {
                "p20": percentile(rms_values, 20, -120.0),
                "median": percentile(rms_values, 50, -120.0),
                "p90": percentile(rms_values, 90, -120.0),
            },
            "noise_floor_dbfs": {
                "median": percentile(noise_values, 50, -120.0),
                "p90": percentile(noise_values, 90, -120.0),
            },
        },
        "suggested_parameters": suggestion,
        "recommended_config": suggestion.get("name") if isinstance(suggestion, dict) else None,
        "candidate_configs": list(CONFIG_CANDIDATES.values()),
        "config_estimates": config_estimates,
        "is_exploratory": False,
        "legacy_report": False,
        "warnings": [
            "No se modifican audios originales.",
            "Usa esta calibracion como punto de partida y revisa clips antes de procesar toda la carpeta.",
            "Si el reporte marca possible_damage/requires_review, no uses esos derivados para entrenamiento automatico.",
        ],
        "files": profiles,
        "errors": errors,
    }
    if output:
        write_json_report(result, output)
        result["report_path"] = str(Path(output))
    return result


def profile_top_contrast_bands(profile_report: dict[str, Any]) -> list[dict[str, Any]]:
    suggested = profile_report.get("suggested_parameters") or {}
    return [item for item in suggested.get("top_contrast_bands") or [] if isinstance(item, dict)]


def band_bounds(item: dict[str, Any]) -> tuple[float, float] | None:
    if item.get("low_hz") is not None and item.get("high_hz") is not None:
        return float(item["low_hz"]), float(item["high_hz"])
    raw = str(item.get("band_hz") or "")
    if "-" not in raw:
        return None
    left, right = raw.split("-", 1)
    return float(left), float(right)


def profile_nyquist(profile_report: dict[str, Any]) -> float:
    sample_rates = [float(item.get("sample_rate") or 0) for item in profile_report.get("files") or [] if item.get("sample_rate")]
    return max(1000.0, min(sample_rates) / 2.0) if sample_rates else 24000.0


def low_frequency_noise_dominant(profile_report: dict[str, Any]) -> bool:
    low_energy = []
    other_energy = []
    for file_item in profile_report.get("files") or []:
        for band in file_item.get("bands") or []:
            bounds = band_bounds(band)
            if not bounds or band.get("mean_db") is None:
                continue
            low, high = bounds
            if high <= 1000:
                low_energy.append(float(band["mean_db"]))
            elif low >= 1000:
                other_energy.append(float(band["mean_db"]))
    return bool(low_energy and other_energy and (mean_or_none(low_energy) or -120) > (mean_or_none(other_energy) or -120) + 6)


def pick_adaptive_band(profile_report: dict[str, Any]) -> dict[str, Any] | None:
    avoid_low = low_frequency_noise_dominant(profile_report)
    candidates = []
    for item in profile_top_contrast_bands(profile_report):
        bounds = band_bounds(item)
        if not bounds:
            continue
        low, high = bounds
        if avoid_low and high <= 1000:
            continue
        contrast = float(item.get("mean_contrast_db", item.get("contrast_db", 0)) or 0)
        candidates.append((contrast, low, high, item))
    if not candidates:
        return None
    contrast, low, high, item = sorted(candidates, reverse=True)[0]
    if contrast < 1 or high <= low:
        return None
    return {**item, "low_hz": low, "high_hz": high, "mean_contrast_db": contrast}


def clamp_hz(value: float, nyquist: float) -> float:
    return float(max(100, min(nyquist, round(float(value) / 100) * 100)))


def adaptive_thresholds(profile_report: dict[str, Any]) -> dict[str, float]:
    summary = profile_report.get("summary") or {}
    rms = summary.get("rms_dbfs") or {}
    noise = summary.get("noise_floor_dbfs") or {}
    base = max(float(noise.get("median", -58)) + 6, float(rms.get("p90", -46)) - 8)
    base = max(-56, min(-42, base))
    return {
        "high_confidence_config": round(base + 2, 1),
        "balanced_config": round(base, 1),
        "high_recall_config": round(base - 2, 1),
        "exploratory_config": round(base - 4, 1),
    }


def build_adaptive_sweep_configs(profile_report: dict[str, Any], label: str | None = None, noise_context: str | None = None) -> list[dict[str, Any]]:
    nyquist = profile_nyquist(profile_report)
    source = pick_adaptive_band(profile_report)
    thresholds = adaptive_thresholds(profile_report)
    ratios = {
        "high_confidence_config": 0.34,
        "balanced_config": 0.28,
        "high_recall_config": 0.22,
        "exploratory_config": 0.16,
    }
    labels = {
        "high_confidence_config": "Alta confianza",
        "balanced_config": "Equilibrada recomendada",
        "high_recall_config": "Mayor cobertura",
        "exploratory_config": "Exploratoria",
    }
    if source:
        low = float(source["low_hz"])
        high = float(source["high_hz"])
        width = high - low
        if width <= 1200 and (low + high) / 2 < 3500:
            ranges = {
                "high_confidence_config": (low + 300, high + 300),
                "balanced_config": (low + 200, high + 200),
                "high_recall_config": (low, high + 500),
                "exploratory_config": (low - 200, high + 1000),
            }
        else:
            ranges = {
                "high_confidence_config": (low + width * 0.15, high - width * 0.05),
                "balanced_config": (low, high),
                "high_recall_config": (low - width * 0.1, high + width * 0.1),
                "exploratory_config": (low - width * 0.2, high + width * 0.2),
            }
        rationale = f"Generada desde la banda de mayor contraste {source['low_hz']}-{source['high_hz']} Hz."
    else:
        ranges = {
            "high_confidence_config": (1000, min(4000, nyquist)),
            "balanced_config": (500, min(6000, nyquist)),
            "high_recall_config": (300, min(8000, nyquist)),
            "exploratory_config": (100, min(10000, nyquist)),
        }
        rationale = "Generada con barrido amplio conservador porque no hubo una banda dominante clara."
    return [
        normalize_config(
            sweep_config(
                name,
                labels[name],
                clamp_hz(ranges[name][0], nyquist),
                max(clamp_hz(ranges[name][1], nyquist), clamp_hz(ranges[name][0], nyquist) + 500),
                thresholds[name],
                ratios[name],
                sweep_profile_type="adaptive",
                source_band=source,
                rationale=rationale,
            ),
            False,
        )
        for name in ["high_confidence_config", "balanced_config", "high_recall_config", "exploratory_config"]
    ]


def detect_segments(audio: np.ndarray, sample_rate: int, source_path: Path, config: dict[str, Any]) -> list[Segment]:
    if audio.size == 0 or sample_rate <= 0:
        return []
    starts, window_size = frame_starts(audio.size, sample_rate)
    if audio.size < window_size:
        audio = np.pad(audio, (0, window_size - audio.size))
    active: list[tuple[float, float, float, float]] = []
    low_hz = float(config["frequency_min_hz"])
    high_hz = float(config["frequency_max_hz"])
    threshold = float(config["threshold_dbfs"])
    min_ratio = float(config["min_band_energy_ratio"])
    for start in starts:
        frame = audio[start : start + window_size]
        rms = float(np.sqrt(np.mean(np.square(frame)) + 1e-10))
        total_power = sum(band_power_for_frame(frame, sample_rate, low, high) for low, high in PROFILE_BANDS) + 1e-12
        band_power = band_power_for_frame(frame, sample_rate, low_hz, high_hz)
        ratio = float(band_power / total_power)
        rms_db = dbfs(rms)
        band_rms_db = dbfs(rms * math.sqrt(max(0.0, min(1.0, ratio))))
        if band_rms_db >= threshold and ratio >= min_ratio:
            frame_start = float(start / sample_rate)
            active.append((frame_start, frame_start + window_size / sample_rate, rms_db, ratio))
    merged = merge_intervals([(start, end) for start, end, _, _ in active], float(config["min_silence_seconds"]))
    padded = [(max(0.0, start - float(config["padding_seconds"])), min(audio.size / sample_rate, end + float(config["padding_seconds"]))) for start, end in merged]
    merged = merge_intervals(padded, float(config["min_silence_seconds"]))
    merged = split_long_intervals(merged, float(config["max_segment_seconds"]))
    segments: list[Segment] = []
    for start, end in merged:
        if end - start < float(config["min_activity_seconds"]):
            continue
        related = [item for item in active if item[0] < end and item[1] > start]
        if not related:
            continue
        ratio = float(np.mean([item[3] for item in related]))
        rms_db = float(np.mean([item[2] for item in related]))
        score = max(0.0, min(1.0, ratio * 0.7 + max(0.0, rms_db - threshold) / 45.0 * 0.3))
        segments.append(Segment(source_path, round(start, 3), round(end, 3), round(end - start, 3), round(rms_db, 3), round(ratio, 6), round(score, 4)))
    return segments


def merge_intervals(intervals: list[tuple[float, float]], max_gap: float) -> list[tuple[float, float]]:
    if not intervals:
        return []
    intervals = sorted(intervals)
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        last_start, last_end = merged[-1]
        if start - last_end <= max_gap:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def split_long_intervals(intervals: list[tuple[float, float]], max_seconds: float) -> list[tuple[float, float]]:
    if max_seconds <= 0:
        return intervals
    out: list[tuple[float, float]] = []
    for start, end in intervals:
        cursor = start
        while end - cursor > max_seconds:
            out.append((cursor, cursor + max_seconds))
            cursor += max_seconds
        if end > cursor:
            out.append((cursor, end))
    return out


def write_wav(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.clip(audio.astype("float32"), -1.0, 1.0)
    if sf is not None:
        sf.write(str(path), data, int(sample_rate), format="WAV")
        return
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(int(sample_rate))
        wav.writeframes((data * 32767.0).astype("<i2").tobytes())


def extract_segment_audio(audio: np.ndarray, sample_rate: int, segment: Segment) -> np.ndarray:
    start = max(0, int(segment.start_seconds * sample_rate))
    end = min(audio.size, max(start, int(segment.end_seconds * sample_rate)))
    return audio[start:end].astype("float32")


def apply_bandpass(audio: np.ndarray, sample_rate: int, low_hz: float, high_hz: float) -> np.ndarray:
    if audio.size == 0:
        return audio
    spectrum = np.fft.rfft(audio.astype("float32"))
    freqs = np.fft.rfftfreq(audio.size, d=1.0 / sample_rate)
    mask = (freqs >= low_hz) & (freqs <= min(high_hz, sample_rate / 2))
    spectrum[~mask] = 0
    return np.fft.irfft(spectrum, n=audio.size).astype("float32")


def apply_soft_gate(audio: np.ndarray, sample_rate: int, prop_decrease: float) -> np.ndarray:
    if audio.size == 0:
        return audio
    rms_values = []
    starts, window_size = frame_starts(audio.size, sample_rate, window_seconds=0.05, hop_seconds=0.025)
    padded = audio if audio.size >= window_size else np.pad(audio, (0, window_size - audio.size))
    for start in starts:
        frame = padded[start : start + window_size]
        rms_values.append(float(np.sqrt(np.mean(np.square(frame)) + 1e-10)))
    threshold = float(np.percentile(rms_values, 35)) if rms_values else 0.0
    processed = audio.copy()
    quiet = np.abs(processed) < threshold
    processed[quiet] *= max(0.0, min(1.0, 1.0 - prop_decrease))
    return processed


def process_preview(audio: np.ndarray, sample_rate: int, config: dict[str, Any]) -> np.ndarray:
    processed = audio.astype("float32", copy=True)
    if config.get("bandpass", True):
        processed = apply_bandpass(processed, sample_rate, float(config["frequency_min_hz"]), float(config["frequency_max_hz"]))
    if config.get("detection_only"):
        return np.clip(processed, -1.0, 1.0)
    if config.get("noise_reduce"):
        processed = apply_soft_gate(processed, sample_rate, float(config.get("prop_decrease", 0.25)))
    peak = float(np.max(np.abs(processed))) if processed.size else 0.0
    if config.get("normalize") and peak > 0.95:
        processed = processed / peak * 0.90
    return np.clip(processed, -1.0, 1.0)


def segment_quality(source: np.ndarray, processed: np.ndarray, sample_rate: int) -> dict[str, Any]:
    source_metrics = simple_metrics(source, sample_rate)
    processed_metrics = simple_metrics(processed, sample_rate)
    noise_delta = processed_metrics["noise_floor_dbfs"] - source_metrics["noise_floor_dbfs"]
    contrast_delta = processed_metrics["contrast_db"] - source_metrics["contrast_db"]
    high_delta = processed_metrics["band_2000_8000_db"] - source_metrics["band_2000_8000_db"]
    clipping = processed_metrics["clipping_ratio"]
    possible_damage = (
        noise_delta > 6
        or contrast_delta < -3
        or clipping > 0
        or (high_delta > 8 and contrast_delta < 1)
    )
    return {
        "source": source_metrics,
        "processed": processed_metrics,
        "noise_floor_delta_db": round(noise_delta, 3),
        "contrast_delta_db": round(contrast_delta, 3),
        "band_2000_8000_delta_db": round(high_delta, 3),
        "possible_damage": bool(possible_damage),
        "recommendation": "possible_damage/requires_review" if possible_damage else "requires_review",
    }


def simple_metrics(audio: np.ndarray, sample_rate: int) -> dict[str, float]:
    if audio.size == 0:
        return {"rms_dbfs": -120.0, "noise_floor_dbfs": -120.0, "activity_dbfs": -120.0, "contrast_db": 0.0, "clipping_ratio": 0.0, "band_2000_8000_db": -120.0}
    audio = np.clip(audio.astype("float32"), -1.0, 1.0)
    starts, window_size = frame_starts(audio.size, sample_rate, 0.05, 0.025)
    if audio.size < window_size:
        audio = np.pad(audio, (0, window_size - audio.size))
    rms = [float(np.sqrt(np.mean(np.square(audio[start : start + window_size])) + 1e-10)) for start in starts]
    rms_db = [dbfs(value) for value in rms]
    noise = percentile(rms_db, 20, -120.0) or -120.0
    activity = percentile(rms_db, 95, -120.0) or -120.0
    return {
        "rms_dbfs": round(dbfs(float(np.sqrt(np.mean(np.square(audio)) + 1e-10))), 3),
        "noise_floor_dbfs": round(noise, 3),
        "activity_dbfs": round(activity, 3),
        "contrast_db": round(activity - noise, 3),
        "clipping_ratio": round(float(np.mean(np.abs(audio) >= 0.99)), 8),
        "band_2000_8000_db": round(float(10.0 * np.log10(max(band_power_for_frame(audio, sample_rate, 2000, 8000) / max(1, audio.size), 1e-20))), 3),
    }


def test_audio_processing_configs(
    folder_path: str,
    label: str,
    sample_size: int = 10,
    configs: list[str] | None = None,
    config_definitions: list[dict[str, Any]] | None = None,
    output_dir: str | Path | None = None,
    *,
    job_allowed_roots: list[str] | None = None,
    allow_unrestricted: bool = False,
    detection_only: bool | None = None,
    mode: str | None = None,
    species_profile: str | None = None,
) -> dict[str, Any]:
    folder = resolve_calibration_folder(folder_path, job_allowed_roots=job_allowed_roots, allow_unrestricted=allow_unrestricted)
    files = representative_sample(list_audio_files(folder), sample_size)
    if not files:
        raise CalibrationError("No se encontraron audios para probar configuraciones.")
    sweep_mode = str(mode or "").strip().lower()
    sweep_profile_type = "generic"
    adaptive_profile_report = None
    effective_species_profile = str(species_profile or "").strip().lower()
    if sweep_mode == "adaptive_advanced_sweep":
        adaptive_profile_report = analyze_audio_folder_profile(
            str(folder),
            label,
            sample_size=sample_size,
            job_allowed_roots=[str(folder)],
            allow_unrestricted=False,
        )
        configs = []
        config_definitions = build_adaptive_sweep_configs(adaptive_profile_report, label=label)
        detection_only = False
        sweep_profile_type = "adaptive"
    elif sweep_mode in {"advanced_sweep", "profile_sweep"}:
        if effective_species_profile and effective_species_profile != "pristimantis_simoterus_rain_wind":
            raise CalibrationError(f"species_profile desconocido para advanced_sweep: {species_profile}")
        configs = []
        config_definitions = pristimantis_rain_wind_sweep_configs()
        detection_only = False
        effective_species_profile = "pristimantis_simoterus_rain_wind"
        sweep_profile_type = "species_specific"
    selected = resolve_config_selection(configs, config_definitions, detection_only)
    report_root = Path(output_dir) if output_dir else settings.STORAGE_DIR / "audio_lab" / "calibration_reports" / safe_name(f"{label}_test_{now_id()}")
    report_root.mkdir(parents=True, exist_ok=True)
    summaries = []
    preview_records = []
    for config in selected:
        config_dir = report_root / "previews" / config["name"]
        config_dir.mkdir(parents=True, exist_ok=True)
        segments_all: list[Segment] = []
        qualities = []
        preview_count = 0
        analyzed_duration = 0.0
        for source_path in files:
            audio, sample_rate, _ = read_audio_mono(source_path, max_seconds=90.0)
            analyzed_duration += float(audio.size / sample_rate) if sample_rate else 0.0
            segments = detect_segments(audio, sample_rate, source_path, config)
            segments_all.extend(segments)
            for segment in segments[:4]:
                raw_clip = extract_segment_audio(audio, sample_rate, segment)
                processed = process_preview(raw_clip, sample_rate, config)
                quality = segment_quality(raw_clip, processed, sample_rate)
                qualities.append(quality)
                if preview_count < 20:
                    stem = safe_name(source_path.stem, "audio")
                    base = f"{stem}_{segment.start_seconds:.2f}_{segment.end_seconds:.2f}"
                    raw_path = config_dir / f"{base}_raw.wav"
                    processed_path = config_dir / f"{base}_processed.wav"
                    write_wav(raw_path, raw_clip, sample_rate)
                    write_wav(processed_path, processed, sample_rate)
                    preview_records.append(
                        {
                            "config": config["name"],
                            "source_audio_path": str(source_path),
                            "raw_preview_path": str(raw_path),
                            "processed_preview_path": str(processed_path),
                            "start_seconds": segment.start_seconds,
                            "end_seconds": segment.end_seconds,
                            "preview_mode": "detection_candidate" if config.get("detection_only") else "processed_preview",
                            "quality": quality,
                        }
                    )
                    preview_count += 1
        possible_damage_count = sum(1 for item in qualities if item["possible_damage"])
        clipping_count = sum(1 for item in qualities if item["processed"]["clipping_ratio"] > 0)
        contrast_before = mean_or_none(item["source"]["contrast_db"] for item in qualities)
        contrast_after = mean_or_none(item["processed"]["contrast_db"] for item in qualities)
        noise_before = mean_or_none(item["source"]["noise_floor_dbfs"] for item in qualities)
        noise_after = mean_or_none(item["processed"]["noise_floor_dbfs"] for item in qualities)
        contrast_delta = round((contrast_after or 0) - (contrast_before or 0), 3) if contrast_before is not None and contrast_after is not None else None
        noise_delta = round((noise_after or 0) - (noise_before or 0), 3) if noise_before is not None and noise_after is not None else None
        total_duration = round(sum(segment.duration_seconds for segment in segments_all), 3)
        useful_candidates = sum(1 for segment in segments_all if segment.score >= 0.12 and segment.duration_seconds >= float(config["min_activity_seconds"]))
        duration_ratio = round(total_duration / analyzed_duration, 6) if analyzed_duration else 0.0
        duration_reasonable = total_duration > 0 and duration_ratio <= 0.35
        requires_manual_review = bool(useful_candidates) and not duration_reasonable
        cleaning_safe = (
            bool(qualities)
            and not config.get("detection_only")
            and possible_damage_count == 0
            and clipping_count == 0
            and (contrast_delta is None or contrast_delta >= -2)
            and (noise_delta is None or noise_delta <= 6)
        )
        detection_label = "candidate_for_review" if useful_candidates and duration_reasonable else "too_few_candidates" if not useful_candidates else "too_many_candidates"
        cleaning_label = "not_applicable_detection_only" if config.get("detection_only") else "safe_for_review" if cleaning_safe else "requires_review"
        review_preview_candidate = bool(
            len(segments_all) > 0
            and possible_damage_count == 0
            and clipping_count == 0
            and cleaning_label == "requires_review"
        )
        small_batch_review_candidate = bool(
            (requires_manual_review or review_preview_candidate)
            and len(segments_all) > 0
            and possible_damage_count == 0
            and clipping_count == 0
        )
        summary = {
            "config": config["name"],
            "label": config["label"],
            "parameters": config,
            "total_candidates": len(segments_all),
            "total_duration_candidates": total_duration,
            "average_band_energy_ratio": mean_or_none(segment.band_energy_ratio for segment in segments_all),
            "average_rms_dbfs": mean_or_none(segment.rms_dbfs for segment in segments_all),
            "estimated_noise_floor": noise_before,
            "possible_damage_count": possible_damage_count,
            "clipping_count": clipping_count,
            "contrast_before_after": {
                "before_db": contrast_before,
                "after_db": contrast_after,
                "delta_db": contrast_delta,
            },
            "noise_floor_before_after": {
                "before_db": noise_before,
                "after_db": noise_after,
                "delta_db": noise_delta,
            },
            "detection_metrics": {
                "total_candidates": len(segments_all),
                "useful_candidates": useful_candidates,
                "total_duration_candidates": total_duration,
                "duration_ratio_of_sample": duration_ratio,
                "duration_reasonable": duration_reasonable,
                "requires_manual_review": requires_manual_review,
                "candidate_for_small_batch_review": small_batch_review_candidate,
                "review_preview_candidate": review_preview_candidate,
                "average_band_energy_ratio": mean_or_none(segment.band_energy_ratio for segment in segments_all),
                "average_score": mean_or_none(segment.score for segment in segments_all),
                "recommendation": detection_label,
            },
            "cleaning_metrics": {
                "mode": "detection_only" if config.get("detection_only") else "cleaning_preview",
                "cleaning_safe": cleaning_safe,
                "possible_damage_count": possible_damage_count,
                "clipping_count": clipping_count,
                "contrast_delta_db": contrast_delta,
                "noise_floor_delta_db": noise_delta,
                "recommendation": cleaning_label,
            },
            "recommendation": cleaning_label if not config.get("detection_only") else detection_label,
            "review_status": "candidate_for_small_batch_review" if small_batch_review_candidate else "requires_manual_review" if requires_manual_review else None,
        }
        summaries.append(summary)
    best_detection = choose_best_detection_config(summaries)
    best_cleaning = choose_best_cleaning_config(summaries)
    safe_recommended = choose_safe_recommended_config(summaries)
    final_recommendation_profiles = build_final_recommendation_profiles(summaries)
    recommended = choose_recommended_config(summaries)
    incremental_recommendation = build_incremental_recommendation(recommended)
    recommended_summary = next((item for item in summaries if item.get("config") == (recommended or {}).get("config")), None)
    final_recommendation = build_final_recommendation(best_detection, best_cleaning, review_candidate=recommended_summary)
    recommended_config_name = (recommended or {}).get("config")
    recommended_recommendation = (recommended_summary or {}).get("recommendation")
    no_candidates = bool(summaries) and all(int(item.get("total_candidates") or 0) == 0 for item in summaries)
    recommended_is_exploratory_wide = recommended_config_name == "exploratory_wide"
    recommended_is_intermediate = recommended_config_name == "intermedia_exploratoria"
    recommended_is_narrower = recommended_config_name == "intermedia_cerrada"
    recommended_is_selective = recommended_config_name in {"intermedia_cerrada_mas_selectiva", "intermedia_cerrada_mas_selectiva_ratio025"}
    recommended_is_broader_detection = is_recommended_broader_detection_summary(recommended_summary)
    recommended_is_unsafe_probe = bool(
        recommended_is_exploratory_wide
        or (recommended_is_intermediate and recommended_recommendation == "too_many_candidates")
    )
    has_exploratory_wide = any(item.get("config") == "exploratory_wide" or item.get("label") == "Exploratoria amplia" for item in summaries)
    has_broader_detection = any(is_recommended_broader_detection_summary(item) for item in summaries)
    should_try_broader_detection = bool(
        not has_broader_detection
        and summaries
        and any(is_low_candidate_strict_probe(item) for item in summaries)
    )
    strict_probe_no_candidates = bool(no_candidates and selected and all(config.get("name") == "intermedia_cerrada_estricta" for config in selected))
    should_try_intermediate = bool(
        recommended_is_exploratory_wide and recommended_recommendation == "too_many_candidates"
    )
    should_try_narrower = bool(
        recommended_is_intermediate and recommended_recommendation == "too_many_candidates"
    )
    should_review_previews = is_review_preview_candidate(recommended_summary)
    if recommended_is_broader_detection and recommended_summary and int(recommended_summary.get("total_candidates") or 0) > 0:
        best_next_step = "review_previews"
    elif should_try_broader_detection:
        best_next_step = "try_broader_detection"
    elif strict_probe_no_candidates:
        best_next_step = "return_to_selective_config"
    elif no_candidates and not has_exploratory_wide:
        best_next_step = "try_exploratory_wide"
    elif should_try_intermediate:
        best_next_step = "try_intermediate_config"
    elif should_try_narrower:
        best_next_step = "try_narrower_config"
    elif recommended_is_selective and recommended_recommendation == "too_many_candidates":
        best_next_step = "manual_review_or_tighten"
    elif should_review_previews:
        best_next_step = "review_previews"
    elif safe_recommended:
        best_next_step = "apply_safe_config"
    elif any(item.get("recommendation") == "too_many_candidates" for item in summaries):
        best_next_step = "review_and_tighten_filters"
    else:
        best_next_step = None
    recommendation_explanation = build_recommendation_explanation(
        recommended_summary,
        no_candidates=no_candidates,
        best_next_step=best_next_step,
    )
    result = {
        "report_type": "audio_processing_config_test",
        "calibration_mode": sweep_mode or None,
        "sweep_profile_type": sweep_profile_type,
        "species_profile": effective_species_profile or None,
        "adaptive_profile_summary": {
            "top_contrast_bands": profile_top_contrast_bands(adaptive_profile_report),
        } if adaptive_profile_report else None,
        "report_id": safe_name(f"{label}_test_{now_id()}"),
        "folder_path": str(folder),
        "folder_path_resolved": str(folder),
        "label": label,
        "sample_size_used": len(files),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "recommended_config": recommended["config"] if recommended else None,
        "recommended_parameters": recommended["parameters"] if recommended else None,
        "best_detection_config": best_detection["config"] if best_detection else None,
        "best_detection_parameters": best_detection["parameters"] if best_detection else None,
        "best_cleaning_config": best_cleaning["config"] if best_cleaning else None,
        "best_cleaning_parameters": best_cleaning["parameters"] if best_cleaning else None,
        "safe_recommended_config": None if recommended_is_unsafe_probe or recommended_is_broader_detection else safe_recommended["config"] if safe_recommended else None,
        "safe_recommended_parameters": None if recommended_is_unsafe_probe or recommended_is_broader_detection else safe_recommended["parameters"] if safe_recommended else None,
        "cleaning_safe": bool(safe_recommended) and not recommended_is_unsafe_probe,
        "best_next_step": best_next_step,
        "suggested_broader_detection_config": RECOMMENDED_BROADER_DETECTION_CONFIG if should_try_broader_detection else None,
        "suggested_intermediate_config": SUGGESTED_INTERMEDIATE_CONFIG if should_try_intermediate else None,
        "suggested_narrower_config": SUGGESTED_NARROWER_CONFIG if should_try_narrower else None,
        "suggested_stricter_config": SUGGESTED_STRICT_NARROWER_CONFIG if recommended_is_selective and recommended_recommendation == "too_many_candidates" else None,
        "suggested_narrower_variants": {
            "if_too_many_candidates": {
                **SUGGESTED_NARROWER_TOO_MANY_VARIANT,
                "alternative_min_band_energy_ratio": 0.25,
            },
            "if_too_many_candidates_ratio025": SUGGESTED_NARROWER_TOO_MANY_RATIO025_VARIANT,
            "if_zero_candidates": SUGGESTED_NARROWER_ZERO_VARIANT,
        } if should_try_narrower or recommended_is_narrower or recommended_is_selective else None,
        "is_exploratory": bool(
            selected
            and all(
                str(config.get("name") or "").startswith("exploratory")
                or str(config.get("name") or "") in {
                    "intermedia_exploratoria",
                    "intermedia_cerrada",
                    "intermedia_cerrada_mas_selectiva",
                    "intermedia_cerrada_mas_selectiva_ratio025",
                    "intermedia_cerrada_estricta",
                }
                for config in selected
            )
        ),
        "legacy_report": False,
        "recommendation_explanation": recommendation_explanation,
        "final_recommendation": final_recommendation,
        "final_recommendation_profiles": final_recommendation_profiles,
        "primary_recommended_profile": final_recommendation_profiles.get("primary_recommended_profile"),
        "balanced_recommendation_rationale": balanced_recommendation_rationale(final_recommendation_profiles),
        "incremental_recommendation": incremental_recommendation,
        "configs": summaries,
        "previews": preview_records,
        "output_dir": str(report_root),
        "report_paths": {
            "json": str(report_root / "summary.json"),
            "csv": str(report_root / "summary.csv"),
            "markdown": str(report_root / "report.md"),
        },
        "warnings": [
            "Los previews son derivados; los audios originales no se modifican.",
            "Todos los resultados siguen requiriendo revision humana antes de entrenamiento.",
        ],
    }
    write_test_reports(result, report_root)
    return result


def choose_recommended_config(summaries: list[dict[str, Any]]) -> dict[str, Any] | None:
    profiles = build_final_recommendation_profiles(summaries)
    primary = profiles.get("primary_recommended_profile")
    if primary and profiles.get(primary):
        return profiles[primary].get("config_summary")
    return choose_best_cleaning_config(summaries) or choose_best_detection_config(summaries)


def profile_contrast_after(item: dict[str, Any] | None) -> float:
    contrast = (item or {}).get("contrast_before_after") or {}
    return float(contrast.get("after_db") or 0)


def profile_contrast_delta(item: dict[str, Any] | None) -> float:
    contrast = (item or {}).get("contrast_before_after") or {}
    return float(contrast.get("delta_db") or 0)


def profile_duration(item: dict[str, Any] | None) -> float:
    return float((item or {}).get("total_duration_candidates") or 0)


def profile_candidates(item: dict[str, Any] | None) -> int:
    return int((item or {}).get("total_candidates") or 0)


def profile_ratio(item: dict[str, Any] | None) -> float:
    return float((item or {}).get("average_band_energy_ratio") or 0)


def profile_width(item: dict[str, Any] | None) -> float:
    params = summary_parameters(item)
    return float(params.get("frequency_max_hz") or 0) - float(params.get("frequency_min_hz") or 0)


def clean_review_candidates(summaries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        item for item in summaries
        if profile_candidates(item) > 0
        and int(item.get("possible_damage_count") or 0) == 0
        and int(item.get("clipping_count") or 0) == 0
        and item.get("recommendation") in {"safe_for_review", "requires_review", "candidate_for_review"}
    ]


def profile_payload(item: dict[str, Any] | None, role: str, title: str, warning: str) -> dict[str, Any] | None:
    if not item:
        return None
    return {
        "role": role,
        "title": title,
        "config": item.get("config"),
        "label": item.get("label"),
        "parameters": item.get("parameters"),
        "total_candidates": item.get("total_candidates"),
        "total_duration_candidates": item.get("total_duration_candidates"),
        "average_band_energy_ratio": item.get("average_band_energy_ratio"),
        "possible_damage_count": item.get("possible_damage_count"),
        "clipping_count": item.get("clipping_count"),
        "contrast_before_after": item.get("contrast_before_after"),
        "recommendation": item.get("recommendation"),
        "review_status": item.get("review_status") or "candidate_for_small_batch_review",
        "warning": warning,
        "training_allowed": False,
        "badge": title.lower(),
        "sweep_profile_type": (item.get("parameters") or {}).get("sweep_profile_type"),
        "species_profile": (item.get("parameters") or {}).get("species_profile"),
        "adaptive_source_band": (item.get("parameters") or {}).get("adaptive_source_band"),
        "adaptive_rationale": (item.get("parameters") or {}).get("adaptive_rationale"),
        "config_summary": item,
    }


def balanced_recommendation_rationale(profiles: dict[str, Any]) -> str | None:
    balanced = profiles.get("balanced_config")
    if not balanced:
        return None
    if profiles.get("primary_recommended_profile") != "balanced_config":
        return "balanced_config no fue recomendacion principal porque no cumplio candidatos moderados, possible_damage_count=0, clipping_count=0 y safe_for_review."
    params = balanced.get("parameters") or {}
    if params.get("species_profile"):
        source = " Usa el preset especifico pristimantis_simoterus_rain_wind."
    elif params.get("adaptive_source_band"):
        band = params["adaptive_source_band"]
        source = f" Banda motivadora: {band.get('low_hz')}-{band.get('high_hz')} Hz."
    else:
        source = ""
    return "balanced_config se eligio porque combina candidatos moderados, possible_damage_count=0, clipping_count=0 y safe_for_review." + source


def is_balanced_primary_candidate(item: dict[str, Any] | None) -> bool:
    return bool(
        item
        and 1 <= profile_candidates(item) <= 30
        and int(item.get("possible_damage_count") or 0) == 0
        and int(item.get("clipping_count") or 0) == 0
        and item.get("recommendation") == "safe_for_review"
    )


def named_sweep_profiles(summaries: list[dict[str, Any]]) -> dict[str, Any] | None:
    by_name = {item.get("config"): item for item in summaries}
    names = {"high_confidence_config", "balanced_config", "high_recall_config", "exploratory_config"}
    if not any(name in by_name for name in names):
        return None
    primary = "balanced_config" if is_balanced_primary_candidate(by_name.get("balanced_config")) else None
    return {
        "high_confidence_config": profile_payload(by_name.get("high_confidence_config"), "high_confidence", "Alta confianza", "Alta confianza. Revisar previews antes de entrenamiento."),
        "balanced_config": profile_payload(by_name.get("balanced_config"), "balanced", "Equilibrada recomendada", "Equilibrada recomendada. Revisar previews antes de entrenamiento."),
        "high_recall_config": profile_payload(by_name.get("high_recall_config"), "high_recall", "Mayor cobertura", "Mayor cobertura con mayor riesgo de falsos positivos. Revisar manualmente."),
        "exploratory_config": profile_payload(by_name.get("exploratory_config"), "exploratory", "Exploratoria", "Solo exploracion / no entrenamiento automatico."),
        "primary_recommended_profile": primary,
        "training_allowed": False,
    }


def build_final_recommendation_profiles(summaries: list[dict[str, Any]]) -> dict[str, Any]:
    named_profiles = named_sweep_profiles(summaries)
    if named_profiles:
        return named_profiles
    clean = clean_review_candidates(summaries)
    if not clean:
        exploratory = next((item for item in summaries if item.get("recommendation") == "too_many_candidates"), None)
        return {
            "high_confidence_config": None,
            "balanced_config": None,
            "high_recall_config": None,
            "exploratory_config": profile_payload(exploratory, "exploratory", "Exploratoria", "Solo exploracion. No usar para entrenamiento."),
            "primary_recommended_profile": None,
            "training_allowed": False,
        }

    high_confidence = sorted(
        clean,
        key=lambda item: (
            0 if 1 <= profile_candidates(item) <= 8 else 1,
            -profile_ratio(item),
            -profile_contrast_after(item),
            profile_duration(item),
        ),
    )[0]
    balanced_pool = [
        item for item in clean
        if 5 <= profile_candidates(item) <= 24
        and profile_duration(item) <= 14
        and not is_recommended_broader_detection_summary(item)
    ] or [item for item in clean if 5 <= profile_candidates(item) <= 24 and profile_duration(item) <= 14] or clean
    balanced = sorted(
        balanced_pool,
        key=lambda item: (
            abs(profile_candidates(item) - 14),
            abs(profile_duration(item) - 7.0),
            -profile_ratio(item),
            -profile_contrast_after(item),
        ),
    )[0]
    recall_pool = [
        item for item in clean
        if item is not balanced
        and profile_candidates(item) >= profile_candidates(balanced)
        and profile_candidates(item) <= 30
    ] or [item for item in clean if item is not balanced] or clean
    high_recall = sorted(
        recall_pool,
        key=lambda item: (
            -profile_candidates(item),
            profile_duration(item),
            -profile_ratio(item),
        ),
    )[0]
    exploratory_pool = [
        item for item in summaries
        if item.get("recommendation") == "too_many_candidates"
        or profile_candidates(item) > 30
        or profile_duration(item) > 20
        or profile_width(item) >= 1500
    ]
    exploratory = sorted(
        exploratory_pool,
        key=lambda item: (
            0 if item.get("recommendation") == "too_many_candidates" else 1,
            -profile_candidates(item),
            -profile_duration(item),
        ),
    )[0] if exploratory_pool else None
    profiles = {
        "high_confidence_config": profile_payload(high_confidence, "high_confidence", "Alta confianza", "Pocos candidatos y alta senal. Revisar previews antes de entrenamiento."),
        "balanced_config": profile_payload(balanced, "balanced", "Equilibrada recomendada", "Configuracion principal para muestra mediana. Requiere revision humana."),
        "high_recall_config": profile_payload(high_recall, "high_recall", "Mayor cobertura", "Mas cobertura con mayor riesgo de falsos positivos. Revisar manualmente."),
        "exploratory_config": profile_payload(exploratory, "exploratory", "Exploratoria", "Solo exploracion. No usar para entrenamiento."),
        "primary_recommended_profile": "balanced_config",
        "training_allowed": False,
    }
    return profiles


def build_recommendation_explanation(
    recommended_summary: dict[str, Any] | None,
    *,
    no_candidates: bool,
    best_next_step: str | None,
) -> str:
    if no_candidates and best_next_step != "return_to_selective_config":
        return "No se detectaron candidatos con las configuraciones iniciales; puede ser muestra pequena, banda estricta, threshold alto o ruido dominante."
    if not recommended_summary:
        if best_next_step == "return_to_selective_config":
            return "La configuracion estricta puede estar perdiendo llamados; vuelve a intermedia_cerrada_mas_selectiva y revisa manualmente."
        return "No hay configuracion recomendada; revisa manualmente la muestra antes de procesar toda la carpeta."
    config_name = recommended_summary.get("config")
    recommendation = recommended_summary.get("recommendation")
    if config_name == "exploratory_wide" and recommendation == "too_many_candidates":
        return "La configuracion exploratoria encontro actividad, pero es demasiado amplia y puede incluir lluvia, viento o falsos candidatos."
    if config_name == "intermedia_exploratoria" and recommendation == "too_many_candidates":
        return "La configuracion intermedia encontro actividad y no marco dano, pero todavia es demasiado amplia; conviene cerrar filtros."
    if config_name == "intermedia_cerrada":
        if recommendation == "too_many_candidates":
            return "La configuracion cerrada sigue encontrando demasiados candidatos; prueba una variante mas selectiva."
        if int(recommended_summary.get("total_candidates") or 0) == 0:
            return "La configuracion cerrada no encontro candidatos; prueba una variante un poco mas abierta."
        return "La configuracion cerrada encontro actividad; revisa clips antes de usarla en mas audios."
    if config_name in {"intermedia_cerrada_mas_selectiva", "intermedia_cerrada_mas_selectiva_ratio025"} and recommendation == "too_many_candidates":
        return "La configuracion detecta actividad sin dano, pero todavia puede incluir ruido. Revisa manualmente el preview."
    if is_recommended_broader_detection_summary(recommended_summary):
        return "Esta configuracion encontro mas candidatos sin dano. Revisa previews antes de entrenamiento."
    if best_next_step == "try_broader_detection":
        return "Las configuraciones 2500-5000 Hz dieron pocos candidatos; prueba una deteccion mas amplia hacia 2200-3300 Hz."
    if config_name == "intermedia_cerrada_estricta" and int(recommended_summary.get("total_candidates") or 0) == 0:
        return "La configuracion estricta puede estar perdiendo llamados; vuelve a intermedia_cerrada_mas_selectiva y revisa manualmente."
    if best_next_step == "apply_safe_config":
        return "Existe una configuracion candidata segura para aplicar a la carpeta actual, siempre con revision humana antes de entrenamiento."
    if best_next_step == "review_previews":
        return "La configuracion detecto candidatos sin dano, pero requiere revision humana antes de procesar una muestra pequena."
    if recommendation == "too_many_candidates":
        return "La configuracion encontro actividad, pero es demasiado amplia; ajusta banda, threshold o ratio antes del lote grande."
    if recommendation == "possible_damage":
        return "Hay posible dano en derivados; no uses esta configuracion para procesar toda la carpeta."
    return "Revisa manualmente los candidatos antes de procesar toda la carpeta."


def choose_best_detection_config(summaries: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates = [item for item in summaries if int(item.get("detection_metrics", {}).get("useful_candidates") or 0) > 0]
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda item: (
            0 if item.get("detection_metrics", {}).get("duration_reasonable") else 1,
            item.get("possible_damage_count", 0),
            -float(item.get("detection_metrics", {}).get("average_score") or 0),
            -float(item.get("average_band_energy_ratio") or 0),
            -int(item.get("detection_metrics", {}).get("useful_candidates") or 0),
        ),
    )[0]


def choose_best_cleaning_config(summaries: list[dict[str, Any]]) -> dict[str, Any] | None:
    safe = [item for item in summaries if item.get("cleaning_metrics", {}).get("cleaning_safe")]
    if not safe:
        return None
    return sorted(
        safe,
        key=lambda item: (
            -float(item.get("average_band_energy_ratio") or 0),
            -int(item.get("detection_metrics", {}).get("useful_candidates") or 0),
            abs(float(item.get("cleaning_metrics", {}).get("contrast_delta_db") or 0)),
        ),
    )[0]


def close_enough(left: Any, right: Any, tolerance: float = 0.001) -> bool:
    try:
        return abs(float(left) - float(right)) <= tolerance
    except (TypeError, ValueError):
        return False


def summary_parameters(item: dict[str, Any] | None) -> dict[str, Any]:
    if not item:
        return {}
    params = item.get("parameters") or {}
    return params if isinstance(params, dict) else {}


def is_recommended_broader_detection_summary(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    params = summary_parameters(item)
    ratio = params.get("min_band_ratio", params.get("min_band_energy_ratio"))
    return bool(
        item.get("config") in {"amplia_2200_3300_m51_r023_no_noise", "broader_detection"}
        or (
            close_enough(params.get("frequency_min_hz"), 2200)
            and close_enough(params.get("frequency_max_hz"), 3300)
            and close_enough(params.get("threshold_dbfs"), -51)
            and close_enough(ratio, 0.23)
            and params.get("noise_reduce") is False
            and params.get("normalize") is False
        )
    )


def is_low_candidate_strict_probe(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    params = summary_parameters(item)
    ratio = params.get("min_band_ratio", params.get("min_band_energy_ratio"))
    max_hz = float(params.get("frequency_max_hz") or 0)
    return bool(
        close_enough(params.get("frequency_min_hz"), 2500)
        and (close_enough(max_hz, 4500) or close_enough(max_hz, 5000))
        and float(ratio or 0) >= 0.22
        and int(item.get("total_candidates") or 0) <= 1
        and int(item.get("possible_damage_count") or 0) == 0
        and int(item.get("clipping_count") or 0) == 0
    )


def is_safe_recommended_summary(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    if item.get("config") in {"exploratory_wide", "intermedia_exploratoria"}:
        return False
    if is_recommended_broader_detection_summary(item):
        return False
    cleaning = item.get("cleaning_metrics") or {}
    return (
        int(item.get("total_candidates") or 0) > 0
        and int(item.get("possible_damage_count") or 0) == 0
        and int(item.get("clipping_count") or 0) == 0
        and item.get("recommendation") != "too_many_candidates"
        and cleaning.get("cleaning_safe") is not False
        and bool(cleaning.get("cleaning_safe"))
    )


def is_review_preview_candidate(item: dict[str, Any] | None) -> bool:
    return bool(
        item
        and int(item.get("total_candidates") or 0) > 0
        and int(item.get("possible_damage_count") or 0) == 0
        and int(item.get("clipping_count") or 0) == 0
        and item.get("recommendation") in {"requires_review", "candidate_for_review"}
    )


def choose_safe_recommended_config(summaries: list[dict[str, Any]]) -> dict[str, Any] | None:
    safe = [item for item in summaries if is_safe_recommended_summary(item)]
    if not safe:
        return None
    return sorted(
        safe,
        key=lambda item: (
            -float(item.get("average_band_energy_ratio") or 0),
            -int(item.get("detection_metrics", {}).get("useful_candidates") or 0),
            abs(float(item.get("cleaning_metrics", {}).get("contrast_delta_db") or 0)),
        ),
    )[0]


def build_final_recommendation(
    best_detection: dict[str, Any] | None,
    best_cleaning: dict[str, Any] | None,
    review_candidate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if is_recommended_broader_detection_summary(best_cleaning):
        return {
            "mode": "review_previews",
            "summary": "Esta configuracion encontro mas candidatos sin dano. Revisa previews antes de entrenamiento.",
            "warning": "No usar automaticamente para entrenamiento.",
        }
    if best_cleaning:
        return {
            "mode": "cleaning_safe_for_review",
            "summary": f"La mejor limpieza para revision es {best_cleaning['label']}. Aun requiere escucha/espectrograma antes de entrenamiento.",
            "warning": None,
        }
    if is_review_preview_candidate(review_candidate):
        return {
            "mode": "review_previews",
            "summary": "Hay candidatos sin dano, pero requieren revision humana.",
            "warning": "No usar automaticamente para entrenamiento.",
        }
    if best_detection:
        if best_detection.get("config") == "intermedia_exploratoria" and best_detection.get("recommendation") == "too_many_candidates":
            return {
                "mode": "try_narrower_config",
                "summary": "La configuracion intermedia encontro actividad y no marco dano, pero todavia es demasiado amplia.",
                "warning": "Siguiente paso recomendado: crear una configuracion mas cerrada antes de procesar una carpeta grande.",
            }
        if best_detection.get("config") == "intermedia_cerrada" and best_detection.get("recommendation") == "too_many_candidates":
            return {
                "mode": "review_and_tighten_filters",
                "summary": "La configuracion mas cerrada encontro actividad, pero todavia genera demasiados candidatos para esta muestra.",
                "warning": "Siguiente paso recomendado: probar una configuracion mas selectiva antes de procesar una carpeta grande.",
            }
        if best_detection.get("config") in {"intermedia_cerrada_mas_selectiva", "intermedia_cerrada_mas_selectiva_ratio025"} and best_detection.get("recommendation") == "too_many_candidates":
            return {
                "mode": "manual_review_or_tighten",
                "summary": "La configuracion detecta actividad sin dano, pero todavia puede incluir ruido. Revisa manualmente el preview.",
                "warning": "Siguiente paso recomendado: revisar preview manualmente o probar configuracion mas estricta.",
            }
        if best_detection.get("recommendation") == "too_many_candidates" or best_detection.get("config") == "exploratory_wide":
            return {
                "mode": "try_intermediate_config",
                "summary": "La configuracion encontro actividad, pero es demasiado amplia. Puede incluir lluvia, viento o falsos candidatos.",
                "warning": "Siguiente paso recomendado: crear una configuracion intermedia antes de procesar una carpeta grande.",
            }
        return {
            "mode": "detection_only_recommended",
            "summary": f"Usa {best_detection['label']} para detectar y cortar candidatos. No hay una limpieza segura en esta muestra.",
            "warning": "La limpieza puede haber aumentado el ruido o reducido el contraste. Recomendacion: usar deteccion/corte sin normalizacion y revisar clips antes de entrenar.",
        }
    return {
        "mode": "no_reliable_config",
        "summary": "Ninguna configuracion genero candidatos utiles en esta muestra. Baja threshold gradualmente o revisa manualmente espectrogramas.",
        "warning": "No proceses toda la carpeta todavia.",
    }


def build_incremental_recommendation(recommended: dict[str, Any] | None) -> dict[str, Any]:
    if not is_safe_but_strict(recommended):
        return {
            "triggered": False,
            "summary": None,
            "variants": [],
            "recommended_variant": None,
            "normalize_warning": None,
        }
    params = recommended["parameters"]
    base = normalize_config(
        {
            **params,
            "frequency_min_hz": 2500,
            "frequency_max_hz": 5000,
            "normalize": False,
            "noise_reduce": True,
            "noise_reduce_strength": "soft",
        },
        params.get("detection_only"),
    )
    variant_a = normalize_config(
        {
            **base,
            "name": "mas_sensible_threshold",
            "label": "A. Mismo ratio, threshold -52",
            "threshold_dbfs": -52,
            "min_band_energy_ratio": base["min_band_energy_ratio"],
            "min_band_ratio": base["min_band_ratio"],
            "normalize": False,
        },
        base.get("detection_only"),
    )
    variant_b = normalize_config(
        {
            **base,
            "name": "mas_sensible_ratio",
            "label": "B. Mismo threshold, ratio 0.22",
            "threshold_dbfs": base["threshold_dbfs"],
            "min_band_energy_ratio": 0.22,
            "min_band_ratio": 0.22,
            "normalize": False,
        },
        base.get("detection_only"),
    )
    variant_c = normalize_config({**MORE_SENSITIVE_VARIANT, "detection_only": base.get("detection_only", False)}, base.get("detection_only"))
    return {
        "triggered": True,
        "summary": "La configuración es segura pero estricta; prueba una variante más sensible.",
        "safe_config": recommended.get("config"),
        "safe_parameters": params,
        "variants": [
            {
                "key": "A",
                "description": "Mantener banda 2500-5000 Hz y bajar threshold de -51 a -52 dBFS.",
                "parameters": variant_a,
            },
            {
                "key": "B",
                "description": "Mantener threshold -51 dBFS y bajar ratio minimo de energia en banda de 0.25 a 0.22.",
                "parameters": variant_b,
            },
            {
                "key": "C",
                "description": "Si sigue saliendo poco, probar threshold -52 dBFS y ratio 0.22.",
                "parameters": variant_c,
            },
        ],
        "recommended_variant": variant_c,
        "normalize_warning": "No normalizar este lote por ahora: el reporte previo mostró que normalizar puede subir el ruido o reducir el contraste.",
    }


def is_safe_but_strict(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    if item.get("recommendation") == "too_many_candidates":
        return False
    detection = item.get("detection_metrics", {})
    if detection.get("requires_manual_review") or detection.get("candidate_for_small_batch_review"):
        return False
    cleaning = item.get("cleaning_metrics", {})
    useful_candidates = int(detection.get("useful_candidates") or 0)
    contrast_delta = cleaning.get("contrast_delta_db")
    return (
        item.get("possible_damage_count", 0) == 0
        and item.get("clipping_count", 0) == 0
        and contrast_delta is not None
        and float(contrast_delta) > 0
        and 0 < useful_candidates <= 2
    )


def write_json_report(result: dict[str, Any], output: str | Path) -> None:
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


def write_test_reports(result: dict[str, Any], report_root: Path) -> None:
    write_json_report(result, report_root / "summary.json")
    csv_path = report_root / "summary.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as file:
        fieldnames = [
            "config",
            "total_candidates",
            "total_duration_candidates",
            "average_band_energy_ratio",
            "average_rms_dbfs",
            "estimated_noise_floor",
            "noise_floor_after",
            "noise_floor_delta_db",
            "possible_damage_count",
            "clipping_count",
            "contrast_before_db",
            "contrast_after_db",
            "contrast_delta_db",
            "useful_candidates",
            "duration_ratio_of_sample",
            "cleaning_safe",
            "recommendation",
        ]
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for item in result["configs"]:
            contrast = item["contrast_before_after"]
            noise = item["noise_floor_before_after"]
            detection = item["detection_metrics"]
            cleaning = item["cleaning_metrics"]
            writer.writerow(
                {
                    "config": item["config"],
                    "total_candidates": item["total_candidates"],
                    "total_duration_candidates": item["total_duration_candidates"],
                    "average_band_energy_ratio": item["average_band_energy_ratio"],
                    "average_rms_dbfs": item["average_rms_dbfs"],
                    "estimated_noise_floor": item["estimated_noise_floor"],
                    "noise_floor_after": noise["after_db"],
                    "noise_floor_delta_db": noise["delta_db"],
                    "possible_damage_count": item["possible_damage_count"],
                    "clipping_count": item["clipping_count"],
                    "contrast_before_db": contrast["before_db"],
                    "contrast_after_db": contrast["after_db"],
                    "contrast_delta_db": contrast["delta_db"],
                    "useful_candidates": detection["useful_candidates"],
                    "duration_ratio_of_sample": detection["duration_ratio_of_sample"],
                    "cleaning_safe": cleaning["cleaning_safe"],
                    "recommendation": item["recommendation"],
                }
            )
    md_lines = [
        f"# Calibracion acustica - {result['label']}",
        "",
        f"Carpeta: `{result['folder_path']}`",
        f"Muestra: {result['sample_size_used']} audio(s)",
        f"Configuracion recomendada: **{result.get('recommended_config') or 'sin recomendacion'}**",
        f"Mejor configuracion para detectar: **{result.get('best_detection_config') or 'ninguna'}**",
        f"Mejor configuracion para limpiar: **{result.get('best_cleaning_config') or 'ninguna segura'}**",
        f"Configuracion segura recomendada: **{result.get('safe_recommended_config') or 'ninguna segura'}**",
        "",
        f"Recomendacion final: {result.get('final_recommendation', {}).get('summary', '')}",
    ]
    warning = result.get("final_recommendation", {}).get("warning")
    if warning:
        md_lines.extend(["", f"> {warning}"])
    profiles = result.get("final_recommendation_profiles") or {}
    profile_rows = [
        ("Alta confianza", profiles.get("high_confidence_config")),
        ("Equilibrada recomendada", profiles.get("balanced_config")),
        ("Mayor cobertura", profiles.get("high_recall_config")),
        ("Exploratoria", profiles.get("exploratory_config")),
    ]
    if any(item for _, item in profile_rows):
        md_lines.extend(["", "## Perfiles de recomendacion", ""])
        for title, item in profile_rows:
            if not item:
                continue
            contrast = item.get("contrast_before_after") or {}
            md_lines.extend(
                [
                    f"### {title}",
                    "",
                    f"- Configuracion: `{item.get('config')}`",
                    f"- Candidatos: {item.get('total_candidates')}",
                    f"- Duracion candidata: {item.get('total_duration_candidates')} s",
                    f"- Ratio banda: {item.get('average_band_energy_ratio')}",
                    f"- Contraste: {contrast.get('before_db')} -> {contrast.get('after_db')} dB",
                    f"- Posible dano: {item.get('possible_damage_count')}",
                    f"- Recomendacion: {item.get('recommendation')}",
                    f"- Advertencia: {item.get('warning')}",
                    "",
                ]
            )
    no_candidates = bool(result.get("configs")) and all(int(item.get("total_candidates") or 0) == 0 for item in result["configs"])
    if result.get("best_next_step") == "try_intermediate_config":
        intermediate = result.get("suggested_intermediate_config") or SUGGESTED_INTERMEDIATE_CONFIG
        md_lines.extend(
            [
                "",
                "## Resultado exploratorio",
                "",
                "Crear configuracion intermedia.",
                "",
                "La configuracion encontro actividad, pero es demasiado amplia. Puede incluir lluvia, viento o falsos candidatos.",
                "",
                "Configuracion intermedia sugerida: "
                f"`{intermediate.get('name')}` {intermediate.get('frequency_min_hz')}-{intermediate.get('frequency_max_hz')} Hz, "
                f"threshold {intermediate.get('threshold_dbfs')} dBFS, ratio {intermediate.get('min_band_energy_ratio')}, "
                f"normalize={str(intermediate.get('normalize', False)).lower()}, noise_reduce={str(intermediate.get('noise_reduce', False)).lower()}.",
            ]
        )
    if result.get("best_next_step") == "try_narrower_config":
        narrower = result.get("suggested_narrower_config") or SUGGESTED_NARROWER_CONFIG
        variants = result.get("suggested_narrower_variants") or {}
        too_many_variant = variants.get("if_too_many_candidates") or SUGGESTED_NARROWER_TOO_MANY_VARIANT
        zero_variant = variants.get("if_zero_candidates") or SUGGESTED_NARROWER_ZERO_VARIANT
        md_lines.extend(
            [
                "",
                "## Resultado intermedio",
                "",
                "La configuracion intermedia encontro actividad y no marco dano, pero todavia es demasiado amplia.",
                "",
                "Siguiente paso recomendado: crear configuracion mas cerrada.",
                "",
                "Configuracion mas cerrada sugerida: "
                f"`{narrower.get('name')}` {narrower.get('frequency_min_hz')}-{narrower.get('frequency_max_hz')} Hz, "
                f"threshold {narrower.get('threshold_dbfs')} dBFS, ratio {narrower.get('min_band_energy_ratio')}, "
                f"normalize={str(narrower.get('normalize', False)).lower()}, noise_reduce={str(narrower.get('noise_reduce', False)).lower()}.",
                "",
                "Variantes sugeridas despues de probarla:",
                f"- Si sigue demasiado amplia: {too_many_variant.get('frequency_min_hz')}-{too_many_variant.get('frequency_max_hz')} Hz, threshold {too_many_variant.get('threshold_dbfs')} dBFS, ratio {too_many_variant.get('min_band_energy_ratio')} o {too_many_variant.get('alternative_min_band_energy_ratio', 0.25)}.",
                f"- Si no encuentra candidatos: {zero_variant.get('frequency_min_hz')}-{zero_variant.get('frequency_max_hz')} Hz, threshold {zero_variant.get('threshold_dbfs')} dBFS, ratio {zero_variant.get('min_band_energy_ratio')}.",
            ]
        )
    if result.get("best_next_step") == "review_and_tighten_filters":
        variants = result.get("suggested_narrower_variants") or {}
        selective = variants.get("if_too_many_candidates") or SUGGESTED_NARROWER_TOO_MANY_VARIANT
        ratio025 = variants.get("if_too_many_candidates_ratio025") or SUGGESTED_NARROWER_TOO_MANY_RATIO025_VARIANT
        md_lines.extend(
            [
                "",
                "## Resultado de prueba cerrada",
                "",
                "La configuracion mas cerrada encontro actividad, pero todavia genera demasiados candidatos para esta muestra.",
                "",
                "Siguiente paso recomendado: probar una configuracion mas selectiva.",
                "",
                "Variantes mas selectivas sugeridas:",
                f"- `{selective.get('name')}` {selective.get('frequency_min_hz')}-{selective.get('frequency_max_hz')} Hz, threshold {selective.get('threshold_dbfs')} dBFS, ratio {selective.get('min_band_energy_ratio')}.",
                f"- `{ratio025.get('name')}` {ratio025.get('frequency_min_hz')}-{ratio025.get('frequency_max_hz')} Hz, threshold {ratio025.get('threshold_dbfs')} dBFS, ratio {ratio025.get('min_band_energy_ratio')}.",
                "",
                "Si ambas quedan en 0 candidatos, vuelve a intermedia_cerrada y revisa manualmente los clips.",
            ]
        )
    if result.get("best_next_step") == "manual_review_or_tighten":
        strict = result.get("suggested_stricter_config") or SUGGESTED_STRICT_NARROWER_CONFIG
        md_lines.extend(
            [
                "",
                "## Revision manual o prueba estricta",
                "",
                "La configuracion detecta actividad sin dano, pero todavia puede incluir ruido. Revisa manualmente el preview.",
                "",
                "Siguiente paso recomendado: revisar preview manualmente o probar configuracion mas estricta.",
                "",
                "Configuracion estricta sugerida: "
                f"`{strict.get('name')}` {strict.get('frequency_min_hz')}-{strict.get('frequency_max_hz')} Hz, "
                f"threshold {strict.get('threshold_dbfs')} dBFS, ratio {strict.get('min_band_energy_ratio')}.",
                "",
                "Si la configuracion estricta da 0 candidatos, vuelve a intermedia_cerrada_mas_selectiva: puede estar perdiendo llamados.",
            ]
        )
    if result.get("best_next_step") == "try_broader_detection":
        broader = result.get("suggested_broader_detection_config") or RECOMMENDED_BROADER_DETECTION_CONFIG
        md_lines.extend(
            [
                "",
                "## Deteccion mas amplia recomendada",
                "",
                "Siguiente paso recomendado: volver a deteccion mas amplia recomendada.",
                "",
                "Las configuraciones 2500-5000 Hz dieron pocos candidatos. Prueba una banda mas baja con la senal fuerte observada en 2000-3000 Hz.",
                "",
                "Configuracion sugerida: "
                f"`{broader.get('name')}` {broader.get('frequency_min_hz')}-{broader.get('frequency_max_hz')} Hz, "
                f"threshold {broader.get('threshold_dbfs')} dBFS, ratio {broader.get('min_band_energy_ratio')}, "
                f"normalize={str(broader.get('normalize', False)).lower()}, noise_reduce={str(broader.get('noise_reduce', False)).lower()}.",
                "",
                "Usar solo para muestra pequena y revisar previews antes de entrenamiento.",
            ]
        )
    if result.get("best_next_step") == "review_previews":
        md_lines.extend(
            [
                "",
                "## Revision humana requerida",
                "",
                "La configuracion detecto candidatos sin dano, pero requiere revision humana.",
                "",
                "Siguiente paso recomendado: abrir previews para revisar.",
                "",
                "No usar automaticamente para entrenamiento.",
            ]
        )
    if result.get("best_next_step") == "return_to_selective_config":
        md_lines.extend(
            [
                "",
                "## Configuracion estricta sin candidatos",
                "",
                "La configuracion estricta puede estar perdiendo llamados.",
                "",
                "Siguiente paso recomendado: volver a intermedia_cerrada_mas_selectiva y revisar manualmente los previews.",
            ]
        )
    if no_candidates:
        md_lines.extend(
            [
                "",
                "## Sin candidatos detectados",
                "",
                "No se detectaron candidatos en la muestra con estas configuraciones. Esto no significa que no haya rana; puede indicar que la banda, threshold o ratio son demasiado estrictos.",
                "",
                "Causas probables:",
                "- La muestra es muy pequeña.",
                "- Los audios elegidos no tienen canto.",
                "- La especie canta fuera de la banda configurada.",
                "- Threshold dBFS demasiado alto.",
                "- Ratio de energía en banda demasiado alto.",
                "- Ruido de lluvia/viento tapa la señal.",
                "",
                "Siguiente paso recomendado: crear una prueba exploratoria amplia para encontrar actividad posible, no para entrenamiento automático.",
                "",
                "Configuracion exploratoria sugerida: `exploratory_wide` 1800-6000 Hz, threshold -55 dBFS, ratio 0.15, bandpass=true, noise_reduce=false, normalize=false, min_activity_seconds=0.25, min_silence_seconds=0.5, padding_seconds=0.15, clip_duration_seconds=5, max_segment_seconds=10.",
            ]
        )
    if result.get("safe_recommended_config"):
        md_lines.extend(
            [
                "",
                "## Configuracion candidata segura",
                "",
                f"Configuracion: `{result.get('safe_recommended_config')}`.",
                "",
                "Siguiente paso recomendado: aplicar configuracion segura a carpeta actual y revisar manualmente antes de entrenamiento.",
            ]
        )
    incremental = result.get("incremental_recommendation") or {}
    if incremental.get("triggered"):
        recommended_variant = incremental.get("recommended_variant") or {}
        md_lines.extend(
            [
                "",
                f"Recomendacion incremental: {incremental.get('summary')}",
                f"Variante mas sensible recomendada: **{recommended_variant.get('name', 'variante_mas_sensible')}** "
                f"({recommended_variant.get('frequency_min_hz')}-{recommended_variant.get('frequency_max_hz')} Hz, "
                f"{recommended_variant.get('threshold_dbfs')} dBFS, ratio {recommended_variant.get('min_band_energy_ratio')}).",
                f"Advertencia: {incremental.get('normalize_warning')}",
                "",
                "Variantes sugeridas:",
            ]
        )
        for variant in incremental.get("variants", []):
            params = variant.get("parameters") or {}
            md_lines.append(
                f"- {variant.get('key')}. {variant.get('description')} "
                f"normalize={str(params.get('normalize', False)).lower()}, noise_reduce_strength={params.get('noise_reduce_strength', 'soft')}."
            )
    md_lines.extend(
        [
        "",
        "| Configuracion | Candidatos utiles | Duracion s | Ratio banda | Contraste antes/despues | Ruido antes/despues | Posible dano | Limpieza segura | Recomendacion |",
        "| --- | ---: | ---: | ---: | --- | --- | ---: | --- | --- |",
        ]
    )
    for item in result["configs"]:
        contrast = item["contrast_before_after"]
        noise = item["noise_floor_before_after"]
        detection = item["detection_metrics"]
        cleaning = item["cleaning_metrics"]
        md_lines.append(
            f"| {item['label']} | {detection['useful_candidates']} | {item['total_duration_candidates']} | "
            f"{item['average_band_energy_ratio']} | {contrast['before_db']} -> {contrast['after_db']} dB | "
            f"{noise['before_db']} -> {noise['after_db']} dB | {item['possible_damage_count']} | "
            f"{'si' if cleaning['cleaning_safe'] else 'no'} | {item['recommendation']} |"
        )
    md_lines.extend(
        [
            "",
            "Los audios originales no se modificaron. Los previews son derivados de calibracion y requieren revision humana.",
        ]
    )
    (report_root / "report.md").write_text("\n".join(md_lines), encoding="utf-8")


def calibration_reports_dir() -> Path:
    path = settings.STORAGE_DIR / "audio_lab" / "calibration_reports"
    path.mkdir(parents=True, exist_ok=True)
    return path


def default_profile_output(label: str) -> Path:
    return calibration_reports_dir() / f"{safe_name(label)}_profile_{now_id()}.json"


def default_test_output_dir(label: str) -> Path:
    return calibration_reports_dir() / f"{safe_name(label)}_test_{now_id()}"


def list_calibration_reports() -> list[dict[str, Any]]:
    root = calibration_reports_dir()
    reports = []
    for path in sorted(root.rglob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        if path.name.endswith(".quality.json"):
            continue
        rel = path.relative_to(root).as_posix()
        metadata: dict[str, Any] = {}
        try:
            metadata = normalize_calibration_report(json.loads(path.read_text(encoding="utf-8")), source_path=path)
        except Exception:
            metadata = {}
        reports.append(
            {
                "id": rel,
                "report_id": metadata.get("report_id") or rel,
                "report_type": metadata.get("report_type"),
                "name": path.name,
                "path": str(path),
                "source_report_path": str(path),
                "folder_path": metadata.get("folder_path"),
                "folder_path_resolved": metadata.get("folder_path_resolved"),
                "created_at": metadata.get("created_at"),
                "recommended_config": metadata.get("recommended_config"),
                "is_exploratory": metadata.get("is_exploratory", False),
                "safe_recommended_config": metadata.get("safe_recommended_config"),
                "legacy_report": metadata.get("legacy_report", True),
                "size_bytes": path.stat().st_size,
                "updated_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
            }
        )
    return reports


def normalize_calibration_report(report: dict[str, Any], source_path: Path | None = None) -> dict[str, Any]:
    folder_path = report.get("folder_path")
    report["folder_path_resolved"] = report.get("folder_path_resolved") or folder_path
    report["legacy_report"] = not bool(folder_path)
    if source_path:
        report["source_report_path"] = str(source_path)
    report["report_id"] = report.get("report_id") or (source_path.name if source_path else "")
    report["is_exploratory"] = bool(
        report.get("is_exploratory")
        or any((item.get("config") or "").startswith("exploratory") for item in report.get("configs") or [])
    )
    return report


def read_calibration_report(report_id: str) -> dict[str, Any]:
    root = calibration_reports_dir()
    candidate = resolve_no_strict(root / report_id)
    if not is_path_inside(candidate, root) or not candidate.exists() or not candidate.is_file():
        raise CalibrationError("Reporte de calibracion no encontrado.")
    return normalize_calibration_report(json.loads(candidate.read_text(encoding="utf-8")), source_path=candidate)
