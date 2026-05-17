from __future__ import annotations

import argparse

import pandas as pd

from ml_utils import ensure_dir, import_opensoundscape_cnn, predict_short_clips, read_training_manifest, save_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Predicción experimental con modelo OpenSoundscape.")
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--manifest-csv", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = ensure_dir(args.output_dir)
    df = read_training_manifest(args.manifest_csv, limit=args.limit)
    df.to_csv(output_dir / "prediction_manifest_used.csv", index=False)

    if args.dry_run:
        save_json(output_dir / "prediction_summary.json", {"status": "dry_run_ok", "rows": int(len(df))})
        print(f"Dry-run OK. {len(df)} audios listos para predicción.")
        return

    _, load_model = import_opensoundscape_cnn()
    model = load_model(args.model_path)
    scores = predict_short_clips(model, df["audio_path"].tolist())
    score_columns = list(scores.columns)
    predictions = pd.DataFrame(
        {
            "audio_path": df["audio_path"].tolist()[: len(scores)],
            "true_label": df["normalized_label"].tolist()[: len(scores)] if "normalized_label" in df else "",
            "predicted_label": scores.idxmax(axis=1).astype(str).tolist(),
            "confidence": scores.max(axis=1).astype(float).tolist(),
        }
    )
    for column in score_columns:
        predictions[f"score_{column}"] = scores[column].values
    predictions.to_csv(output_dir / "predictions.csv", index=False)
    save_json(output_dir / "prediction_summary.json", {"status": "predicted", "rows": int(len(predictions)), "classes": score_columns})
    print(f"Predicciones guardadas en {output_dir / 'predictions.csv'}")


if __name__ == "__main__":
    main()
