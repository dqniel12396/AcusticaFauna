from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def parse_bool(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "si", "y"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Construye manifest de reentrenamiento con hard negatives.")
    parser.add_argument("--base-manifest-csv", required=True)
    parser.add_argument("--hard-negatives-csv", required=True)
    parser.add_argument("--output-csv", required=True)
    parser.add_argument("--positive-label", default="rana_sapo")
    parser.add_argument("--negative-label", default="otros_ruidos")
    parser.add_argument("--hard-negative-weight", type=int, default=2)
    parser.add_argument("--exclude-from-test", default="true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base = pd.read_csv(args.base_manifest_csv)
    original_base_count = int(len(base))
    hard = pd.read_csv(args.hard_negatives_csv)
    exclude_from_test = parse_bool(args.exclude_from_test)
    output_path = Path(args.output_csv)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    base["audio_path"] = base["audio_path"].astype(str)
    hard["audio_path"] = hard["audio_path"].astype(str)
    hard = hard.drop_duplicates("audio_path").copy()
    hard_paths = set(hard["audio_path"])
    base_paths = set(base["audio_path"])
    base_hard_mask = base["audio_path"].isin(hard_paths)
    base_rows_replaced = int(base_hard_mask.sum()) if exclude_from_test else 0
    if exclude_from_test:
        base = base[~base_hard_mask].copy()
        hard_to_add = hard.copy()
        duplicates_avoided = 0
    else:
        hard_to_add = hard[~hard["audio_path"].isin(base_paths)].copy()
        duplicates_avoided = int(len(hard) - len(hard_to_add))

    if hard_to_add.empty:
        combined = base.copy()
    else:
        template_columns = list(base.columns)
        rows = []
        weight = max(1, int(args.hard_negative_weight))
        for _, row in hard_to_add.iterrows():
            for copy_index in range(weight):
                item = {column: "" for column in template_columns}
                item.update(
                    {
                        "audio_path": row["audio_path"],
                        "source_path": row.get("source_path", ""),
                        "original_label": row.get("original_label", args.negative_label),
                        "normalized_label": args.negative_label,
                        "taxonomy_label": args.negative_label,
                        "group_name": "ruido",
                        "label_type": "noise",
                        "item_role": "background",
                        "confidence_source": "hard_negative",
                        "split": "train" if exclude_from_test else row.get("split", "train"),
                        "duration_seconds": row.get("duration_seconds", ""),
                        "sha256": row.get("sha256", ""),
                        "include_reason": "hard_negative_confirmado",
                        "exclude_reason": "",
                    }
                )
                item["hard_negative"] = True
                item["hard_negative_source"] = row.get("hard_negative_source", "")
                item["hard_negative_copy_index"] = copy_index
                item["sample_weight"] = 1.0
                rows.append(item)
        hard_manifest = pd.DataFrame(rows)
        for column in hard_manifest.columns:
            if column not in base.columns:
                base[column] = ""
        for column in base.columns:
            if column not in hard_manifest.columns:
                hard_manifest[column] = ""
        combined = pd.concat([base, hard_manifest[base.columns]], ignore_index=True)

    combined.to_csv(output_path, index=False)
    summary = {
        "total_base": original_base_count,
        "total_base_after_excluding_previous_test_hard_negatives": int(len(base)),
        "total_hard_negatives_unique_added": int(len(hard_to_add)),
        "hard_negative_weight": int(args.hard_negative_weight),
        "total_output": int(len(combined)),
        "total_train_val_test": combined["split"].value_counts().to_dict() if "split" in combined.columns else {},
        "count_by_label": combined["normalized_label"].value_counts().to_dict() if "normalized_label" in combined.columns else {},
        "duplicate_paths_avoided": duplicates_avoided,
        "base_rows_replaced_as_hard_negatives": base_rows_replaced,
        "exclude_from_test": exclude_from_test,
        "note": "sample_weight se conserva como metadato; este pipeline OpenSoundscape usa oversampling por duplicacion en train.",
    }
    summary_path = output_path.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Manifest hard-negative creado: {len(combined)} filas -> {output_path}")
    print(f"Resumen -> {summary_path}")


if __name__ == "__main__":
    main()
