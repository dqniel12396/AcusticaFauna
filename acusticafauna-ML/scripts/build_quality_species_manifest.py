from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from ml_utils import save_json


DEFAULT_EXCLUDE_LABELS = {
    "otros_ruidos",
    "rana_sapo",
    "ave_general",
    "insecto",
    "revisar_etiqueta",
    "desconocido",
    "unknown",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Construye un manifest de especie/genero filtrado por score rana/sapo."
    )
    parser.add_argument("--input-csv", required=True)
    parser.add_argument("--output-csv", required=True)
    parser.add_argument("--min-frog-score", type=float, default=0.60)
    parser.add_argument("--min-duration", type=float, default=1.0)
    parser.add_argument("--max-per-class", type=int, default=None)
    parser.add_argument("--balance-strategy", choices=["min_class", "none"], default="none")
    parser.add_argument("--exclude-labels", default="")
    parser.add_argument("--random-seed", type=int, default=50)
    return parser.parse_args()


def clean_list(value: str) -> set[str]:
    if not value:
        return set()
    return {item.strip() for item in value.split(",") if item.strip()}


def label_counts(df: pd.DataFrame) -> dict[str, int]:
    if df.empty or "normalized_label" not in df.columns:
        return {}
    return {str(label): int(count) for label, count in df["normalized_label"].value_counts().to_dict().items()}


def is_species_or_genus_row(row: pd.Series) -> bool:
    label = str(row.get("normalized_label", "")).strip()
    if not label:
        return False
    item_role = str(row.get("item_role", "")).strip()
    if item_role in {"excluded", "background", "negative"}:
        return False
    label_type = str(row.get("label_type", "")).strip()
    group_name = str(row.get("group_name", "")).strip()
    if label_type:
        return label_type in {"species", "genus"} or (
            label_type == "group" and group_name == "anfibio" and "_" not in label
        )
    return label not in DEFAULT_EXCLUDE_LABELS


def apply_caps(df: pd.DataFrame, max_per_class: int | None, random_seed: int) -> pd.DataFrame:
    if max_per_class is None or max_per_class <= 0 or df.empty:
        return df
    return (
        df.groupby(["split", "normalized_label"], group_keys=False, sort=False)
        .apply(lambda group: group.sample(n=min(len(group), max_per_class), random_state=random_seed))
        .reset_index(drop=True)
    )


def balance_min_class(df: pd.DataFrame, random_seed: int) -> pd.DataFrame:
    if df.empty:
        return df
    parts: list[pd.DataFrame] = []
    for split, split_df in df.groupby("split", sort=False):
        counts = split_df["normalized_label"].value_counts()
        if counts.empty:
            continue
        target = int(counts.min())
        for _, group in split_df.groupby("normalized_label", sort=False):
            parts.append(group.sample(n=min(len(group), target), random_state=random_seed))
    if not parts:
        return df.head(0).copy()
    return pd.concat(parts, ignore_index=True)


def main() -> None:
    args = parse_args()
    input_path = Path(args.input_csv)
    output_path = Path(args.output_csv)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        raise FileNotFoundError(f"No existe input CSV: {input_path}")

    df = pd.read_csv(input_path)
    required = {"audio_path", "normalized_label", "split", "duration_seconds", "score_rana_sapo"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV sin columnas requeridas: {sorted(missing)}")

    work = df.copy()
    work["score_rana_sapo"] = pd.to_numeric(work["score_rana_sapo"], errors="coerce")
    work["duration_seconds"] = pd.to_numeric(work["duration_seconds"], errors="coerce")
    work["split"] = work["split"].fillna("unassigned").astype(str)
    if "scoring_error" not in work.columns:
        work["scoring_error"] = ""
    work["scoring_error"] = work["scoring_error"].fillna("").astype(str)

    exclude_labels = DEFAULT_EXCLUDE_LABELS | clean_list(args.exclude_labels)
    before_counts = label_counts(work)
    before_rows = int(len(work))

    error_mask = work["scoring_error"].str.len().gt(0) | work["score_rana_sapo"].isna()
    duration_mask = work["duration_seconds"].fillna(0).lt(args.min_duration)
    score_mask = work["score_rana_sapo"].lt(args.min_frog_score)
    excluded_label_mask = work["normalized_label"].astype(str).isin(exclude_labels)
    species_mask = work.apply(is_species_or_genus_row, axis=1)

    kept = work[
        ~error_mask
        & ~duration_mask
        & ~score_mask
        & ~excluded_label_mask
        & species_mask
    ].copy()

    kept = apply_caps(kept, args.max_per_class, args.random_seed)
    if args.balance_strategy == "min_class":
        kept = balance_min_class(kept, args.random_seed)

    kept.to_csv(output_path, index=False)
    summary = {
        "input_csv": str(input_path),
        "output_csv": str(output_path),
        "rows_before": before_rows,
        "rows_after": int(len(kept)),
        "min_frog_score": float(args.min_frog_score),
        "min_duration": float(args.min_duration),
        "max_per_class": args.max_per_class,
        "balance_strategy": args.balance_strategy,
        "count_by_class_before": before_counts,
        "count_by_class_after": label_counts(kept),
        "discarded_by_score_low": int((~error_mask & ~duration_mask & score_mask).sum()),
        "discarded_by_error": int(error_mask.sum()),
        "discarded_by_duration": int((~error_mask & duration_mask).sum()),
        "discarded_by_excluded_label": int((~error_mask & ~duration_mask & ~score_mask & excluded_label_mask).sum()),
        "discarded_by_not_species_or_genus": int((~error_mask & ~duration_mask & ~score_mask & ~excluded_label_mask & ~species_mask).sum()),
    }
    summary_path = output_path.with_suffix(".summary.json")
    save_json(summary_path, summary)
    print(f"Manifest de calidad: {output_path}")
    print(f"Resumen: {summary_path}")
    print(f"Filas antes: {summary['rows_before']} | despues: {summary['rows_after']}")


if __name__ == "__main__":
    main()
