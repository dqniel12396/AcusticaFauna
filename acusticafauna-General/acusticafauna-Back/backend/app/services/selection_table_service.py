import csv
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.utils.parsing import safe_float


def parse_selection_table(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            rows.append(row)

    return rows


def group_predictions_by_window(rows: list[dict[str, Any]]) -> dict[tuple[str, float, float], list[dict[str, Any]]]:
    grouped: dict[tuple[str, float, float], list[dict[str, Any]]] = defaultdict(list)

    for row in rows:
        begin_path = row.get("Begin Path", "") or row.get("BeginPath", "")
        begin_time = safe_float(row.get("Begin Time (s)") or row.get("Begin Time") or row.get("Begin"), 0.0)
        end_time = safe_float(row.get("End Time (s)") or row.get("End Time") or row.get("End"), 0.0)

        key = (begin_path, begin_time, end_time)
        grouped[key].append(row)

    return grouped