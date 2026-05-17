from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from ml_utils import (
    basic_manifest_summary,
    build_label_map,
    choose_device,
    ensure_dir,
    import_opensoundscape_cnn,
    read_training_manifest,
    save_json,
    save_used_manifests,
    split_manifest,
    to_binary_presence_df,
    to_one_hot_df,
)


PANDAS_COMPAT_ERROR = (
    "OpenSoundscape 0.12.x requiere pandas <3 para este pipeline. "
    "Ejecuta: python -m pip install 'pandas>=2.2,<3'"
)


def check_pandas_compatibility() -> None:
    major = int(pd.__version__.split(".", 1)[0])
    if major >= 3:
        raise SystemExit(PANDAS_COMPAT_ERROR)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Entrenamiento experimental OpenSoundscape para AcusticaFauna.")
    parser.add_argument("--manifest-csv", required=True, help="CSV solo incluidos exportado desde datasets versionados.")
    parser.add_argument("--output-dir", required=True, help="Directorio donde guardar modelo, métricas y manifests usados.")
    parser.add_argument("--model-name", required=True, help="Nombre lógico del modelo.")
    parser.add_argument(
        "--target-mode",
        default="multiclass",
        choices=["multiclass", "multilabel", "one-vs-rest", "binary_presence"],
    )
    parser.add_argument("--positive-label", default="rana_sapo", help="Etiqueta positiva para target-mode binary_presence.")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--sample-rate", type=int, default=32000)
    parser.add_argument("--clip-duration", type=float, default=5.0)
    parser.add_argument("--device", default="auto", help="auto, cpu, cuda, cuda:0, etc.")
    parser.add_argument("--limit", type=int, default=None, help="Limita filas para smoke test o depuración.")
    parser.add_argument("--limit-per-class", type=int, default=None, help="Toma hasta N ejemplos por clase dentro de cada split.")
    parser.add_argument("--sample-strategy", default="head", choices=["head", "random", "stratified"])
    parser.add_argument("--random-seed", type=int, default=42)
    parser.add_argument("--dry-run", action="store_true", help="Valida manifests y escribe salidas sin entrenar.")
    return parser.parse_args()


