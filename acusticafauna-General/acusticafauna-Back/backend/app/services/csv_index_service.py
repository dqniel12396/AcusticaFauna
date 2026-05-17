import csv
from pathlib import Path
from typing import Any


def normalize_time_str(value: Any) -> str:
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return str(value).strip()


def build_csv_index(csv_path: Path | None) -> dict[tuple[str, str, str], dict[str, Any]]:
    index: dict[tuple[str, str, str], dict[str, Any]] = {}

    if csv_path is None or not csv_path.exists():
        return index

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            audio_original = row.get("audio_original", "")
            basename = Path(audio_original).name.lower().strip()

            inicio_s = normalize_time_str(row.get("inicio_s", ""))
            fin_s = normalize_time_str(row.get("fin_s", ""))

            key = (basename, inicio_s, fin_s)
            index[key] = row

    return index


def enrich_from_csv(
    csv_index: dict[tuple[str, str, str], dict[str, Any]],
    begin_path: str,
    begin_time: float,
    end_time: float,
) -> dict[str, Any]:
    basename = Path(begin_path).name.lower().strip()

    begin_norm = normalize_time_str(begin_time)
    end_norm = normalize_time_str(end_time)

    key = (basename, begin_norm, end_norm)
    row = csv_index.get(key) or {}

    return {
        "segment_audio_path": row.get("ruta_segmento_audio"),
        "spectrogram_path": row.get("ruta_espectrograma"),
        "location_name": row.get("location_name"),
        "habitat": row.get("habitat"),
        "latitude": row.get("latitude"),
        "longitude": row.get("longitude"),
    }