from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix

from ml_utils import ensure_dir, import_opensoundscape_cnn, predict_short_clips, read_training_manifest, save_json


DEFAULT_POSITIVE_LABEL = "rana_sapo"
NEGATIVE_LABEL = "otros_ruidos"
IMPORTANT_BINARY_LABELS = [NEGATIVE_LABEL, DEFAULT_POSITIVE_LABEL]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluacion experimental de modelo OpenSoundscape.")
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--manifest-csv", required=True, help="CSV de test o manifest incluido con split=test.")
    parser.add_argument("--calibration-manifest-csv", default=None, help="Manifest de validacion para calibrar threshold.")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--target-mode", default="multiclass", choices=["multiclass", "multilabel", "one-vs-rest", "binary_presence"])
    parser.add_argument("--positive-label", default=DEFAULT_POSITIVE_LABEL)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def normalize_audio_path(value: str) -> str:
    return str(value).strip().replace("\\", "/").lower()


def read_class_counts(path: Path) -> dict:
    if not path.exists():
        return {"exists": False, "counts": {}}
    df = pd.read_csv(path)
    if "normalized_label" not in df.columns:
        return {"exists": True, "rows": int(len(df)), "counts": {}}
    return {
        "exists": True,
        "rows": int(len(df)),
        "counts": df["normalized_label"].astype(str).value_counts().to_dict(),
    }


def read_one_hot_sums(path: Path) -> dict:
    if not path.exists():
        return {"exists": False, "column_sums": {}}
    df = pd.read_csv(path, index_col=0)
    numeric = df.select_dtypes(include="number")
    return {
        "exists": True,
        "rows": int(len(df)),
        "column_sums": {str(key): int(value) for key, value in numeric.sum(axis=0).to_dict().items()},
    }


def load_json(path: Path) -> dict:
    if not path.exists():
        return {"exists": False}
    try:
        return {"exists": True, "data": json.loads(path.read_text(encoding="utf-8"))}
    except Exception as exc:
        return {"exists": True, "error": str(exc)}


def is_balanced_counts(counts: dict[str, int]) -> bool:
    values = list(counts.values())
    return bool(values) and len(set(values)) == 1


def dataset_diagnostics(model_dir: Path) -> dict:
    split_counts = {split: read_class_counts(model_dir / f"{split}_manifest.csv") for split in ["train", "val", "test"]}
    one_hot_sums = {
        split: read_one_hot_sums(model_dir / f"opensoundscape_{split}_labels.csv")
        for split in ["train", "val", "test"]
    }
    label_map = load_json(model_dir / "label_map.json")
    labels = set((label_map.get("data") or {}).keys())
    presence = {}
    for label in IMPORTANT_BINARY_LABELS:
        presence[label] = {
            "in_label_map": label in labels,
            "in_train_manifest": split_counts["train"]["counts"].get(label, 0) > 0,
            "in_val_manifest": split_counts["val"]["counts"].get(label, 0) > 0,
            "in_test_manifest": split_counts["test"]["counts"].get(label, 0) > 0,
            "in_train_one_hot": one_hot_sums["train"]["column_sums"].get(label, 0) > 0,
            "in_val_one_hot": one_hot_sums["val"]["column_sums"].get(label, 0) > 0,
            "in_test_one_hot": one_hot_sums["test"]["column_sums"].get(label, 0) > 0,
        }
    return {
        "label_map": label_map,
        "manifest_class_counts": split_counts,
        "one_hot_column_sums": one_hot_sums,
        "important_label_presence": presence,
        "split_balance": {
            split: is_balanced_counts(split_counts[split].get("counts", {}))
            for split in ["train", "val", "test"]
        },
    }


