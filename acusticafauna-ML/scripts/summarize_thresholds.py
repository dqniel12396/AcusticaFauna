from __future__ import annotations

import argparse

import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Resume threshold_report.csv para elegir umbrales.")
    parser.add_argument("--threshold-report-csv", required=True)
    return parser.parse_args()


def print_row(title: str, row: pd.Series | None) -> None:
    if row is None:
        print(f"{title}: no disponible")
        return
    fields = ["threshold", "precision", "recall", "f1", "fp", "fn", "specificity"]
    values = ", ".join(f"{field}={row.get(field)}" for field in fields if field in row)
    print(f"{title}: {values}")


def main() -> None:
    args = parse_args()
    df = pd.read_csv(args.threshold_report_csv)
    if df.empty:
        raise SystemExit("threshold_report.csv esta vacio.")
    best_f1 = df.sort_values(["f1", "recall", "precision"], ascending=False).iloc[0]
    recall_candidates = df[df["recall"] >= 0.90].sort_values(["fp", "f1"], ascending=[True, False])
    precision_candidates = df[df["precision"] >= 0.75].sort_values(["f1", "recall"], ascending=False)

    print("Resumen de thresholds")
    print_row("Mejor F1", best_f1)
    print_row("Recall >= 0.90 con menor FP", recall_candidates.iloc[0] if not recall_candidates.empty else None)
    print_row("Precision >= 0.75", precision_candidates.iloc[0] if not precision_candidates.empty else None)


if __name__ == "__main__":
    main()
