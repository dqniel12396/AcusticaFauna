from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.audio_calibration_service import (
    CalibrationError,
    available_calibration_config_names,
    get_default_calibration_configs,
    test_audio_processing_configs,
)


def load_configs(path: str | None) -> list[dict] | None:
    if not path:
        return None
    config_path = Path(path)
    data_text = config_path.read_text(encoding="utf-8")
    if config_path.suffix.lower() in {".yaml", ".yml"}:
        try:
            import yaml
        except ImportError as exc:
            raise SystemExit("Para usar --configs-yaml instala PyYAML o usa --configs-json.") from exc
        data = yaml.safe_load(data_text)
    else:
        data = json.loads(data_text)
    if isinstance(data, dict):
        data = data.get("configs") or data.get("items") or []
    if not isinstance(data, list):
        raise SystemExit("El archivo de configuraciones debe contener una lista o un objeto con clave 'configs'.")
    return data


def print_config_summary(result: dict) -> None:
    rows = result.get("configs") or []
    if not rows:
        return
    print("config,candidates,duration,ratio,possible_damage,clipping,recommendation")
    for row in rows:
        metrics = row.get("detection_metrics") or {}
        candidates = row.get("total_candidates", 0)
        duration = row.get("total_duration_candidates", 0)
        ratio = metrics.get("duration_ratio_of_sample")
        print(
            ",".join(
                [
                    str(row.get("config") or ""),
                    str(candidates),
                    f"{float(duration or 0):.3f}",
                    "" if ratio is None else f"{float(ratio):.6f}",
                    str(row.get("possible_damage_count") or 0),
                    str(row.get("clipping_count") or 0),
                    str(row.get("recommendation") or ""),
                ]
            )
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prueba configuraciones de deteccion/limpieza en una muestra pequena.",
        epilog=(
            "Formato --configs-json/--configs-yaml: una lista de objetos o un objeto con clave 'configs'. "
            "Cada config custom debe incluir al menos name, frequency_min_hz, frequency_max_hz, "
            "threshold_dbfs y min_band_energy_ratio. Los nombres custom son validos cuando se pasan por archivo."
        ),
    )
    parser.add_argument("--folder", help="Carpeta local con audios.")
    parser.add_argument("--label", help="Especie objetivo.")
    parser.add_argument("--sample-size", type=int, default=10, help="Cantidad de audios a muestrear.")
    parser.add_argument("--configs", default="conservadora,balanceada,sensible", help="Configuraciones separadas por coma.")
    parser.add_argument("--configs-json", help="Archivo JSON versionable con configuraciones personalizadas.")
    parser.add_argument("--configs-yaml", help="Archivo YAML con configuraciones personalizadas.")
    parser.add_argument("--list-configs", action="store_true", help="Lista las configuraciones disponibles y termina.")
    parser.add_argument("--detection-only", action="store_true", help="Detecta/corta candidatos sin limpieza destructiva ni normalizacion.")
    parser.add_argument("--output-dir", help="Directorio de reportes y previews.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.list_configs:
        for name, config in get_default_calibration_configs().items():
            print(
                f"{name}: {config['label']} "
                f"({config['frequency_min_hz']:.0f}-{config['frequency_max_hz']:.0f} Hz, "
                f"threshold {config['threshold_dbfs']:.0f} dBFS, ratio {config['min_band_energy_ratio']:.2f}, "
                f"detection_only={str(config['detection_only']).lower()})"
            )
        return 0
    missing = [name for name in ["folder", "label", "output_dir"] if not getattr(args, name)]
    if missing:
        print(f"Faltan argumentos requeridos: {', '.join('--' + item.replace('_', '-') for item in missing)}", file=sys.stderr)
        return 2
    config_definitions = load_configs(args.configs_json or args.configs_yaml)
    configs = [] if config_definitions else [item.strip() for item in args.configs.split(",") if item.strip()]
    try:
        result = test_audio_processing_configs(
            args.folder,
            args.label,
            sample_size=args.sample_size,
            configs=configs,
            config_definitions=config_definitions,
            output_dir=args.output_dir,
            allow_unrestricted=True,
            detection_only=True if args.detection_only else None,
        )
    except CalibrationError as exc:
        message = str(exc)
        print(message.split(". Configuraciones disponibles:")[0], file=sys.stderr)
        if "desconocida" in message.lower():
            print(f"Configuraciones disponibles: {', '.join(available_calibration_config_names())}", file=sys.stderr)
        return 2
    print_config_summary(result)
    print(json.dumps({"output_dir": str(Path(args.output_dir)), "recommended_config": result["recommended_config"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
