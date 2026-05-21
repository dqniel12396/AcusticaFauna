import json
import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[2]
CLI_SCRIPT = BACKEND_ROOT / "scripts" / "test_audio_processing_configs.py"


def write_signal_wav(path: Path, signal: np.ndarray, sample_rate: int = 16000) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.clip(signal.astype("float32"), -1.0, 1.0)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes((data * 32767.0).astype("<i2").tobytes())
    return path


def synthetic_calibration_folder(tmp_path: Path) -> Path:
    sample_rate = 16000
    duration = 2.0
    t = np.arange(int(sample_rate * duration), dtype="float32") / sample_rate
    rng = np.random.default_rng(7)

    rain = rng.normal(0, 0.045, t.size).astype("float32")
    pulse = ((t > 0.45) & (t < 1.35)).astype("float32")
    useful = 0.22 * np.sin(2 * math.pi * 3500 * t) * pulse + rain

    broadband = rng.normal(0, 0.06, t.size).astype("float32")
    wind = 0.20 * np.sin(2 * math.pi * 120 * t).astype("float32") + rng.normal(0, 0.02, t.size).astype("float32")

    folder = tmp_path / "calibration"
    write_signal_wav(folder / "pristimantis_useful_3500.wav", useful, sample_rate)
    write_signal_wav(folder / "rain_broadband.wav", broadband, sample_rate)
    write_signal_wav(folder / "wind_low_frequency.wav", wind, sample_rate)
    return folder


def test_resolve_config_selection_recognizes_guided_configs():
    from app.services.audio_calibration_service import resolve_config_selection

    configs = resolve_config_selection([
        "exploratory_wide",
        "intermedia_exploratoria",
        "intermedia_cerrada",
        "intermedia_cerrada_mas_selectiva",
        "intermedia_cerrada_mas_selectiva_ratio025",
        "intermedia_cerrada_estricta",
    ])
    names = [item["name"] for item in configs]

    assert names == [
        "exploratory_wide",
        "intermedia_exploratoria",
        "intermedia_cerrada",
        "intermedia_cerrada_mas_selectiva",
        "intermedia_cerrada_mas_selectiva_ratio025",
        "intermedia_cerrada_estricta",
    ]
    assert all(item["detection_only"] is True for item in configs)
    assert configs[0]["frequency_min_hz"] == 1800
    assert configs[1]["frequency_max_hz"] == 5500
    assert configs[2]["frequency_max_hz"] == 3300
    assert configs[3]["frequency_min_hz"] == 2200
    assert configs[3]["min_band_energy_ratio"] == 0.23
    assert configs[4]["min_band_energy_ratio"] == 0.25
    assert configs[5]["frequency_min_hz"] == 2300
    assert configs[5]["frequency_max_hz"] == 3100
    assert configs[5]["min_band_energy_ratio"] == 0.30