def prepare_raw_scores(scores: pd.DataFrame) -> pd.DataFrame:
    raw = scores.copy()
    if "Unnamed: 0" in raw.columns:
        raw = raw.rename(columns={"Unnamed: 0": "audio_path"})
    elif raw.index.name or not isinstance(raw.index, pd.RangeIndex):
        raw = raw.reset_index()
        raw = raw.rename(columns={raw.columns[0]: "audio_path"})
    if "audio_path" not in raw.columns:
        raw.insert(0, "audio_path", raw.index.astype(str))
    raw["audio_path"] = raw["audio_path"].astype(str)
    return raw


def score_class_columns(raw_scores: pd.DataFrame, manifest_columns: set[str]) -> list[str]:
    reserved = {"audio_path", "true_label", "predicted_label", "confidence", "correct", "Unnamed: 0"}
    reserved.update(manifest_columns)
    return [
        column
        for column in raw_scores.columns
        if column not in reserved and pd.api.types.is_numeric_dtype(raw_scores[column])
    ]


def softmax(logits: pd.DataFrame) -> pd.DataFrame:
    values = logits.to_numpy(dtype=float)
    shifted = values - np.max(values, axis=1, keepdims=True)
    exp_values = np.exp(shifted)
    probs = exp_values / np.sum(exp_values, axis=1, keepdims=True)
    return pd.DataFrame(probs, index=logits.index, columns=logits.columns)


def sigmoid(logits: pd.Series) -> pd.Series:
    values = logits.to_numpy(dtype=float)
    clipped = np.clip(values, -80, 80)
    return pd.Series(1 / (1 + np.exp(-clipped)), index=logits.index)


def enrich_scores(
    scores: pd.DataFrame,
    test_df: pd.DataFrame,
    target_mode: str,
    positive_label: str,
    threshold: float,
) -> tuple[pd.DataFrame, list[str]]:
    raw = prepare_raw_scores(scores)
    manifest = test_df.copy().reset_index(drop=True)
    manifest["audio_path"] = manifest["audio_path"].astype(str)
    manifest["audio_key"] = manifest["audio_path"].map(normalize_audio_path)
    raw["audio_key"] = raw["audio_path"].map(normalize_audio_path)

    class_cols = score_class_columns(raw, set(manifest.columns))
    joined = raw.merge(
        manifest[["audio_key", "normalized_label"]],
        on="audio_key",
        how="left",
        validate="one_to_one",
    )
    if joined["normalized_label"].isna().any() and len(joined) == len(manifest):
        joined["normalized_label"] = joined["normalized_label"].fillna(manifest["normalized_label"])

    logits = joined[class_cols].astype(float)

    if target_mode == "binary_presence":
        if len(class_cols) != 1:
            raise ValueError(f"binary_presence espera una sola columna de score, recibio {class_cols}")
        model_col = class_cols[0]
        positive_scores = sigmoid(logits[model_col])
        pred_binary = positive_scores.ge(threshold)
        pred_labels = pred_binary.map(lambda value: positive_label if value else f"no_{positive_label}")
        confidence = pred_binary.map(lambda value: 0.0).astype(float)
        confidence[pred_binary] = positive_scores[pred_binary]
        confidence[~pred_binary] = 1 - positive_scores[~pred_binary]
        probabilities = pd.DataFrame({positive_label: positive_scores})
    else:
        probabilities = softmax(logits)
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
    if target_mode == "binary_presence":
        enriched["true_binary"] = enriched["true_label"] == positive_label
        enriched["predicted_binary"] = enriched["predicted_label"] == positive_label
    enriched["correct"] = enriched["true_label"] == enriched["predicted_label"]
    if target_mode == "binary_presence":
        enriched["correct"] = enriched["true_binary"] == enriched["predicted_binary"]
    for label in class_cols:
        output_label = positive_label if target_mode == "binary_presence" else label
        enriched[f"logit_{output_label}"] = logits[label].astype(float)
    for label in probabilities.columns:
        enriched[f"score_{label}"] = probabilities[label].astype(float)
    output_cols = [positive_label] if target_mode == "binary_presence" else class_cols
    return enriched, output_cols


