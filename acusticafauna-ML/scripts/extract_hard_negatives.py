from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extrae falsos positivos confirmables como hard negatives.")
    parser.add_argument("--eval-dir", required=True)
    parser.add_argument("--output-csv", required=True)
    parser.add_argument("--positive-label", default="rana_sapo")
    parser.add_argument("--negative-label", default="otros_ruidos")
    parser.add_argument("--threshold", type=float, default=0.55)
    parser.add_argument("--min-score", type=float, default=0.55)
    parser.add_argument("--source-name", default=None, help="Nombre del modelo/origen. Por defecto usa el nombre del eval-dir.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    eval_dir = Path(args.eval_dir)
    scores_path = eval_dir / "test_scores.csv"
    manifest_path = eval_dir / "test_manifest.csv"
    if not scores_path.exists():
        raise SystemExit(f"No existe {scores_path}")
    if not manifest_path.exists():
        raise SystemExit(f"No existe {manifest_path}")

    scores = pd.read_csv(scores_path)
    manifest = pd.read_csv(manifest_path)
    score_col = f"score_{args.positive_label}"
    if score_col not in scores.columns:
        raise SystemExit(f"No existe columna {score_col} en {scores_path}")

    negative_truth = scores["true_label"].isin([args.negative_label, f"no_{args.positive_label}"])
    predicted_positive = scores.get("predicted_label", "").eq(args.positive_label)
    above_threshold = scores[score_col].ge(max(args.threshold, args.min_score))
    hard = scores[negative_truth & (predicted_positive | above_threshold)].copy()

    manifest_cols = [column for column in ["audio_path", "source_path", "original_label", "normalized_label"] if column in manifest.columns]
    if manifest_cols:
        hard = hard.merge(manifest[manifest_cols].drop_duplicates("audio_path"), on="audio_path", how="left", suffixes=("", "_manifest"))
    if "normalized_label" not in hard.columns:
        hard["normalized_label"] = args.negative_label
    hard["normalized_label"] = hard["normalized_label"].fillna(args.negative_label)
    if "original_label" not in hard.columns:
        hard["original_label"] = hard["normalized_label"]
    if "source_path" not in hard.columns:
        hard["source_path"] = ""

    source_name = args.source_name or eval_dir.name
    for suffix in ["_eval_calibrated", "_eval_debug", "_eval"]:
        if source_name.endswith(suffix):
            source_name = source_name[: -len(suffix)]
            break

    output = pd.DataFrame(
        {
            "audio_path": hard["audio_path"],
            "source_path": hard.get("source_path", ""),
            "original_label": hard.get("original_label", args.negative_label),
            "normalized_label": hard.get("normalized_label", args.negative_label),
            score_col: hard[score_col],
            "predicted_label": hard.get("predicted_label", args.positive_label),
            "true_label": hard.get("true_label", args.negative_label),
            "hard_negative": True,
            "hard_negative_source": source_name,
            "notes": "",
        }
    )
    output_path = Path(args.output_csv)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(output_path, index=False)
    print(f"Hard negatives exportados: {len(output)} -> {output_path}")


if __name__ == "__main__":
    main()
