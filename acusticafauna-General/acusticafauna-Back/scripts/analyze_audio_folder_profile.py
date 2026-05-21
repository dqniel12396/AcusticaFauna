from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.audio_calibration_service import analyze_audio_folder_profile


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analiza una muestra de una carpeta de audios para calibracion bioacustica.")
    parser.add_argument("--folder", required=True, help="Carpeta local con audios.")
    parser.add_argument("--label", required=True, help="Especie objetivo.")
    parser.add_argument("--sample-size", type=int, default=20, help="Cantidad de audios a muestrear.")
    parser.add_argument("--output", required=True, help="Ruta JSON de salida.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = analyze_audio_folder_profile(
        args.folder,
        args.label,
        sample_size=args.sample_size,
        output=args.output,
        allow_unrestricted=True,
    )
    print(json.dumps({"output": str(Path(args.output)), "files": result["sample_size_used"], "suggested_parameters": result["suggested_parameters"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