def mean_columns_by_label(df: pd.DataFrame, columns: list[str], label_column: str) -> dict:
    if not columns:
        return {}
    grouped = df.groupby(label_column)[columns].mean(numeric_only=True)
    return {
        str(group): {str(column): float(value) for column, value in means.items()}
        for group, means in grouped.iterrows()
    }


def top_confusions(true_labels: list[str], pred_labels: list[str], limit: int = 20) -> list[dict]:
    rows = pd.DataFrame({"true_label": true_labels, "predicted_label": pred_labels})
    rows = rows[rows["true_label"] != rows["predicted_label"]]
    if rows.empty:
        return []
    counts = rows.value_counts(["true_label", "predicted_label"]).reset_index(name="count")
    return counts.head(limit).to_dict(orient="records")


def threshold_report(enriched: pd.DataFrame, class_cols: list[str], output_dir: Path, positive_label: str) -> dict | None:
    if positive_label not in class_cols:
        return None
    score_col = f"score_{positive_label}"
    y_true = enriched["true_label"].eq(positive_label)
    rows = []
    for threshold in np.round(np.arange(0.05, 1.0, 0.05), 2):
        y_pred = enriched[score_col].ge(float(threshold))
        tp = int((y_true & y_pred).sum())
        fp = int((~y_true & y_pred).sum())
        tn = int((~y_true & ~y_pred).sum())
        fn = int((y_true & ~y_pred).sum())
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        rows.append(
            {
                "positive_label": positive_label,
                "threshold": float(threshold),
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "tp": tp,
                "fp": fp,
                "tn": tn,
                "fn": fn,
                "predicted_positive": int(y_pred.sum()),
            }
        )
    report = pd.DataFrame(rows)
    report.to_csv(output_dir / "threshold_report.csv", index=False)
    best = report.sort_values(["f1", "recall", "precision"], ascending=False).iloc[0].to_dict()
    return {key: float(value) if isinstance(value, (np.floating, float)) else int(value) if isinstance(value, (np.integer, int)) else value for key, value in best.items()}


def binary_metrics_at_threshold(enriched: pd.DataFrame, positive_label: str, threshold: float) -> dict:
    score_col = f"score_{positive_label}"
    y_true = enriched["true_label"].eq(positive_label)
    y_pred = enriched[score_col].ge(float(threshold))
    tp = int((y_true & y_pred).sum())
    fp = int((~y_true & y_pred).sum())
    tn = int((~y_true & ~y_pred).sum())
    fn = int((y_true & ~y_pred).sum())
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    accuracy = (tp + tn) / (tp + fp + tn + fn) if (tp + fp + tn + fn) else 0.0
    specificity = tn / (tn + fp) if (tn + fp) else 0.0
    balanced_accuracy = (recall + specificity) / 2
    return {
        "positive_label": positive_label,
        "threshold": float(threshold),
        "accuracy": accuracy,
        "balanced_accuracy": balanced_accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "specificity": specificity,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "predicted_positive": int(y_pred.sum()),
        "predicted_negative": int((~y_pred).sum()),
    }


def threshold_report_dataframe(enriched: pd.DataFrame, positive_label: str) -> pd.DataFrame:
    rows = [
        binary_metrics_at_threshold(enriched, positive_label, float(threshold))
        for threshold in np.round(np.arange(0.05, 1.0, 0.05), 2)
    ]
    return pd.DataFrame(rows)


def best_threshold_from_report(report: pd.DataFrame) -> dict:
    best = report.sort_values(["f1", "recall", "precision"], ascending=False).iloc[0].to_dict()
    return {
        key: float(value) if isinstance(value, (np.floating, float)) else int(value) if isinstance(value, (np.integer, int)) else value
        for key, value in best.items()
    }