def test_cli_list_configs_includes_guided_configs():
    completed = subprocess.run(
        [sys.executable, str(CLI_SCRIPT), "--list-configs"],
        cwd=BACKEND_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 0
    assert "exploratory_wide" in completed.stdout
    assert "intermedia_exploratoria" in completed.stdout
    assert "intermedia_cerrada" in completed.stdout
    assert "intermedia_cerrada_mas_selectiva" in completed.stdout
    assert "intermedia_cerrada_mas_selectiva_ratio025" in completed.stdout
    assert "intermedia_cerrada_estricta" in completed.stdout


def test_cli_unknown_config_prints_clear_available_list(tmp_path):
    folder = synthetic_calibration_folder(tmp_path)
    completed = subprocess.run(
        [
            sys.executable,
            str(CLI_SCRIPT),
            "--folder",
            str(folder),
            "--label",
            "Pristimantis_simoterus",
            "--sample-size",
            "1",
            "--configs",
            "no_existe",
            "--output-dir",
            str(tmp_path / "out"),
        ],
        cwd=BACKEND_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 2
    assert "Configuración desconocida: no_existe" in completed.stderr
    assert "Configuraciones disponibles:" in completed.stderr
    assert "exploratory_wide" in completed.stderr
    assert "intermedia_cerrada" in completed.stderr


def test_profiler_recommends_high_band_for_pristimantis(tmp_path):
    from app.services.audio_calibration_service import analyze_audio_folder_profile

    folder = synthetic_calibration_folder(tmp_path)
    result = analyze_audio_folder_profile(
        str(folder),
        "Pristimantis_simoterus",
        sample_size=3,
        allow_unrestricted=True,
    )

    params = result["suggested_parameters"]
    assert params["frequency_min_hz"] >= 2500
    assert params["frequency_max_hz"] >= 4500
    top_bands = [item["band_hz"] for item in params["top_contrast_bands"]]
    assert top_bands[0] not in {"0-300", "300-1000"}
    assert any(band in top_bands for band in {"3000-4500", "2000-3000", "4500-8000"})


def test_config_test_writes_reports_and_previews(tmp_path):
    from app.services.audio_calibration_service import test_audio_processing_configs

    folder = synthetic_calibration_folder(tmp_path)
    output_dir = tmp_path / "reports"
    result = test_audio_processing_configs(
        str(folder),
        "Pristimantis_simoterus",
        sample_size=3,
        configs=["conservadora", "balanceada"],
        output_dir=output_dir,
        allow_unrestricted=True,
    )

    assert result["recommended_config"] in {"conservadora", "balanceada"}
    assert (output_dir / "summary.json").exists()
    assert (output_dir / "summary.csv").exists()
    assert (output_dir / "report.md").exists()
    assert result["previews"]
    assert (folder / "pristimantis_useful_3500.wav").exists()


def test_config_test_accepts_custom_definitions(tmp_path):
    from app.services.audio_calibration_service import test_audio_processing_configs

    folder = synthetic_calibration_folder(tmp_path)
    result = test_audio_processing_configs(
        str(folder),
        "Pristimantis_simoterus",
        sample_size=3,
        configs=[],
        config_definitions=[
            {
                "name": "intermedia_sin_norm",
                "frequency_min_hz": 2500,
                "frequency_max_hz": 5000,
                "threshold_dbfs": -51,
                "min_band_energy_ratio": 0.25,
                "bandpass": True,
                "noise_reduce": True,
                "noise_reduce_strength": "soft",
                "normalize": False,
            }
        ],
        output_dir=tmp_path / "custom_reports",
        allow_unrestricted=True,
        detection_only=True,
    )

    assert result["configs"][0]["config"] == "intermedia_sin_norm"
    assert result["configs"][0]["parameters"]["detection_only"] is True
    assert result["best_detection_config"] == "intermedia_sin_norm"


def test_incremental_recommendation_for_safe_but_strict_config():
    from app.services.audio_calibration_service import CONFIG_CANDIDATES, build_incremental_recommendation

    recommendation = build_incremental_recommendation(
        {
            "config": "intermedia_sin_norm",
            "label": "Intermedia sin normalizacion",
            "parameters": CONFIG_CANDIDATES["intermedia_sin_norm"],
            "possible_damage_count": 0,
            "clipping_count": 0,
            "detection_metrics": {"useful_candidates": 1},
            "cleaning_metrics": {"contrast_delta_db": 7.051},
        }
    )

    assert recommendation["triggered"] is True
    assert recommendation["recommended_variant"]["frequency_min_hz"] == 2500
    assert recommendation["recommended_variant"]["frequency_max_hz"] == 5000
    assert recommendation["recommended_variant"]["threshold_dbfs"] == -52
    assert recommendation["recommended_variant"]["min_band_energy_ratio"] == 0.22
    assert recommendation["recommended_variant"]["normalize"] is False


def test_incremental_recommendation_does_not_trigger_for_too_many_candidates():
    from app.services.audio_calibration_service import CONFIG_CANDIDATES, build_incremental_recommendation

    recommendation = build_incremental_recommendation(
        {
            "config": "intermedia_cerrada_mas_selectiva",
            "label": "Intermedia cerrada mas selectiva",
            "parameters": CONFIG_CANDIDATES["intermedia_sin_norm"],
            "recommendation": "too_many_candidates",
            "possible_damage_count": 0,
            "clipping_count": 0,
            "detection_metrics": {
                "useful_candidates": 1,
                "duration_ratio_of_sample": 0.5,
                "requires_manual_review": True,
                "candidate_for_small_batch_review": True,
            },
            "cleaning_metrics": {"contrast_delta_db": 14.321},
        }
    )

    assert recommendation["triggered"] is False
    assert recommendation["variants"] == []
    assert recommendation["recommended_variant"] is None


def test_report_documents_when_no_candidates_are_detected(tmp_path):
    from app.services.audio_calibration_service import test_audio_processing_configs

    folder = synthetic_calibration_folder(tmp_path)
    output_dir = tmp_path / "no_candidates_report"
    result = test_audio_processing_configs(
        str(folder),
        "Pristimantis_simoterus",
        sample_size=3,
        configs=[],
        config_definitions=[
            {
                "name": "too_strict",
                "frequency_min_hz": 3000,
                "frequency_max_hz": 4500,
                "threshold_dbfs": 0,
                "min_band_energy_ratio": 0.99,
                "bandpass": True,
                "noise_reduce": False,
                "normalize": False,
            }
        ],
        output_dir=output_dir,
        allow_unrestricted=True,
    )

    assert result["configs"][0]["total_candidates"] == 0
    assert result["best_next_step"] == "try_exploratory_wide"
    assert result["safe_recommended_config"] is None
    report = (output_dir / "report.md").read_text(encoding="utf-8")
    assert "## Sin candidatos detectados" in report
    assert "exploratory_wide" in report
    assert "No se detectaron candidatos" in report


def test_exploratory_wide_is_not_safe_and_suggests_intermediate(tmp_path):
    from app.services.audio_calibration_service import test_audio_processing_configs

    sample_rate = 16000
    duration = 2.0
    t = np.arange(int(sample_rate * duration), dtype="float32") / sample_rate
    folder = tmp_path / "exploratory"
    for index in range(3):
        signal = 0.25 * np.sin(2 * math.pi * 3300 * t).astype("float32")
        write_signal_wav(folder / f"continuous_{index}.wav", signal, sample_rate)

    output_dir = tmp_path / "exploratory_report"
    result = test_audio_processing_configs(
        str(folder),
        "Pristimantis_simoterus",
        sample_size=3,
        configs=[],
        config_definitions=[
            {
                "name": "exploratory_wide",
                "label": "Exploratoria amplia",
                "frequency_min_hz": 1800,
                "frequency_max_hz": 6000,
                "threshold_dbfs": -55,
                "min_band_energy_ratio": 0.15,
                "bandpass": True,
                "noise_reduce": False,
                "normalize": False,
                "min_activity_seconds": 0.25,
                "min_silence_seconds": 0.5,
                "padding_seconds": 0.15,
                "clip_duration_seconds": 5,
                "max_segment_seconds": 10,
                "detection_only": True,
            }
        ],
        output_dir=output_dir,
        allow_unrestricted=True,
        detection_only=True,
    )

    assert result["recommended_config"] == "exploratory_wide"
    assert result["safe_recommended_config"] is None
    assert result["safe_recommended_parameters"] is None
    assert result["cleaning_safe"] is False
    assert result["configs"][0]["recommendation"] == "too_many_candidates"
    assert result["configs"][0]["cleaning_metrics"]["cleaning_safe"] is False
    assert result["best_next_step"] == "try_intermediate_config"
    assert result["suggested_intermediate_config"]["name"] == "intermedia_exploratoria"
    assert result["suggested_intermediate_config"]["frequency_min_hz"] == 2200
    assert result["suggested_intermediate_config"]["frequency_max_hz"] == 5500
    report = (output_dir / "report.md").read_text(encoding="utf-8")
    assert "Crear configuracion intermedia" in report
    assert "Configuracion segura recomendada: **ninguna segura**" in report


def test_intermediate_too_many_candidates_suggests_narrower_config(tmp_path):
    from app.services.audio_calibration_service import test_audio_processing_configs

    sample_rate = 16000
    duration = 2.0
    t = np.arange(int(sample_rate * duration), dtype="float32") / sample_rate
    folder = tmp_path / "intermediate"
    for index in range(3):
        signal = 0.25 * np.sin(2 * math.pi * 2600 * t).astype("float32")
        write_signal_wav(folder / f"continuous_{index}.wav", signal, sample_rate)

    output_dir = tmp_path / "intermediate_report"
    result = test_audio_processing_configs(
        str(folder),
        "Pristimantis_simoterus",
        sample_size=3,
        configs=[],
        config_definitions=[
            {
                "name": "intermedia_exploratoria",
                "label": "Intermedia exploratoria",
                "frequency_min_hz": 2200,
                "frequency_max_hz": 5500,
                "threshold_dbfs": -53,
                "min_band_energy_ratio": 0.20,
                "bandpass": True,
                "noise_reduce": False,
                "normalize": False,
                "min_activity_seconds": 0.25,
                "min_silence_seconds": 0.5,
                "padding_seconds": 0.15,
                "clip_duration_seconds": 5,
                "max_segment_seconds": 10,
                "detection_only": True,
            }
        ],
        output_dir=output_dir,
        allow_unrestricted=True,
        detection_only=True,
    )

    assert result["recommended_config"] == "intermedia_exploratoria"
    assert result["configs"][0]["recommendation"] == "too_many_candidates"
    assert result["safe_recommended_config"] is None
    assert result["cleaning_safe"] is False
    assert result["best_next_step"] == "try_narrower_config"
    assert result["suggested_narrower_config"]["name"] == "intermedia_cerrada"
    assert result["suggested_narrower_config"]["frequency_min_hz"] == 2000
    assert result["suggested_narrower_config"]["frequency_max_hz"] == 3300
    assert result["suggested_narrower_variants"]["if_too_many_candidates"]["frequency_min_hz"] == 2200
    assert result["suggested_narrower_variants"]["if_zero_candidates"]["frequency_min_hz"] == 1800
    report = (output_dir / "report.md").read_text(encoding="utf-8")
    assert "## Resultado intermedio" in report
    assert "crear configuracion mas cerrada" in report


def test_safe_recommendation_rules_reject_exploratory_and_allow_real_safe_candidate():
    from app.services.audio_calibration_service import is_safe_recommended_summary

    base = {
        "total_candidates": 2,
        "possible_damage_count": 0,
        "clipping_count": 0,
        "recommendation": "safe_for_review",
        "average_band_energy_ratio": 0.3,
        "detection_metrics": {"useful_candidates": 2},
        "cleaning_metrics": {"cleaning_safe": True, "contrast_delta_db": 4.0},
    }

    assert is_safe_recommended_summary({**base, "config": "exploratory_wide"}) is False
    assert is_safe_recommended_summary({**base, "config": "intermedia_exploratoria"}) is False
    assert is_safe_recommended_summary({**base, "config": "intermedia_cerrada"}) is True
    assert is_safe_recommended_summary({**base, "config": "intermedia_cerrada", "recommendation": "too_many_candidates"}) is False


def test_closed_config_too_many_suggests_selective_not_intermediate():
    from app.services.audio_calibration_service import build_final_recommendation

    recommendation = build_final_recommendation(
        {
            "config": "intermedia_cerrada",
            "label": "Intermedia cerrada",
            "recommendation": "too_many_candidates",
        },
        None,
    )

    assert recommendation["mode"] == "review_and_tighten_filters"
    assert "mas selectiva" in recommendation["warning"]
    assert "intermedia" not in recommendation["warning"].lower()


def test_selective_too_many_requires_manual_review_or_tighten():
    from app.services.audio_calibration_service import build_final_recommendation

    recommendation = build_final_recommendation(
        {
            "config": "intermedia_cerrada_mas_selectiva",
            "label": "Intermedia cerrada mas selectiva",
            "recommendation": "too_many_candidates",
        },
        None,
    )

    assert recommendation["mode"] == "manual_review_or_tighten"
    assert "preview" in recommendation["warning"]
    assert "mas estricta" in recommendation["warning"]


def test_calibration_api_accepts_authorized_folder(client, tmp_path):
    folder = synthetic_calibration_folder(tmp_path)
    profile = client.post(
        "/api/audio-lab/calibration/profile-folder",
        json={
            "folder_path": str(folder),
            "label": "Pristimantis_simoterus",
            "sample_size": 3,
            "noise_type": "mezcla",
            "job_allowed_roots": [str(folder)],
        },
    )
    assert profile.status_code == 200
    payload = profile.json()
    assert payload["suggested_parameters"]["frequency_min_hz"] >= 2500
    assert Path(payload["report_path"]).exists()
    assert payload["folder_path"] == str(folder.resolve())
    assert payload["folder_path_resolved"] == str(folder.resolve())
    assert payload["legacy_report"] is False

    tested = client.post(
        "/api/audio-lab/calibration/test-configs",
        json={
            "folder_path": str(folder),
            "label": "Pristimantis_simoterus",
            "sample_size": 3,
            "configs": ["conservadora", "balanceada"],
            "noise_type": "mezcla",
            "job_allowed_roots": [str(folder)],
        },
    )
    assert tested.status_code == 200
    tested_payload = tested.json()
    assert tested_payload["recommended_config"] in {"conservadora", "balanceada"}
    assert Path(tested_payload["report_paths"]["json"]).exists()
    assert tested_payload["folder_path"] == str(folder.resolve())
    assert tested_payload["folder_path_resolved"] == str(folder.resolve())
    assert tested_payload["legacy_report"] is False

    reports = client.get("/api/audio-lab/calibration/reports")
    assert reports.status_code == 200
    assert any(item["folder_path"] == str(folder.resolve()) for item in reports.json()["items"])


def test_calibration_report_legacy_metadata(client, test_settings):
    reports_dir = test_settings.STORAGE_DIR / "audio_lab" / "calibration_reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    legacy = reports_dir / "legacy_report.json"
    legacy.write_text(
        json.dumps({"report_type": "audio_folder_profile", "report_id": "legacy_report", "created_at": "2026-01-01T00:00:00"}),
        encoding="utf-8",
    )

    response = client.get("/api/audio-lab/calibration/reports/legacy_report.json")
    assert response.status_code == 200
    payload = response.json()
    assert payload["legacy_report"] is True
    assert payload["folder_path_resolved"] is None
    assert payload["source_report_path"] == str(legacy)

    missing = client.get("/api/audio-lab/calibration/reports/missing.json")
    assert missing.status_code == 404
    assert missing.json()["detail"]["error"] == "report_not_found"