def main() -> None:
    check_pandas_compatibility()
    args = parse_args()
    output_dir = ensure_dir(args.output_dir)

    df = read_training_manifest(
        args.manifest_csv,
        limit=args.limit,
        limit_per_class=args.limit_per_class,
        sample_strategy=args.sample_strategy,
        random_seed=args.random_seed,
    )
    splits = split_manifest(df)
    source_classes = sorted(df["normalized_label"].unique().tolist())
    negative_labels = [label for label in source_classes if label != args.positive_label]
    classes = [args.positive_label] if args.target_mode == "binary_presence" else source_classes
    label_map = (
        {
            "mode": "binary_presence",
            "positive_label": args.positive_label,
            "negative_labels": negative_labels,
        }
        if args.target_mode == "binary_presence"
        else build_label_map(classes)
    )

    save_used_manifests(output_dir, splits)
    save_json(output_dir / "label_map.json", label_map)
    hard_negatives_count = int(df.get("hard_negative", pd.Series(dtype=object)).astype(str).str.lower().isin(["true", "1", "yes"]).sum()) if "hard_negative" in df.columns else 0
    hard_negative_sources = sorted(df["hard_negative_source"].dropna().astype(str).unique().tolist()) if "hard_negative_source" in df.columns else []
    hard_negative_weight = None
    if "hard_negative_copy_index" in df.columns and hard_negatives_count:
        hard_negative_weight = int(pd.to_numeric(df["hard_negative_copy_index"], errors="coerce").fillna(0).max()) + 1
    summary = {
        "model_name": args.model_name,
        "target_mode": args.target_mode,
        "dry_run": bool(args.dry_run),
        "sample_rate": args.sample_rate,
        "clip_duration": args.clip_duration,
        "batch_size": args.batch_size,
        "epochs": args.epochs,
        "positive_label": args.positive_label if args.target_mode == "binary_presence" else None,
        "negative_labels": negative_labels if args.target_mode == "binary_presence" else None,
        "sample_strategy": args.sample_strategy,
        "limit": args.limit,
        "limit_per_class": args.limit_per_class,
        "random_seed": args.random_seed,
        "classes_used": classes,
        "source_classes": source_classes,
        "class_counts": df["normalized_label"].value_counts().to_dict(),
        "split_counts": df["split"].value_counts().to_dict(),
        "hard_negatives_count": hard_negatives_count,
        "hard_negative_weight": hard_negative_weight,
        "hard_negative_source": hard_negative_sources,
        "sample_weight_note": "OpenSoundscape 0.12.x no usa sample_weight en este pipeline; hard negatives se ponderan por oversampling en train.",
        "manifest_summary": basic_manifest_summary(df),
    }

    if not len(df):
        save_json(output_dir / "metrics.json", {**summary, "status": "failed", "error": "Manifest sin audios válidos."})
        raise SystemExit("Manifest sin audios válidos.")

    if args.target_mode == "one-vs-rest":
        summary["note"] = (
            "OpenSoundscape trabaja naturalmente con dataframes one-hot. "
            "Este script prepara multiclass/multilabel; one-vs-rest queda documentado para una fase posterior."
        )

    if args.target_mode == "binary_presence":
        if args.positive_label not in source_classes:
            save_json(
                output_dir / "metrics.json",
                {**summary, "status": "failed", "error": f"No hay positivos para {args.positive_label}."},
            )
            raise SystemExit(f"No hay positivos para {args.positive_label}.")
        if not negative_labels:
            save_json(
                output_dir / "metrics.json",
                {**summary, "status": "failed", "error": "Se requiere al menos una etiqueta negativa."},
            )
            raise SystemExit("Se requiere al menos una etiqueta negativa.")
        train_df = to_binary_presence_df(splits["train"], args.positive_label)
        val_df = to_binary_presence_df(splits["val"], args.positive_label)
        test_df = to_binary_presence_df(splits["test"], args.positive_label)
    else:
        train_df = to_one_hot_df(splits["train"], classes)
        val_df = to_one_hot_df(splits["val"], classes)
        test_df = to_one_hot_df(splits["test"], classes)
    train_df.to_csv(output_dir / "opensoundscape_train_labels.csv")
    val_df.to_csv(output_dir / "opensoundscape_val_labels.csv")
    test_df.to_csv(output_dir / "opensoundscape_test_labels.csv")

    if args.dry_run:
        save_json(output_dir / "metrics.json", {**summary, "status": "dry_run_ok"})
        print(f"Dry-run OK. {len(df)} audios válidos, {len(classes)} clases. Salida: {output_dir}")
        return

    if train_df.empty or val_df.empty:
        save_json(
            output_dir / "metrics.json",
            {**summary, "status": "failed", "error": "Se requieren splits train y val no vacíos para entrenar."},
        )
        raise SystemExit("Se requieren splits train y val no vacíos para entrenar.")

    CNN, _ = import_opensoundscape_cnn()
    single_target = args.target_mode == "multiclass"
    model = CNN("resnet18", classes, args.clip_duration, single_target=single_target)

    if args.sample_rate and hasattr(model, "preprocessor"):
        try:
            model.preprocessor.pipeline.load_audio.set(sample_rate=args.sample_rate)
        except Exception:
            summary["sample_rate_note"] = "No se pudo ajustar sample_rate vía pipeline.load_audio; revisar API OpenSoundscape instalada."

    device = choose_device(args.device)
    train_kwargs = {
        "train_df": train_df,
        "validation_df": val_df,
        "save_path": str(output_dir),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "save_interval": max(args.epochs, 1),
        "num_workers": 0,
    }
    if device:
        train_kwargs["device"] = device

    try:
        model.train(**train_kwargs)
    except TypeError:
        train_kwargs.pop("device", None)
        model.train(**train_kwargs)

    model_path = output_dir / f"{args.model_name}.model"
    model.save(str(model_path))
    save_json(output_dir / "metrics.json", {**summary, "status": "trained", "model_path": str(model_path)})
    print(f"Entrenamiento finalizado. Modelo guardado en {model_path}")


if __name__ == "__main__":
    main()
