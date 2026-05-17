from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exporta ejemplos de confusion desde una evaluacion.")
    parser.add_argument("--eval-dir", required=True)
    parser.add_argument("--output-csv", required=True)
    parser.add_argument("--top-n", type=int, default=None)
    return parser.parse_args()


def normalize_path(value: str) -> str:
    return str(value or "").strip().replace("\\", "/").lower()


def error_type(row: pd.Series) -> str:
    true_label = str(row.get("true_label", ""))
    predicted_label = str(row.get("predicted_label", ""))
    if true_label == predicted_label:
        return "correct"
    if true_label.startswith("no_") and not predicted_label.startswith("no_"):
        return "false_positive"
    if predicted_label.startswith("no_") and not true_label.startswith("no_"):
        return "false_negative"
    return f"{true_label}__predicho_como__{predicted_label}"


def score_payload(row: pd.Series, score_cols: list[str]) -> str:
    payload = {
        column.replace("score_", "", 1): float(row[column])
        for column in score_cols
        if pd.notna(row[column])
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def main() -> None:
    args = parse_args()
    eval_dir = Path(args.eval_dir)
    scores_path = eval_dir / "test_scores.csv"
    manifest_path = eval_dir / "test_manifest.csv"
    output_path = Path(args.output_csv)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not scores_path.exists():
        raise FileNotFoundError(f"No existe {scores_path}")
    if not manifest_path.exists():
        raise FileNotFoundError(f"No existe {manifest_path}")

    scores = pd.read_csv(scores_path)
    manifest = pd.read_csv(manifest_path)
    required_scores = {"audio_path", "true_label", "predicted_label"}
    missing = required_scores - set(scores.columns)
    if missing:
        raise ValueError(f"test_scores.csv sin columnas requeridas: {sorted(missing)}")

    scores = scores.copy()
    manifest = manifest.copy()
    scores["audio_key"] = scores["audio_path"].map(normalize_path)
    manifest["audio_key"] = manifest["audio_path"].map(normalize_path)

    manifest_cols = [
        column
        for column in ["audio_key", "source_path", "duration_seconds", "sha256", "segment_id", "split"]
        if column in manifest.columns
    ]
    joined = scores.merge(
        manifest[manifest_cols].drop_duplicates("audio_key"),
        on="audio_key",
        how="left",
        suffixes=("", "_manifest"),
    )
    score_cols = [
        column
        for column in joined.columns
        if column.startswith("score_") and pd.api.types.is_numeric_dtype(joined[column])
    ]
    joined["error_type"] = joined.apply(error_type, axis=1)
    errors = joined[joined["true_label"].astype(str) != joined["predicted_label"].astype(str)].copy()
    errors["scores"] = errors.apply(lambda row: score_payload(row, score_cols), axis=1)

    if "confidence" in errors.columns:
        errors = errors.sort_values("confidence", ascending=False)
    if args.top_n and args.top_n > 0:
        errors = errors.head(args.top_n)

    output_cols = [
        "true_label",
        "predicted_label",
        "confidence",
        "scores",
        "audio_path",
        "source_path",
        "duration_seconds",
        "sha256",
        "segment_id",
        "split",
        "error_type",
    ]
    for column in output_cols:
        if column not in errors.columns:
            errors[column] = ""
    errors[output_cols].to_csv(output_path, index=False)
    print(f"Errores exportados: {output_path}")
    print(f"Total errores: {len(errors)}")


if __name__ == "__main__":
    main()
