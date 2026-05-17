from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd

from ml_utils import import_opensoundscape_cnn, predict_short_clips


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Puntua un manifest con el detector binario rana/sapo sin modificar audios."
    )
    parser.add_argument("--manifest-csv", required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--output-csv", required=True)
    parser.add_argument("--target-mode", default="binary_presence", choices=["binary_presence"])
    parser.add_argument("--positive-label", default="rana_sapo")
    parser.add_argument("--clip-duration", type=float, default=5.0)
    parser.add_argument("--threshold", type=float, default=0.30)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def sigmoid(value: float) -> float:
    clipped = max(min(float(value), 80.0), -80.0)
    return float(1.0 / (1.0 + math.exp(-clipped)))


def normalize_scores(raw_scores, positive_label: str) -> list[float]:
    if hasattr(raw_scores, "columns"):
        scores_df = raw_scores.copy()
        if positive_label in scores_df.columns:
            values = scores_df[positive_label].astype(float).tolist()
        else:
            numeric_cols = [
                column
                for column in scores_df.columns
                if pd.api.types.is_numeric_dtype(scores_df[column])
            ]
            if not numeric_cols:
                raise ValueError("La prediccion no devolvio columnas numericas.")
            values = scores_df[numeric_cols[0]].astype(float).tolist()
        return [sigmoid(value) for value in values]

    values = np.asarray(raw_scores, dtype=float).reshape(-1)
    return [sigmoid(value) for value in values]


def predict_batch(model, audio_paths: list[str], positive_label: str) -> list[float]:
    raw_scores = predict_short_clips(model, audio_paths)
    scores = normalize_scores(raw_scores, positive_label)
    if len(scores) != len(audio_paths):
        raise ValueError(f"El modelo devolvio {len(scores)} scores para {len(audio_paths)} audios.")
    return scores


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest_csv)
    output_path = Path(args.output_csv)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not manifest_path.exists():
        raise FileNotFoundError(f"No existe manifest CSV: {manifest_path}")
    if not Path(args.model_path).exists():
        raise FileNotFoundError(f"No existe modelo: {args.model_path}")

    df = pd.read_csv(manifest_path)
    missing = {"audio_path", "normalized_label"} - set(df.columns)
    if missing:
        raise ValueError(f"Manifest sin columnas requeridas: {sorted(missing)}")
    if args.limit:
        df = df.head(args.limit).copy()
    else:
        df = df.copy()

    for column in [
        f"score_{args.positive_label}",
        f"predicted_{args.positive_label}",
        "frog_detector_model",
        "frog_detector_threshold",
        "frog_detector_clip_duration",
        "scoring_error",
    ]:
        if column not in df.columns:
            df[column] = ""

    _, load_model = import_opensoundscape_cnn()
    model = load_model(args.model_path)
    model_name = Path(args.model_path).stem

    valid_indices: list[int] = []
    valid_paths: list[str] = []
    for index, row in df.iterrows():
        audio_path = str(row.get("audio_path", "")).strip()
        if not audio_path:
            df.at[index, "scoring_error"] = "audio_path_vacio"
            continue
        if not Path(audio_path).exists():
            df.at[index, "scoring_error"] = "audio_no_encontrado"
            continue
        valid_indices.append(index)
        valid_paths.append(audio_path)

    batch_size = max(1, int(args.batch_size or 1))
    for start in range(0, len(valid_paths), batch_size):
        batch_paths = valid_paths[start : start + batch_size]
        batch_indices = valid_indices[start : start + batch_size]
        try:
            batch_scores = predict_batch(model, batch_paths, args.positive_label)
        except Exception as batch_error:
            for index, audio_path in zip(batch_indices, batch_paths, strict=False):
                try:
                    score = predict_batch(model, [audio_path], args.positive_label)[0]
                    df.at[index, f"score_{args.positive_label}"] = score
                    df.at[index, f"predicted_{args.positive_label}"] = bool(score >= args.threshold)
                    df.at[index, "scoring_error"] = ""
                except Exception as item_error:
                    df.at[index, "scoring_error"] = repr(item_error) or repr(batch_error)
            continue

        for index, score in zip(batch_indices, batch_scores, strict=False):
            df.at[index, f"score_{args.positive_label}"] = score
            df.at[index, f"predicted_{args.positive_label}"] = bool(score >= args.threshold)
            df.at[index, "scoring_error"] = ""

    df["frog_detector_model"] = model_name
    df["frog_detector_threshold"] = float(args.threshold)
    df["frog_detector_clip_duration"] = float(args.clip_duration)
    df.to_csv(output_path, index=False)

    scored = pd.to_numeric(df[f"score_{args.positive_label}"], errors="coerce").notna().sum()
    errors = df["scoring_error"].astype(str).str.len().gt(0).sum()
    print(f"Manifest puntuado: {output_path}")
    print(f"Filas: {len(df)} | puntuadas: {scored} | errores: {errors}")


if __name__ == "__main__":
    main()
