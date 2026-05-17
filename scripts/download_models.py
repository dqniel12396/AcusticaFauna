from __future__ import annotations

import argparse
import shutil
import urllib.request
from pathlib import Path

from paths import REPO_ROOT


MODEL_PACKS = {
    "default": [
        {
            "model_id": "frog_detector_v1_binary_v3_hardneg",
            "url": "PENDIENTE_URL_RELEASE",
            "target_dir": "acusticafauna-ML/models/frog_detector_v1_binary_v3_hardneg",
        },
        {
            "model_id": "boana_boans_pugnax_v3_quality045",
            "url": "PENDIENTE_URL_RELEASE",
            "target_dir": "acusticafauna-ML/models/boana_boans_pugnax_v3_quality045",
        },
    ],
    "none": [],
}


def list_packs() -> None:
    for pack, items in MODEL_PACKS.items():
        print(f"{pack}: {len(items)} modelo(s)")
        for item in items:
            print(f"  - {item['model_id']} -> {item['target_dir']}")


def download_pack(pack: str) -> None:
    items = MODEL_PACKS.get(pack)
    if items is None:
        raise SystemExit(f"Pack desconocido: {pack}")
    if not items:
        print("Pack vacio. No se descarga nada.")
        return
    for item in items:
        url = item["url"]
        target_dir = REPO_ROOT / item["target_dir"]
        target_dir.mkdir(parents=True, exist_ok=True)
        if url.startswith("PENDIENTE"):
            print(f"WARNING: {item['model_id']} no tiene URL configurada todavia.")
            continue
        filename = target_dir / Path(url).name
        print(f"Descargando {item['model_id']}...")
        with urllib.request.urlopen(url) as response, filename.open("wb") as output:
            shutil.copyfileobj(response, output)
        print(f"OK: {filename}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Descarga paquetes de modelos AcusticaFauna.")
    parser.add_argument("--pack", default="default", choices=sorted(MODEL_PACKS))
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()
    if args.list:
        list_packs()
        return
    download_pack(args.pack)


if __name__ == "__main__":
    main()
