from __future__ import annotations

import argparse
from pathlib import Path

from app.db.init_db import init_db
from app.services.curated_dataset_service import import_curated_manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Importa dataset_curado/manifests/manifest_segmentos.csv a SQLite."
    )
    parser.add_argument(
        "--dataset-root",
        required=True,
        help="Carpeta raiz de dataset_curado.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    init_db()
    result = import_curated_manifest(Path(args.dataset_root))

    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