def load_eval_manifest(path: str | Path, limit: int | None = None, preferred_splits: set[str] | None = None) -> pd.DataFrame:
    df = read_training_manifest(path, limit=limit)
    if "split" in df.columns:
        splits = preferred_splits or {"test", "unassigned"}
        selected = df[df["split"].isin(splits)].copy()
        return selected if not selected.empty else df.copy()
    return df.copy()


def predict_enriched(model, manifest_df: pd.DataFrame, target_mode: str, positive_label: str, threshold: float) -> tuple[pd.DataFrame, list[str]]:
    raw_scores = predict_short_clips(model, manifest_df["audio_path"].tolist())
    return enrich_scores(raw_scores, manifest_df, target_mode, positive_label, threshold)


def main() -> None:
    args = parse_args()
    output_dir = ensure_dir(args.output_dir)
    test_df = load_eval_manifest(args.manifest_csv, limit=args.limit, preferred_splits={"test", "unassigned"})

    test_df.to_csv(output_dir / "test_manifest.csv", index=False)
    model_dir = Path(args.model_path).parent
    diagnostics = dataset_diagnostics(model_dir)

    if args.dry_run:
        save_json(output_dir / "metrics.json", {"status": "dry_run_ok", "rows": int(len(test_df))})
        save_json(output_dir / "diagnostics.json", diagnostics)
        print(f"Dry-run OK. {len(test_df)} audios de evaluacion.")
        return

    _, load_model = import_opensoundscape_cnn()
    model = load_model(args.model_path)

    calibrated_threshold = args.threshold
    calibration_summary = None
    if args.calibration_manifest_csv and args.target_mode == "binary_presence":
        calibration_df = load_eval_manifest(args.calibration_manifest_csv, limit=args.limit, preferred_splits={"val", "validation"})
        calibration_enriched, calibration_class_cols = predict_enriched(
            model,
            calibration_df,
            args.target_mode,
            args.positive_label,
            args.threshold,
        )
        calibration_enriched.to_csv(output_dir / "validation_scores.csv", index=False)
        if args.positive_label in calibration_class_cols:
            validation_report = threshold_report_dataframe(calibration_enriched, args.positive_label)
            validation_report.to_csv(output_dir / "validation_threshold_report.csv", index=False)
            calibration_summary = best_threshold_from_report(validation_report)
            calibrated_threshold = float(calibration_summary["threshold"])
        else:
            calibration_summary = {"error": f"No existe score_{args.positive_label} en validacion."}

    enriched, class_cols = predict_enriched(model, test_df, args.target_mode, args.positive_label, calibrated_threshold)
    enriched.to_csv(output_dir / "test_scores.csv", index=False)

    if args.target_mode == "binary_presence":
        true_labels = enriched["true_binary"].map(lambda value: args.positive_label if value else f"no_{args.positive_label}").tolist()
        pred_labels = enriched["predicted_binary"].map(lambda value: args.positive_label if value else f"no_{args.positive_label}").tolist()
        labels = [f"no_{args.positive_label}", args.positive_label]
    else:
        true_labels = enriched["true_label"].astype(str).tolist()
        pred_labels = enriched["predicted_label"].astype(str).tolist()
        labels = sorted(set(true_labels) | set(pred_labels) | set(class_cols))
    report = classification_report(true_labels, pred_labels, labels=labels, output_dict=True, zero_division=0)
    prediction_counts = enriched["predicted_label"].value_counts().to_dict()
    true_counts = enriched["true_label"].value_counts().to_dict()
    logit_cols = [f"logit_{label}" for label in class_cols]
    score_cols = [f"score_{label}" for label in class_cols]
    collapsed_prediction = len(set(pred_labels)) == 1 and len(labels) > 1
    warnings = []
    if collapsed_prediction:
        warnings.append(
            {
                "code": "single_class_prediction_collapse",
                "message": f"El modelo predijo una sola clase: {pred_labels[0] if pred_labels else 'sin_predicciones'}.",
            }
        )
    all_splits_balanced = all(diagnostics["split_balance"].values())
    if all_splits_balanced and collapsed_prediction:
        warnings.append(
            {
                "code": "balanced_data_but_prediction_collapse",
                "message": "Train/val/test estan balanceados, pero la prediccion colapso a una sola clase.",
            }
        )

    best_threshold = threshold_report(enriched, class_cols, output_dir, args.positive_label)
    test_threshold_applied_metrics = None
    if args.target_mode == "binary_presence" and args.positive_label in class_cols:
        test_threshold_applied_metrics = binary_metrics_at_threshold(enriched, args.positive_label, calibrated_threshold)
        save_json(output_dir / "test_threshold_applied_metrics.json", test_threshold_applied_metrics)
    positive_metrics = report.get(args.positive_label) if args.positive_label in labels else None
    negative_key = f"no_{args.positive_label}" if args.target_mode == "binary_presence" else NEGATIVE_LABEL
    metrics = {
        "status": "evaluated",
        "rows": len(enriched),
        "labels": labels,
        "target_mode": args.target_mode,
        "positive_label": args.positive_label if args.target_mode == "binary_presence" else None,
        "threshold": calibrated_threshold if args.target_mode == "binary_presence" else None,
        "calibration_manifest_csv": args.calibration_manifest_csv,
        "validation_best_threshold_by_f1": calibration_summary,
        "test_threshold_applied_metrics": test_threshold_applied_metrics,
        "true_counts": true_counts,
        "prediction_counts": prediction_counts,
        "accuracy": accuracy_score(true_labels, pred_labels) if true_labels else None,
        "balanced_accuracy": balanced_accuracy_score(true_labels, pred_labels) if true_labels else None,
        "collapsed_prediction_warning": collapsed_prediction,
        "single_class_prediction_collapse": collapsed_prediction,
        "warnings": warnings,
        "mean_scores_by_true_label": mean_columns_by_label(enriched, score_cols, "true_label"),
        "mean_logits_by_true_label": mean_columns_by_label(enriched, logit_cols, "true_label"),
        "mean_scores_by_predicted_label": mean_columns_by_label(enriched, score_cols, "predicted_label"),
        "top_confusions": top_confusions(true_labels, pred_labels),
        "per_class_recall": {str(label): float(report.get(label, {}).get("recall", 0.0)) for label in labels},
        "positive_label_metrics": positive_metrics,
        "negative_label_metrics": report.get(negative_key) if negative_key in labels else None,
        "best_threshold_by_f1": best_threshold,
        "classification_report": report,
        "confusion_matrix": confusion_matrix(true_labels, pred_labels, labels=labels).tolist(),
    }
    diagnostics.update(
        {
            "target_mode": args.target_mode,
            "positive_label": args.positive_label if args.target_mode == "binary_presence" else None,
            "threshold": calibrated_threshold if args.target_mode == "binary_presence" else None,
            "calibration_manifest_csv": args.calibration_manifest_csv,
            "validation_best_threshold_by_f1": calibration_summary,
            "test_threshold_applied_metrics": test_threshold_applied_metrics,
            "prediction_counts": prediction_counts,
            "true_counts": true_counts,
            "mean_scores_by_true_label": metrics["mean_scores_by_true_label"],
            "mean_logits_by_true_label": metrics["mean_logits_by_true_label"],
            "top_confusions": metrics["top_confusions"],
            "possible_class_collapse": collapsed_prediction,
            "balanced_data_but_prediction_collapse": all_splits_balanced and collapsed_prediction,
            "warnings": warnings,
            "best_threshold_by_f1": best_threshold,
        }
    )
    save_json(output_dir / "metrics.json", metrics)
    save_json(output_dir / "diagnostics.json", diagnostics)
    print(f"Evaluacion guardada en {output_dir}")


if __name__ == "__main__":
    main()
