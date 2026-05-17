from __future__ import annotations

import hashlib
import math
import os
import re
from pathlib import Path

from app.core.config import settings


def safe_stem(value: str) -> str:
    text = str(value or "").strip()
    text = re.sub(r"[^A-Za-z0-9_.-]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return (text or "segmento")[:120]


def stable_spectrogram_name(segment_id: str, audio_path: Path) -> str:
    raw = f"{segment_id}|{audio_path.resolve()}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"{safe_stem(segment_id)}__{digest}.png"


def downmix_audio(data, np_module):
    if data.ndim > 1:
        data = np_module.mean(data, axis=1)
    return data.astype(np_module.float32, copy=False)


def choose_nfft(sample_rate: int, sample_count: int) -> int:
    if sample_count <= 1024:
        return max(128, 2 ** int(math.floor(math.log2(max(sample_count, 128)))))
    if sample_rate >= 44100:
        return 2048
    return 1024


def target_path_for(segment_id: str, audio_path: Path, mode: str) -> Path:
    filename = stable_spectrogram_name(segment_id, audio_path)
    if mode == "confirmed":
        return settings.SPECTROGRAM_CURATED_CONFIRMED_DIR / filename
    return settings.SPECTROGRAM_TMP_DIR / filename


def clear_temporary_spectrograms() -> dict[str, int]:
    tmp_dir = settings.SPECTROGRAM_TMP_DIR.resolve()
    tmp_dir.mkdir(parents=True, exist_ok=True)

    deleted = 0
    errors = 0

    for path in tmp_dir.glob("*.png"):
        try:
            resolved = path.resolve()
            resolved.relative_to(tmp_dir)
            resolved.unlink()
            deleted += 1
        except Exception:
            errors += 1

    return {"deleted": deleted, "errors": errors}


def generate_spectrogram_png(
    audio_path: Path,
    segment_id: str,
    mode: str = "preview",
    force: bool = False,
) -> Path:
    try:
        import matplotlib

        matplotlib.use("Agg")

        import matplotlib.pyplot as plt
        import numpy as np
        import soundfile as sf
    except Exception as exc:
        raise RuntimeError(
            "Faltan dependencias para generar espectrogramas: matplotlib, numpy y soundfile."
        ) from exc

    audio_path = audio_path.expanduser().resolve()
    if mode not in {"preview", "confirmed"}:
        raise ValueError("mode debe ser 'preview' o 'confirmed'.")

    if not audio_path.exists() or not audio_path.is_file():
        raise FileNotFoundError(f"No existe el audio: {audio_path}")

    output_path = target_path_for(segment_id, audio_path, mode)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_path.exists() and output_path.is_file() and not force:
        return output_path

    data, sample_rate = sf.read(audio_path, always_2d=False)
    mono = downmix_audio(np.asarray(data), np)

    if mono.size == 0:
        raise ValueError("El audio no contiene muestras.")

    nfft = choose_nfft(int(sample_rate), int(mono.size))
    noverlap = int(nfft * 0.75)

    fig, ax = plt.subplots(figsize=(11, 4.5), dpi=140)
    _, _, _, image = ax.specgram(
        mono,
        NFFT=nfft,
        Fs=int(sample_rate),
        noverlap=noverlap,
        cmap="magma",
        scale="dB",
    )

    duration = mono.size / float(sample_rate)
    ax.set_title(f"{segment_id} | {duration:.2f}s | {sample_rate} Hz", fontsize=10)
    ax.set_xlabel("Tiempo (s)")
    ax.set_ylabel("Frecuencia (Hz)")
    ax.set_ylim(0, min(sample_rate / 2, 16000))
    fig.colorbar(image, ax=ax, label="Intensidad (dB)")
    fig.tight_layout()
    tmp_output_path = output_path.with_name(f"{output_path.stem}__writing_{os.getpid()}.png")

    try:
        fig.savefig(tmp_output_path)
        tmp_output_path.replace(output_path)
    finally:
        plt.close(fig)
        if tmp_output_path.exists():
            tmp_output_path.unlink()

    return output_path
